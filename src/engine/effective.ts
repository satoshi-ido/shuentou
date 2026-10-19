// 実効値の導出をアクション種別ごとに1箇所へ集約する（[M-CALC-EFFECTIVE] [M-CALC-ROUNDING]）。
// 被バフ量・被デバフ量は実行者ユニット側が保持する（[M-STATE-UNIT]）。

import { effectiveBasicInt, effectiveDecayRateCenti, effectiveDecimalCenti } from './calc.js';
import type { ParamId } from './params.js';
import type { ActionInstance, Unit } from './types.js';

const FLOOR_AT_ONE = { floorAtOne: true } as const;

function basic(unit: Unit, id: ParamId, base: number, floorAtOne = false): number {
  return effectiveBasicInt(base, unit.buff[id], unit.debuff[id], id, floorAtOne ? FLOOR_AT_ONE : undefined);
}

export function effectiveStepThought(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'step_thought', action.base_params.step_thought);
}

// [M-CALC-ROUNDING]「通常発生ステップのみ下限1」：基礎値が1以上（通常アクション）の場合のみ適用する。
export function effectiveStepStartup(unit: Unit, action: ActionInstance): number {
  const isNormal = action.base_params.step_startup > 0;
  return basic(unit, 'step_startup', action.base_params.step_startup, isNormal);
}

export function effectiveStepRecovery(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'step_recovery', action.base_params.step_recovery);
}

export function effectiveCostHp(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'cost_hp', action.base_params.cost_hp);
}

export function effectiveCostVp(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'cost_vp', action.base_params.cost_vp);
}

export function effectiveCostPp(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'cost_pp', action.base_params.cost_pp);
}

export function effectiveCostAp(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'cost_ap', action.base_params.cost_ap);
}

export function effectiveDeployAp(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'deploy_ap', action.base_params.deploy_ap);
}

export function effectiveGainVp(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'gain_vp', action.base_params.gain_vp);
}

export function effectiveRange(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'range', action.base_params.range);
}

export function effectiveAtk(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'atk', action.base_params.atk);
}

export function effectiveDmgHpCenti(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'dmg_hp', action.base_params.dmg_hp);
}

export function effectiveDmgVpCenti(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'dmg_vp', action.base_params.dmg_vp);
}

export function effectiveDmgPpCenti(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'dmg_pp', action.base_params.dmg_pp);
}

export function effectiveDmgApCenti(unit: Unit, action: ActionInstance): number {
  return basic(unit, 'dmg_ap', action.base_params.dmg_ap);
}

export function effectiveChargePpCenti(unit: Unit, action: ActionInstance): number {
  return effectiveDecimalCenti(action.base_params.charge_pp, unit.buff.charge_pp, unit.debuff.charge_pp, 'charge_pp');
}

export function effectiveDecayApRateCenti(unit: Unit, action: ActionInstance): number {
  return effectiveDecayRateCenti(action.base_params.decay_ap, unit.buff.decay_ap, unit.debuff.decay_ap);
}
