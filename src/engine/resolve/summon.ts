// [M-RESOLVE-SUMMON] 召喚コンポーネント解決アルゴリズム（[M-RESOLVE-ORDER] Step 1）。
// クリーチャーマスタ（[M-DATA-CREATUREMASTER]）を引いて実体を組み立てるのは engine/creature.ts であり、
// 本モジュールは撤去と配置のみを担う。採番は当該バトルのステートが持つ連番を用いる（[I-STATE-ID]）。

import { hasFlag } from '../flags.js';
import type { ActionInstance, Unit } from '../types.js';
import { partnerSlotOf } from './partner.js';

// [I-STATE-ID] クリーチャーの実体化が消費する採番位置。BattleState をそのまま渡す。
export interface IdCounters {
  instance_id_seq: number;
  unit_id_seq: number;
}

export type CreatureFactory = (
  creatureId: string,
  posIdx: number,
  side: Unit['side'],
  ids: IdCounters,
) => Unit;

export function resolveSummon(
  units: (Unit | null)[],
  actor: Unit,
  action: ActionInstance,
  createCreature: CreatureFactory,
  ids: IdCounters,
): void {
  if (!hasFlag(action.sys_flags, 'FLAG_SUMMON') || action.base_params.summon_id === null) {
    return;
  }
  const summonSlotIdx = partnerSlotOf(actor.pos_idx);
  // 既存クリーチャーの物理撤去（生存・消滅猶予を問わない）。
  units[summonSlotIdx] = createCreature(action.base_params.summon_id, summonSlotIdx, actor.side, ids);
}
