// [M-PIPE-P1-FREEZE] 《処理1》通常効果の発動確定と実効防御力の凍結。

import { freezeDefense, type DefenseSnapshot } from '../defense.js';
import { effectiveStepStartup } from '../effective.js';
import type { BattleState, Unit } from '../types.js';

export interface P1Result {
  readonly firingUnitIds: readonly string[];
  readonly defenseSnapshot: DefenseSnapshot;
}

function livingUnits(state: BattleState): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.state !== 'PENDING_DISCARD');
}

export function runP1Freeze(state: BattleState): P1Result {
  const living = livingUnits(state);
  const defenseSnapshot = freezeDefense(living);

  const firingUnitIds: string[] = [];
  for (const unit of living) {
    if (unit.state !== 'STARTUP' || unit.last_act === null) {
      continue;
    }
    const action = unit.acts.find((a) => a.instance_id === unit.last_act?.instance_id);
    if (action === undefined) {
      continue;
    }
    if (unit.elapsed_startup >= effectiveStepStartup(unit, action)) {
      firingUnitIds.push(unit.unit_id);
    }
  }
  return { firingUnitIds, defenseSnapshot };
}
