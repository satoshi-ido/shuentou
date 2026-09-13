// [M-PIPE-P5-DISCARD] 《処理5》通常破棄と勝敗判定。

import type { BattleState } from '../types.js';

export type BattleOutcome = 'NONE' | 'WIN' | 'LOSS';

function hasMaster(state: BattleState, side: 'MINE' | 'FOE'): boolean {
  return state.units.some((unit) => unit !== null && unit.side === side && unit.unit_kind === 'MASTER');
}

export function runP5Discard(state: BattleState): BattleOutcome {
  // 1. 通常破棄（一括撤去）。
  for (let idx = 0; idx < state.units.length; idx += 1) {
    const unit = state.units[idx];
    if (unit !== null && unit.state === 'PENDING_DISCARD') {
      state.units[idx] = null;
    }
  }

  // 2. 勝敗判定。
  const mineAlive = hasMaster(state, 'MINE');
  const foeAlive = hasMaster(state, 'FOE');
  const outcome: BattleOutcome = !mineAlive ? 'LOSS' : !foeAlive ? 'WIN' : 'NONE';

  // 3. 勝敗決定時：残存クリーチャーを即座に物理撤去する。
  if (outcome !== 'NONE') {
    for (let idx = 0; idx < state.units.length; idx += 1) {
      state.units[idx] = null;
    }
  }
  return outcome;
}
