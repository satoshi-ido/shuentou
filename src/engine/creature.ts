// [M-RESOLVE-SUMMON]［新クリーチャー実体化］ [M-DATA-CREATUREMASTER] [M-DATA-INSTANTIATE]
// 召喚コンポーネントが要求するクリーチャーを、クリーチャーマスタから初期ステートで組み立てる。
// 配置マスの決定は [M-RESOLVE-SUMMON] の相方マス規則に従い呼び出し側が行う。

import type { ActionMasterRecord, CreatureMasterRecord } from '../data/types.js';
import { allocateUnitId, createUnit } from './battle.js';
import { instantiateActionList } from './instantiate.js';
import type { CreatureFactory, IdCounters } from './resolve/summon.js';
import type { Unit } from './types.js';

export interface CreatureMastersRef {
  readonly creatures: Readonly<Record<string, CreatureMasterRecord>>;
  readonly actions: Readonly<Record<string, ActionMasterRecord>>;
}

export function createCreatureFactory(masters: CreatureMastersRef): CreatureFactory {
  return (creatureId: string, posIdx: number, side: Unit['side'], ids: IdCounters): Unit => {
    const record = masters.creatures[creatureId];
    if (record === undefined) {
      throw new Error(`未知のクリーチャーID: ${creatureId}`);
    }
    const acts = instantiateActionList(record.acts, masters.actions, ids);
    // ［初期ステート定義］思考中・経過0、VP/PP/AP 0、被スリップ量・被バフ量・被デバフ量 0、
    // 封印蓄積値 0。いずれも createUnit と instantiateAction の既定値がそのまま満たす。
    return createUnit(allocateUnitId(ids), side, 'CREATURE', posIdx, record.max_hp, record.max_hp, acts);
  };
}
