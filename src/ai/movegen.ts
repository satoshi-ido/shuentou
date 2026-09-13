// [A-SEARCH-MOVEGEN] 候補手の生成規則。[A-TIE-BREAK] の優先度1（アクション区分）・
// 優先度4（所持アクション配列インデックス昇順）を実装する。優先度2・3（ユニット種別・マス配置idx）
// は同時手（joint action）比較時のみ意味を持ち、[A-DIFF-CONFIG] で joint_action=False の
// M2範囲（1-01, max_depth 3）では単一ユニットの決定点のみを扱うため対象外とする。
// [A-PROFILE-BONUS] アクション種別ボーナスのタグ判定もここに置く。

import { executableActions, isInstant } from '../engine/decision.js';
import type { ActionInstance, BattleState, Unit } from '../engine/types.js';
import { actionBonusOf, type ActionTag, type EffectiveProfile } from './profile.js';

export type AiMove = { readonly kind: 'PASS' } | { readonly kind: 'ACT'; readonly action: ActionInstance };

// [A-TIE-BREAK] 優先度1：瞬動(0) → 即発(1) → 通常(2)。パスは別枠で末尾に置く。
function categoryRank(action: ActionInstance): number {
  if (isInstant(action)) {
    return action.base_params.step_recovery === 0 ? 0 : 1;
  }
  return 2;
}

// [A-SEARCH-MOVEGEN] 常に「パス」を1候補として含める。実行可能アクションの列は
// executableActions（[M-PIPE-SUICIDE] を含む実行可否判定）をそのまま用いる。
export function generateMoves(state: BattleState, unit: Unit): readonly AiMove[] {
  const actions = executableActions(state, unit);
  // Array#sort は安定ソート（ES2019+）であるため、同ランク内は元の配列インデックス順を保つ。
  const sorted = [...actions].sort((a, b) => categoryRank(a) - categoryRank(b));
  const moves: AiMove[] = sorted.map((action) => ({ kind: 'ACT', action }));
  moves.push({ kind: 'PASS' });
  return moves;
}

// [A-PROFILE-BONUS] 手のタグ判定。
export function tagsOf(move: AiMove): readonly ActionTag[] {
  if (move.kind === 'PASS') {
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
