// [M-DATA-INSTANTIATE] [I-STATE-ID] マスタからアクションインスタンスへの実体化。
// 実装する経路は「主人公の初期キット」「敵マスターの所持アクション配列」「継承」。
// コピー・秘蹟覚醒・クリーチャーの各経路は該当機構の実装時に追加する。

import type { ActionMasterRecord } from '../data/types.js';
import { roundDiv } from '../num/helpers.js';
import { deriveSysFlags } from './flags.js';
import { INFINITE_USES } from './params.js';
import type { ActionInstance } from './types.js';

// [I-STATE-ID] 採番カウンタの保持者。[M-STATE-RUNSTATE] の instance_id_seq を指す。
export interface InstanceIdCounter {
  instance_id_seq: number;
}

// [M-CALC-ROUNDING]「基本整数」区分：実効初期使用回数 = round(base_uses / 100)。
export function usesInitialFromBaseUses(baseUses: number): number {
  if (baseUses === INFINITE_USES) {
    return INFINITE_USES;
  }
  return roundDiv(baseUses, 100);
}

// [I-STATE-ID] IID + 4桁ゼロ詰め連番。
export function allocateInstanceId(counter: InstanceIdCounter): string {
  const id = `IID${String(counter.instance_id_seq).padStart(4, '0')}`;
  counter.instance_id_seq += 1;
  return id;
}

// [M-DATA-INSTANTIATE] 手順1〜6（乗算係数は等倍）。継承経路は [M-INHERIT-POOL] が手順2〜3を担う。
export function instantiateAction(record: ActionMasterRecord, counter: InstanceIdCounter): ActionInstance {
  const baseParams = { ...record.params }; // 1. 複製（等倍。2-3: 丸め不要）
  const sysFlags = deriveSysFlags(baseParams); // 4.
  const instanceId = allocateInstanceId(counter); // 5.
  const usesInitial = usesInitialFromBaseUses(record.base_uses);
  return {
    instance_id: instanceId,
    master_ref: record.class_id,
    sys_flags: sysFlags,
    base_params: baseParams,
    merge_params: { ...record.params },
    uses_initial: usesInitial,
    uses_left: usesInitial, // 6.
    seal_accum: 0,
    is_copy: false,
    copy_fixation: 0,
  };
}

// 所持アクション配列（左詰め）を、指定した class_id の順序でまとめて実体化する。
export function instantiateActionList(
  classIds: readonly string[],
  masters: Readonly<Record<string, ActionMasterRecord>>,
  counter: InstanceIdCounter,
): ActionInstance[] {
  return classIds.map((classId) => {
    const record = masters[classId];
    if (record === undefined) {
      throw new Error(`未知のアクションクラスID: ${classId}`);
    }
    return instantiateAction(record, counter);
  });
}
