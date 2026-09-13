// [M-RESOLVE-INTERFERE] 位置干渉解決アルゴリズム。
// 発火条件（[M-RESOLVE-MARTIAL] が命中判定を基に判定済み）を前提に、
// 両マス占有・生存・回数制限を検査したうえで前列⇔後列の入れ替えを適用する。

import type { Side, Unit } from '../types.js';
import type { InterferenceRequest } from './martial.js';

function slotsOf(side: Side): { readonly front: number; readonly back: number } {
  return side === 'MINE' ? { front: 1, back: 0 } : { front: 2, back: 3 };
}

// 同一ステップ内・当該陣営に対する成立回数（[M-PIPE-P2-APPLY]#3-4）を1回に制限するため、
// 呼び出し側が「成立済み陣営」の配列を保持し、本関数へ都度渡す。
export function applyInterference(
  units: (Unit | null)[],
  request: InterferenceRequest,
  alreadyAppliedSides: readonly Side[],
): boolean {
  if (alreadyAppliedSides.includes(request.side)) {
    return false; // #4 回数制限
  }
  const { front, back } = slotsOf(request.side);
  const frontUnit = units[front];
  const backUnit = units[back];
  if (frontUnit === null || backUnit === null) {
    return false; // #2 両マス占有の判定
  }
  if (frontUnit.state === 'PENDING_DISCARD' || backUnit.state === 'PENDING_DISCARD') {
    return false; // #3 生存の判定
  }
  units[front] = backUnit;
  units[back] = frontUnit;
  backUnit.pos_idx = front;
  frontUnit.pos_idx = back;
  return true;
}
