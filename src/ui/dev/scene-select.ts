// 開発用のシーン選択（[M-UI-SCREENS]［開発用のシーン選択］）。BGM・表示アセット・脚本を各シーンで確かめるために、
// 任意のシーンのバトル開始前演出から始める。起動時に指定した場合に限ってタイトルに出し、配布版の既定では出さない。
// 主人公は初期の能力・所持アクションのままとし、従者はそのアクトまでに加わる者を定員まで入れる。正規の道筋で
// 育てた状態ではないため、戦闘の難しさの確認には用いない。

import type { GameMasters } from '../../engine/run/masters.js';
import { sceneOf } from '../../engine/run/masters.js';
import { createNewGame } from '../../engine/run/newgame.js';
import { enterSceneIntro } from '../../engine/meta/foreknown.js';
import type { SaveData } from '../../engine/meta/types.js';

// 起動の指定（URL の ?scene-select）。Electron では起動引数 --scene-select を主プロセスが URL へ写す。
export function sceneSelectEnabled(search: string): boolean {
  return new URLSearchParams(search).has('scene-select');
}

export interface SceneEntry {
  readonly sceneId: string;
  readonly order: number;
  readonly label: string; // 「1-02 鉄鎖と秤」
}

export function sceneEntries(masters: GameMasters): SceneEntry[] {
  return Object.values(masters.scenes)
    .sort((left, right) => left.order - right.order)
    .map((scene) => ({
      sceneId: scene.scene_id,
      order: scene.order,
      label: `${scene.scene_id.replace(/^SCENE_/, '').replace('_', '-')} ${scene.display_name}`,
    }));
}

// 選んだシーンのバトル開始前演出から始めるセーブデータ。既知の記録は持たず、初見の版の脚本が選ばれる。
export function sceneJumpData(masters: GameMasters, sceneId: string): SaveData {
  const data = createNewGame(masters);
  const scene = sceneOf(masters, sceneId);
  const { run, meta } = data;
  const joined = Object.values(masters.attendants)
    .filter((record) => record.join_act <= scene.act)
    .sort((left, right) => Number(right.is_fixed) - Number(left.is_fixed) || left.join_act - right.join_act || left.attendant_id.localeCompare(right.attendant_id))
    .slice(0, scene.attendant_capacity)
    .map((record) => record.attendant_id);
  run.current_scene_id = sceneId;
  run.party = joined.map((attendantId) => ({ attendant_id: attendantId, inherit_state: 'UNUSED' }));
  run.recruited = [...joined].sort();
  run.enshrined_count = joined.filter((attendantId) => masters.attendants[attendantId]?.is_fixed !== true).length;
  run.foreknown_scenes = [];
  run.forecleared_scenes = [];
  meta.furthest_order = scene.order - 1;
  meta.furthest_cleared_order = scene.order - 1;
  enterSceneIntro(meta, run, masters);
  return data;
}
