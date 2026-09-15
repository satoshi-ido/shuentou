// [M-DATA-AUDIO-CUE] 発火契機の通知。受け口が与えられていない場合は何もしない。
// 通知はステートを変更せず、遷移にも関与しない（[M-CORE-DETERMINISM] の対象外）。

import type { CueSink } from '../cue.js';
import type { ResolveOutcome } from '../resolve/order.js';
import type { ActionInstance, BattleState, Unit } from '../types.js';

// ACTION_TRIGGER：当該アクションの発動時（統合解決パイプラインの Step 1 直前・[M-RESOLVE-ORDER]）。
export function emitTrigger(onCue: CueSink | undefined, unit: Unit, action: ActionInstance): void {
  onCue?.({
    kind: 'ACTION_TRIGGER',
    unitId: unit.unit_id,
    posIdx: unit.pos_idx,
    classId: action.master_ref,
    sysFlags: action.sys_flags,
  });
}

// HIT / MISS：武技の命中判定の確定時（[M-RESOLVE-MARTIAL]#3）。対象ごとに1件を通知する。
export function emitMartialResult(
  onCue: CueSink | undefined,
  state: BattleState,
  unit: Unit,
  action: ActionInstance,
  outcome: ResolveOutcome,
): void {
  if (onCue === undefined) {
    return;
  }
  const posOf = (unitId: string): number | null =>
    state.units.find((candidate) => candidate !== null && candidate.unit_id === unitId)?.pos_idx ?? null;
  for (const [kind, unitIds] of [
    ['HIT', outcome.hitUnitIds],
    ['MISS', outcome.missUnitIds],
  ] as const) {
    for (const unitId of unitIds) {
      const posIdx = posOf(unitId);
      if (posIdx === null) {
        continue; // 既に撤去された対象は通知しない
      }
      onCue({ kind, unitId, posIdx, classId: action.master_ref, sysFlags: action.sys_flags });
    }
  }
}
