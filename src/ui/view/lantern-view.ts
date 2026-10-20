// [S-BG-INTERMISSION]・[S-LOOK-LANTERN] インターミッションに重ねる燈の状態。表示のたびにステートから導出する。

import type { GameMasters } from '../../engine/run/masters.js';
import { sceneOf } from '../../engine/run/masters.js';
import type { RunState } from '../../engine/run/state.js';

const SOCKETS = 5;

// 煤の層（[S-LOOK-LANTERN]【煤の層】）。浅い・深い・皆無が見分けられればよく、輪の数を数えられる精度は要らない。
export type SootDepth = 'NONE' | 'RINGS' | 'COVERED' | 'BURIED';

export interface LanternView {
  readonly closed: number; // 閉じた受け口（5 − attendant_capacity）
  readonly empty: number; // 魂のない芯（attendant_capacity − party の要素数 − ash_core_count）
  readonly souls: number; // 魂の宿る芯（party の要素数）
  readonly ash: number; // 空芯（ash_core_count）
  readonly soot: SootDepth;
  readonly rings: number; // RINGS のときの輪の数（1〜9）
}

export function sootOf(rewindCount: number): { readonly soot: SootDepth; readonly rings: number } {
  if (rewindCount <= 0) {
    return { soot: 'NONE', rings: 0 };
  }
  if (rewindCount < 10) {
    return { soot: 'RINGS', rings: rewindCount };
  }
  return { soot: rewindCount < 100 ? 'COVERED' : 'BURIED', rings: 0 };
}

export function lanternView(run: RunState, masters: GameMasters, rewindCount: number): LanternView {
  const capacity = sceneOf(masters, run.current_scene_id).attendant_capacity;
  const souls = run.party.length;
  const ash = run.ash_core_count;
  return {
    closed: SOCKETS - capacity,
    empty: Math.max(capacity - souls - ash, 0),
    souls,
    ash,
    ...sootOf(rewindCount),
  };
}
