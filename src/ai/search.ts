// [A-SEARCH-ALGORITHM] 探索アルゴリズム。反復深化 + αβ + [A-CORE-DETERMINISM] の決定論規約。
// 深さ（ply）は決定点の数で数える（[A-SEARCH-NODE]）。手番モデルは minimax（[A-SEARCH-ROOT]）：
// 各決定点でFOEユニットはE(state)を最大化、MINEユニットはE(state)を最小化する（Eは常にFOE視点、
// [A-EVAL-FORM]）。joint_action のシーンでは同一陣営の2体の手を組として1エッジで扱い
// （[A-SEARCH-ROOT]［joint action の規則］）、deferred_decision のシーンでは同一ステップ内の
// 決定点を自軍 → 敵軍の順に並べる（[A-LATE-5-10]）。

import { BOOK_MASTERS } from '../data/generated/book-masters.js';
import type { BookMasterRecord } from '../data/types.js';
import type { ResolvedDecision } from '../engine/decision.js';
import type { BattleOutcome } from '../engine/pipeline/p5-discard.js';
import type { StepDeps } from '../engine/pipeline/step.js';
import type { BattleState, Side, Unit } from '../engine/types.js';
import { hasExecutableAction, isActionExecutable } from '../engine/decision.js';
import { currentDefense } from '../engine/defense.js';
import { effectiveAtk, effectiveRange } from '../engine/effective.js';
import { applyMove } from './apply.js';
import { lookupBook } from './book.js';
import { cloneBattleState } from './clone.js';
import { INF, MATE_TH, TTK_MAX } from './constants.js';
import { evaluateLeafPosition, mateScore, quiescenceMateScore } from './evaluate.js';
import { generateMoves, moveBonusOf, opposingMaster, reswapPenaltyOf, type AiMove } from './movegen.js';
import type { EffectiveProfile } from './profile.js';
import { firstPendingUnit, isStalled, runPreP8, runStepEnd } from './step-driver.js';

export class NodeBudgetExceeded extends Error {}

// [A-CORE-DETERMINISM]#2 打ち切りは1決定点あたりの総ノード数上限（反復深化の累計消費数）のみ。
// 深さごとにリセットしない共有の可変ボックスとして持つ。
interface NodeBudget {
  remaining: number;
}

interface SearchCtx {
  readonly prof: EffectiveProfile;
  readonly deps: StepDeps;
  readonly budget: NodeBudget;
  // [A-SEARCH-QUIESCE]［決着の確認］確認の延長の内側であるか。入れ子の確認を行わないために持つ。
  readonly verified?: boolean;
  // [A-SEARCH-QUIESCE]［決着の確認］確認の延長で決定点を与える陣営（敗れる側）。他陣営の決定点はパスとして進める。
  readonly confirmSide?: Side;
}

function consumeNode(budget: NodeBudget): void {
  budget.remaining -= 1;
  if (budget.remaining < 0) {
    throw new NodeBudgetExceeded();
  }
}

function findUnitById(state: BattleState, unitId: string): Unit {
  const unit = state.units.find((u): u is Unit => u !== null && u.unit_id === unitId);
  if (unit === undefined) {
    throw new Error(`探索クローン内にユニットが見つからない: ${unitId}`);
  }
  return unit;
}

// [A-SEARCH-NODE]［待機手の約定］ユニットID → 待機するアクションのインスタンスIDと、約定を記録した
// 時点のステップ。枝ごとに複製して受け渡し、探索中の局面（BattleState）には持たせない。
// ステップは［解消］の期限（記録から TTK_MAX ステップ）の判定に用いる。
interface WaitCommitment {
  readonly instanceId: string;
  readonly since: number;
}
type WaitCommitments = Readonly<Record<string, WaitCommitment>>;

// ［発射］対象アクションが実行可能で、相手陣営のマスター（前列・後列を問わない）に命中し射程内にあるとき。
export function readyToFire(state: BattleState, unit: Unit, instanceId: string): 'FIRE' | 'WAIT' | 'DROP' {
  const action = unit.acts.find((candidate) => candidate.instance_id === instanceId);
  if (action === undefined) {
    return 'DROP';
  }
  const master = opposingMaster(state, unit);
  const fires =
    isActionExecutable(state, unit, action) &&
    master !== null &&
    effectiveAtk(unit, action) >= currentDefense(master) &&
    Math.abs(master.pos_idx - unit.pos_idx) <= effectiveRange(unit, action);
  return fires ? 'FIRE' : 'WAIT';
}

interface FireResult {
  readonly outcome: BattleOutcome;
  readonly waits: WaitCommitments; // 解消されずに残った約定
}

// ［発射］［解消］配置マス idx 昇順に約定を判定する。発射の確定は深さに数えない。
function fireWaits(state: BattleState, waits: WaitCommitments, deps: StepDeps): FireResult {
  const remaining: Record<string, WaitCommitment> = {};
  const units = state.units.filter((unit): unit is Unit => unit !== null && waits[unit.unit_id] !== undefined);
  for (const unit of units.sort((a, b) => a.pos_idx - b.pos_idx)) {
    const commitment = waits[unit.unit_id];
    // ［解消］記録から TTK_MAX ステップを経過した約定は解消し、以後は通常の決定点として扱う。
    // 発射条件は相手の配置・防御力・距離に依存し、成立しないまま推移する局面では発射も対象の消滅も
    // 起こらないため、期限がないと決定点が現れないまま自動進行が終わらない。
    if (state.step - commitment.since >= TTK_MAX) {
      continue;
    }
    const instanceId = commitment.instanceId;
    const verdict = readyToFire(state, unit, instanceId);
    if (verdict === 'WAIT') {
      remaining[unit.unit_id] = commitment;
    } else if (verdict === 'FIRE') {
      const action = unit.acts.find((candidate) => candidate.instance_id === instanceId)!;
      const outcome = applyMove(state, unit, { kind: 'ACT', action }, deps);
      if (outcome !== 'NONE') {
        return { outcome, waits: {} };
      }
    }
  }
  return { outcome: 'NONE', waits: remaining };
}

// ［葉での扱い］約定が残っていれば、新規行動を入れずに（発射の確定のみ行い）進めてから評価する。
// extendable は [A-SEARCH-QUIESCE]［決着の確認］の対象となる葉（手を適用して到達した葉）であるか。
function evaluateLeaf(
  state: BattleState,
  waits: WaitCommitments,
  ctx: SearchCtx,
  ply: number,
  passed: readonly string[] = [],
  extendable = false,
): number {
  let pending = waits;
  for (let steps = 0; Object.keys(pending).length > 0; steps += 1) {
    const fired = fireWaits(state, pending, ctx.deps);
    if (fired.outcome !== 'NONE') {
      return quiescenceMateScore(fired.outcome, ply, steps);
    }
    pending = fired.waits;
    if (Object.keys(pending).length === 0 || steps >= TTK_MAX) {
      break;
    }
    runStepEnd(state);
    const outcome = runPreP8(state, ctx.deps);
    if (outcome !== 'NONE') {
      return quiescenceMateScore(outcome, ply, steps + 1);
    }
  }
  const leaf = evaluateLeafPosition(state, ctx.prof, ply, ctx.deps);
  // [A-SEARCH-QUIESCE]［決着の確認］敗れる側に決定点が現れた決着は確定とせず、敗れる側の最初の決定点まで
  // 進めて決定点1つ分だけ延長した結果で評価する。延長の内側では確認を行わない（入れ子にしない）。
  if (extendable && leaf.refutableLoser !== null && ctx.verified !== true) {
    return searchStep(cloneBattleState(state), { ...ctx, verified: true, confirmSide: leaf.refutableLoser }, 1, ply, passed, waits);
  }
  return leaf.value;
}

// [A-SEARCH-NODE]「子ノードへの遷移」の続き。手を適用後、次の決定点または詰みまで進める。
function continueAfterMove(
  state: BattleState,
  outcomeFromMove: BattleOutcome,
  ctx: SearchCtx,
  depthRemaining: number,
  ply: number,
  passedUnitIds: readonly string[],
  waits: WaitCommitments,
  alpha = -INF,
  beta = INF,
): number {
  if (outcomeFromMove !== 'NONE') {
    return mateScore(outcomeFromMove, ply);
  }
  return searchStep(state, ctx, depthRemaining, ply, passedUnitIds, waits, alpha, beta);
}

// P1〜P7を経て、なお決定待ちのユニットがなければステップ境界を越えて進む。全ユニットが
// STARTUP/RECOVERY中で誰も決定を持たない間は、スタックを消費しないループで前進を続ける
// （[M-UI-TIMELINE]と同様、経過ステップ数は各アクションの必要発生・硬直で有限に収束する）。
// 全ユニットが思考中で、思考の蓄積を待っても実行可能にならない場合は以後ステートが変化しないため、
// 決定点に到達しない葉として評価する。
function searchStep(
  state: BattleState,
  ctx: SearchCtx,
  depthRemaining: number,
  ply: number,
  passedUnitIds: readonly string[],
  waitsIn: WaitCommitments,
  alpha = -INF,
  beta = INF,
): number {
  let passed = passedUnitIds;
  let waits = waitsIn;
  for (;;) {
    // [A-SEARCH-NODE]［待機手の約定］決定点の探索に先立ち発射を判定し、約定のあるユニットは決定点から除く。
    const fired = fireWaits(state, waits, ctx.deps);
    if (fired.outcome !== 'NONE') {
      return mateScore(fired.outcome, ply);
    }
    waits = fired.waits;
    const pending = firstPendingUnit(state, [...passed, ...Object.keys(waits)], ctx.prof.deferredDecision);
    // [A-SEARCH-QUIESCE]［決着の確認］確認の延長では、敗れる側より先に現れる勝つ側の決定点をパスとして進める。
    if (pending !== undefined && ctx.confirmSide !== undefined && pending.side !== ctx.confirmSide) {
      passed = [...passed, pending.unit_id];
      continue;
    }
    if (pending !== undefined) {
      return searchDecision(state, pending, ctx, depthRemaining, ply, passed, waits, alpha, beta);
    }
    if (isStalled(state)) {
      return evaluateLeaf(state, waits, ctx, ply);
    }
    passed = [];
    runStepEnd(state);
    const outcome = runPreP8(state, ctx.deps);
    if (outcome !== 'NONE') {
      return mateScore(outcome, ply);
    }
  }
}

// [A-SEARCH-ROOT]［joint action の規則］組の後の手。自滅ポリシーの判定に実行者と即時決着を保持する。
interface PartnerMove {
  readonly unit: Unit;
  readonly move: AiMove;
  readonly outcome: BattleOutcome;
}

interface RankedMove {
  readonly move: AiMove;
  readonly value: number;
  readonly outcome: BattleOutcome; // その手を root で適用した直後の即時決着（自滅ポリシー判定に用いる）
  readonly partner: PartnerMove | null;
}

// 手をクローンへ適用した結果。
interface Applied {
  readonly outcome: BattleOutcome;
  readonly waits: WaitCommitments;
  readonly passed: readonly string[];
}

// state（クローン）上の unit に手を適用する。move.action は生成時点のユニットを参照しうるため、
// 適用前に必ずクローン側の対応インスタンスへ差し替える。そのまま適用すると [A-CORE-DETERMINISM]#6 に
// 反し、探索の分岐評価が呼び出し元の実ステートを汚染する（uses_left・seal_accum 等が探索のたびに減耗する）。
function applyToClone(
  clone: BattleState,
  unitId: string,
  move: AiMove,
  deps: StepDeps,
  passed: readonly string[],
  waits: WaitCommitments,
): Applied {
  const clonedUnit = findUnitById(clone, unitId);
  const clonedMove: AiMove =
    move.kind === 'PASS'
      ? move
      : { kind: move.kind, action: clonedUnit.acts.find((a) => a.instance_id === move.action.instance_id)! };
  const outcome = applyMove(clone, clonedUnit, clonedMove, deps);
  // [A-SEARCH-NODE]［待機手の約定］待機手は約定を記録し、同ステップ内のパスと同様に扱う。
  return {
    outcome,
    waits: move.kind === 'WAIT' ? { ...waits, [unitId]: { instanceId: move.action.instance_id, since: clone.step } } : waits,
    passed: move.kind === 'ACT' ? passed : [...passed, unitId],
  };
}

// [A-SEARCH-ROOT]［joint action の規則］「組の列挙と適用の順序」unit の後に [M-PIPE-P8-ORDER]#1 の
// ループ順（配置 idx 昇順）で並ぶ同一陣営の思考中ユニット。実行可能性は先の手の適用後に判定する。
function jointPartnerIdOf(state: BattleState, unit: Unit, passed: readonly string[], waits: WaitCommitments): string | null {
  const partner = state.units.find(
    (other): other is Unit =>
      other !== null &&
      other.side === unit.side &&
      other.unit_id !== unit.unit_id &&
      other.state === 'THOUGHT' &&
      other.pos_idx > unit.pos_idx &&
      !passed.includes(other.unit_id) &&
      waits[other.unit_id] === undefined,
  );
  return partner?.unit_id ?? null;
}

// ［退化］先の手の適用後も相方が思考中で実行可能アクションを持つとき、その候補手を返す。
function partnerMovesAfter(clone: BattleState, partnerId: string | null, applied: Applied, ctx: SearchCtx): PartnerMove[] {
  if (partnerId === null || applied.outcome !== 'NONE') {
    return [];
  }
  const partner = clone.units.find((unit): unit is Unit => unit !== null && unit.unit_id === partnerId);
  if (partner === undefined || !hasExecutableAction(clone, partner)) {
    return [];
  }
  return generateMoves(clone, partner, ctx.prof.waitMoves).map((move) => ({ unit: partner, move, outcome: 'NONE' }));
}

// unit の候補手をすべて探索し、(move, value) の対を [A-TIE-BREAK] の生成順を保って返す。
// [A-TIE-BREAK]「根ノードはフルウィンドウで探索」に合わせ、兄弟手どうしの枝刈りは行わない
// （自滅ポリシー適用のため全候補の確定スコアを保持する必要がある。[A-EVAL-MATE]）。
function rankMoves(
  state: BattleState,
  unit: Unit,
  ctx: SearchCtx,
  depthRemaining: number,
  ply: number,
  passedUnitIds: readonly string[],
  waits: WaitCommitments,
  alphaIn = -INF,
  betaIn = INF,
): RankedMove[] {
  const moves = generateMoves(state, unit, ctx.prof.waitMoves);
  const ranked: RankedMove[] = [];
  // [A-SEARCH-ALGORITHM] αβ。根ノードは全候補の確定スコアを保持する必要があるため枝刈りしない
  // （[A-TIE-BREAK]「根ノードはフルウィンドウで探索」・自滅ポリシーの適用のため）。
  const maximizing = unit.side === 'FOE';
  let alpha = alphaIn;
  let beta = betaIn;
  const partnerId = ctx.prof.jointAction ? jointPartnerIdOf(state, unit, passedUnitIds, waits) : null;

  // 1エッジ（単独の手または組）の子を評価する。
  const childValue = (clone: BattleState, applied: Applied): number => {
    if (depthRemaining <= 1) {
      return applied.outcome !== 'NONE'
        ? mateScore(applied.outcome, ply + 1)
        : evaluateLeaf(clone, applied.waits, ctx, ply + 1, applied.passed, true);
    }
    return continueAfterMove(clone, applied.outcome, ctx, depthRemaining - 1, ply + 1, applied.passed, applied.waits, alpha, beta);
  };
  // [A-TIE-BREAK]「根ノードは action_bonus を加算した確定スコアで並べ替える」。ボーナスは根の手の選好であり、
  // 子孫ノードの確定スコアには加算しない（[V-NUM-STEP157]・[V-NUM-OPENING] の比較も根の手に対する加算である）。
  // [A-PROFILE-BONUS] 再交代の減点も根の手の選好として同じく加算する。
  const rootBonus = (before: BattleState, actor: Unit, move: AiMove): number => {
    const bonus = moveBonusOf(move, ctx.prof) + reswapPenaltyOf(before, actor, move, ctx.prof);
    return actor.side === 'FOE' ? bonus : -bonus;
  };
  // 窓を更新し、閉じたら true を返す。
  const record = (entry: RankedMove): boolean => {
    ranked.push(entry);
    if (ply === 0) {
      return false;
    }
    if (maximizing) {
      if (entry.value > alpha) {
        alpha = entry.value;
      }
    } else if (entry.value < beta) {
      beta = entry.value;
    }
    return alpha >= beta; // 窓が閉じた。以降の兄弟手は親の選択を変えない
  };

  for (const move of moves) {
    const clone = cloneBattleState(state);
    const applied = applyToClone(clone, unit.unit_id, move, ctx.deps, passedUnitIds, waits);
    const partnerMoves = partnerMovesAfter(clone, partnerId, applied, ctx);
    if (partnerMoves.length === 0) {
      consumeNode(ctx.budget);
      let value = childValue(clone, applied);
      if (ply === 0) {
        value += rootBonus(state, unit, move);
      }
      if (record({ move, value, outcome: applied.outcome, partner: null })) {
        break;
      }
      continue;
    }
    // [A-SEARCH-ROOT]［joint action の規則］組は1手（1 ply）・1ノード。後の手は先の手を適用した局面で生成する。
    let closed = false;
    for (const partner of partnerMoves) {
      consumeNode(ctx.budget);
      const pairClone = cloneBattleState(clone);
      const pairApplied = applyToClone(pairClone, partner.unit.unit_id, partner.move, ctx.deps, applied.passed, applied.waits);
      let value = childValue(pairClone, pairApplied);
      if (ply === 0) {
        // ［根のボーナスと自滅ポリシー］組の両手にボーナスと再交代の減点を加算する。
        value += rootBonus(state, unit, move) + rootBonus(clone, partner.unit, partner.move);
      }
      if (record({ move, value, outcome: applied.outcome, partner: { ...partner, outcome: pairApplied.outcome } })) {
        closed = true;
        break;
      }
    }
    if (closed) {
      break;
    }
  }
  return ranked;
}

function searchDecision(
  state: BattleState,
  unit: Unit,
  ctx: SearchCtx,
  depthRemaining: number,
  ply: number,
  passedUnitIds: readonly string[],
  waits: WaitCommitments,
  alpha = -INF,
  beta = INF,
): number {
  const ranked = rankMoves(state, unit, ctx, depthRemaining, ply, passedUnitIds, waits, alpha, beta);
  const maximizing = unit.side === 'FOE';
  let best = maximizing ? -INF : INF;
  for (const { value } of ranked) {
    if (maximizing ? value > best : value < best) {
      best = value;
    }
  }
  return best;
}

// [M-PIPE-SUICIDE]「HPコスト自滅」は executableActions が既に除外済み。ここで扱うのは
// [M-PIPE-SUICIDE]「スリップ決済自滅の許容」のうち、瞬動アクションが実行者自身のマスターを
// 即時決済で葬るケースである（[A-EVAL-MATE]「自滅手への対処」）。
function isMasterSlipSuicide(unit: Unit, move: AiMove, outcome: BattleOutcome): boolean {
  if (move.kind !== 'ACT' || unit.unit_kind !== 'MASTER') {
    return false;
  }
  if (move.action.base_params.step_startup !== 0 || move.action.base_params.step_recovery !== 0) {
    return false; // 瞬動（発生0・硬直0）以外は本ケースの対象外
  }
  return unit.side === 'FOE' ? outcome === 'WIN' : outcome === 'LOSS';
}

export interface DecideActionResult {
  readonly decision: ResolvedDecision;
  readonly score: number;
  // [D-05] 決定点1回（反復深化の全深さを通じた累計）で消費したノード数。
  readonly nodesConsumed: number;
  // [V-TEST-NONFUNC] D-01a 反復深化で完了した最大の深さ。1段も完了しなかった場合と定跡の手は 0。
  readonly depthCompleted: number;
}

function bookOf(bookId: string): BookMasterRecord {
  const book = (BOOK_MASTERS as Readonly<Record<string, BookMasterRecord>>)[bookId];
  if (book === undefined) {
    throw new Error(`未知の定跡ID: ${bookId}`);
  }
  return book;
}

// [A-SEARCH-ALGORITHM] decide_action(state, prof)。ノード予算は反復深化の全深さで共有する
// （[A-CORE-DETERMINISM]#2）。state は変更しない（[A-CORE-DETERMINISM]#6 純関数）。
// 1. 定跡参照：[A-BOOK-SEMANTICS]［適用範囲］により敵マスターの手のみを拘束する。HIT（定跡手・待機）は
// 探索せず返し、BOOK_MISS は探索に委ねる。いずれも更新後の定跡進行状態を決定に添える。
export function decideActionDetailed(
  state: BattleState,
  unit: Unit,
  prof: EffectiveProfile,
  deps: StepDeps,
): DecideActionResult {
  if (prof.bookId !== null && unit.side === 'FOE' && unit.unit_kind === 'MASTER') {
    const lookup = lookupBook(state, unit, bookOf(prof.bookId));
    if (lookup.kind === 'MOVE') {
      return { decision: { kind: 'ACT', instanceId: lookup.instanceId, book: lookup.progress, source: 'BOOK' }, score: 0, nodesConsumed: 0, depthCompleted: 0 };
    }
    if (lookup.kind === 'PASS_MOVE') {
      return { decision: { kind: 'PASS', book: lookup.progress, source: 'BOOK' }, score: 0, nodesConsumed: 0, depthCompleted: 0 };
    }
    const searched = searchRoot(state, unit, prof, deps);
    return { ...searched, decision: { ...searched.decision, book: lookup.progress, source: 'SEARCH' } };
  }
  const searched = searchRoot(state, unit, prof, deps);
  return { ...searched, decision: { ...searched.decision, source: 'SEARCH' } };
}

function searchRoot(state: BattleState, unit: Unit, prof: EffectiveProfile, deps: StepDeps): DecideActionResult {
  const budget: NodeBudget = { remaining: prof.nodeLimit };
  let bestDecision: ResolvedDecision = { kind: 'PASS' };
  let bestScore = 0;
  let depthCompleted = 0;
  // [A-LATE-5-10] 敵軍AIはプレイヤーの着手が確定した子ノードから探索を始める。同一ステップの自軍の決定は
  // 済んでいるため、自軍ユニットを当該ステップで決定済みとして扱う。
  const decided =
    prof.deferredDecision && unit.side === 'FOE'
      ? state.units.filter((u): u is Unit => u !== null && u.side === 'MINE').map((u) => u.unit_id)
      : [];

  for (let depth = 1; depth <= prof.maxDepth; depth += 1) {
    const ctx: SearchCtx = { prof, deps, budget };
    let ranked: RankedMove[];
    try {
      ranked = rankMoves(state, unit, ctx, depth, 0, decided, {});
    } catch (error) {
      if (error instanceof NodeBudgetExceeded) {
        break; // 直前深さの結果を採用して打ち切る
      }
      throw error;
    }

    const maximizing = unit.side === 'FOE';
    const sorted = [...ranked].sort((a, b) => (maximizing ? b.value - a.value : a.value - b.value));

    // [A-EVAL-MATE]「自滅手への対処」[A-SEARCH-ALGORITHM]#3：上位手から順に、マスターの
    // スリップ決済自滅かつ score < MATE_TH の手を除外する。パスは自滅し得ないため必ず残る。
    let chosen = sorted[0];
    // [A-SEARCH-ROOT]［根のボーナスと自滅ポリシー］組ではマスターの手について判定する。
    for (const candidate of sorted) {
      const suicide =
        isMasterSlipSuicide(unit, candidate.move, candidate.outcome) ||
        (candidate.partner !== null &&
          isMasterSlipSuicide(candidate.partner.unit, candidate.partner.move, candidate.partner.outcome));
      if (suicide && Math.abs(candidate.value) < MATE_TH) {
        continue;
      }
      chosen = candidate;
      break;
    }

    // [A-SEARCH-NODE]［待機手の約定］根で選ばれた待機手はパスとして返す。
    bestDecision = chosen.move.kind === 'ACT' ? { kind: 'ACT', instanceId: chosen.move.action.instance_id } : { kind: 'PASS' };
    bestScore = chosen.value;
    depthCompleted = depth;
    if (Math.abs(chosen.value) >= MATE_TH) {
      break; // 詰み発見で早期打ち切り
    }
  }

  const nodesConsumed = prof.nodeLimit - Math.max(budget.remaining, 0);
  if (depthCompleted === 0) {
    return { decision: { kind: 'PASS' }, score: 0, nodesConsumed, depthCompleted };
  }
  return { decision: bestDecision, score: bestScore, nodesConsumed, depthCompleted };
}

export function decideAction(state: BattleState, unit: Unit, prof: EffectiveProfile, deps: StepDeps): ResolvedDecision {
  return decideActionDetailed(state, unit, prof, deps).decision;
}
