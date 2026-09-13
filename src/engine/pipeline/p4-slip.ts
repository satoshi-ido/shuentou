// [M-PIPE-P4-SLIP] 《処理4》通常型スリップの一斉計算と適用。

import { levelSlipDamage } from '../calc.js';
import type { BattleState } from '../types.js';

export function runP4Slip(state: BattleState, recoveryCompleteIds: readonly string[]): void {
  for (const unit of state.units) {
    if (unit === null || !recoveryCompleteIds.includes(unit.unit_id)) {
      continue;
    }
    const damage = levelSlipDamage(unit.slip, state.scene_level);
    unit.hp = unit.hp - damage;
    if (unit.hp <= 0) {
      unit.state = 'PENDING_DISCARD';
    }
  }
}
