// [M-UI-SORT] アクション一覧の表示順序。所持アクション配列は左詰めで管理されるが、表示順は安定ソートで決める。

import { isActionExecutable } from '../../engine/decision.js';
import { effectiveCostAp, effectiveCostHp, effectiveCostPp, effectiveCostVp, effectiveStepThought } from '../../engine/effective.js';
import type { ActionInstance, BattleState, Unit } from '../../engine/types.js';

const SEAL_LIMIT_CENTI = 100;

// 1. 発動可能性ランク（0: 実行可能 / 1: コスト充足だが思考蓄積待ち / 2: コスト不足 / 3: 構造的に発動不可）。
export function activationRank(state: BattleState, unit: Unit, action: ActionInstance): 0 | 1 | 2 | 3 {
  if (action.uses_left === 0 || action.seal_accum >= SEAL_LIMIT_CENTI || unit.state !== 'THOUGHT') {
    return 3;
  }
  if (isActionExecutable(state, unit, action)) {
    return 0;
  }
  const costsMet =
    unit.hp > effectiveCostHp(unit, action) &&
    unit.vp >= effectiveCostVp(unit, action) &&
    unit.pp >= effectiveCostPp(unit, action) &&
    unit.ap >= effectiveCostAp(unit, action);
  return costsMet ? 1 : 2;
}

// 1 → 2（必要思考実効値の昇順）→ 3（配列インデックス昇順）の安定ソート。
export function sortedActions(state: BattleState, unit: Unit): ActionInstance[] {
  return unit.acts
    .map((action, index) => ({ action, index }))
    .sort((a, b) => {
      const rank = activationRank(state, unit, a.action) - activationRank(state, unit, b.action);
      if (rank !== 0) {
        return rank;
      }
      const thought = effectiveStepThought(unit, a.action) - effectiveStepThought(unit, b.action);
      return thought !== 0 ? thought : a.index - b.index;
    })
    .map((entry) => entry.action);
}
