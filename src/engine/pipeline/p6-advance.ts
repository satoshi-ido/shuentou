// [M-PIPE-P6-ADVANCE] 《処理6》自動前進。

import type { BattleState } from '../types.js';

export function runP6Advance(state: BattleState): void {
  if (state.units[0] !== null && state.units[1] === null) {
    const unit = state.units[0]!;
    state.units[1] = unit;
    state.units[0] = null;
    unit.pos_idx = 1;
  }
  if (state.units[3] !== null && state.units[2] === null) {
    const unit = state.units[3]!;
    state.units[2] = unit;
    state.units[3] = null;
    unit.pos_idx = 2;
  }
}
