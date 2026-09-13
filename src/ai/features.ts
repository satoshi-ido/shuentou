// [A-EVAL-TEMPO] [A-EVAL-RESOURCE] [A-EVAL-STATUS] [A-EVAL-BOARD] の各特徴量。
// いずれも AI側（FOE）視点で「AI有利を正」とする（[A-EVAL-FORM]）。返り値は SCALE(1024)刻みの
// 固定小数（x = 1.0 は SCALE を意味する）。
//
// x_pp・x_vp の「最も撃ちたい武技」「目標PPに必要なVP」（[A-EVAL-RESOURCE]）は、合本の記述が
// 具体的な選択規則を明示していない。本実装は「実効攻撃力が最大の武技」を暫定の選択規則として
// 採用する。1-01（[A-DIFF-CONFIG]）の eval_mask はこの2項を含まないため M2 の受け入れ線には
// 影響しない（[A-DESIGN-WEAKNESS]「評価項のマスク」）。2-01以降で有効化する際に該当IDへの
// 書き戻し（[I-PLAN-WORKFLOW]）を検討すること。

import { effectiveAtk, effectiveChargePpCenti, effectiveCostPp, effectiveCostVp, effectiveDmgHpCenti, effectiveRange } from '../engine/effective.js';
import { executableActions } from '../engine/decision.js';
import { hasFlag } from '../engine/flags.js';
import { partnerSlotOf } from '../engine/resolve/partner.js';
import { PARAM_IDS } from '../engine/params.js';
import type { ActionInstance, BattleState, Side, Unit } from '../engine/types.js';
import { floorDiv } from '../num/helpers.js';
import { DEBUFF_IMPORTANCE, SCALE, STD } from './constants.js';
import { clamp, ratioToScale, signedRoundDiv } from './fixed.js';

function livingUnitsOfSide(state: BattleState, side: Side): Unit[] {
  return state.units.filter((u): u is Unit => u !== null && u.side === side);
}

function masterOfSide(state: BattleState, side: Side): Unit | undefined {
  return livingUnitsOfSide(state, side).find((u) => u.unit_kind === 'MASTER');
}

// [A-EVAL-TEMPO] 行動可能到達度（1ユニット分）。
function tempoContribution(state: BattleState, unit: Unit): number {
  if (unit.state === 'THOUGHT') {
    if (executableActions(state, unit).length > 0) {
      return SCALE;
    }
    if (unit.acts.length === 0) {
      return 0;
    }
    const minThought = Math.min(...unit.acts.map((a) => a.base_params.step_thought));
    return clamp(ratioToScale(unit.elapsed_thought, Math.max(minThought, 1), SCALE), 0, SCALE);
  }
  if (unit.state === 'STARTUP') {
    if (unit.last_act === null) {
      return 0;
    }
    const active = unit.acts.find((a) => a.instance_id === unit.last_act?.instance_id);
    if (active === undefined) {
      return 0;
    }
    const ratio = clamp(ratioToScale(unit.elapsed_startup, Math.max(active.base_params.step_startup, 1), SCALE), 0, SCALE);
    return signedRoundDiv(ratio * 2, 5); // ×0.4
  }
  // RECOVERY
  const ratio = clamp(ratioToScale(unit.elapsed_recovery, Math.max(unit.applied_recovery, 1), SCALE), 0, SCALE);
  return signedRoundDiv(ratio, 4); // ×0.25
}

function sideTempo(state: BattleState, side: Side): number {
  const units = livingUnitsOfSide(state, side);
  if (units.length === 0) {
    return 0;
  }
  const sum = units.reduce((s, u) => s + tempoContribution(state, u), 0);
  return signedRoundDiv(sum, units.length);
}

export function xTempo(state: BattleState): number {
  return signedRoundDiv(sideTempo(state, 'FOE') - sideTempo(state, 'MINE'), 2);
}

// [A-EVAL-BOARD]
export function xBoard(state: BattleState): number {
  const foe = livingUnitsOfSide(state, 'FOE').length;
  const mine = livingUnitsOfSide(state, 'MINE').length;
  return signedRoundDiv((foe - mine) * SCALE, 2);
}

function maxMartialRange(state: BattleState, side: Side): number {
  let best = 0;
  for (const unit of livingUnitsOfSide(state, side)) {
    for (const action of unit.acts) {
      if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
        continue;
      }
      best = Math.max(best, effectiveRange(unit, action));
    }
  }
  return best;
}

export function xPosition(state: BattleState): number {
  const foe = maxMartialRange(state, 'FOE');
  const mine = maxMartialRange(state, 'MINE');
  return signedRoundDiv((foe - mine) * SCALE, 3);
}

// [A-EVAL-BOARD] 常に敵側の減点として線形に効く。expectedLength は [A-PROFILE-RESOLVE] 経由の
// EffectiveProfile.expectedLength を用いる。
export function xImpatience(state: BattleState, expectedLength: number): number {
  return -ratioToScale(state.step, Math.max(expectedLength, 1), SCALE);
}

function mostWantedMartialAction(unit: Unit): ActionInstance | undefined {
  let best: ActionInstance | undefined;
  let bestAtk = -1;
  for (const action of unit.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const atk = effectiveAtk(unit, action);
    if (atk > bestAtk) {
      bestAtk = atk;
      best = action;
    }
  }
  return best;
}

// [A-EVAL-RESOURCE] x_pp。
function ppSaturation(unit: Unit): number {
  const wanted = mostWantedMartialAction(unit);
  const cost = wanted === undefined ? 0 : effectiveCostPp(unit, wanted);
  const ratio = ratioToScale(unit.pp, Math.max(cost, 1), SCALE);
  return Math.min(ratio, SCALE);
}

export function xPp(state: BattleState): number {
  const foe = masterOfSide(state, 'FOE');
  const mine = masterOfSide(state, 'MINE');
  return (foe === undefined ? 0 : ppSaturation(foe)) - (mine === undefined ? 0 : ppSaturation(mine));
}

function ceilDivPositive(a: number, b: number): number {
  if (a <= 0) {
    return 0;
  }
  return floorDiv(a + b - 1, b);
}

// [A-EVAL-RESOURCE] x_vp。召喚コスト（未召喚時のみ）または「目標PPに必要なVP」のいずれか
// 小さい方を分母とする（本項冒頭の注記を参照）。
function vpSaturation(state: BattleState, unit: Unit): number {
  const candidates: number[] = [];
  const summonActs = unit.acts.filter((a) => hasFlag(a.sys_flags, 'FLAG_SUMMON'));
  if (summonActs.length > 0 && state.units[partnerSlotOf(unit.pos_idx)] === null) {
    candidates.push(...summonActs.map((a) => effectiveCostVp(unit, a)));
  }
  const wantedPp = mostWantedMartialAction(unit);
  const wantedPpCost = wantedPp === undefined ? 0 : effectiveCostPp(unit, wantedPp);
  const mindActs = unit.acts.filter((a) => hasFlag(a.sys_flags, 'FLAG_MIND') && effectiveChargePpCenti(unit, a) > 0);
  if (wantedPpCost > 0 && mindActs.length > 0) {
    const bestRate = Math.max(...mindActs.map((a) => effectiveChargePpCenti(unit, a)));
    candidates.push(ceilDivPositive(wantedPpCost * 100, bestRate));
  }
  const cost = candidates.length === 0 ? 0 : Math.min(...candidates);
  const ratio = ratioToScale(unit.vp, Math.max(cost, 1), SCALE);
  return Math.min(ratio, SCALE);
}

export function xVp(state: BattleState): number {
  const foe = masterOfSide(state, 'FOE');
  const mine = masterOfSide(state, 'MINE');
  return (foe === undefined ? 0 : vpSaturation(state, foe)) - (mine === undefined ? 0 : vpSaturation(state, mine));
}

// [A-EVAL-STATUS] x_slip。
export function xSlip(state: BattleState): number {
  const foe = masterOfSide(state, 'FOE');
  const mine = masterOfSide(state, 'MINE');
  const foeSlip = foe?.slip ?? 0;
  const mineSlip = mine?.slip ?? 0;
  return clamp(signedRoundDiv((mineSlip - foeSlip) * SCALE, 100), -SCALE, SCALE);
}

// [A-EVAL-STATUS] x_debuff。17種のAI評価重みで加重和し、標準付与量の加重和で正規化する。
function weightedDebuff(unit: Unit): number {
  let numerator = 0;
  let denominator = 0;
  for (const id of PARAM_IDS) {
    numerator += DEBUFF_IMPORTANCE[id] * unit.debuff[id];
    denominator += DEBUFF_IMPORTANCE[id] * STD[id];
  }
  return ratioToScale(numerator, denominator, SCALE);
}

export function xDebuff(state: BattleState): number {
  const foe = masterOfSide(state, 'FOE');
  const mine = masterOfSide(state, 'MINE');
  const foeVal = foe === undefined ? 0 : weightedDebuff(foe);
  const mineVal = mine === undefined ? 0 : weightedDebuff(mine);
  return mineVal - foeVal;
}

// [A-EVAL-STATUS] x_seal：封印により失われた「最大実効HPダメージ」の割合。
function sealLossRatio(unit: Unit): number {
  let bestOverall = 0;
  let bestUnsealed = 0;
  for (const action of unit.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const dmg = effectiveDmgHpCenti(unit, action);
    bestOverall = Math.max(bestOverall, dmg);
    if (action.seal_accum < 100) {
      bestUnsealed = Math.max(bestUnsealed, dmg);
    }
  }
  if (bestOverall === 0) {
    return 0;
  }
  return SCALE - ratioToScale(bestUnsealed, bestOverall, SCALE);
}

export function xSeal(state: BattleState): number {
  const foe = masterOfSide(state, 'FOE');
  const mine = masterOfSide(state, 'MINE');
  const foeVal = foe === undefined ? 0 : sealLossRatio(foe);
  const mineVal = mine === undefined ? 0 : sealLossRatio(mine);
  return mineVal - foeVal;
}

// [A-EVAL-STATUS] x_copy：獲得済みコピー枠の実効HPダメージ／オリジナル最大値の比（定着度で割引）。
function copyRatio(unit: Unit): number {
  let bestOriginal = 0;
  let copyValue = 0;
  for (const action of unit.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const dmg = effectiveDmgHpCenti(unit, action);
    if (action.is_copy) {
      copyValue += ratioToScale(dmg * action.copy_fixation, 100, 1);
    } else {
      bestOriginal = Math.max(bestOriginal, dmg);
    }
  }
  if (bestOriginal === 0) {
    return 0;
  }
  return Math.min(ratioToScale(copyValue, bestOriginal, SCALE), SCALE);
}

export function xCopy(state: BattleState): number {
  const foe = masterOfSide(state, 'FOE');
  const mine = masterOfSide(state, 'MINE');
  const foeVal = foe === undefined ? 0 : copyRatio(foe);
  const mineVal = mine === undefined ? 0 : copyRatio(mine);
  return foeVal - mineVal;
}
