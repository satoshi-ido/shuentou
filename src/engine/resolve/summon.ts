// [M-RESOLVE-SUMMON] 召喚コンポーネント解決アルゴリズム（[M-RESOLVE-ORDER] Step 1）。
// クリーチャーマスタ（[M-DATA-CREATUREMASTER]）はまだ生成対象になっていない（M1範囲外）ため、
// 新規クリーチャーの実体生成は呼び出し側が注入するファクトリに委ねる。

import { hasFlag } from '../flags.js';
import type { ActionInstance, Unit } from '../types.js';
import { partnerSlotOf } from './partner.js';

export type CreatureFactory = (creatureId: string, posIdx: number, side: Unit['side']) => Unit;

export function resolveSummon(
  units: (Unit | null)[],
  actor: Unit,
  action: ActionInstance,
  createCreature: CreatureFactory,
): void {
  if (!hasFlag(action.sys_flags, 'FLAG_SUMMON') || action.base_params.summon_id === null) {
    return;
  }
  const summonSlotIdx = partnerSlotOf(actor.pos_idx);
  // 既存クリーチャーの物理撤去（生存・消滅猶予を問わない）。
  units[summonSlotIdx] = createCreature(action.base_params.summon_id, summonSlotIdx, actor.side);
}
