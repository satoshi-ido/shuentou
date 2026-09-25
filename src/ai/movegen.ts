// [A-SEARCH-MOVEGEN] 候補手の生成規則。[A-TIE-BREAK] の優先度1（アクション区分）・
// 優先度4（所持アクション配列インデックス昇順）を実装する。優先度2・3（ユニット種別・マス配置idx）
// は同時手（joint action）の組の順序として探索器が扱う（[A-SEARCH-ROOT]［joint action の規則］）。
// [A-PROFILE-BONUS] アクション種別ボーナスのタグ判定もここに置く。

import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { executableActions, isInstant } from '../engine/decision.js';
import { currentDefense } from '../engine/defense.js';
import { effectiveAtk, effectiveRange } from '../engine/effective.js';
import { hasFlag } from '../engine/flags.js';
import { partnerOf } from '../engine/resolve/partner.js';
import type { ActionInstance, BattleState, Unit } from '../engine/types.js';
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

function isRootAction(action: ActionInstance): boolean {
  return (ACTION_MASTERS as Readonly<Record<string, { readonly is_root: boolean }>>)[action.master_ref]?.is_root === true;
}

// [A-SEARCH-MOVEGEN]「待機手」必要思考のみが未充足の武技（マスター根源武技を除く）で、発射の条件のうち
// 実行可能であること以外が成立するもの。所持アクション配列の順。
function waitableActions(state: BattleState, unit: Unit, executable: readonly ActionInstance[]): ActionInstance[] {
  const matured: Unit = { ...unit, elapsed_thought: Number.MAX_SAFE_INTEGER };
  const whenMatured = executableActions(state, matured).map((action) => action.instance_id);
  // 相手陣営の前列マス（[M-FIELD-GRID]）。発射の条件は [A-SEARCH-NODE]［待機手の約定］による。
  const front = state.units[unit.side === 'MINE' ? 2 : 1] ?? null;
  return unit.acts.filter(
    (action) =>
      hasFlag(action.sys_flags, 'FLAG_MARTIAL') &&
      !isRootAction(action) &&
      !executable.includes(action) &&
      whenMatured.includes(action.instance_id) &&
      front !== null &&
      front.unit_kind === 'MASTER' &&
      effectiveAtk(unit, action) >= currentDefense(front) &&
      Math.abs(front.pos_idx - unit.pos_idx) <= effectiveRange(unit, action),
  );
}

// [A-SEARCH-MOVEGEN] 常に「パス」を1候補として含める。実行可能アクションの列は
// executableActions（[M-PIPE-SUICIDE] を含む実行可否判定）をそのまま用いる。
// waitMoves は実効プロファイルの waitMoves（参照プレイヤーAIに限り真）。
export function generateMoves(state: BattleState, unit: Unit, waitMoves = false): readonly AiMove[] {
  const actions = executableActions(state, unit);
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
  // [A-PROFILE-BONUS] WAIT は PASS と同じ既定値を用い、PASS の上書きに従う。
  if (move.kind === 'PASS' || move.kind === 'WAIT') {
    return ['PASS'];
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
