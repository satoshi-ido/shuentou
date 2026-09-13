// 候補手の適用。[M-PIPE-P8-ORDER]#1・#3（通常アクション選択時の共通処理）および
// [M-PIPE-INSTANT]（即時型の決済）と同一の手順を、探索器の仮想状態（クローン）に対して適用する。
// 通常アクション分岐は src/engine/pipeline/p8-decision.ts の confirmNormalAction と同一の手順を
// 再実装する（同モジュールが非公開のため。[I-ENV-LAYOUT] により src/ai は src/engine を参照できる）。

import { isInstant } from '../engine/decision.js';
import { effectiveCostAp, effectiveCostHp, effectiveCostPp, effectiveCostVp } from '../engine/effective.js';
import { INFINITE_USES } from '../engine/params.js';
import { runInstant, type InstantDeps } from '../engine/pipeline/instant.js';
import type { BattleOutcome } from '../engine/pipeline/p5-discard.js';
import type { ActionInstance, BattleState, LastActionSnapshot, Unit } from '../engine/types.js';
import type { AiMove } from './movegen.js';

export type ApplyMoveDeps = InstantDeps;

// [M-PIPE-P8-ORDER]#1・#3 通常アクション選択時の共通処理（[M-PIPE-P8-DECISION] confirmNormalAction と同一）。
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

// state.units 内の unit（クローン後の対応個体）を対象に mv を適用する。PASS は無処理。
export function applyMove(state: BattleState, unit: Unit, move: AiMove, deps: ApplyMoveDeps): BattleOutcome {
  if (move.kind === 'PASS') {
    return 'NONE';
  }
  if (isInstant(move.action)) {
    return runInstant(state, unit, move.action, deps);
  }
  confirmNormalAction(unit, move.action);
  return 'NONE';
}
