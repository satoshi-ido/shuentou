// [S-SCRIPT-SCHEMA] [S-SCRIPT-TRIGGER] 発火点ごとに再生するレコードの選択。
// 同一の (trigger, anchor) を order の昇順に並べ、branch_group を共有するレコードからは
// condition が成立する1件のみを選ぶ。condition は発火した時点のステートで一括して評価する（[S-SCRIPT-CONDITION]）。

import type { ScriptMasterRecord, ScriptTrigger } from '../../data/types.js';
import { evaluateCondition } from './condition.js';

type Reader = Parameters<typeof evaluateCondition>[1];

function byScriptId(a: ScriptMasterRecord, b: ScriptMasterRecord): number {
  return a.script_id < b.script_id ? -1 : a.script_id > b.script_id ? 1 : 0;
}

export function scriptsAt(
  scripts: Readonly<Record<string, ScriptMasterRecord>>,
  trigger: ScriptTrigger,
  anchor: string | null,
  read: Reader,
): ScriptMasterRecord[] {
  const candidates = Object.values(scripts)
    .filter((record) => record.trigger === trigger && record.anchor === anchor)
    .sort((a, b) => a.order - b.order || byScriptId(a, b));
  const chosenGroups: string[] = [];
  const result: ScriptMasterRecord[] = [];
  for (const record of candidates) {
    if (record.branch_group !== null && chosenGroups.includes(record.branch_group)) {
      continue;
    }
    if (!evaluateCondition(record.condition, read)) {
      continue;
    }
    if (record.branch_group !== null) {
      chosenGroups.push(record.branch_group);
    }
    result.push(record);
  }
  return result;
}

// 残響・交差残響の発火点は再生対象の script_id を直接指定する（[S-SCRIPT-TRIGGER]）。
// 指定したレコードが branch_group を持つ場合は、同じグループで condition が成立する1件を選ぶ（[S-ECHO-SCHEMA]【版の切り替え】）。
export function scriptById(
  scripts: Readonly<Record<string, ScriptMasterRecord>>,
  scriptId: string,
  read: Reader,
): ScriptMasterRecord | null {
  const record = scripts[scriptId];
  if (record === undefined) {
    throw new Error(`脚本IDが見つからない: ${scriptId}`);
  }
  if (record.branch_group === null) {
    return evaluateCondition(record.condition, read) ? record : null;
  }
  const group = Object.values(scripts)
    .filter((candidate) => candidate.branch_group === record.branch_group)
    .sort(byScriptId);
  return group.find((candidate) => evaluateCondition(candidate.condition, read)) ?? null;
}
