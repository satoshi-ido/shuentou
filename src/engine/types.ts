// [M-STATE-UNIT] [M-STATE-ACTION] [M-STATE-LASTACTION] [M-STATE-BATTLESTATE] [M-STATE-FLAGS]
// バトル中のステート表現。I-STATE-JSON によりJSONで表現できる値のみで構成する
// （Map/Set を用いず、辞書は素のオブジェクト、集合はソート済み配列とする）。

import type { ActionParams } from '../data/types.js';
import type { ParamId } from './params.js';

export type Side = 'MINE' | 'FOE';
export type UnitKind = 'MASTER' | 'CREATURE';
export type UnitLifeState = 'THOUGHT' | 'STARTUP' | 'RECOVERY' | 'PENDING_DISCARD';

// [M-STATE-FLAGS] 系統フラグ。ビットフラグ集合の代わりにソート済み配列（重複なし）で表す。
export type SysFlag =
  | 'FLAG_SUMMON'
  | 'FLAG_SWAP'
  | 'FLAG_MIND'
  | 'FLAG_MARTIAL'
  | 'FLAG_STANCE'
  | 'FLAG_PURIFY';
export type SysFlags = readonly SysFlag[];

// [M-STATE-LASTACTION]
export interface LastActionSnapshot {
  readonly instance_id: string;
  readonly class_id: string;
  readonly sys_flags: SysFlags;
  readonly params: ActionParams;
  readonly uses_left_before: number;
  readonly is_copy: boolean;
}

// [M-STATE-ACTION] ActionInstance。base_params は [M-CALC-PIPELINE]#1 で確定した静的パラメータ基礎値であり、
// 統合（[M-INHERIT-MERGE]）でのみ更新される。merge_params は統合キーの基礎値部分（係数適用前）。
export interface ActionInstance {
  readonly instance_id: string;
  readonly master_ref: string; // class_id
  sys_flags: SysFlags;
  base_params: ActionParams;
  readonly merge_params: ActionParams;
  uses_initial: number; // 無限は INFINITE_USES(-1)
  uses_left: number; // 無限は INFINITE_USES(-1)
  seal_accum: number; // centi
  is_copy: boolean;
  copy_fixation: number; // centi
}

// [M-STATE-UNIT]
export interface Unit {
  readonly unit_id: string;
  readonly side: Side;
  readonly unit_kind: UnitKind;
  pos_idx: number; // 0-3
  hp: number;
  readonly max_hp: number;
  vp: number;
  pp: number;
  ap: number;
  state: UnitLifeState;
  elapsed_thought: number;
  elapsed_startup: number;
  elapsed_recovery: number;
  acts: ActionInstance[]; // 左詰め管理
  slip: number; // centi
  buff: Record<ParamId, number>; // centi
  debuff: Record<ParamId, number>; // centi
  last_act: LastActionSnapshot | null;
  applied_recovery: number;
}

// [M-UI-WATCH] 監視条件5種。キーの並びは同項「同時成立時の提示順序」③に一致させる。
export const WATCH_KINDS = ['READY', 'STUN', 'HIT_FRONT', 'HIT_BACK', 'EVADE'] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];
export type WatchFlags = Record<WatchKind, boolean>;

// [M-DATA-PAUSE-REASON]［停止事由レコード］
export type PauseReasonCode = 'STEP0_READY' | 'ENEMY_START' | 'ENEMY_IMMEDIATE' | 'WATCH_MET' | 'MANUAL_PAUSE';

export interface PauseReason {
  readonly code: PauseReasonCode;
  readonly unit_id: string | null;
  readonly instance_id: string | null;
  readonly watch_kind: WatchKind | null;
  readonly remaining_steps: number | null;
}

// [M-STATE-BATTLESTATE]（定跡の項目は定跡の実装時に追加する）
// instance_id_seq は [M-STATE-RUNSTATE] が保持する採番カウンタであり、BattleState に含めない（[I-STATE-ID]）。
export interface BattleState {
  step: number;
  scene_level: number;
  units: (Unit | null)[]; // 添字が pos_idx と一致（要素数4）
  unit_id_seq: number;
  instant_used: Record<string, string[]>; // unit_id -> class_id の昇順配列
  watching: Record<string, WatchFlags>; // アクションインスタンスID -> 監視ON/OFF
  watch_prev_met: Record<string, WatchFlags>; // アクションインスタンスID -> 直前ステップの充足状態
  pause_reason: PauseReason | null;
}
