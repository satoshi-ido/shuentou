// [M-PIPE-P8-ORDER] [M-PIPE-PAUSE-TRIGGER] [M-STATE-HISTORY] [M-STATE-RUNSTATE] [M-PROG-CLEAR] [A-LATE-5-10]
// バトルの開始・時間停止までの進行・プレイヤー指示（確定操作1）・ステップ進行確定（確定操作2）。
//
// 静止中のバトルは常に「《処理8》の時間停止中（敵軍AI確定後）」にある。HistoryStack の各項目も
// この時点で記録されるため、復元後に敵軍AIを再計算せずプレイヤー指示から再開できる（[M-REWIND-UNDO]）。
// 5-10（[A-LATE-5-10]）に限り時間停止は敵軍AI決定の前にあり、停止の解除後に同ステップの敵軍AI決定を行う。
// 例外はバトル開始時セーブのステップ0生成直後であり、ロード・バトル開始時ロールバックでは
// enterBattle により最初の時間停止まで進める。
// 時間停止トリガーの #3（UI監視トグル）は [M-UI-WATCH] の判定を用い、#4（手動停止）は stopAtStep で与える。
// 停止事由は BattleState の pause_reason に記録する（[M-DATA-PAUSE-REASON]）。

import { executableActions, hasExecutableAction, type DecisionProvider } from '../decision.js';
import { createBattleState } from '../battle.js';
import { instantiateActionList } from '../instantiate.js';
import type { BattleOutcome } from '../pipeline/p5-discard.js';
import { executeAction, newSideLoopState, runSideDecisionLoop, type ExecutedAction } from '../pipeline/p8-decision.js';
import { runPreDecision } from '../pipeline/step.js';
import { runStepEnd } from '../pipeline/stepend.js';
import { settleBattleClear } from '../progress/clear.js';
import { bookOf, enemyOf, sceneOf } from '../run/masters.js';
import { isSearchSuppressed, updateReuse } from '../reuse.js';
import { cloneRun, cloneState } from '../run/snapshot.js';
import type { BattleState, PauseReason, Unit, WatchKind } from '../types.js';
import {
  applyWatchDefault,
  detectWatchEdges,
  syncWatchKeys,
  watchMetReason,
  type WatchDefaultMode,
  type WatchEdge,
} from '../watch.js';
import { autosave, beginConfirmOperation, type GameContext, type GameSession } from './session.js';

// AWAIT_FOE は敵軍AIの応答待ちで中断した状態（[I-ENV-WORKER]）。応答後に resumeBattle で再開する。
export type BattleResult = 'PAUSED' | 'WIN' | 'LOSS' | 'AWAIT_FOE' | 'RUNNING';

export interface AdvanceOptions {
  // [M-PIPE-PAUSE-TRIGGER]#4 手動停止を要求する最初のステップ数。
  readonly stopAtStep?: number;
  // [M-UI-PLAYBACK] 1回の呼び出しで越えるステップ境界の上限（1描画フレームあたりの歩進）。
  // 上限に達した時点で RUNNING を返し、次の呼び出しで続きから進める。省略時は時間停止まで進める。
  readonly maxSteps?: number;
}

export interface StartOptions extends AdvanceOptions {
  // [M-UI-CONFIG]「監視トグルの既定」。端末ローカル設定であり、ステップ0の生成時にのみ適用する。
  readonly watchDefault?: WatchDefaultMode;
}

const SCENE_5_11 = 'SCENE_5_11';

// 進行の防護。時間停止も決着も成立しないまま歩進が際限なく続く状況（決定主体が常にパスを返す等の
// 呼び出し側の不整合）を、フリーズさせずに検出する。[M-PIPE-PAUSE-TRIGGER] の規定を変えるものではなく、
// 正常な進行がこの歩数に達することはない（最長の開幕でも 147 ステップ・[V-NUM-OPENING]）。
const ADVANCE_GUARD_STEPS = 100000;

// [A-SEARCH-REUSE] 敵軍AIの決定主体に再探索抑制を挟む。定跡が有効な間は抑制せず毎決定点で問い合わせる。
function foeDecisionWithReuse(session: GameSession, ctx: GameContext): DecisionProvider {
  const scene = sceneOf(ctx.masters, session.data.run.current_scene_id);
  const enemy = enemyOf(ctx.masters, scene.enemy_id);
  const bookLength = enemy.book_id === null ? 0 : bookOf(ctx.masters, enemy.book_id).steps.length;
  const inertiaSteps = scene.inertia_steps ?? 0;
  return (state, unit) => {
    const bookActive = !state.book_aborted && state.book_index < bookLength;
    if (!bookActive && isSearchSuppressed(state, unit)) {
      return { kind: 'PASS' };
    }
    const decision = ctx.foeDecision(state, unit);
    updateReuse(state, unit, decision.kind === 'PASS' && decision.source === 'SEARCH', inertiaSteps);
    return decision;
  };
}

function battleOf(session: GameSession): BattleState {
  const { run } = session.data;
  if (run.phase !== 'BATTLE' || run.battle_state === null) {
    throw new Error(`バトル中ではない: ${run.phase}`);
  }
  return run.battle_state;
}

function hasMaster(state: BattleState, side: Unit['side']): boolean {
  return state.units.some((unit) => unit !== null && unit.side === side && unit.unit_kind === 'MASTER');
}

// ［停止の継続と解除］手動指示可能な思考中の自軍ユニット。
function instructableUnits(state: BattleState): Unit[] {
  return state.units.filter(
    (unit): unit is Unit => unit !== null && unit.side === 'MINE' && hasExecutableAction(state, unit),
  );
}

function finish(session: GameSession, ctx: GameContext, outcome: Exclude<BattleOutcome, 'NONE'>): BattleResult {
  session.pending_step = null;
  if (outcome === 'WIN') {
    settleBattleClear(session.data.run, ctx.masters);
    session.battle_start_run = null;
    autosave(session, ctx); // ［保存契機］バトルクリア共通決済の完了時（スナップショット記録の後）
  }
  return outcome;
}

// [A-LATE-5-10] 決定順を反転するシーン（シーンマスタの deferred_decision）。
function isDeferred(session: GameSession, ctx: GameContext): boolean {
  return sceneOf(ctx.masters, session.data.run.current_scene_id).deferred_decision;
}

// [A-LATE-5-10]「時間停止トリガー2」前のステップの敵アクションを次のステップで提示する。
// 発生満了までの残ステップ数（[M-DATA-PAUSE-REASON]）は、間の《処理6》で1ステップ進んだ分を差し引く。
function carriedToCurrentStep(executed: ExecutedAction | null | undefined): ExecutedAction | null {
  if (executed === null || executed === undefined) {
    return null;
  }
  return executed.instant ? executed : { ...executed, remainingSteps: Math.max(0, executed.remainingSteps - 1) };
}

// ステップの先頭（ステップ0は《処理8》の先頭）から、時間停止または決着まで進める。
// [A-LATE-5-10] 決定順の反転時は、時間停止判定 → プレイヤー指示 → 敵軍AI決定 の順に進める。
function runUntilPause(session: GameSession, ctx: GameContext, options: AdvanceOptions): BattleResult {
  const state = battleOf(session);
  const foeDecision = foeDecisionWithReuse(session, ctx);
  const deferred = isDeferred(session, ctx);
  const sceneId = session.data.run.current_scene_id;
  let advanced = 0;
  for (;;) {
    const pending = session.pending_step ?? { preDone: false, loop: newSideLoopState() };
    if (!pending.preDone) {
      const pre = runPreDecision(state, ctx.stepDeps);
      if (pre !== 'NONE') {
        return finish(session, ctx, pre);
      }
      pending.preDone = true;
    }
    if (deferred && pending.mineDone !== true) {
      const edges = detectWatchEdges(state, ctx.stepDeps);
      const reason = pauseReasonOf(state, sceneId, carriedToCurrentStep(pending.carried), edges, options);
      pending.carried = null;
      if (reason !== null && instructableUnits(state).length > 0) {
        session.pending_step = null;
        state.pause_reason = reason;
        return 'PAUSED';
      }
      pending.mineDone = true;
    }
    const foe = runSideDecisionLoop(state, 'FOE', foeDecision, ctx.stepDeps, pending.loop);
    if (foe.awaiting) {
      session.pending_step = pending; // [I-ENV-WORKER] 応答後に同じ地点から再開する
      return 'AWAIT_FOE';
    }
    session.pending_step = null;
    if (foe.outcome !== 'NONE') {
      return finish(session, ctx, foe.outcome);
    }
    if (deferred) {
      // [A-LATE-5-10] 敵アクションの実行開始による時間停止は次のステップで成立させる。
      runStepEnd(state);
      session.pending_step = { preDone: false, loop: newSideLoopState(), carried: foe.firstExecuted };
    } else {
      // [M-PIPE-P8-ORDER]#2 敵AI確定後の状態を基準に判定する。
      // #3 の充足判定は停止の成否に関わらず毎ステップ行い、watch_prev_met を更新する（[M-UI-WATCH]）。
      const edges = detectWatchEdges(state, ctx.stepDeps);
      const reason = pauseReasonOf(state, sceneId, foe.firstExecuted, edges, options);
      // ［停止の継続と解除］停止は手動指示可能な自軍ユニットがいる場合に限り成立する。
      // #4 の手動停止要求は、指示可能な自軍ユニットが現れるまで維持する。
      if (reason !== null && instructableUnits(state).length > 0) {
        state.pause_reason = reason;
        return 'PAUSED';
      }
      runStepEnd(state);
    }
    advanced += 1;
    if (options.maxSteps !== undefined && advanced >= options.maxSteps) {
      return 'RUNNING';
    }
    if (advanced >= ADVANCE_GUARD_STEPS) {
      throw new Error(`時間停止にも決着にも到達しないまま ${ADVANCE_GUARD_STEPS} ステップ進行した（ステップ ${state.step}）`);
    }
  }
}

// [M-PIPE-PAUSE-TRIGGER] の成否と、[M-DATA-PAUSE-REASON]「同時成立時」の規則による提示事由1件。
// 成立しない場合は null。
function pauseReasonOf(
  state: BattleState,
  sceneId: string,
  firstExecuted: ExecutedAction | null,
  edges: readonly WatchEdge[],
  options: AdvanceOptions,
): PauseReason | null {
  // #1 はステップ0の判定そのものが「自軍に即時実行可能なアクションの存在」である（呼び出し側で判定）。
  if (state.step === 0) {
    return { code: 'STEP0_READY', unit_id: null, instance_id: null, watch_kind: null, remaining_steps: null };
  }
  // #2 シーン5-11に限り無効化する。
  if (firstExecuted !== null && sceneId !== SCENE_5_11) {
    return firstExecuted.instant
      ? { code: 'ENEMY_IMMEDIATE', unit_id: firstExecuted.unitId, instance_id: firstExecuted.instanceId, watch_kind: null, remaining_steps: null }
      : {
          code: 'ENEMY_START',
          unit_id: firstExecuted.unitId,
          instance_id: firstExecuted.instanceId,
          watch_kind: null,
          remaining_steps: firstExecuted.remainingSteps,
        };
  }
  const edge = edges[0];
  if (edge !== undefined) {
    return watchMetReason(edge);
  }
  if (options.stopAtStep !== undefined && state.step >= options.stopAtStep) {
    return { code: 'MANUAL_PAUSE', unit_id: null, instance_id: null, watch_kind: null, remaining_steps: null };
  }
  return null;
}

// [M-UI-WATCH] 監視トグルの切り替え。確定操作ではなく HistoryStack へプッシュしない。
export function setWatch(session: GameSession, instanceId: string, kind: WatchKind, on: boolean): void {
  const state = battleOf(session);
  const flags = state.watching[instanceId];
  if (flags === undefined) {
    throw new Error(`監視対象でないアクション: ${instanceId}`);
  }
  flags[kind] = on;
}

// [M-DATA-PAUSE-REASON]［停止事由レコード］「解除」：ステップ境界への移行時に Null へ戻す。
// [A-LATE-5-10] 決定順の反転時は、ステップ境界の前に同ステップの敵軍AI決定を行う。
function leavePause(session: GameSession, ctx: GameContext): void {
  const state = battleOf(session);
  state.pause_reason = null;
  if (isDeferred(session, ctx)) {
    session.pending_step = { preDone: true, loop: newSideLoopState(), mineDone: true };
    return;
  }
  runStepEnd(state);
}

// [M-STATE-RUNSTATE]［主人公ステートの正本］バトル開始時（ステップ0の生成）。
export function startBattle(session: GameSession, ctx: GameContext, options: StartOptions = {}): BattleResult {
  const { run } = session.data;
  if (run.phase !== 'PRE_BATTLE') {
    throw new Error(`バトル開始前ではない: ${run.phase}`);
  }
  const scene = sceneOf(ctx.masters, run.current_scene_id);
  const enemy = enemyOf(ctx.masters, scene.enemy_id);
  run.history_stack = []; // [M-STATE-HISTORY]［破棄契機］1.
  const enemyActs = instantiateActionList(enemy.acts, ctx.masters.actions, run);
  run.battle_state = createBattleState({
    sceneLevel: scene.level,
    heroMaxHp: run.hero_max_hp,
    heroHp: run.hero_hp,
    heroActs: cloneState(run.hero_acts),
    enemyRecord: enemy,
    enemyActs,
    instanceIdSeq: run.instance_id_seq,
    // [A-MIRROR-5-09]［決定論の担保］5-09 に限り、5-08 クリア時に記録した鏡像統計を固定する。
    mirrorSnapshot: scene.scene_id === 'SCENE_5_09' ? run.mirror_stats : null,
  });
  if (options.watchDefault !== undefined) {
    applyWatchDefault(run.battle_state, options.watchDefault);
  } else {
    syncWatchKeys(run.battle_state);
  }
  run.phase = 'BATTLE';
  session.pending_step = null;
  session.battle_start_run = cloneRun(run);
  autosave(session, ctx); // ［保存契機］バトル開始時（ステップ0の生成完了時）
  return runUntilPause(session, ctx, options);
}

// ステップ0生成直後のステートから最初の時間停止まで進める（ロード・バトル開始時ロールバック）。
export function enterBattle(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
  session.pending_step = null;
  return runUntilPause(session, ctx, options);
}

// [I-ENV-WORKER] 敵軍AIの応答が得られた後、中断した地点から進行を再開する。
export function resumeBattle(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
  return runUntilPause(session, ctx, options);
}

function assertPaused(state: BattleState): void {
  if (!hasMaster(state, 'MINE') || !hasMaster(state, 'FOE')) {
    throw new Error('決着済みのバトルには指示できない');
  }
}

// 確定操作1：指示確定。
export function instruct(
  session: GameSession,
  ctx: GameContext,
  unitId: string,
  instanceId: string,
  options: AdvanceOptions = {},
): BattleResult {
  const state = battleOf(session);
  assertPaused(state);
  const unit = instructableUnits(state).find((candidate) => candidate.unit_id === unitId);
  const action = unit?.acts.find((candidate) => candidate.instance_id === instanceId);
  if (unit === undefined || action === undefined || !executableActions(state, unit).includes(action)) {
    throw new Error(`実行できない指示: ${unitId} ${instanceId}`);
  }
  beginConfirmOperation(session, 1, ctx);
  const outcome = executeAction(state, unit, action, ctx.stepDeps);
  if (outcome !== 'NONE') {
    return finish(session, ctx, outcome);
  }
  syncWatchKeys(state); // 即時型の召喚・コピーで生成されたインスタンスを監視対象へ加える
  if (instructableUnits(state).length > 0) {
    return 'PAUSED';
  }
  leavePause(session, ctx);
  return runUntilPause(session, ctx, options);
}

// 確定操作2：ステップ進行確定（時間停止の解除）。
export function resumeTime(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
  assertPaused(battleOf(session));
  beginConfirmOperation(session, 2, ctx);
  leavePause(session, ctx);
  return runUntilPause(session, ctx, options);
}
