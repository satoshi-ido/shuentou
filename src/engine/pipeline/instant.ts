// [M-PIPE-INSTANT]【共通サブルーチン】即時型アクション（発生0）の決済処理。

import { decayAp, levelSlipDamage } from '../calc.js';
import { currentDefense } from '../defense.js';
import {
  effectiveCostAp,
  effectiveCostHp,
  effectiveCostPp,
  effectiveCostVp,
  effectiveDecayApRateCenti,
  effectiveStepRecovery,
} from '../effective.js';
import { INFINITE_USES } from '../params.js';
import { resolveAction } from '../resolve/order.js';
import type { CueSink } from '../cue.js';
import { emitDestroyed, emitMartialResult, emitTrigger, pendingDiscardIds } from './cue-emit.js';
import type { CreatureFactory } from '../resolve/summon.js';
import type { ActionInstance, BattleState, LastActionSnapshot, Unit } from '../types.js';
import { removeCreatures, type BattleOutcome } from './p5-discard.js';
import { runP6Advance } from './p6-advance.js';

export interface InstantDeps {
  readonly createCreature: CreatureFactory;
  readonly onCue?: CueSink; // [M-DATA-AUDIO-CUE] 発火契機の受け口
}

function hasMaster(state: BattleState, side: 'MINE' | 'FOE'): boolean {
  return state.units.some((unit) => unit !== null && unit.side === side && unit.unit_kind === 'MASTER');
}

// [M-PIPE-INSTANT]#3 即時破棄・自動前進・勝敗判定。
function discardDeadAndCheckVictory(state: BattleState): BattleOutcome {
  let anyDiscarded = false;
  for (let idx = 0; idx < state.units.length; idx += 1) {
    const unit = state.units[idx];
    if (unit !== null && unit.hp <= 0) {
      state.units[idx] = null;
      anyDiscarded = true;
    }
  }
  if (anyDiscarded) {
    runP6Advance(state);
  }
  const mineAlive = hasMaster(state, 'MINE');
  const foeAlive = hasMaster(state, 'FOE');
  if (!mineAlive || !foeAlive) {
    removeCreatures(state);
    return mineAlive ? 'WIN' : 'LOSS';
  }
  return 'NONE';
}

function pushInstantUsed(state: BattleState, unitId: string, classId: string): void {
  const used = state.instant_used[unitId] ?? [];
  const next = [...used, classId].sort();
  state.instant_used[unitId] = next;
}

function removeSpentActions(unit: Unit): void {
  unit.acts = unit.acts.filter((instance) => {
    const usedUp = instance.uses_left !== INFINITE_USES && instance.uses_left === 0;
    const fixationLost = instance.is_copy && instance.copy_fixation < 100;
    return !usedUp && !fixationLost;
  });
}

export function runInstant(state: BattleState, unit: Unit, action: ActionInstance, deps: InstantDeps): BattleOutcome {
  // #1 コスト消費と回数減算。last_act の記録も指示確定時点で行う（[M-STATE-LASTACTION-LIFECYCLE]#1）。
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
  pushInstantUsed(state, unit.unit_id, action.master_ref);

  // [M-DATA-AUDIO-CUE] ACTION_TRIGGER：統合解決パイプラインの Step 1 直前。
  emitTrigger(deps.onCue, unit, action);
  const destroyedBefore = pendingDiscardIds(state);

  // #2 統合効果の即時適用。
  const resolveOutcome = resolveAction(state.units, unit, action, 'INSTANT', {
    createCreature: deps.createCreature,
    level: state.scene_level,
    defenseOf: (target) => currentDefense(target),
    idCounter: state,
    appliedInterferenceSides: [],
  });

  // [M-DATA-AUDIO-CUE] HIT / MISS：武技の命中判定の確定時。
  emitMartialResult(deps.onCue, state, unit, action, resolveOutcome);
  emitDestroyed(deps.onCue, state, destroyedBefore);

  // #3 即時破棄・自動前進・勝敗判定。
  const outcomeAfterEffects = discardDeadAndCheckVictory(state);
  if (outcomeAfterEffects !== 'NONE') {
    return outcomeAfterEffects;
  }
  if (unit.hp <= 0) {
    // 自身がこの時点で撤去されていれば以降の硬直分岐は行わない。
    return 'NONE';
  }

  // #4 硬直分岐処理。
  const isSokuhatsu = action.base_params.step_recovery > 0; // 即発アクション（硬直1以上）
  if (isSokuhatsu) {
    unit.applied_recovery = effectiveStepRecovery(unit, action);
    unit.state = 'RECOVERY';
    unit.elapsed_recovery = 0;
    return 'NONE';
  }

  // 瞬動アクション（硬直0）。
  const slipDamage = levelSlipDamage(unit.slip, state.scene_level);
  unit.hp = unit.hp - slipDamage;
  if (unit.hp <= 0) {
    const outcomeAfterSlip = discardDeadAndCheckVictory(state);
    if (outcomeAfterSlip !== 'NONE') {
      return outcomeAfterSlip;
    }
    return 'NONE';
  }
  const decayRate = effectiveDecayApRateCenti(unit, action);
  unit.ap = decayAp(unit.ap, decayRate);
  removeSpentActions(unit);
  unit.state = 'THOUGHT';
  unit.elapsed_thought = 0;
  return 'NONE';
}
