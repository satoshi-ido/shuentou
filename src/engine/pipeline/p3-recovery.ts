// [M-PIPE-P3-RECOVERY] 《処理3》硬直満了判定とマーク処理。

import type { BattleState } from '../types.js';

export function runP3Recovery(state: BattleState): readonly string[] {
  const marked: string[] = [];
  for (const unit of state.units) {
    if (unit === null || unit.state !== 'RECOVERY') {
      continue;
    }
    if (unit.elapsed_recovery >= unit.applied_recovery) {
      marked.push(unit.unit_id);
    }
  }
  return marked;
}
