// [M-STATE-RUNSTATE] [M-STATE-HISTORY] [M-STATE-IMSNAPSHOT] [M-META-MIRRORSTATS]
// 周回進行ステートとその内包ステートの型。[I-STATE-JSON] に適合する値のみで構成する。

import type { ActionInstance, BattleState } from '../types.js';

export type Phase = 'PRE_BATTLE' | 'BATTLE' | 'INTERMISSION' | 'ENDING';
export type IntermissionStage = 'INHERIT' | 'TRANSITION';
export type InheritState = 'UNUSED' | 'SPENT' | 'FORFEITED';

// [M-STATE-RUNSTATE]［同行枠］
export interface PartySlot {
  readonly attendant_id: string;
  inherit_state: InheritState;
}

export type MirrorSystem = 'NONE' | 'SUMMON' | 'MIND' | 'MARTIAL' | 'STANCE';

// [M-META-MIRRORSTATS] counts は 武技 / 体勢 / 心気 / 召喚 の順の4要素。
export interface MirrorStats {
  counts: number[];
  first_system: MirrorSystem;
}

// [M-STATE-RUNSTATE]
export interface RunState {
  current_scene_id: string;
  phase: Phase;
  intermission_stage: IntermissionStage | null;
  hero_max_hp: number;
  hero_hp: number;
  hero_acts: ActionInstance[];
  instance_id_seq: number;
  party: PartySlot[];
  recruited: string[]; // 従者ID昇順
  sacrificed: string[]; // 従者ID昇順
  enshrined_count: number;
  cross_unlocked: Record<string, boolean>;
  mirror_stats: MirrorStats | null;
  battle_state: BattleState | null;
  history_stack: HistoryEntry[];
  im_snapshots: ImSnapshot[];
}

// [M-STATE-HISTORY]［スナップショット対象］im_snapshots・history_stack を除く全項目。
export type RunProgress = Omit<RunState, 'history_stack' | 'im_snapshots'>;

type HeroKeys = 'hero_max_hp' | 'hero_hp' | 'hero_acts';

// [M-STATE-HISTORY]［主人公3項目の扱い］phase == BATTLE の区間は主人公3項目を記録しない。
export type BattleHistoryEntry = Omit<RunProgress, HeroKeys> & { phase: 'BATTLE'; battle_state: BattleState };
export type IntermissionHistoryEntry = RunProgress & { phase: 'INTERMISSION'; battle_state: null };
export type HistoryEntry = BattleHistoryEntry | IntermissionHistoryEntry;

// [M-STATE-IMSNAPSHOT]
export interface ImSnapshot {
  readonly order: number;
  readonly state: RunProgress;
}
