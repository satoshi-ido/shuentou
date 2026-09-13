// [M-CALC-EFFECTIVE] [M-CALC-ROUNDING] [M-CALC-DECAY] [M-CALC-DEFENSE] [M-CALC-LEVEL]
// 実効値確定・端数処理・減衰・防御力・レベル補正の各計算式。
// 決定論層につき除算演算子・浮動小数リテラル・Math.sqrt を用いず、[I-NUM-HELPERS] のみで計算する。

import { floorDiv, isqrt, roundDiv } from '../num/helpers.js';
import { isDecreasingParam, type ParamId } from './params.js';

const CENTI = 100;

// [M-CALC-EFFECTIVE] factor = (1.0 -+ 被バフ量 +- 被デバフ量) を centi スケール（基準100）で返す。
function effectiveFactorCenti(buffCenti: number, debuffCenti: number, id: ParamId): number {
  return isDecreasingParam(id) ? CENTI - buffCenti + debuffCenti : CENTI + buffCenti - debuffCenti;
}

// [M-CALC-ROUNDING]「基本整数」区分。四捨五入・下限0。基礎値0固定ルールが最優先。
// base は centi ではない素の整数（攻撃力・必要ステップ数等）。
// floorAtOne を true にした場合のみ、通常アクションの必要発生ステップとして下限1を適用する。
export function effectiveBasicInt(
  base: number,
  buffCenti: number,
  debuffCenti: number,
  id: ParamId,
  options?: { readonly floorAtOne?: boolean },
): number {
  if (base === 0) {
    return 0;
  }
  const factor = effectiveFactorCenti(buffCenti, debuffCenti, id);
  const value = roundDiv(Math.max(base * factor, 0), CENTI);
  if (options?.floorAtOne === true) {
    return Math.max(value, 1);
  }
  return Math.max(value, 0);
}

// 「小数パラメータ」区分の実効値（charge_pp のみが該当。base・戻り値ともに centi）。通常: 小数第3位四捨五入。
export function effectiveDecimalCenti(baseCenti: number, buffCenti: number, debuffCenti: number, id: ParamId): number {
  if (baseCenti === 0) {
    return 0;
  }
  const factor = effectiveFactorCenti(buffCenti, debuffCenti, id);
  return Math.max(roundDiv(baseCenti * factor, CENTI), 0);
}

// decay_ap のみ該当。「減衰率パラメータ」区分：小数第3位四捨五入、下限0.00/上限1.00（centi 0〜100）。
export function effectiveDecayRateCenti(baseCenti: number, buffCenti: number, debuffCenti: number): number {
  if (baseCenti === 0) {
    return 0;
  }
  const factor = effectiveFactorCenti(buffCenti, debuffCenti, 'decay_ap');
  const raw = roundDiv(baseCenti * factor, CENTI);
  return Math.min(Math.max(raw, 0), CENTI);
}

// [M-CALC-DECAY] 値_new = max(0.00, floor(値_old * (1.0 - 減衰率実効値) * 100) / 100)。
// centi 表現のまま：value_new_centi = floor(value_old_centi * (100 - rate_centi) / 100)。
export function decayCenti(oldCenti: number, rateCenti: number): number {
  return Math.max(floorDiv(oldCenti * (CENTI - rateCenti), CENTI), 0);
}

// [M-CALC-MAXOVERWRITE] 更新後値 = max(現在値, 新規付与量)。
export function maxOverwrite(currentCenti: number, incomingCenti: number): number {
  return Math.max(currentCenti, incomingCenti);
}

// [M-CALC-DEFENSE]
export function defenseFromApAndEfficiency(apCurrent: number, defEfficiencyCenti: number): number {
  return roundDiv(apCurrent * defEfficiencyCenti, CENTI);
}

// [M-CALC-LEVEL] sqrt(L) を isqrt(L * 10000) / 100 として centi で確定する。
// isqrt(L * 10000) 自体が sqrt(L) の centi 表現（小数第2位まで切り捨て）に一致する。
export function sqrtLevelCenti(level: number): number {
  return isqrt(level * 10000);
}

// [M-CALC-LEVEL] 実効HPダメージ = max(0, round(実効HPダメージ係数 * L))。
export function levelHpDamage(dmgHpEffectiveCenti: number, level: number): number {
  return Math.max(roundDiv(dmgHpEffectiveCenti * level, CENTI), 0);
}

// [M-CALC-LEVEL] 実効VPダメージ = max(0, round(実効VPダメージ係数))。
export function levelVpDamage(dmgVpEffectiveCenti: number): number {
  return Math.max(roundDiv(dmgVpEffectiveCenti, CENTI), 0);
}

// [M-CALC-LEVEL] 実効PPダメージ = max(0, round(実効PPダメージ係数 * sqrt(L)))。
export function levelPpDamage(dmgPpEffectiveCenti: number, level: number): number {
  const sqrtCenti = sqrtLevelCenti(level);
  return Math.max(roundDiv(dmgPpEffectiveCenti * sqrtCenti, CENTI * CENTI), 0);
}

// [M-CALC-LEVEL] 実効APダメージ = max(0, round(実効APダメージ係数))。
export function levelApDamage(dmgApEffectiveCenti: number): number {
  return Math.max(roundDiv(dmgApEffectiveCenti, CENTI), 0);
}

// [M-CALC-LEVEL] 実効スリップダメージ = max(0, round(被スリップ量 * L))。
export function levelSlipDamage(slipCenti: number, level: number): number {
  return Math.max(roundDiv(slipCenti * level, CENTI), 0);
}

// [M-PIPE-P7-LANDING]#2 AP_new = floor(AP_old * (1.0 - AP減衰率実効値))。「減衰・決済整数」区分：切り捨て、下限0。
export function decayAp(apOld: number, decayRateEffectiveCenti: number): number {
  return Math.max(floorDiv(apOld * (CENTI - decayRateEffectiveCenti), CENTI), 0);
}
