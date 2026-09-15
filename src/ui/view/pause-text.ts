// [M-DATA-PAUSE-REASON] 自動時間停止の事由文言。事由コードに対応する文言マスタのレコードへ、
// 当該事由が供給する束（UNIT / ACTION / PAUSE）を渡して解決する。

import type { BattleState, PauseReason, PauseReasonCode, Unit, WatchKind } from '../../engine/types.js';
import type { BundleValues, StringTable, TextContext } from '../text.js';

// [M-DATA-PAUSE-REASON] 事由コードと文言IDの対応（コード名から機械的に合成しない）。
export const PAUSE_REASON_STRING_ID: Readonly<Record<PauseReasonCode, string>> = {
  STEP0_READY: 'STR_PAUSE_STEP0_READY',
  ENEMY_START: 'STR_PAUSE_ENEMY_START',
  ENEMY_IMMEDIATE: 'STR_PAUSE_ENEMY_IMMEDIATE',
  WATCH_MET: 'STR_PAUSE_WATCH_MET',
  MANUAL_PAUSE: 'STR_PAUSE_MANUAL',
};

// [M-DATA-PAUSE-REASON]［監視条件ラベル］監視条件と非対象状態に対応する文言ID。
export const WATCH_LABEL_STRING_ID: Readonly<Record<WatchKind | 'NA' | 'IDLE', string>> = {
  READY: 'STR_WATCH_READY',
  STUN: 'STR_WATCH_STUN',
  HIT_FRONT: 'STR_WATCH_HIT_FRONT',
  HIT_BACK: 'STR_WATCH_HIT_BACK',
  EVADE: 'STR_WATCH_EVADE',
  NA: 'STR_WATCH_NA',
  IDLE: 'STR_WATCH_IDLE',
};

export interface UnitTextSources {
  readonly unitName: (unit: Unit) => string;
  readonly unitRoleName: (unit: Unit) => string | null;
}

export interface PauseTextSources extends UnitTextSources {
  readonly strings: StringTable;
  readonly common: BundleValues;
  readonly actionName: (classId: string) => string;
}

function unitOf(state: BattleState, unitId: string | null): Unit | undefined {
  if (unitId === null) {
    return undefined;
  }
  return state.units.find((unit): unit is Unit => unit !== null && unit.unit_id === unitId);
}

// [M-DATA-INTERP]［文脈束］UNIT。停止事由のほか、相方に関する文言（[M-UI-HUD]［判定語彙］）でも用いる。
export function unitBundleOf(unit: Unit, sources: UnitTextSources): BundleValues {
  return {
    UnitName: sources.unitName(unit),
    UnitRoleName: sources.unitRoleName(unit) ?? '',
    UnitHp: unit.hp,
    UnitHpMax: unit.max_hp,
    UnitVp: unit.vp,
    UnitPp: unit.pp,
    UnitAp: unit.ap,
  };
}

export function pauseReasonText(state: BattleState, reason: PauseReason, sources: PauseTextSources): string {
  const bundles: NonNullable<TextContext['bundles']> = {};
  const unit = unitOf(state, reason.unit_id);
  if (unit !== undefined) {
    bundles.UNIT = unitBundleOf(unit, sources);
  }
  if (reason.instance_id !== null) {
    const action = unit?.acts.find((candidate) => candidate.instance_id === reason.instance_id);
    const classId = action?.master_ref ?? unit?.last_act?.class_id ?? reason.instance_id;
    bundles.ACTION = { ActionName: sources.actionName(classId) };
  }
  if (reason.watch_kind !== null || reason.remaining_steps !== null) {
    bundles.PAUSE = {
      WatchLabel: reason.watch_kind === null ? '' : sources.strings.resolve(WATCH_LABEL_STRING_ID[reason.watch_kind]),
      RemainingSteps: reason.remaining_steps ?? 0,
    };
  }
  return sources.strings.resolve(PAUSE_REASON_STRING_ID[reason.code], { common: sources.common, bundles });
}
