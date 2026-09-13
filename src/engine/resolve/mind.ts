// [M-RESOLVE-MIND] 心気・浄化コンポーネント解決アルゴリズム（[M-RESOLVE-ORDER] Step 3）。

import { roundDiv } from '../../num/helpers.js';
import { decayCenti, maxOverwrite } from '../calc.js';
import { effectiveChargePpCenti, effectiveGainVp } from '../effective.js';
import { hasFlag } from '../flags.js';
import { PARAM_IDS, type ParamId } from '../params.js';
import type { ActionInstance, Unit } from '../types.js';
import { partnerOf } from './partner.js';

// [M-RESOLVE-MIND]#1 浄化処理：不利状態（被デバフ量・被スリップ量・封印蓄積値）を実効浄化率で減衰する。
// purify_rate は17種の補正対象に含まれないため基礎値をそのまま「実効浄化率」として用いる。
function applyPurify(unit: Unit, action: ActionInstance): void {
  const rate = action.base_params.purify_rate;
  if (rate === 0) {
    return;
  }
  for (const id of PARAM_IDS) {
    unit.debuff[id] = decayCenti(unit.debuff[id], rate);
  }
  unit.slip = decayCenti(unit.slip, rate);
  for (const instance of unit.acts) {
    instance.seal_accum = decayCenti(instance.seal_accum, rate);
  }
}

// [M-RESOLVE-MIND]#2〜#4 VP加算・PP充填。目標PP = round(加算後VP * 実効PP充填効率)。
function applyVpAndPp(unit: Unit, action: ActionInstance): void {
  const gainVp = effectiveGainVp(unit, action);
  unit.vp = unit.vp + gainVp;
  const chargeRateCenti = effectiveChargePpCenti(unit, action);
  const targetPp = roundDiv(unit.vp * chargeRateCenti, 100);
  if (unit.pp < targetPp) {
    unit.pp = targetPp;
  }
}

// [M-RESOLVE-MIND]#5 自己バフ適用：与バフ量で被バフ量を最大値上書き更新する。
function applySelfBuff(unit: Unit, action: ActionInstance): void {
  for (const [id, value] of Object.entries(action.base_params.give_buff)) {
    const paramId = id as ParamId;
    unit.buff[paramId] = maxOverwrite(unit.buff[paramId], value);
  }
}

function applyAll(unit: Unit, action: ActionInstance): void {
  applyPurify(unit, action);
  applyVpAndPp(unit, action);
  applySelfBuff(unit, action);
}

// [M-RESOLVE-MIND] Step 3 本体。target_scope が PARTY のときは相方（生存中に限る）へも一括適用する。
export function resolveMind(units: (Unit | null)[], actor: Unit, action: ActionInstance): void {
  if (!hasFlag(action.sys_flags, 'FLAG_PURIFY') && !hasFlag(action.sys_flags, 'FLAG_MIND')) {
    return;
  }
  applyAll(actor, action);

  if (action.base_params.target_scope !== 'PARTY') {
    return;
  }
  const partner = partnerOf(units, actor);
  if (partner === null || partner.state === 'PENDING_DISCARD') {
    return;
  }
  applyAll(partner, action);
}
