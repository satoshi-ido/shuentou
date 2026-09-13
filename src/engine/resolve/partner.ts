// 自陣における相方（マスター⇔クリーチャー）の参照。[M-FIELD-GRID] の陣営領域に基づく。

import type { Unit } from '../types.js';

const PARTNER_IDX: Readonly<Record<number, number>> = { 0: 1, 1: 0, 2: 3, 3: 2 };

export function partnerSlotOf(posIdx: number): number {
  return PARTNER_IDX[posIdx];
}

export function partnerOf(units: readonly (Unit | null)[], actor: Unit): Unit | null {
  return units[partnerSlotOf(actor.pos_idx)] ?? null;
}
