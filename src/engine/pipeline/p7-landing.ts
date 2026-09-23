// [M-PIPE-P7-LANDING] 《処理7》アクション消滅と状態遷移の一斉処理。
// #2（硬直満了帰結：AP減衰＋思考中着地）を先に適用し、その後 #1・#3 の消滅判定を
// 全ユニットへ一括で適用する。着地により対象ユニットが STARTUP/RECOVERY でなくなるため、
// 直前まで実行中だったアクションも #1 の一般消滅判定へ自然に合流する。

import { decayAp } from '../calc.js';
import { effectiveDecayApRateCenti } from '../effective.js';
import { INFINITE_USES } from '../params.js';
import type { ActionInstance, BattleState, Unit } from '../types.js';

function findAction(unit: Unit, instanceId: string): ActionInstance | undefined {
  return unit.acts.find((a) => a.instance_id === instanceId);
}

function shouldDiscard(instance: ActionInstance): boolean {
  if (instance.uses_left !== INFINITE_USES && instance.uses_left === 0) {
    return true;
  }
  return instance.is_copy && instance.copy_fixation < 100;
}

function isActiveInstance(unit: Unit, instance: ActionInstance): boolean {
  return (unit.state === 'STARTUP' || unit.state === 'RECOVERY') && unit.last_act?.instance_id === instance.instance_id;
}

export function runP7Landing(state: BattleState, recoveryCompleteIds: readonly string[]): void {
  // #2 硬直満了帰結。
  for (const unit of state.units) {
    if (unit === null || !recoveryCompleteIds.includes(unit.unit_id) || unit.last_act === null) {
      continue;
    }
    const action = findAction(unit, unit.last_act.instance_id);
    const rate = action !== undefined ? effectiveDecayApRateCenti(unit, action) : 0;
    unit.ap = decayAp(unit.ap, rate);
    unit.state = 'THOUGHT';
    unit.elapsed_thought = 0;
  }

  // #1・#3 非実行アクションおよび満了アクションの消滅（実行中のアクションを除く）。
  // 消滅対象がないステップが大半であるため、該当があるユニットに限り配列を作り直す。
  const discarded = (unit: Unit, instance: ActionInstance): boolean => !isActiveInstance(unit, instance) && shouldDiscard(instance);
  for (const unit of state.units) {
    if (unit === null || !unit.acts.some((instance) => discarded(unit, instance))) {
      continue;
    }
    unit.acts = unit.acts.filter((instance) => !discarded(unit, instance));
  }
}
