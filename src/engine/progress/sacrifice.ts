// [M-PROG-SACRIFICE] [M-PROG-NOATTENDANT] 供犠。

import type { RunState } from '../run/state.js';

export function insertSorted(values: readonly string[], value: string): string[] {
  return [...values, value].sort();
}

// ［実行回数］当該インターミッション開始時のスナップショットとの比較で判定する。
function sacrificedThisIntermission(run: RunState): boolean {
  const start = run.im_snapshots[run.im_snapshots.length - 1];
  return start !== undefined && run.sacrificed.length > start.state.sacrificed.length;
}

export function canSacrifice(run: RunState, attendantId: string): boolean {
  return (
    run.phase === 'INTERMISSION' &&
    run.intermission_stage === 'INHERIT' &&
    !sacrificedThisIntermission(run) &&
    run.party.some((slot) => slot.attendant_id === attendantId)
  );
}

// 事前条件は canSacrifice。
export function applySacrifice(run: RunState, attendantId: string): void {
  run.party = run.party.filter((slot) => slot.attendant_id !== attendantId);
  run.sacrificed = insertSorted(run.sacrificed, attendantId);
  run.hero_hp = run.hero_max_hp;
}
