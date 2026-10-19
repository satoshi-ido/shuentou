// [M-STATE-RUNSTATE]【既知】【巻き戻し後の既知】[M-META-COUNTERS] furthest_order・furthest_cleared_order
// セインが過去の道行きで場面に着いたか・見届けたかの記録。既知感演出の条件に用いる（[S-REVEAL-STAGES-FOREKNOWN]）。

import { sceneOf, type GameMasters } from '../run/masters.js';
import type { RunState } from '../run/state.js';
import type { MetaCounters } from './types.js';

// [M-STATE-RUNSTATE]［集合型フィールドの表現］シーンID昇順のソート済み配列として保持する。
function addSorted(set: string[], sceneId: string): void {
  if (set.includes(sceneId)) {
    return;
  }
  set.push(sceneId);
  set.sort();
}

// バトル開始前演出フェーズの開始時。furthest_order の更新に先立って既知を判定する。
export function enterSceneIntro(meta: MetaCounters, run: RunState, masters: GameMasters): void {
  const scene = sceneOf(masters, run.current_scene_id);
  if (meta.furthest_order >= scene.order) {
    addSorted(run.foreknown_scenes, scene.scene_id);
  }
  if (meta.furthest_cleared_order >= scene.order) {
    addSorted(run.forecleared_scenes, scene.scene_id);
  }
  meta.furthest_order = Math.max(meta.furthest_order, scene.order);
}

// バトルクリア共通決済の完了時。
export function recordSceneCleared(meta: MetaCounters, clearedOrder: number): void {
  meta.furthest_cleared_order = Math.max(meta.furthest_cleared_order, clearedOrder);
}

// アンドゥおよびロールバックを適用した直後、復元したステートへ戻り先までに通る場面を加える。
// R は current_scene_id の進行順（INTERMISSION では次に遷移するシーン）。周回移行では適用しない。
export function applyRewindKnowledge(run: RunState, masters: GameMasters): void {
  const resumeOrder = sceneOf(masters, run.current_scene_id).order;
  const inScene = run.phase === 'PRE_BATTLE' || run.phase === 'BATTLE';
  for (const scene of Object.values(masters.scenes)) {
    if (scene.order < resumeOrder) {
      addSorted(run.foreknown_scenes, scene.scene_id);
      addSorted(run.forecleared_scenes, scene.scene_id);
    } else if (scene.order === resumeOrder && inScene) {
      addSorted(run.foreknown_scenes, scene.scene_id);
    }
  }
}
