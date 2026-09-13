// [M-DATA-INSTANTIATE] マスタからアクションインスタンスへの実体化。
// M1 時点で実装する経路は「主人公の初期キット」「敵マスターの所持アクション配列」のみ。
// 継承・コピー・秘蹟覚醒の各経路は [M-CH-INHERIT]・[M-END-SACRAMENT] 実装時に追加する。

import type { ActionMasterRecord } from '../data/types.js';
import { roundDiv } from '../num/helpers.js';
import { deriveSysFlags } from './flags.js';
import { INFINITE_USES } from './params.js';
import type { ActionInstance } from './types.js';

// [M-CALC-ROUNDING]「基本整数」区分：実効初期使用回数 = round(base_uses / 100)。
function usesInitialFromBaseUses(baseUses: number): number {
  if (baseUses === INFINITE_USES) {
    return INFINITE_USES;
  }
  return roundDiv(baseUses, 100);
}

let nextInstanceIdSeq = 0;

// [I-STATE-ID] IID + 4桁ゼロ詰め連番。
export function resetInstanceIdSeq(startAt = 0): void {
  nextInstanceIdSeq = startAt;
}

function nextInstanceId(): string {
  const id = `IID${String(nextInstanceIdSeq).padStart(4, '0')}`;
  nextInstanceIdSeq += 1;
  return id;
}

// [M-DATA-INSTANTIATE] 手順1〜6（継承経路を除く。乗算係数は等倍として扱う）。
export function instantiateAction(record: ActionMasterRecord): ActionInstance {
  const baseParams = { ...record.params }; // 1. 複製（等倍。2-3: 丸め不要）
  const sysFlags = deriveSysFlags(baseParams); // 4.
  const instanceId = nextInstanceId(); // 5.
  return {
    instance_id: instanceId,
    master_ref: record.class_id,
    sys_flags: sysFlags,
    base_params: baseParams,
    uses_left: usesInitialFromBaseUses(record.base_uses), // 6.
    seal_accum: 0,
    is_copy: false,
    copy_fixation: 0,
  };
}

// 所持アクション配列（左詰め）を、指定した class_id の順序でまとめて実体化する。
export function instantiateActionList(
  classIds: readonly string[],
  masters: Readonly<Record<string, ActionMasterRecord>>,
): ActionInstance[] {
  return classIds.map((classId) => {
    const record = masters[classId];
    if (record === undefined) {
      throw new Error(`未知のアクションクラスID: ${classId}`);
    }
    return instantiateAction(record);
  });
}
