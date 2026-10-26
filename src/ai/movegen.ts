// [A-SEARCH-MOVEGEN] 候補手の生成規則。[A-TIE-BREAK] の優先度1（アクション区分）・
// 優先度4（所持アクション配列インデックス昇順）を実装する。優先度2・3（ユニット種別・マス配置idx）
// は同時手（joint action）の組の順序として探索器が扱う（[A-SEARCH-ROOT]［joint action の規則］）。
// [A-PROFILE-BONUS] アクション種別ボーナスのタグ判定もここに置く。

import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { executableActions, isInstant } from '../engine/decision.js';
import { currentDefense } from '../engine/defense.js';
import {
  effectiveAtk,
  effectiveCostPp,
  effectiveRange,
  effectiveStepRecovery,
  effectiveStepStartup,
  effectiveStepThought,
} from '../engine/effective.js';
import { hasFlag } from '../engine/flags.js';
import { partnerOf } from '../engine/resolve/partner.js';
import type { ActionInstance, BattleState, Unit } from '../engine/types.js';
import { ROOT_COUNTER_ID } from './constants.js';
import { actionBonusOf, type ActionTag, type EffectiveProfile } from './profile.js';

// WAIT は待機手（[A-SEARCH-MOVEGEN]）。適用・約定・発射は [A-SEARCH-NODE]［待機手の約定］に従い、探索器が扱う。
export type AiMove =
  | { readonly kind: 'PASS' }
  | { readonly kind: 'ACT'; readonly action: ActionInstance }
  | { readonly kind: 'WAIT'; readonly action: ActionInstance };

// [A-TIE-BREAK] 優先度1：瞬動(0) → 即発(1) → 通常(2)。待機手・パスは別枠でこの順に末尾へ置く。
function categoryRank(action: ActionInstance): number {
  if (isInstant(action)) {
    return action.base_params.step_recovery === 0 ? 0 : 1;
  }
  return 2;
}

export function isRootAction(action: ActionInstance): boolean {
  return (ACTION_MASTERS as Readonly<Record<string, { readonly is_root: boolean }>>)[action.master_ref]?.is_root === true;
}

// [A-SEARCH-NODE]［待機手の約定］［発射］の対象である相手陣営のマスター。武技は射程内のすべての敵ユニットへ
// 個別に判定する（[M-RESOLVE-MARTIAL]）ため、前列・後列を問わない。
export function opposingMaster(state: BattleState, unit: Unit): Unit | null {
  return state.units.find((u): u is Unit => u !== null && u.side !== unit.side && u.unit_kind === 'MASTER') ?? null;
}

// [A-SEARCH-MOVEGEN]「待機手」必要思考のみが未充足の武技（マスター根源武技を除く）で、発射の条件のうち
// 実行可能であること以外が成立するもの。所持アクション配列の順。
function waitableActions(state: BattleState, unit: Unit, executable: readonly ActionInstance[]): ActionInstance[] {
  const matured: Unit = { ...unit, elapsed_thought: Number.MAX_SAFE_INTEGER };
  const whenMatured = executableActions(state, matured).map((action) => action.instance_id);
  // 発射の条件は [A-SEARCH-NODE]［待機手の約定］による。
  const master = opposingMaster(state, unit);
  // 心気（FLAG_MIND）は命中の条件を持たず、PPの不足でPPを要するアクションをいずれも実行できない間に限り、
  // 必要思考のみが未充足であれば待機手を生成する。
  const ppCosts = unit.acts.filter((action) => !isRootAction(action) && action.base_params.cost_pp > 0).map((action) => effectiveCostPp(unit, action));
  const ppStarved = ppCosts.length > 0 && unit.pp < Math.min(...ppCosts);
  return unit.acts.filter(
    (action) =>
      !isRootAction(action) &&
      !executable.includes(action) &&
      whenMatured.includes(action.instance_id) &&
      ((hasFlag(action.sys_flags, 'FLAG_MIND') && ppStarved) ||
        (hasFlag(action.sys_flags, 'FLAG_MARTIAL') &&
          master !== null &&
          effectiveAtk(unit, action) >= currentDefense(master) &&
          Math.abs(master.pos_idx - unit.pos_idx) <= effectiveRange(unit, action))),
  );
}

// [A-SEARCH-MOVEGEN]「拍止め」の残り：相手陣営のマスターが思考中のとき、その根源武技の発動までのステップ数。
// 思考中でなければ null（規則を適用しない）。
function rootLeft(state: BattleState, unit: Unit): number | null {
  const rival = opposingMaster(state, unit);
  const root = rival?.acts.find(isRootAction);
  if (rival === null || root === undefined || rival.state !== 'THOUGHT') {
    return null;
  }
  return Math.max(effectiveStepThought(rival, root) - rival.elapsed_thought, 0) + effectiveStepStartup(rival, root);
}

function counterOf(unit: Unit | null): ActionInstance | undefined {
  return unit?.acts.find((action) => action.master_ref === ROOT_COUNTER_ID);
}

// 拍止めの必要思考実効値 + 必要発生実効値（撃った後に再び撃てるようになり、着弾するまで）。
function counterLead(unit: Unit, counter: ActionInstance): number {
  return effectiveStepThought(unit, counter) + effectiveStepStartup(unit, counter);
}

// 温存の条件：思考中で、待てば拍止めが根源武技の発動より前のステップに着弾する（同じステップでは止まらない）。
function counterInTime(unit: Unit, counter: ActionInstance, left: number): boolean {
  return (
    unit.state === 'THOUGHT' &&
    Math.max(effectiveStepThought(unit, counter) - unit.elapsed_thought, 0) + effectiveStepStartup(unit, counter) < left
  );
}

// 通る中断：相手陣営のマスターへ通り、根源武技の発動より前に着弾するスタン付与の武技（拍止め・根源武技を除く）。
// 着弾すれば相手の思考を中断するため、温存で除かない。
function interruptsRoot(state: BattleState, unit: Unit, action: ActionInstance, left: number): boolean {
  const rival = opposingMaster(state, unit);
  return (
    rival !== null &&
    hasFlag(action.sys_flags, 'FLAG_MARTIAL') &&
    action.base_params.stun &&
    action.master_ref !== ROOT_COUNTER_ID &&
    !isRootAction(action) &&
    effectiveAtk(unit, action) >= currentDefense(rival) &&
    Math.abs(rival.pos_idx - unit.pos_idx) <= effectiveRange(unit, action) &&
    effectiveStepStartup(unit, action) < left
  );
}

// [A-SEARCH-MOVEGEN]「拍止め」：発射・温存・相方の隊列交代の規則。発射の時機であれば拍止めのみを返す。
function applyCounterRules(state: BattleState, unit: Unit, actions: readonly ActionInstance[]): readonly ActionInstance[] {
  const left = rootLeft(state, unit);
  const counter = counterOf(unit);
  if (left === null) {
    return actions.filter((action) => action !== counter);
  }
  let result = actions;
  if (counter !== undefined) {
    const lead = counterLead(unit, counter);
    if (result.includes(counter)) {
      if (left <= lead) {
        return [counter];
      }
      result = result.filter((action) => action !== counter);
    }
    if (counterInTime(unit, counter, left)) {
      result = result.filter(
        (action) =>
          effectiveStepStartup(unit, action) + effectiveStepRecovery(unit, action) + lead < left ||
          interruptsRoot(state, unit, action, left),
      );
    }
  }
  const partner = partnerOf(state.units, unit);
  const held = counterOf(partner);
  if (partner !== null && held !== undefined && counterInTime(partner, held, left) && counterLead(partner, held) >= left) {
    result = result.filter((action) => !hasFlag(action.sys_flags, 'FLAG_SWAP'));
  }
  return result;
}

// [A-SEARCH-MOVEGEN] 常に「パス」を1候補として含める（拍止めの発射を除く）。実行可能アクションの列は
// executableActions（[M-PIPE-SUICIDE] を含む実行可否判定）をそのまま用いる。
// waitMoves は実効プロファイルの waitMoves（敵軍AI・参照プレイヤーAIの双方で真）。
export function generateMoves(state: BattleState, unit: Unit, waitMoves = false): readonly AiMove[] {
  const actions = applyCounterRules(state, unit, executableActions(state, unit));
  // 拍止めが残るのは発射の時機に限られ、そのとき候補手は拍止めのみとする。
  const counter = counterOf(unit);
  if (counter !== undefined && actions.includes(counter)) {
    return [{ kind: 'ACT', action: counter }];
  }
  // Array#sort は安定ソート（ES2019+）であるため、同ランク内は元の配列インデックス順を保つ。
  const sorted = [...actions].sort((a, b) => categoryRank(a) - categoryRank(b));
  const moves: AiMove[] = sorted.map((action) => ({ kind: 'ACT', action }));
  if (waitMoves) {
    for (const action of waitableActions(state, unit, actions)) {
      moves.push({ kind: 'WAIT', action });
    }
  }
  moves.push({ kind: 'PASS' });
  return moves;
}

// [A-PROFILE-BONUS] 手のタグ判定。
export function tagsOf(move: AiMove): readonly ActionTag[] {
  // [A-PROFILE-BONUS] WAIT はHPダメージを与える武技（拍止めを除く）を待つ待機手であり、上書きがなければ PASS の値に
  // 従う（actionBonusOf）。心気・拍止めを待つ待機手は、発射まで局面を変えないパスと同じく PASS とする。
  if (move.kind === 'PASS') {
    return ['PASS'];
  }
  if (move.kind === 'WAIT') {
    const strikes =
      hasFlag(move.action.sys_flags, 'FLAG_MARTIAL') && move.action.base_params.dmg_hp > 0 && move.action.master_ref !== ROOT_COUNTER_ID;
    return [strikes ? 'WAIT' : 'PASS'];
  }
  const params = move.action.base_params;
  const flags = move.action.sys_flags;
  const tags: ActionTag[] = [];
  if (flags.includes('FLAG_MIND')) tags.push('MIND');
  if (flags.includes('FLAG_MARTIAL')) tags.push('MARTIAL');
  if (flags.includes('FLAG_STANCE')) tags.push('STANCE');
  if (flags.includes('FLAG_SUMMON')) tags.push('SUMMON');
  if (flags.includes('FLAG_SWAP')) tags.push('SWAP');
  if (flags.includes('FLAG_MARTIAL') && params.step_thought === 0 && params.def_efficiency > 0) {
    tags.push('RUSH');
  }
  if (flags.includes('FLAG_MARTIAL') && params.def_efficiency === 0) {
    tags.push('HEAVY');
  }
  if (params.interfere_pos !== 'NONE') tags.push('INTERFERE');
  if (params.dmg_vp > 0) tags.push('STRIP_VP');
  if (params.dmg_pp > 0) tags.push('STRIP_PP');
  if (params.dmg_ap > 0) tags.push('STRIP_AP');
  if (Object.keys(params.give_debuff).length > 0) tags.push('DEBUFF');
  if (params.give_seal > 0) tags.push('SEAL');
  if (params.give_slip > 0) tags.push('SLIP');
  if (params.initial_copy_val > 0) tags.push('COPY');
  if (params.cost_hp > 0) tags.push('SELF_HARM');
  return tags;
}

// [A-PROFILE-BONUS] action_bonus_of(mv) = Σ bonus.get(tag, 0)。
export function moveBonusOf(move: AiMove, prof: EffectiveProfile): number {
  let total = 0;
  for (const tag of tagsOf(move)) {
    total += actionBonusOf(prof, tag);
  }
  return total;
}

// 隊列交代の後に他のアクションを実行していない思考中のユニット（経過したステップ数を問わない）。
function unmovedSinceSwap(unit: Unit | null): boolean {
  return (
    unit !== null &&
    unit.state === 'THOUGHT' &&
    unit.last_act !== null &&
    hasFlag(unit.last_act.sys_flags, 'FLAG_SWAP')
  );
}

// [A-PROFILE-BONUS]［再交代の減点］再交代：交代の後に他のアクションを実行していないユニット（実行者または相方）を
// 含む組の隊列交代。交代と戻しの繰り返しは局面を変えずにパスの減点を回避し、相方の経過思考を0へ戻し続けるため、
// パスより1だけ大きい減点を課して、評価がパスを上回る場合に限り選ばれるようにする。
export function isReswap(state: BattleState, unit: Unit, move: AiMove): boolean {
  if (move.kind !== 'ACT' || !hasFlag(move.action.sys_flags, 'FLAG_SWAP')) {
    return false;
  }
  return unmovedSinceSwap(unit) || unmovedSinceSwap(partnerOf(state.units, unit));
}

// 再交代の減点 = 当該プロファイルの PASS の値 − 1（プロファイルの上書きを含む）。
export function reswapPenaltyOf(state: BattleState, unit: Unit, move: AiMove, prof: EffectiveProfile): number {
  return isReswap(state, unit, move) ? actionBonusOf(prof, 'PASS') - 1 : 0;
}
