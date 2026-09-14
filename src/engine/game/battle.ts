// [M-PIPE-P8-ORDER] [M-PIPE-PAUSE-TRIGGER] [M-STATE-HISTORY] [M-STATE-RUNSTATE] [M-PROG-CLEAR]
// バトルの開始・時間停止までの進行・プレイヤー指示（確定操作1）・ステップ進行確定（確定操作2）。
//
// 静止中のバトルは常に「《処理8》の時間停止中（敵軍AI確定後）」にある。HistoryStack の各項目も
// この時点で記録されるため、復元後に敵軍AIを再計算せずプレイヤー指示から再開できる（[M-REWIND-UNDO]）。
// 例外はバトル開始時セーブのステップ0生成直後であり、ロード・バトル開始時ロールバックでは
// enterBattle により最初の時間停止まで進める。
// 時間停止トリガーのうち #3（UI監視トグル）は M4 で追加する。#4（手動停止）は stopAtStep で与える。

import { executableActions } from '../decision.js';
import { createBattleState } from '../battle.js';
import { instantiateActionList } from '../instantiate.js';
import type { BattleOutcome } from '../pipeline/p5-discard.js';
import { executeAction, runSideDecisionLoop } from '../pipeline/p8-decision.js';
import { runPreDecision } from '../pipeline/step.js';
import { runStepEnd } from '../pipeline/stepend.js';
import { settleBattleClear } from '../progress/clear.js';
import { enemyOf, sceneOf } from '../run/masters.js';
import { cloneRun, cloneState } from '../run/snapshot.js';
import type { BattleState, Unit } from '../types.js';
import { autosave, beginConfirmOperation, type GameContext, type GameSession } from './session.js';

export type BattleResult = 'PAUSED' | 'WIN' | 'LOSS';

export interface AdvanceOptions {
  // [M-PIPE-PAUSE-TRIGGER]#4 手動停止を要求する最初のステップ数。
  readonly stopAtStep?: number;
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
    (unit): unit is Unit => unit !== null && unit.side === 'MINE' && executableActions(state, unit).length > 0,
  );
}

function finish(session: GameSession, ctx: GameContext, outcome: Exclude<BattleOutcome, 'NONE'>): BattleResult {
  if (outcome === 'WIN') {
    settleBattleClear(session.data.run, ctx.masters);
    session.battle_start_run = null;
    autosave(session, ctx); // ［保存契機］バトルクリア共通決済の完了時（スナップショット記録の後）
  }
  return outcome;
}

// ステップの先頭（ステップ0は《処理8》の先頭）から、時間停止または決着まで進める。
function runUntilPause(session: GameSession, ctx: GameContext, options: AdvanceOptions): BattleResult {
  const state = battleOf(session);
  for (;;) {
    const pre = runPreDecision(state, ctx.stepDeps);
    if (pre !== 'NONE') {
      return finish(session, ctx, pre);
    }
    const foe = runSideDecisionLoop(state, 'FOE', ctx.foeDecision, ctx.stepDeps);
    if (foe.outcome !== 'NONE') {
      return finish(session, ctx, foe.outcome);
    }
    // #1 はステップ0の判定そのものが「自軍に即時実行可能なアクションの存在」である。
    // #4 の手動停止要求は、指示可能な自軍ユニットが現れるまで維持する。
    const manualStop = options.stopAtStep !== undefined && state.step >= options.stopAtStep;
    const triggered = state.step === 0 || foe.acted || manualStop;
    if (triggered && instructableUnits(state).length > 0) {
      return 'PAUSED';
    }
    runStepEnd(state);
  }
}

// [M-STATE-RUNSTATE]［主人公ステートの正本］バトル開始時（ステップ0の生成）。
export function startBattle(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
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
  });
  run.phase = 'BATTLE';
  session.battle_start_run = cloneRun(run);
  autosave(session, ctx); // ［保存契機］バトル開始時（ステップ0の生成完了時）
  return runUntilPause(session, ctx, options);
}

// ステップ0生成直後のステートから最初の時間停止まで進める（ロード・バトル開始時ロールバック）。
export function enterBattle(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
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
  if (instructableUnits(state).length > 0) {
    return 'PAUSED';
  }
  runStepEnd(state);
  return runUntilPause(session, ctx, options);
}

// 確定操作2：ステップ進行確定（時間停止の解除）。
export function resumeTime(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
  assertPaused(battleOf(session));
  beginConfirmOperation(session, 2, ctx);
  runStepEnd(battleOf(session));
  return runUntilPause(session, ctx, options);
}
