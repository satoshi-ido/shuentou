// [M-UI-WATCH] アクション監視フォーカス：監視条件5種の充足判定と立ち上がりエッジ検出。
// 判定は [M-PIPE-P8-ORDER]#2（敵軍AI確定後）に1ステップ1回行う。呼び出しは game/battle.ts が担う。

import { executableActions, isInstant } from './decision.js';
import { currentDefense } from './defense.js';
import { effectiveAtk, effectiveRange, effectiveStepStartup } from './effective.js';
import { hasFlag } from './flags.js';
import { executeAction } from './pipeline/p8-decision.js';
import { advanceStep, type StepDeps } from './pipeline/step.js';
import { runStepEnd } from './pipeline/stepend.js';
import {
  WATCH_KINDS,
  type ActionInstance,
  type BattleState,
  type PauseReason,
  type Unit,
  type WatchFlags,
  type WatchKind,
} from './types.js';

// 条件ごとの判定結果。NA・IDLE は未充足として扱い、UIは STR_WATCH_NA / STR_WATCH_IDLE で提示する
// （[M-DATA-PAUSE-REASON]［監視条件ラベル］）。
export type WatchStatus = 'MET' | 'UNMET' | 'NA' | 'IDLE';

export interface WatchEvaluation {
  readonly status: WatchStatus;
  // [M-DATA-PAUSE-REASON]「RemainingSteps の意味」。参照対象を持たない条件は 0。
  readonly remainingSteps: number;
}

export type ActionWatchEvaluation = Record<WatchKind, WatchEvaluation>;

const NEVER: WatchEvaluation = { status: 'NA', remainingSteps: 0 };

const FOE_FRONT_IDX = 2;
const FOE_BACK_IDX = 3;

export function allWatchFlags(value: boolean): WatchFlags {
  return { READY: value, STUN: value, HIT_FRONT: value, HIT_BACK: value, EVADE: value };
}

function mineUnits(state: BattleState): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.side === 'MINE');
}

function findUnitById(state: BattleState, unitId: string): Unit | undefined {
  return state.units.find((unit): unit is Unit => unit !== null && unit.unit_id === unitId);
}

function activeActionOf(unit: Unit): ActionInstance | undefined {
  if (unit.last_act === null) {
    return undefined;
  }
  return unit.acts.find((action) => action.instance_id === unit.last_act?.instance_id);
}

// [M-UI-WATCH]［判定の時点と対象］途中で生成・破棄されたインスタンスを両マップへ反映する。
// 生成は全要素 False で登録し、所持アクションに存在しなくなったキーは削除する。
export function syncWatchKeys(state: BattleState): void {
  const liveIds: string[] = [];
  for (const unit of mineUnits(state)) {
    for (const action of unit.acts) {
      liveIds.push(action.instance_id);
      if (state.watching[action.instance_id] === undefined) {
        state.watching[action.instance_id] = allWatchFlags(false);
      }
      if (state.watch_prev_met[action.instance_id] === undefined) {
        state.watch_prev_met[action.instance_id] = allWatchFlags(false);
      }
    }
  }
  for (const id of Object.keys(state.watching)) {
    if (!liveIds.includes(id)) {
      delete state.watching[id];
    }
  }
  for (const id of Object.keys(state.watch_prev_met)) {
    if (!liveIds.includes(id)) {
      delete state.watch_prev_met[id];
    }
  }
}

// [M-UI-CONFIG]「監視トグルの既定の適用」：ステップ0の生成時に自軍の全アクションへ条件単位で一律に適用する。
export function applyWatchDefault(state: BattleState, defaults: WatchFlags): void {
  for (const unit of mineUnits(state)) {
    for (const action of unit.acts) {
      state.watching[action.instance_id] = { ...defaults };
      state.watch_prev_met[action.instance_id] = allWatchFlags(false);
    }
  }
}

function hitStatus(unit: Unit, action: ActionInstance, target: Unit | null): WatchEvaluation {
  if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL') || target === null) {
    return NEVER;
  }
  if (Math.abs(unit.pos_idx - target.pos_idx) > effectiveRange(unit, action)) {
    return NEVER;
  }
  const met = effectiveAtk(unit, action) >= currentDefense(target);
  return { status: met ? 'MET' : 'UNMET', remainingSteps: 0 };
}

function remainingStartup(unit: Unit, action: ActionInstance): number {
  return Math.max(effectiveStepStartup(unit, action) - unit.elapsed_startup, 0);
}

interface Threat {
  readonly unitId: string;
  readonly instanceId: string;
  readonly remaining: number;
}

// 発生中の敵アクションのうち、条件 predicate を満たすもの。
function foeStartupActions(state: BattleState, predicate: (foe: Unit, action: ActionInstance) => boolean): Threat[] {
  const threats: Threat[] = [];
  for (const foe of state.units) {
    if (foe === null || foe.side !== 'FOE' || foe.state !== 'STARTUP') {
      continue;
    }
    const action = activeActionOf(foe);
    if (action !== undefined && predicate(foe, action)) {
      threats.push({ unitId: foe.unit_id, instanceId: action.instance_id, remaining: remainingStartup(foe, action) });
    }
  }
  return threats;
}

const alwaysPass = () => ({ kind: 'PASS' }) as const;

// 確定仮定展開の起点：現ステートの複製に対し、u が a を指示確定したものとして適用する。
function confirmedClone(state: BattleState, unitId: string, instanceId: string, deps: StepDeps): BattleState | null {
  const clone = structuredClone(state);
  const unit = findUnitById(clone, unitId);
  const action = unit?.acts.find((candidate) => candidate.instance_id === instanceId);
  if (unit === undefined || action === undefined) {
    return null;
  }
  const outcome = executeAction(clone, unit, action, deps);
  if (outcome !== 'NONE') {
    return null;
  }
  runStepEnd(clone);
  return clone;
}

// [M-UI-WATCH]『スタン』：a の発動ステップまで展開し、スタンによる中断を受けずに発動するか。
function stunStatus(state: BattleState, unit: Unit, action: ActionInstance, executable: boolean, deps: StepDeps): WatchEvaluation {
  const stunners = foeStartupActions(
    state,
    (_foe, foeAction) => foeAction.base_params.stun && hasFlag(foeAction.sys_flags, 'FLAG_MARTIAL'),
  );
  if (isInstant(action) || stunners.length === 0) {
    return NEVER;
  }
  const remainingSteps = Math.min(...stunners.map((threat) => threat.remaining));
  if (!executable) {
    return { status: 'UNMET', remainingSteps };
  }
  const clone = confirmedClone(state, unit.unit_id, action.instance_id, deps);
  if (clone === null) {
    return { status: 'UNMET', remainingSteps };
  }
  const limit = effectiveStepStartup(unit, action) + 1;
  for (let i = 0; i < limit; i += 1) {
    const actor = findUnitById(clone, unit.unit_id);
    if (actor === undefined || actor.state !== 'STARTUP' || actor.last_act?.instance_id !== action.instance_id) {
      return { status: 'UNMET', remainingSteps };
    }
    // [M-PIPE-P1-FREEZE]#1 当ステップ開始時点で発動条件を満たせば、同ステップのスタンでは中断されない（相打ち）。
    const fires = actor.elapsed_startup >= effectiveStepStartup(actor, action);
    const { outcome } = advanceStep(clone, alwaysPass, deps);
    if (fires) {
      return { status: 'MET', remainingSteps };
    }
    if (outcome !== 'NONE') {
      return { status: outcome === 'WIN' ? 'MET' : 'UNMET', remainingSteps };
    }
  }
  return { status: 'UNMET', remainingSteps };
}

// [M-UI-WATCH]『回避』の回避手段。
function hasEvadeMeans(action: ActionInstance): boolean {
  const flags = action.sys_flags;
  return (
    (hasFlag(flags, 'FLAG_SWAP') && isInstant(action)) ||
    (hasFlag(flags, 'FLAG_MARTIAL') && action.base_params.stun) ||
    hasFlag(flags, 'FLAG_STANCE') ||
    action.base_params.def_efficiency > 100
  );
}

// 脅威が当ステップに発動するとき、u に命中するか（[M-PIPE-P1-FREEZE] の凍結値と、Step 4 時点の配置で判定）。
// 通常アクションの《処理2》では隊列交代が実行されず位置干渉は全解決後に適用されるため、ステップ開始時点の
// 配置がそのまま Step 4 の配置となる。
function threatHits(state: BattleState, threat: Threat, unitId: string): { readonly fires: boolean; readonly hits: boolean } {
  const foe = findUnitById(state, threat.unitId);
  const target = findUnitById(state, unitId);
  if (foe === undefined || foe.state !== 'STARTUP' || foe.last_act?.instance_id !== threat.instanceId) {
    return { fires: false, hits: false };
  }
  const action = activeActionOf(foe);
  if (action === undefined || foe.elapsed_startup < effectiveStepStartup(foe, action)) {
    return { fires: false, hits: false };
  }
  if (target === undefined) {
    return { fires: true, hits: false };
  }
  const inRange = Math.abs(foe.pos_idx - target.pos_idx) <= effectiveRange(foe, action);
  return { fires: true, hits: inRange && effectiveAtk(foe, action) >= currentDefense(target) };
}

function evadeStatus(state: BattleState, unit: Unit, action: ActionInstance, executable: boolean, deps: StepDeps): WatchEvaluation {
  if (!hasEvadeMeans(action)) {
    return NEVER;
  }
  const threats = foeStartupActions(
    state,
    (foe, foeAction) =>
      hasFlag(foeAction.sys_flags, 'FLAG_MARTIAL') &&
      Math.abs(foe.pos_idx - unit.pos_idx) <= effectiveRange(foe, foeAction) &&
      effectiveAtk(foe, foeAction) >= currentDefense(unit),
  );
  if (threats.length === 0) {
    return { status: 'IDLE', remainingSteps: 0 };
  }
  const remainingSteps = Math.min(...threats.map((threat) => threat.remaining));
  if (!executable) {
    return { status: 'UNMET', remainingSteps };
  }
  const clone = confirmedClone(state, unit.unit_id, action.instance_id, deps);
  if (clone === null) {
    return { status: 'UNMET', remainingSteps };
  }
  let pending = threats;
  const limit = Math.max(...threats.map((threat) => threat.remaining)) + 1;
  for (let i = 0; i < limit && pending.length > 0; i += 1) {
    const stillPending: Threat[] = [];
    for (const threat of pending) {
      const { fires, hits } = threatHits(clone, threat, unit.unit_id);
      if (hits) {
        return { status: 'UNMET', remainingSteps };
      }
      const foe = findUnitById(clone, threat.unitId);
      const cancelled = foe === undefined || foe.state !== 'STARTUP' || foe.last_act?.instance_id !== threat.instanceId;
      if (!fires && !cancelled) {
        stillPending.push(threat);
      }
    }
    pending = stillPending;
    if (pending.length === 0) {
      break;
    }
    const { outcome } = advanceStep(clone, alwaysPass, deps);
    if (outcome !== 'NONE') {
      return { status: outcome === 'WIN' ? 'MET' : 'UNMET', remainingSteps };
    }
  }
  return { status: 'MET', remainingSteps };
}

export function evaluateActionWatch(state: BattleState, unit: Unit, action: ActionInstance, deps: StepDeps): ActionWatchEvaluation {
  const executable = executableActions(state, unit).includes(action);
  return {
    READY: { status: executable ? 'MET' : 'UNMET', remainingSteps: 0 },
    STUN: stunStatus(state, unit, action, executable, deps),
    HIT_FRONT: hitStatus(unit, action, state.units[FOE_FRONT_IDX] ?? null),
    HIT_BACK: hitStatus(unit, action, state.units[FOE_BACK_IDX] ?? null),
    EVADE: evadeStatus(state, unit, action, executable, deps),
  };
}

export interface WatchEdge {
  readonly unitId: string;
  readonly instanceId: string;
  readonly kind: WatchKind;
  readonly remainingSteps: number;
}

// [M-UI-WATCH] 全条件を評価して watch_prev_met を更新し、ONの条件の立ち上がりエッジを提示順序で返す。
export function detectWatchEdges(state: BattleState, deps: StepDeps): WatchEdge[] {
  syncWatchKeys(state);
  const edges: WatchEdge[] = [];
  const units = mineUnits(state).sort((a, b) => a.pos_idx - b.pos_idx);
  const nextMet: Record<string, WatchFlags> = {};
  for (const unit of units) {
    for (const action of unit.acts) {
      const evaluation = evaluateActionWatch(state, unit, action, deps);
      const met = allWatchFlags(false);
      for (const kind of WATCH_KINDS) {
        met[kind] = evaluation[kind].status === 'MET';
        const rising = met[kind] && !state.watch_prev_met[action.instance_id][kind];
        if (rising && state.watching[action.instance_id][kind]) {
          edges.push({ unitId: unit.unit_id, instanceId: action.instance_id, kind, remainingSteps: evaluation[kind].remainingSteps });
        }
      }
      nextMet[action.instance_id] = met;
    }
  }
  for (const [id, met] of Object.entries(nextMet)) {
    state.watch_prev_met[id] = met;
  }
  return edges;
}

export function watchMetReason(edge: WatchEdge): PauseReason {
  return {
    code: 'WATCH_MET',
    unit_id: edge.unitId,
    instance_id: edge.instanceId,
    watch_kind: edge.kind,
    remaining_steps: edge.remainingSteps,
  };
}
