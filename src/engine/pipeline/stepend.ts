// [M-PIPE-STEPEND] ステップ境界の一斉加算処理。

import type { BattleState } from '../types.js';

export function runStepEnd(state: BattleState): void {
  for (const unit of state.units) {
    if (unit === null) {
      continue;
    }
    if (unit.state === 'THOUGHT') {
      unit.elapsed_thought = unit.elapsed_thought + 1;
    } else if (unit.state === 'STARTUP') {
      unit.elapsed_startup = unit.elapsed_startup + 1;
    } else if (unit.state === 'RECOVERY') {
      unit.elapsed_recovery = unit.elapsed_recovery + 1;
    }
  }
  state.instant_used = {};
  state.step = state.step + 1;
}
