// [M-STATE-RUNSTATE] [M-DATA-HERO-INIT] [M-DATA-ATTENDANTMASTER] [M-META-COUNTERS] [M-META-PENDING]
// ニューゲーム時の初期値によるステート生成。

import { instantiateActionList } from '../instantiate.js';
import type { MetaCounters, RewindPending, SaveData } from '../meta/types.js';
import { sceneByOrder, type GameMasters } from './masters.js';
import type { RunState } from './state.js';

export const SAVE_VERSION = 4; // [M-META-SAVEDATA]［データバージョン］BattleState に鏡像統計を追加
const HERO_INIT_MAX_HP = 60; // [M-DATA-HERO-INIT]

function allFalse(keys: readonly string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of keys) {
    result[key] = false;
  }
  return result;
}

export function createInitialRun(masters: GameMasters): RunState {
  const counter = { instance_id_seq: 0 };
  const heroActs = instantiateActionList(masters.heroInitActions, masters.actions, counter);
  // [M-DATA-ATTENDANTMASTER] is_fixed == True のレコードはシーン1-01開始直後に固定編成される。
  const fixed = Object.values(masters.attendants)
    .filter((record) => record.is_fixed)
    .map((record) => record.attendant_id)
    .sort();
  return {
    current_scene_id: sceneByOrder(masters, 1).scene_id,
    phase: 'PRE_BATTLE',
    intermission_stage: null,
    hero_max_hp: HERO_INIT_MAX_HP,
    hero_hp: HERO_INIT_MAX_HP,
    hero_acts: heroActs,
    instance_id_seq: counter.instance_id_seq,
    party: fixed.map((attendantId) => ({ attendant_id: attendantId, inherit_state: 'UNUSED' })),
    recruited: fixed,
    sacrificed: [],
    enshrined_count: 0,
    cross_unlocked: allFalse(masters.crossIds),
    mirror_stats: null,
    battle_state: null,
    history_stack: [],
    im_snapshots: [],
  };
}

export function createInitialMeta(masters: GameMasters): MetaCounters {
  const enshrineAnchor: MetaCounters['enshrine_anchor'] = {};
  for (const attendantId of Object.keys(masters.attendants).sort()) {
    enshrineAnchor[attendantId] = null;
  }
  return {
    total_rewind_count: 0,
    echo_unlocked: allFalse(masters.echoIds),
    playthrough_count: 1,
    obsolete_name_revealed: false,
    help_seen: allFalse(masters.helpIds),
    enshrine_anchor: enshrineAnchor,
  };
}

export function createInitialPending(): RewindPending {
  return { rewind_pending: false, rewind_pending_type: 'NONE' };
}

export function createNewGame(masters: GameMasters): SaveData {
  return {
    save_version: SAVE_VERSION,
    meta: createInitialMeta(masters),
    pending: createInitialPending(),
    run: createInitialRun(masters),
  };
}
