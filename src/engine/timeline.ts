// [M-UI-TIMELINE] 未来予測（タイムライン）シミュレーション。
// 時間停止中（《処理8》）のステートを起点に advance_one_step(no_new_actions=true) を反復し、
// 各ユニットの発生中・硬直中・思考中の区間を表示枠の中に並べる。表示枠と区間は BattleState に含まれない。

import type { DecisionProvider } from './decision.js';
import { effectiveStepRecovery, effectiveStepStartup } from './effective.js';
import { executeAction } from './pipeline/p8-decision.js';
import { runStepBody, type StepDeps } from './pipeline/step.js';
import { runStepEnd } from './pipeline/stepend.js';
import type { ActionInstance, BattleState, Side, Unit } from './types.js';
import { roundDiv } from '../num/helpers.js';

export type TimelineSegmentKind = 'STARTUP' | 'RECOVERY' | 'THOUGHT';

export interface TimelineSegment {
  readonly kind: TimelineSegmentKind;
  readonly start: number; // 区間の開始ステップ
  readonly length: number; // 表示枠の末尾で切り詰めた後のステップ数
  readonly instanceId: string | null; // 発生中・硬直中の実行中アクション
  // 区間開始時点の経過ステップ数（思考中区間では現在の蓄積状況を表す）。
  readonly elapsedAtStart: number;
  // 発生中は必要発生ステップ数の実効値、硬直中は実行中適用硬直ステップ数。思考中は終端を持たないため Null。
  readonly required: number | null;
}

export interface TimelineLane {
  readonly unitId: string;
  readonly side: Side;
  readonly posIdx: number; // 起点ステートにおけるマス配置（途中で生成されたユニットは初出時点）
  readonly segments: readonly TimelineSegment[];
}

export interface Timeline {
  readonly start: number;
  readonly span: number;
  readonly lanes: readonly TimelineLane[];
}

const SPAN_MIN = 20;
const SPAN_MAX = 60;
const SPAN_NO_ACTION = 22;
const SPAN_DURATION_LIMIT = 300;

// [M-UI-TIMELINE]「表示枠」SPAN = clamp(round(平均(実効必要発生+実効必要硬直) × 1.4), 20, 60)。
export function timelineSpan(state: BattleState): number {
  let total = 0;
  let count = 0;
  for (const unit of state.units) {
    if (unit === null) {
      continue;
    }
    for (const action of unit.acts) {
      const duration = effectiveStepStartup(unit, action) + effectiveStepRecovery(unit, action);
      if (duration > 0 && duration < SPAN_DURATION_LIMIT) {
        total += duration;
        count += 1;
      }
    }
  }
  if (count === 0) {
    return SPAN_NO_ACTION;
  }
  const span = roundDiv(total * 14, count * 10);
  // 平均が算出できない場合（有限でない値）は既定値へ倒す。SPAN は描画の反復回数を決めるため、
  // 0 や NaN を表示側へ渡さない。
  return Number.isFinite(span) ? Math.min(Math.max(span, SPAN_MIN), SPAN_MAX) : SPAN_NO_ACTION;
}

interface Frame {
  readonly step: number;
  readonly unitId: string;
  readonly side: Side;
  readonly posIdx: number;
  readonly kind: TimelineSegmentKind;
  readonly instanceId: string | null;
  readonly elapsed: number;
  readonly required: number | null;
}

function activeAction(unit: Unit): ActionInstance | undefined {
  return unit.acts.find((action) => action.instance_id === unit.last_act?.instance_id);
}

function frameOf(step: number, unit: Unit): Frame | null {
  const base = { step, unitId: unit.unit_id, side: unit.side, posIdx: unit.pos_idx };
  if (unit.state === 'THOUGHT') {
    return { ...base, kind: 'THOUGHT', instanceId: null, elapsed: unit.elapsed_thought, required: null };
  }
  if (unit.state === 'STARTUP') {
    const action = activeAction(unit);
    const required = action === undefined ? null : effectiveStepStartup(unit, action);
    return { ...base, kind: 'STARTUP', instanceId: unit.last_act?.instance_id ?? null, elapsed: unit.elapsed_startup, required };
  }
  if (unit.state === 'RECOVERY') {
    return {
      ...base,
      kind: 'RECOVERY',
      instanceId: unit.last_act?.instance_id ?? null,
      elapsed: unit.elapsed_recovery,
      required: unit.applied_recovery,
    };
  }
  return null; // 消滅猶予状態は区間を持たない
}

// 同一区間の継続か：同種・同一アクションで、経過ステップ数が1ずつ進んでいること。
// 思考中の経過が0へ戻る（スタン）場合や、中断により硬直が別区間として始まる場合は区間を分ける。
function continues(prev: Frame, next: Frame): boolean {
  return (
    prev.kind === next.kind &&
    prev.instanceId === next.instanceId &&
    next.step === prev.step + 1 &&
    next.elapsed === prev.elapsed + 1
  );
}

const noNewActions: DecisionProvider = () => ({ kind: 'PASS' });

function isConverged(state: BattleState): boolean {
  return state.units.every((unit) => unit === null || unit.state === 'THOUGHT');
}

// [M-UI-TIMELINE]「注目中のアクションの仮定展開」指示確定を仮定するアクション。
export interface TimelinePlan {
  readonly unitId: string;
  readonly instanceId: string;
}

// [M-UI-TIMELINE] state は変更しない。plan を与えた場合は、当該アクションの指示確定を仮定して展開する。

export function simulateTimeline(state: BattleState, span: number, deps: StepDeps, plan: TimelinePlan | null = null): Timeline {
  const sim = structuredClone(state);
  if (plan !== null) {
    // [M-PIPE-P8-ORDER]#3 当該ユニットが当該アクションを指示確定したものとして適用する。
    const unit = sim.units.find((candidate): candidate is Unit => candidate !== null && candidate.unit_id === plan.unitId);
    const action = unit?.acts.find((candidate) => candidate.instance_id === plan.instanceId);
    if (unit !== undefined && action !== undefined) {
      executeAction(sim, unit, action, deps);
    }
  }
  const start = sim.step;
  const end = start + span;
  const framesByUnit: Record<string, Frame[]> = {};
  const unitOrder: string[] = [];

  const record = (): void => {
    const ordered = sim.units.filter((unit): unit is Unit => unit !== null).sort((a, b) => a.pos_idx - b.pos_idx);
    for (const unit of ordered) {
      const frame = frameOf(sim.step, unit);
      if (frame === null) {
        continue;
      }
      if (framesByUnit[unit.unit_id] === undefined) {
        framesByUnit[unit.unit_id] = [];
        unitOrder.push(unit.unit_id);
      }
      framesByUnit[unit.unit_id].push(frame);
    }
  };

  record();
  let extendThought = true;
  // 展開の打ち切り：全ユニットの思考中への収束、または表示枠の末尾のいずれか早い方。
  while (sim.step + 1 < end && !isConverged(sim)) {
    runStepEnd(sim);
    const outcome = runStepBody(sim, noNewActions, deps);
    record();
    if (outcome !== 'NONE') {
      extendThought = false; // 決着後の区間は情報を持たない
      break;
    }
  }

  const lastStep = sim.step;
  const lanes = unitOrder.map((unitId): TimelineLane => {
    const frames = framesByUnit[unitId];
    const segments: TimelineSegment[] = [];
    let head = frames[0];
    let prev = frames[0];
    const close = (tail: Frame, isLast: boolean): void => {
      // 思考中区間は表示枠の末尾までの継続区間とする。ただしスタンで分かれた前半は分割時点で閉じる。
      const reachesEnd = head.kind === 'THOUGHT' && isLast && extendThought && tail.step === lastStep;
      const stop = reachesEnd ? end : tail.step + 1;
      segments.push({
        kind: head.kind,
        start: head.step,
        length: Math.min(stop, end) - head.step,
        instanceId: head.instanceId,
        elapsedAtStart: head.elapsed,
        required: head.required,
      });
    };
    for (const frame of frames.slice(1)) {
      if (!continues(prev, frame)) {
        close(prev, false);
        head = frame;
      }
      prev = frame;
    }
    close(prev, true);
    return { unitId, side: frames[0].side, posIdx: frames[0].posIdx, segments };
  });

  return { start, span, lanes };
}
