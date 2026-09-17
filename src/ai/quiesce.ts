// [A-SEARCH-QUIESCE] [A-SEARCH-ALGORITHM]「静止探索 quiesce」。
// 「延長中のプレイヤー行動は待機と仮定する」ため、[M-UI-TIMELINE] と同じ
// `advance_one_step(no_new_actions=true)` を、既存の [M-PIPE-MAIN] advanceStep に
// 常にPASSを返す DecisionProvider を渡す形でそのまま再利用する。

import type { DecisionProvider } from '../engine/decision.js';
import { decayAp } from '../engine/calc.js';
import { currentDefense } from '../engine/defense.js';
import { effectiveDecayApRateCenti, effectiveStepStartup } from '../engine/effective.js';
import { advanceStep, type StepDeps } from '../engine/pipeline/step.js';
import type { BattleOutcome } from '../engine/pipeline/p5-discard.js';
import type { ActionInstance, BattleState, Unit } from '../engine/types.js';

// [A-SEARCH-QUIESCE]「トレースの記録内容」。APTrace（現在AP・実効防御力）と PosTrace（現在位置）
// を同一ステップ添字で対応づけて1構造にまとめる（[A-EVAL-TTK] は両者を組で参照するため）。
export interface QuiesceSample {
  readonly ap: number;
  readonly defense: number;
  readonly pos: number;
  // [A-EVAL-TTK]［トレース参照時点］末尾フレームで硬直中のユニットに限り、硬直満了帰結を適用する
  // 添字と適用後のAP。それ以外は null。
  readonly landing: RecoveryLanding | null;
}

export interface RecoveryLanding {
  readonly index: number;
  readonly ap: number;
}
export type QuiesceFrame = Readonly<Record<string, QuiesceSample>>;
export type QuiesceTrace = readonly QuiesceFrame[];

export interface QuiesceResult {
  readonly trace: QuiesceTrace;
  readonly outcome: BattleOutcome;
}

const alwaysPass: DecisionProvider = () => ({ kind: 'PASS' });

function snapshotFrame(state: BattleState): QuiesceFrame {
  const frame: Record<string, QuiesceSample> = {};
  for (const unit of state.units) {
    if (unit === null) {
      continue;
    }
    frame[unit.unit_id] = { ap: unit.ap, defense: currentDefense(unit), pos: unit.pos_idx, landing: null };
  }
  return frame;
}

// [A-EVAL-TTK]［トレース参照時点］末尾で硬直中のユニットは、添字 T + max(0, 適用硬直 − 経過硬直) + 1
// 以降について硬直満了帰結（[M-PIPE-P7-LANDING]#2：AP減衰と思考中への着地）を適用した値をとる。
// AP減衰率実効値は末尾時点のユニットの補正で求める。
function tailFrame(state: BattleState, tailIndex: number): QuiesceFrame {
  const frame: Record<string, QuiesceSample> = { ...snapshotFrame(state) };
  for (const unit of state.units) {
    if (unit === null || unit.state !== 'RECOVERY' || unit.last_act === null) {
      continue;
    }
    const action = findAction(unit, unit.last_act.instance_id);
    const rate = action === undefined ? 0 : effectiveDecayApRateCenti(unit, action);
    const index = tailIndex + Math.max(0, unit.applied_recovery - unit.elapsed_recovery) + 1;
    frame[unit.unit_id] = { ...frame[unit.unit_id], landing: { index, ap: decayAp(unit.ap, rate) } };
  }
  return frame;
}

function findAction(unit: Unit, instanceId: string): ActionInstance | undefined {
  return unit.acts.find((a) => a.instance_id === instanceId);
}

// 「現局面の最大残り必要発生ステップ数」。STARTUP は必要発生実効値までの残り、それ以外は0
// （硬直は発生ではないため数えない）。
function residualOccurrenceSteps(unit: Unit): number {
  if (unit.state !== 'STARTUP' || unit.last_act === null) {
    return 0;
  }
  const action = findAction(unit, unit.last_act.instance_id);
  if (action === undefined) {
    return 0;
  }
  return Math.max(effectiveStepStartup(unit, action) - unit.elapsed_startup, 0);
}

// [A-SEARCH-QUIESCE] 規則1・2：発生中アクションと消滅猶予状態のユニットがいずれも存在しない。
// 硬直中のユニットは静止局面に含む（[A-SEARCH-QUIESCE]［評価対象］が評価するのはこの局面である）。
function isQuiescentState(state: BattleState): boolean {
  return state.units.every((unit) => unit === null || (unit.state !== 'STARTUP' && unit.state !== 'PENDING_DISCARD'));
}

// [A-SEARCH-ALGORITHM] Q_MAX_STEPS = 現局面の最大残り必要発生ステップ数 + 1。
function computeQMaxSteps(state: BattleState): number {
  let maxResidual = 0;
  for (const unit of state.units) {
    if (unit === null) {
      continue;
    }
    maxResidual = Math.max(maxResidual, residualOccurrenceSteps(unit));
  }
  return maxResidual + 1;
}

// state を破壊的に静止局面まで進める（呼び出し側がクローンを渡す前提）。t=0（延長前の現局面）を
// 先頭フレームとして含む。
export function runQuiescence(state: BattleState, deps: StepDeps): QuiesceResult {
  const trace: QuiesceFrame[] = [snapshotFrame(state)];
  const qMaxSteps = computeQMaxSteps(state);
  for (let i = 0; i < qMaxSteps; i += 1) {
    if (isQuiescentState(state)) {
      break;
    }
    const { outcome } = advanceStep(state, alwaysPass, deps);
    trace.push(snapshotFrame(state));
    if (outcome !== 'NONE') {
      return { trace, outcome };
    }
  }
  trace[trace.length - 1] = tailFrame(state, trace.length - 1);
  return { trace, outcome: 'NONE' };
}

// t が末尾を超える場合は末尾値を適用する。末尾で硬直中のユニットは、硬直満了の添字以降を
// 満了帰結後の値（思考中のため実効防御力 = AP）とする（[A-EVAL-TTK]［トレース参照時点］）。
export function sampleAt(trace: QuiesceTrace, t: number, unitId: string): QuiesceSample | undefined {
  const idx = Math.min(Math.max(t, 0), trace.length - 1);
  const sample = trace[idx]?.[unitId];
  if (sample === undefined || sample.landing === null || t < sample.landing.index) {
    return sample;
  }
  return { ap: sample.landing.ap, defense: sample.landing.ap, pos: sample.pos, landing: null };
}
