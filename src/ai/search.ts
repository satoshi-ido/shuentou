// [A-SEARCH-ALGORITHM] 探索アルゴリズム。反復深化 + αβ + [A-CORE-DETERMINISM] の決定論規約。
// 深さ（ply）は決定点の数で数える（[A-SEARCH-NODE]）。手番モデルは minimax（[A-SEARCH-ROOT]）：
// 各決定点でFOEユニットはE(state)を最大化、MINEユニットはE(state)を最小化する（Eは常にFOE視点、
// [A-EVAL-FORM]）。[A-DIFF-CONFIG] で joint_action=False の範囲（1-01, max_depth 3）を対象とし、
// 同時手（joint action）は扱わない。

import { BOOK_MASTERS } from '../data/generated/book-masters.js';
import type { BookMasterRecord } from '../data/types.js';
import type { ResolvedDecision } from '../engine/decision.js';
import type { BattleOutcome } from '../engine/pipeline/p5-discard.js';
import type { StepDeps } from '../engine/pipeline/step.js';
import type { BattleState, Unit } from '../engine/types.js';
import { isActionExecutable } from '../engine/decision.js';
import { currentDefense } from '../engine/defense.js';
import { effectiveAtk, effectiveRange } from '../engine/effective.js';
import { applyMove } from './apply.js';
import { lookupBook } from './book.js';
import { cloneState } from './clone.js';
import { INF, MATE_TH, TTK_MAX } from './constants.js';
import { evaluateLeafPosition, mateScore, quiescenceMateScore } from './evaluate.js';
import { generateMoves, moveBonusOf, reswapPenaltyOf, type AiMove } from './movegen.js';
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

// [A-SEARCH-NODE]［待機手の約定］ユニットID → 待機するアクションのインスタンスID。枝ごとに複製して受け渡し、
// 探索中の局面（BattleState）には持たせない。
type WaitCommitments = Readonly<Record<string, string>>;

const FRONT_IDX_OF_OPPONENT: Readonly<Record<string, number>> = { MINE: 2, FOE: 1 }; // [M-FIELD-GRID]

// ［発射］対象アクションが実行可能で、相手陣営の前列のマスターに命中し射程内にあるとき。
export function readyToFire(state: BattleState, unit: Unit, instanceId: string): 'FIRE' | 'WAIT' | 'DROP' {
  const action = unit.acts.find((candidate) => candidate.instance_id === instanceId);
  if (action === undefined) {
    return 'DROP';
  }
  const front = state.units[FRONT_IDX_OF_OPPONENT[unit.side]] ?? null;
  const fires =
    isActionExecutable(state, unit, action) &&
    front !== null &&
    front.unit_kind === 'MASTER' &&
    effectiveAtk(unit, action) >= currentDefense(front) &&
    Math.abs(front.pos_idx - unit.pos_idx) <= effectiveRange(unit, action);
  return fires ? 'FIRE' : 'WAIT';
}

interface FireResult {
  readonly outcome: BattleOutcome;
  readonly waits: WaitCommitments; // 解消されずに残った約定
}

// ［発射］［解消］配置マス idx 昇順に約定を判定する。発射の確定は深さに数えない。
function fireWaits(state: BattleState, waits: WaitCommitments, deps: StepDeps): FireResult {
  const remaining: Record<string, string> = {};
  const units = state.units.filter((unit): unit is Unit => unit !== null && waits[unit.unit_id] !== undefined);
  for (const unit of units.sort((a, b) => a.pos_idx - b.pos_idx)) {
    const instanceId = waits[unit.unit_id];
    const verdict = readyToFire(state, unit, instanceId);
    if (verdict === 'WAIT') {
      remaining[unit.unit_id] = instanceId;
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
  // [A-SEARCH-QUIESCE]［決着の確認］敗れる側に決定点が現れた決着は確定とせず、決定点1つ分だけ
  // 延長した結果で評価する。延長の内側では確認を行わない（入れ子にしない）。
  if (extendable && leaf.refutableSettlement && ctx.verified !== true) {
    return searchStep(cloneState(state), { ...ctx, verified: true }, 1, ply, passed, waits);
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
    const pending = firstPendingUnit(state, [...passed, ...Object.keys(waits)]);
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

interface RankedMove {
  readonly move: AiMove;
  readonly value: number;
  readonly outcome: BattleOutcome; // その手を root で適用した直後の即時決着（自滅ポリシー判定に用いる）
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
  for (const move of moves) {
    consumeNode(ctx.budget);
    const clone = cloneState(state);
    const clonedUnit = findUnitById(clone, unit.unit_id);
    // move.action は generateMoves 呼び出し時点の unit（クローン前の可能性がある）を参照するため、
    // 適用前に必ずクローン側の対応インスタンスへ差し替える。そのまま適用すると
    // [A-CORE-DETERMINISM]#6 に反し、探索の分岐評価が呼び出し元の実ステートを汚染する
    // （uses_left・seal_accum 等が探索のたびに減耗する）。
    const clonedMove: AiMove =
      move.kind === 'PASS'
        ? move
        : { kind: move.kind, action: clonedUnit.acts.find((a) => a.instance_id === move.action.instance_id)! };
    const outcome = applyMove(clone, clonedUnit, clonedMove, ctx.deps);
    // [A-SEARCH-NODE]［待機手の約定］待機手は約定を記録し、同ステップ内のパスと同様に扱う。
    const waitsAfter = move.kind === 'WAIT' ? { ...waits, [unit.unit_id]: move.action.instance_id } : waits;
    let value: number;
    const passedAfter = move.kind === 'ACT' ? passedUnitIds : [...passedUnitIds, unit.unit_id];
    if (depthRemaining <= 1) {
      value =
        outcome !== 'NONE'
          ? mateScore(outcome, ply + 1)
          : evaluateLeaf(clone, waitsAfter, ctx, ply + 1, passedAfter, true);
    } else {
      value = continueAfterMove(clone, outcome, ctx, depthRemaining - 1, ply + 1, passedAfter, waitsAfter, alpha, beta);
    }
    // [A-TIE-BREAK]「根ノードは action_bonus を加算した確定スコアで並べ替える」。ボーナスは根の手の選好であり、
    // 子孫ノードの確定スコアには加算しない（[V-NUM-STEP157]・[V-NUM-OPENING] の比較も根の手に対する加算である）。
    if (ply === 0) {
      // [A-PROFILE-BONUS] 再交代の減点も根の手の選好として同じく加算する。
      const bonus = moveBonusOf(move, ctx.prof) + reswapPenaltyOf(state, unit, move);
      value += unit.side === 'FOE' ? bonus : -bonus;
    }
    ranked.push({ move, value, outcome });
    if (ply > 0) {
      if (maximizing) {
        if (value > alpha) {
          alpha = value;
        }
      } else if (value < beta) {
        beta = value;
      }
      if (alpha >= beta) {
        break; // 窓が閉じた。以降の兄弟手は親の選択を変えない
      }
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
      return { decision: { kind: 'ACT', instanceId: lookup.instanceId, book: lookup.progress, source: 'BOOK' }, score: 0, nodesConsumed: 0 };
    }
    if (lookup.kind === 'PASS_MOVE') {
      return { decision: { kind: 'PASS', book: lookup.progress, source: 'BOOK' }, score: 0, nodesConsumed: 0 };
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
  let completedAnyDepth = false;

  for (let depth = 1; depth <= prof.maxDepth; depth += 1) {
    const ctx: SearchCtx = { prof, deps, budget };
    let ranked: RankedMove[];
    try {
      ranked = rankMoves(state, unit, ctx, depth, 0, [], {});
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
    for (const candidate of sorted) {
      if (isMasterSlipSuicide(unit, candidate.move, candidate.outcome) && Math.abs(candidate.value) < MATE_TH) {
        continue;
      }
      chosen = candidate;
      break;
    }

    // [A-SEARCH-NODE]［待機手の約定］根で選ばれた待機手はパスとして返す。
    bestDecision = chosen.move.kind === 'ACT' ? { kind: 'ACT', instanceId: chosen.move.action.instance_id } : { kind: 'PASS' };
    bestScore = chosen.value;
    completedAnyDepth = true;
    if (Math.abs(chosen.value) >= MATE_TH) {
      break; // 詰み発見で早期打ち切り
    }
  }

  if (!completedAnyDepth) {
    return { decision: { kind: 'PASS' }, score: 0, nodesConsumed: prof.nodeLimit - Math.max(budget.remaining, 0) };
  }
  return { decision: bestDecision, score: bestScore, nodesConsumed: prof.nodeLimit - Math.max(budget.remaining, 0) };
}

export function decideAction(state: BattleState, unit: Unit, prof: EffectiveProfile, deps: StepDeps): ResolvedDecision {
  return decideActionDetailed(state, unit, prof, deps).decision;
}
