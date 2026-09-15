// [M-UI-SCREENS] 画面一覧と重畳。各画面への遷移条件は規定元に従い、本モジュールは提示に必要な値を組み立てる。
// 重畳する要素（設定・辞典・確認ダイアログ）は画面を遷移させず、同時に開くのは1件に限る。

import type { AttendantMasterRecord, HelpMasterRecord, SceneMasterRecord } from '../../data/types.js';
import type { InheritTarget } from '../../engine/progress/inherit.js';
import type { SaveData } from '../../engine/meta/types.js';
import type { RunState } from '../../engine/run/state.js';

export type ScreenKind = 'TITLE' | 'PRE_BATTLE' | 'BATTLE' | 'INTERMISSION' | 'REFILL' | 'ENDING';
export type OverlayKind = 'NONE' | 'CONFIG' | 'DICTIONARY' | 'CONFIRM' | 'ROLLBACK';

// [M-UI-SCREENS] 画面は phase から定まる。従者補充は INTERMISSION のうちアクト移行の段（[M-PROG-REFILL]）。
export function screenOf(run: RunState): ScreenKind {
  switch (run.phase) {
    case 'PRE_BATTLE':
      return 'PRE_BATTLE';
    case 'BATTLE':
      return 'BATTLE';
    case 'ENDING':
      return 'ENDING';
    default:
      return run.intermission_stage === 'TRANSITION' ? 'REFILL' : 'INTERMISSION';
  }
}

// [M-UI-OBJECTIVE] 進行位置は次に遷移するシーンの order（2〜31）。31（最終インターミッション）は非表示。
export const OBJECTIVE_VOID_LORD = 'STR_OBJECTIVE_VOID_LORD';
export const OBJECTIVE_VEIN = 'STR_OBJECTIVE_VEIN';

export function objectiveStringId(order: number): string | null {
  if (order >= 2 && order <= 20) {
    return OBJECTIVE_VOID_LORD;
  }
  if (order >= 21 && order <= 30) {
    return OBJECTIVE_VEIN;
  }
  return null; // 進行位置 31：シーン5-11に建前が存在しないため提示しない
}

export interface TitleView {
  readonly hasSave: boolean;
  readonly runClosed: boolean; // 周回終了済みのセーブでは進行を再開できない（STR_TITLE_RUN_CLOSED）
}

export function titleView(save: SaveData | null): TitleView {
  return { hasSave: save !== null, runClosed: save !== null && save.run.phase === 'ENDING' };
}

export interface PreBattleView {
  readonly sceneName: string;
  readonly sceneNumber: string;
  readonly enemyName: string;
  // [M-DATA-HELPMASTER] 初出キーに対応する解説を、バトル開始前演出フェーズで1度だけ自動提示する。
  readonly firstSightHelpIds: readonly string[];
}

export function sceneNumberOf(sceneId: string): string {
  return sceneId.replace('SCENE_', '').replace('_', '-');
}

export function firstSightHelps(
  scene: SceneMasterRecord,
  helps: Readonly<Record<string, HelpMasterRecord>>,
  helpSeen: Readonly<Record<string, boolean>>,
): string[] {
  return Object.values(helps)
    .filter((help) => help.unlock_key !== null && scene.unlock.includes(help.unlock_key) && helpSeen[help.help_id] !== true)
    .map((help) => help.help_id)
    .sort();
}

export interface PartySlotView {
  readonly attendantId: string;
  readonly name: string;
  readonly epithet: string;
  readonly inheritState: 'UNUSED' | 'SPENT' | 'FORFEITED';
  readonly canSacrifice: boolean;
}

// [M-PROG-SACRIFICE] 供犠により消滅した従者（壇の脇に並べる）。
export interface FallenView {
  readonly attendantId: string;
  readonly name: string;
  readonly epithet: string;
}

// [M-INHERIT-MERGE]［UI要件］継承対象1件分のプレビュー。選択中の従者の係数を適用した後の値を持つ。
export interface InheritOptionView {
  readonly target: InheritTarget;
  readonly label: string;
  readonly kind: 'MAX_HP' | 'NEW_SLOT' | 'MERGE' | 'VANISH';
  readonly steps: { readonly thought: number; readonly startup: number; readonly recovery: number } | null;
  readonly costs: readonly { readonly label: string; readonly value: number }[];
  readonly range: number | null;
  readonly atk: number | null;
  readonly uses: number | null; // 実効初期使用回数
  readonly hpAdd: number | null; // 最大HP加算
  readonly improved: readonly string[]; // 統合による改善項目（[M-STATE-PARAMIDS] の表示名）
}

export interface IntermissionView {
  readonly objectiveStringId: string | null;
  readonly sceneName: string; // 次に遷移するシーン
  readonly sceneNumber: string;
  readonly slots: readonly PartySlotView[];
  readonly fallen: readonly FallenView[];
  // 壇で選択中の従者。継承先・供犠の対象となる。
  readonly selectedAttendantId: string | null;
  readonly pool: readonly InheritOptionView[];
  readonly canSettle: boolean;
  readonly isActTransition: boolean;
  // [M-PROG-NOATTENDANT] 同行従者0人では継承・供犠を行えない（STR_LOCK_NO_ATTENDANT）。
  readonly noAttendant: boolean;
  // 一度だけ提示するシステム文言（アンドゥ履歴が空である旨など）。提示がなければ空文字。
  readonly noticeText: string;
}

export interface RefillView {
  readonly slotCount: number; // 当該アクトの従者定員
  readonly remainCount: number; // 定員 − 選択済み人数
  readonly pool: readonly { readonly attendantId: string; readonly name: string; readonly epithet: string }[];
  readonly canSettle: boolean;
}

export function attendantName(attendants: Readonly<Record<string, AttendantMasterRecord>>, attendantId: string): string {
  return attendants[attendantId]?.display_name ?? attendantId;
}

export function attendantEpithet(attendants: Readonly<Record<string, AttendantMasterRecord>>, attendantId: string): string {
  return attendants[attendantId]?.epithet ?? '';
}

// [M-DATA-HELPMASTER]［随時参照］辞典は分類ごとに表示順で並べる。
export interface DictionaryEntry {
  readonly helpId: string;
  readonly category: HelpMasterRecord['category'];
  readonly order: number;
  readonly seen: boolean;
}

export const DICTIONARY_CATEGORIES: readonly HelpMasterRecord['category'][] = ['RESOURCE', 'STEP', 'ACTION', 'PROGRESS', 'UI'];

export function dictionaryEntries(
  helps: Readonly<Record<string, HelpMasterRecord>>,
  helpSeen: Readonly<Record<string, boolean>>,
): DictionaryEntry[] {
  return Object.values(helps)
    .map((help) => ({ helpId: help.help_id, category: help.category, order: help.order, seen: helpSeen[help.help_id] === true }))
    .sort((a, b) => {
      const category = DICTIONARY_CATEGORIES.indexOf(a.category) - DICTIONARY_CATEGORIES.indexOf(b.category);
      return category !== 0 ? category : a.order - b.order;
    });
}
