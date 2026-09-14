// [M-PIPE-P2-APPLY] 《処理2》通常効果の適用と遷移。

import type { DefenseSnapshot } from '../defense.js';
import { effectiveStepRecovery } from '../effective.js';
import { applyInterference } from '../resolve/interfere.js';
import type { InterferenceRequest } from '../resolve/martial.js';
import { resolveAction } from '../resolve/order.js';
import type { CreatureFactory } from '../resolve/summon.js';
import { applyStunInterruption } from '../resolve/stun.js';
import type { ActionInstance, BattleState, Side, Unit } from '../types.js';

export interface P2Deps {
  readonly createCreature: CreatureFactory;
}

function findAction(unit: Unit, instanceId: string): ActionInstance | undefined {
  return unit.acts.find((a) => a.instance_id === instanceId);
}

export function runP2Apply(
  state: BattleState,
  firingUnitIds: readonly string[],
  defenseSnapshot: DefenseSnapshot,
  deps: P2Deps,
): void {
  const stunTargetIds: string[] = [];
  const interferenceRequests: InterferenceRequest[] = [];

  // 配置マス順（idx昇順）で発動アクションを順次適用する。
  for (const unit of state.units) {
    if (unit === null || !firingUnitIds.includes(unit.unit_id) || unit.last_act === null) {
      continue;
    }
    const action = findAction(unit, unit.last_act.instance_id);
    if (action === undefined) {
      continue;
    }

    // 1. 硬直遷移。
    unit.applied_recovery = effectiveStepRecovery(unit, action);
    unit.state = 'RECOVERY';
    unit.elapsed_recovery = 0;

    // 2-3. 通常効果の順次適用（凍結防御力を参照）。
    const outcome = resolveAction(state.units, unit, action, 'NORMAL', {
      createCreature: deps.createCreature,
      level: state.scene_level,
      defenseOf: (target) => defenseSnapshot[target.unit_id] ?? 0,
      idCounter: state,
      appliedInterferenceSides: [], // NORMAL モードでは内部即時適用しないため未使用
    });

    for (const id of outcome.stunHitUnitIds) {
      if (!stunTargetIds.includes(id) && !firingUnitIds.includes(id)) {
        stunTargetIds.push(id);
      }
    }
    if (outcome.interferenceRequest !== null) {
      interferenceRequests.push(outcome.interferenceRequest);
    }
  }

  // 4. 妨害（スタン）の一括解決：発動した全アクション適用完了後に一斉判定する。
  for (const unitId of stunTargetIds) {
    const target = state.units.find((u) => u !== null && u.unit_id === unitId) ?? null;
    if (target !== null) {
      applyStunInterruption(target);
    }
  }

  // 位置干渉の一括適用（陣営ごとに一括、成立は各陣営1回まで）。
  const appliedSides: Side[] = [];
  for (const request of interferenceRequests) {
    const applied = applyInterference(state.units, request, appliedSides);
    if (applied) {
      appliedSides.push(request.side);
    }
  }
}
