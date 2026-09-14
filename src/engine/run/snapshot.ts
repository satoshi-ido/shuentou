// [M-STATE-HISTORY] [M-STATE-IMSNAPSHOT] [I-STATE-SNAPSHOT]
// RunState と各スナップショットの相互変換。キーの並びを1箇所で固定し、JSON文字列化の結果を
// 同一操作列の再走どうしで一致させる。

import type { ActionInstance } from '../types.js';
import type { HistoryEntry, ImSnapshot, RunProgress, RunState } from './state.js';

// [I-STATE-SNAPSHOT] HistoryStack・インターミッションスナップショットの複製手段は構造化複製。
export function cloneState<T>(value: T): T {
  return structuredClone(value);
}

interface HeroFields {
  readonly hero_max_hp: number;
  readonly hero_hp: number;
  readonly hero_acts: ActionInstance[];
}

export function assembleRun(
  progress: Omit<RunProgress, keyof HeroFields>,
  hero: HeroFields,
  historyStack: HistoryEntry[],
  imSnapshots: ImSnapshot[],
): RunState {
  return {
    current_scene_id: progress.current_scene_id,
    phase: progress.phase,
    intermission_stage: progress.intermission_stage,
    hero_max_hp: hero.hero_max_hp,
    hero_hp: hero.hero_hp,
    hero_acts: hero.hero_acts,
    instance_id_seq: progress.instance_id_seq,
    party: progress.party,
    recruited: progress.recruited,
    sacrificed: progress.sacrificed,
    enshrined_count: progress.enshrined_count,
    cross_unlocked: progress.cross_unlocked,
    mirror_stats: progress.mirror_stats,
    battle_state: progress.battle_state,
    history_stack: historyStack,
    im_snapshots: imSnapshots,
  };
}

function progressOf(run: RunState): RunProgress {
  return {
    current_scene_id: run.current_scene_id,
    phase: run.phase,
    intermission_stage: run.intermission_stage,
    hero_max_hp: run.hero_max_hp,
    hero_hp: run.hero_hp,
    hero_acts: run.hero_acts,
    instance_id_seq: run.instance_id_seq,
    party: run.party,
    recruited: run.recruited,
    sacrificed: run.sacrificed,
    enshrined_count: run.enshrined_count,
    cross_unlocked: run.cross_unlocked,
    mirror_stats: run.mirror_stats,
    battle_state: run.battle_state,
  };
}

// [M-STATE-HISTORY]［スナップショット対象］［主人公3項目の扱い］
export function toHistoryEntry(run: RunState): HistoryEntry {
  const progress = cloneState(progressOf(run));
  if (progress.phase === 'BATTLE' && progress.battle_state !== null) {
    return {
      current_scene_id: progress.current_scene_id,
      phase: 'BATTLE',
      intermission_stage: progress.intermission_stage,
      instance_id_seq: progress.instance_id_seq,
      party: progress.party,
      recruited: progress.recruited,
      sacrificed: progress.sacrificed,
      enshrined_count: progress.enshrined_count,
      cross_unlocked: progress.cross_unlocked,
      mirror_stats: progress.mirror_stats,
      battle_state: progress.battle_state,
    };
  }
  if (progress.phase !== 'INTERMISSION' || progress.battle_state !== null) {
    throw new Error(`HistoryStack へ記録できないフェーズ: ${progress.phase}`);
  }
  return { ...progress, phase: 'INTERMISSION', battle_state: null };
}

// 記録時点のステートを復元する。phase == BATTLE の項目は主人公3項目を現在のステートから引き継ぐ
// （同区間の主人公3項目はバトル開始後に変化しないため）。
export function fromHistoryEntry(entry: HistoryEntry, current: RunState, historyStack: HistoryEntry[]): RunState {
  const restored = cloneState(entry);
  const hero: HeroFields =
    restored.phase === 'BATTLE'
      ? { hero_max_hp: current.hero_max_hp, hero_hp: current.hero_hp, hero_acts: current.hero_acts }
      : restored;
  return assembleRun(restored, hero, historyStack, current.im_snapshots);
}

export function toImSnapshot(run: RunState, order: number): ImSnapshot {
  return { order, state: cloneState(progressOf(run)) };
}

export function fromImSnapshot(snapshot: ImSnapshot, imSnapshots: ImSnapshot[]): RunState {
  const state = cloneState(snapshot.state);
  return assembleRun(state, state, [], imSnapshots);
}

export function cloneRun(run: RunState): RunState {
  const copy = cloneState(run);
  return assembleRun(copy, copy, copy.history_stack, copy.im_snapshots);
}
