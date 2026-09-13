// [M-PIPE-P8-DECISION] [M-PIPE-P8-ORDER] 《処理8》時間停止・AI決定・即時決済・プレイヤー指示。
//
// M1（ヘッドレスエンジン）の範囲では、時間停止トリガー（[M-PIPE-PAUSE-TRIGGER]）のうち
// UI監視トグル条件（#3）・手動停止（#4）は src/ui 層（M4）の責務であり本モジュールには含めない。
// 決定論的なヘッドレス実行では「思考中ユニットに決定を問い合わせ、確定した効果を解決する」
// という中核の手続きのみが検証対象であるため、停止・再開の可視的な演出はここでは扱わない。
// 敵軍AI（FOE側）を先に評価し、続いて自軍（MINE側）を評価する（[M-PIPE-P8-ORDER]の順序）。

import { executableActions, isInstant, type DecisionProvider } from '../decision.js';
import { effectiveCostAp, effectiveCostHp, effectiveCostPp, effectiveCostVp } from '../effective.js';
import { INFINITE_USES } from '../params.js';
import type { CreatureFactory } from '../resolve/summon.js';
import type { ActionInstance, BattleState, LastActionSnapshot, Side, Unit } from '../types.js';
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

// [M-PIPE-P8-ORDER]#1「評価・行動確定ループ」／#3「プレイヤー指示」を1本の手続きに統一する。
// 瞬動アクション実行後は同一ユニットが即座に思考中へ戻りうるため（[M-PIPE-INSTANT]#4）、
// 決定がなくなるまで走査を繰り返す。1ユニットにつき PASS は1ステップ内で1回のみ問い合わせる。
function runDecisionLoop(state: BattleState, side: Side, decisionFor: DecisionProvider, deps: P8Deps): BattleOutcome {
  const passed: string[] = [];
  const maxIterations = 64;
  for (let i = 0; i < maxIterations; i += 1) {
    const candidate = sideUnits(state, side).find((unit) => unit.state === 'THOUGHT' && !passed.includes(unit.unit_id));
    if (candidate === undefined) {
      break;
    }
    const decision = decisionFor(state, candidate);
    if (decision.kind === 'PASS') {
      passed.push(candidate.unit_id);
      continue;
    }
    const action = candidate.acts.find((a) => a.instance_id === decision.instanceId);
    if (action === undefined || !executableActions(state, candidate).includes(action)) {
      passed.push(candidate.unit_id);
      continue;
    }
    if (isInstant(action)) {
      const outcome = runInstant(state, candidate, action, deps);
      if (outcome !== 'NONE') {
        return outcome;
      }
      // 瞬動で同一ステップ内に再着地した場合は再評価ループを継続する（passed には積まない）。
    } else {
      confirmNormalAction(candidate, action);
    }
  }
  return 'NONE';
}

export function runP8Decision(state: BattleState, decisionFor: DecisionProvider, deps: P8Deps): BattleOutcome {
  const foeOutcome = runDecisionLoop(state, 'FOE', decisionFor, deps);
  if (foeOutcome !== 'NONE') {
    return foeOutcome;
  }
  return runDecisionLoop(state, 'MINE', decisionFor, deps);
}
