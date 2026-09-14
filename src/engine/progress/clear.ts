// [M-PROG-CLEAR] [M-STATE-RUNSTATE]［主人公ステートの正本］ バトルクリア共通決済。

import type { Unit } from '../types.js';
import { sceneByOrder, sceneOf, type GameMasters } from '../run/masters.js';
import { toImSnapshot } from '../run/snapshot.js';
import type { RunState } from '../run/state.js';

const FINAL_ORDER = 31; // [M-STATE-IMSNAPSHOT] order == 31 のスナップショットは記録しない

function heroUnit(run: RunState): Unit {
  const hero = run.battle_state?.units.find((unit) => unit !== null && unit.side === 'MINE' && unit.unit_kind === 'MASTER');
  if (hero === undefined || hero === null) {
    throw new Error('バトルクリア決済の対象となる主人公が存在しない');
  }
  return hero;
}

// 勝利確定直後の RunState（phase == BATTLE）に適用する。
export function settleBattleClear(run: RunState, masters: GameMasters): void {
  const cleared = sceneOf(masters, run.current_scene_id);
  const hero = heroUnit(run);

  // 1. HPの維持。2〜4. 動的リソース・状態異常・直前アクション記憶の初期化。
  hero.vp = 0;
  hero.pp = 0;
  hero.ap = 0;
  hero.slip = 0;
  for (const id of Object.keys(hero.buff) as (keyof Unit['buff'])[]) {
    hero.buff[id] = 0;
    hero.debuff[id] = 0;
  }
  hero.last_act = null;
  // 5. コピーアクションの撤去（クリーチャーは勝敗決定時に撤去済み、[M-PIPE-P5-DISCARD]#3）。
  const acts = hero.acts.filter((action) => !action.is_copy);
  for (const action of acts) {
    action.seal_accum = 0;
  }

  // [M-STATE-RUNSTATE]［主人公ステートの正本］BattleState から主人公3項目へ書き戻す。
  run.hero_max_hp = hero.max_hp;
  run.hero_hp = hero.hp;
  run.hero_acts = acts;
  run.battle_state = null;
  run.phase = 'INTERMISSION';
  run.current_scene_id = sceneByOrder(masters, cleared.order + 1).scene_id;

  // ［継承枠の初期化］
  for (const slot of run.party) {
    slot.inherit_state = 'UNUSED';
  }
  run.intermission_stage = 'INHERIT';

  // [M-STATE-HISTORY]［破棄契機］2.
  run.history_stack = [];

  // 6. スナップショットの記録。
  if (cleared.order !== FINAL_ORDER) {
    run.im_snapshots.push(toImSnapshot(run, cleared.order));
  }
}
