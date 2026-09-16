// [M-PIPE-P8-DECISION] [M-PIPE-P8-ORDER] 《処理8》時間停止・AI決定・即時決済・プレイヤー指示。
//
// 本モジュールは「思考中ユニットに決定を問い合わせ、確定した効果を解決する」中核の手続きを担う。
// 時間停止トリガー（[M-PIPE-PAUSE-TRIGGER]）の判定と停止事由の記録は game/battle.ts が担う。
// 敵軍AI（FOE側）を先に評価し、続いて自軍（MINE側）を評価する（[M-PIPE-P8-ORDER]の順序）。

import { executableActions, isInstant, type DecisionProvider } from '../decision.js';
import { effectiveCostAp, effectiveCostHp, effectiveCostPp, effectiveCostVp, effectiveStepStartup } from '../effective.js';
import { INFINITE_USES } from '../params.js';
import type { CreatureFactory } from '../resolve/summon.js';
import type { ActionInstance, BattleState, LastActionSnapshot, Side, Unit } from '../types.js';
import { countExecution } from '../mirror.js';
import { runInstant } from './instant.js';
import type { BattleOutcome } from './p5-discard.js';

export interface P8Deps {
  readonly createCreature: CreatureFactory;
}

// [M-PIPE-P8-ORDER]#1・#3 通常アクション選択時の共通処理：コスト消費・回数減算・last_act 記録・発生中遷移。
function confirmNormalAction(unit: Unit, action: ActionInstance): void {
  const snapshot: LastActionSnapshot = {
    instance_id: action.instance_id,
    class_id: action.master_ref,
    sys_flags: action.sys_flags,
    params: action.base_params,
    uses_left_before: action.uses_left,
    is_copy: action.is_copy,
  };
  unit.last_act = snapshot;
  unit.hp = unit.hp - effectiveCostHp(unit, action);
  unit.vp = Math.max(unit.vp - effectiveCostVp(unit, action), 0);
  unit.pp = Math.max(unit.pp - effectiveCostPp(unit, action), 0);
  unit.ap = Math.max(unit.ap - effectiveCostAp(unit, action), 0);
  if (action.uses_left !== INFINITE_USES) {
    action.uses_left = action.uses_left - 1;
  }
  unit.state = 'STARTUP';
  unit.elapsed_startup = 0;
}

function sideUnits(state: BattleState, side: Side): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.side === side);
}

// [M-PIPE-P8-ORDER]#1・#3 採択された実行可能アクションを実行ルーティングに渡す。
export function executeAction(state: BattleState, unit: Unit, action: ActionInstance, deps: P8Deps): BattleOutcome {
  // [M-META-MIRRORSTATS] 計上対象は主人公マスターの実行確定に限る（first_system の規定に揃える）。
  if (unit.side === 'MINE' && unit.unit_kind === 'MASTER') {
    countExecution(state.mirror_tally, action);
  }
  if (isInstant(action)) {
    return runInstant(state, unit, action, deps);
  }
  confirmNormalAction(unit, action);
  return 'NONE';
}

export interface ExecutedAction {
  readonly unitId: string;
  readonly instanceId: string;
  readonly instant: boolean;
  // 通常アクションの発生満了までの残ステップ数（即時型は 0）。[M-DATA-PAUSE-REASON]「RemainingSteps の意味」。
  readonly remainingSteps: number;
}

// [I-ENV-WORKER] 決定待ちで中断した地点から再開するための、当該ステップ内の進行状態。
export interface SideLoopState {
  passed: string[];
  acted: boolean;
  firstExecuted: ExecutedAction | null;
}

export function newSideLoopState(): SideLoopState {
  return { passed: [], acted: false, firstExecuted: null };
}

export interface DecisionLoopResult {
  readonly outcome: BattleOutcome;
  // 決定が未応答のため中断したとき true。呼び出し側は同じ SideLoopState で再開する。
  readonly awaiting: boolean;
  // [M-PIPE-PAUSE-TRIGGER]#2 の判定に用いる。1件以上のアクションを実行したとき true。
  readonly acted: boolean;
  // [M-DATA-PAUSE-REASON]「同時成立時」：最初に実行されたアクション。
  readonly firstExecuted: ExecutedAction | null;
}

// [M-PIPE-P8-ORDER]#1「評価・行動確定ループ」／#3「プレイヤー指示」を1本の手続きに統一する。
// 瞬動アクション実行後は同一ユニットが即座に思考中へ戻りうるため（[M-PIPE-INSTANT]#4）、
// 決定がなくなるまで走査を繰り返す。1ユニットにつき PASS は1ステップ内で1回のみ問い合わせる。
export function runSideDecisionLoop(
  state: BattleState,
  side: Side,
  decisionFor: DecisionProvider,
  deps: P8Deps,
  loop: SideLoopState = newSideLoopState(),
): DecisionLoopResult {
  const passed = loop.passed;
  const maxIterations = 64;
  for (let i = 0; i < maxIterations; i += 1) {
    const candidate = sideUnits(state, side).find((unit) => unit.state === 'THOUGHT' && !passed.includes(unit.unit_id));
    if (candidate === undefined) {
      break;
    }
    const decision = decisionFor(state, candidate);
    if (decision.kind === 'AWAIT') {
      return { outcome: 'NONE', acted: loop.acted, firstExecuted: loop.firstExecuted, awaiting: true };
    }
    if (decision.book !== undefined) {
      state.book_index = decision.book.book_index;
      state.book_aborted = decision.book.book_aborted;
      state.book_wait_elapsed = decision.book.book_wait_elapsed;
    }
    if (decision.kind === 'PASS') {
      passed.push(candidate.unit_id);
      continue;
    }
    const action = candidate.acts.find((a) => a.instance_id === decision.instanceId);
    if (action === undefined || !executableActions(state, candidate).includes(action)) {
      passed.push(candidate.unit_id);
      continue;
    }
    loop.acted = true;
    const instant = isInstant(action);
    loop.firstExecuted ??= {
      unitId: candidate.unit_id,
      instanceId: action.instance_id,
      instant,
      remainingSteps: instant ? 0 : effectiveStepStartup(candidate, action),
    };
    const outcome = executeAction(state, candidate, action, deps);
    if (outcome !== 'NONE') {
      return { outcome, acted: loop.acted, firstExecuted: loop.firstExecuted, awaiting: false };
    }
  }
  return { outcome: 'NONE', acted: loop.acted, firstExecuted: loop.firstExecuted, awaiting: false };
}

// ヘッドレス実行（探索・検証）用。決定主体は同期に応答する前提であり、AWAIT は扱わない。
export function runP8Decision(state: BattleState, decisionFor: DecisionProvider, deps: P8Deps): BattleOutcome {
  const foe = runSideDecisionLoop(state, 'FOE', decisionFor, deps);
  if (foe.outcome !== 'NONE') {
    return foe.outcome;
  }
  return runSideDecisionLoop(state, 'MINE', decisionFor, deps).outcome;
}
