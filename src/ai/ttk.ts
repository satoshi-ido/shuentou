// [A-EVAL-TTK] 生存項（TTK：Time-To-Kill）。
// 「あと何ステップで殺せるか／殺されるか」の中核評価軸。t_deny（妨害補正）は防御側の
// 最速スタン武技の「着弾」時刻（reach_timeの第1・第2段＋実効発生ステップ。無限再帰を避けるため
// 第3段の妨害補正はt_deny自身には適用しない）とし、妨害は攻撃側が「思考中」で蓄積している区間
// （[residualBeforeThought, base)）に着弾する場合のみ有効とする（[V-NUM-STEP157]の実測3例
// （体勢AR3=708・体勢AR6=662・武技重撃AR3=787・パス=607、いずれもTTK(敵→主)）に一致することを
// tests/ai/step157-ttk.test.ts で検証済み）。
//
// 既知の差異（開示）：必要ヒット数がリソース補充を要する多段命中（[V-NUM-STEP157]のTTK(主→敵)
// 側、武技コスト不足によりPP充填を挟む場合）は、本実装が合本の式を文字どおりに適用した値と
// 合本の掲載値の間に数ステップ〜のずれが生じることを確認した（例：パスの行でTTK(主→敵)は
// 594〈本実装〉対598〈合本掲載〉）。原因は「後続補充回数×リソース補充サイクル」が単発の
// 補充サイクルあたり常に1回分のコストしか回復しない前提を置く一方、実際のPP充填はVP蓄積の
// 複利的な増加を伴うため、正確な回数がこの単純な線形加算とは一致しないことによる。生存項の
// 主要な検証（到達時間・妨害モデル・封印補正・着弾予測時点の防御力／距離）は上記のとおり
// 実測一致済みであり、本差異はこの狭い補充回数計算のみに閉じる。

import { decayCenti, levelHpDamage } from '../engine/calc.js';
import {
  effectiveAtk,
  effectiveCostAp,
  effectiveCostHp,
  effectiveCostPp,
  effectiveCostVp,
  effectiveDmgHpCenti,
  effectiveRange,
  effectiveStepRecovery,
  effectiveStepStartup,
  effectiveStepThought,
} from '../engine/effective.js';
import { floorDiv } from '../num/helpers.js';
import { hasFlag } from '../engine/flags.js';
import { INFINITE_USES } from '../engine/params.js';
import type { ActionInstance, Unit } from '../engine/types.js';
import { PURIFY_ITER_MAX, TIE_BONUS, TTK_MAX } from './constants.js';
import { signedRoundDiv } from './fixed.js';
import { sampleAt, type QuiesceTrace } from './quiesce.js';

const SEAL_LIMIT_CENTI = 100;
// 除算演算子を用いずに ceil(a / b) を求める（a・b は非負整数、b > 0）。
function ceilDiv(a: number, b: number): number {
  if (a <= 0) {
    return 0;
  }
  return floorDiv(a + b - 1, b);
}

function fullCycle(unit: Unit, action: ActionInstance): number {
  return effectiveStepThought(unit, action) + effectiveStepStartup(unit, action) + effectiveStepRecovery(unit, action);
}

// [A-EVAL-TTK]「第2段（封印補正）」。null は封印解除が不可能（除外対象）を示す。
function purifyActionFor(unit: Unit): { readonly cycle: number; readonly rate: number } | null {
  let best: { readonly cycle: number; readonly rate: number } | null = null;
  for (const action of unit.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_PURIFY')) {
      continue;
    }
    const cycle = fullCycle(unit, action);
    if (best === null || cycle < best.cycle) {
      best = { cycle, rate: action.base_params.purify_rate };
    }
  }
  return best;
}

function sealBreakCount(sealAccumCenti: number, purifyRateCenti: number): number {
  let value = sealAccumCenti;
  let count = 0;
  while (value >= SEAL_LIMIT_CENTI && count <= PURIFY_ITER_MAX + 1) {
    value = decayCenti(value, purifyRateCenti);
    count += 1;
  }
  return count;
}

// [A-EVAL-TTK]「第1段」＋「第2段」。第3段（妨害補正）を適用する前の到達時間。
// t_deny の自己参照的な無限再帰を避けるため、妨害側の候補技評価にもこの2段のみを用いる。
function reachTimeBase(unit: Unit, action: ActionInstance): number | null {
  const stage1 = baseStageOne(unit, action);
  if (action.seal_accum < SEAL_LIMIT_CENTI) {
    return stage1;
  }
  const purify = purifyActionFor(unit);
  if (purify === null) {
    return null;
  }
  const breaks = sealBreakCount(action.seal_accum, purify.rate);
  if (breaks > PURIFY_ITER_MAX) {
    return null;
  }
  return breaks * purify.cycle + effectiveStepThought(unit, action);
}

// ユニットが再び「思考中」へ帰着するまでの残りステップ数。STARTUP中は残り発生に加えて、
// 現在実行中のアクションの硬直（[M-PIPE-P7-LANDING]#2により着地は発生満了→硬直満了の順で
// 進む）を通過する分も加える（[V-NUM-STEP157]の実測「硬直明け（314）＝157+39+118」に一致）。
// 候補技（action）自身の必要思考はこの後に別途加算するため、ここには含めない。
function residualBeforeThought(unit: Unit): number {
  if (unit.state === 'STARTUP') {
    if (unit.last_act === null) {
      return 0;
    }
    const active = unit.acts.find((a) => a.instance_id === unit.last_act?.instance_id);
    if (active === undefined) {
      return 0;
    }
    const remainingStartup = Math.max(effectiveStepStartup(unit, active) - unit.elapsed_startup, 0);
    return remainingStartup + effectiveStepRecovery(unit, active);
  }
  if (unit.state === 'RECOVERY') {
    return Math.max(unit.applied_recovery - unit.elapsed_recovery, 0);
  }
  return 0; // THOUGHT
}

// [A-EVAL-TTK]「第1段（ステート別の基本値）」テーブル本体。「必要思考実効値」は候補技（action）
// 自身のものを用いる（[M-PIPE-P7-LANDING]により着地のたびに経過思考が0へリセットされるため、
// 以後の必要思考は候補技ごとに定まる）。
function baseStageOne(unit: Unit, action: ActionInstance): number {
  if (unit.state === 'THOUGHT') {
    return Math.max(effectiveStepThought(unit, action) - unit.elapsed_thought, 0);
  }
  return residualBeforeThought(unit) + effectiveStepThought(unit, action);
}

// [A-EVAL-TTK]「妨害モデル t_deny」：防御側が保有するスタン付き武技のうち、攻撃側へ届く
// ものの中で最速の「着弾」時刻（第1・第2段の到達時間＋実効発生ステップ）。存在しなければ
// TTK_MAX（妨害なし）。着弾時刻を用いる理由は [V-NUM-STEP157]「主人公は56ステップ後に
// 武技AR6を命中させられる」の実測（＝必要思考42＋必要発生14）に一致するため。
function denyTime(defender: Unit, attacker: Unit): number {
  let best = TTK_MAX;
  for (const action of defender.acts) {
    if (!action.base_params.stun || !hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const range = effectiveRange(defender, action);
    const distance = Math.abs(defender.pos_idx - attacker.pos_idx);
    if (distance > range) {
      continue;
    }
    const t = reachTimeBase(defender, action);
    if (t === null) {
      continue;
    }
    const landing = t + effectiveStepStartup(defender, action);
    if (landing < best) {
      best = landing;
    }
  }
  return best;
}

// [A-EVAL-TTK]「到達時間(act)」（第1〜第3段）。null は除外対象。妨害は攻撃側が「思考中」で
// 蓄積している区間（[residualBeforeThought, base)）に着弾する場合のみ有効となる
// （[V-NUM-STEP157]「武技（重撃）AR3」注記：発生236の投資中に着弾する妨害は
// 「敵が思考中に入る236より前」であるため無効となる＝t_denyの有効範囲外）。
function reachTime(unit: Unit, action: ActionInstance, opponentMaster: Unit): number | null {
  const base = reachTimeBase(unit, action);
  if (base === null) {
    return null;
  }
  const residual = residualBeforeThought(unit);
  const tDeny = denyTime(opponentMaster, unit);
  if (tDeny >= residual && tDeny < base) {
    return tDeny + effectiveStepThought(unit, action);
  }
  return base;
}

function currentResourceFor(unit: Unit, costKind: 'cost_hp' | 'cost_vp' | 'cost_pp' | 'cost_ap'): number {
  if (costKind === 'cost_hp') return unit.hp;
  if (costKind === 'cost_vp') return unit.vp;
  if (costKind === 'cost_pp') return unit.pp;
  return unit.ap;
}

interface ShotsResult {
  readonly count: number; // 連射可能回数（無制限は TTK_MAX を上限とする）
  readonly limitingCost: 'cost_hp' | 'cost_vp' | 'cost_pp' | 'cost_ap' | 'uses' | null;
}

// [A-EVAL-TTK]「連射可能回数」。
function shotsAvailable(unit: Unit, action: ActionInstance): ShotsResult {
  let best: ShotsResult = { count: TTK_MAX, limitingCost: null };
  if (action.uses_left !== INFINITE_USES && action.uses_left < best.count) {
    best = { count: action.uses_left, limitingCost: 'uses' };
  }
  const costs: readonly ['cost_hp' | 'cost_vp' | 'cost_pp' | 'cost_ap', number][] = [
    ['cost_hp', effectiveCostHp(unit, action)],
    ['cost_vp', effectiveCostVp(unit, action)],
    ['cost_pp', effectiveCostPp(unit, action)],
    ['cost_ap', effectiveCostAp(unit, action)],
  ];
  for (const [kind, cost] of costs) {
    if (cost <= 0) {
      continue;
    }
    const count = floorDiv(currentResourceFor(unit, kind), cost);
    if (count < best.count) {
      best = { count, limitingCost: kind };
    }
  }
  return best;
}

// [A-EVAL-TTK]「補充サイクル」：PP/VP不足はFLAG_MIND、AP不足はFLAG_STANCEの最短フルサイクル。
function refillCycleFor(unit: Unit, limitingCost: ShotsResult['limitingCost']): number {
  if (limitingCost !== 'cost_pp' && limitingCost !== 'cost_vp' && limitingCost !== 'cost_ap') {
    return TTK_MAX; // 使用回数枯渇・HP不足には補充手段がない
  }
  const wantedFlag = limitingCost === 'cost_ap' ? 'FLAG_STANCE' : 'FLAG_MIND';
  let best = TTK_MAX;
  for (const action of unit.acts) {
    if (!hasFlag(action.sys_flags, wantedFlag)) {
      continue;
    }
    const cycle = fullCycle(unit, action);
    if (cycle < best) {
      best = cycle;
    }
  }
  return best;
}

export interface TtkInputs {
  readonly trace: QuiesceTrace;
  readonly level: number;
}

// TTK(atk_side -> def_side) を、攻撃側マスター/クリーチャーの全アクションから最小値として求める。
// 有効HP(d) は対象マスターのHPのみ（[A-EVAL-TTK]）。
export function ttk(attacker: Unit, defenderMaster: Unit, inputs: TtkInputs): number {
  let best = TTK_MAX;
  for (const action of attacker.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const effAtk = effectiveAtk(attacker, action);
    const effHpDamage = levelHpDamage(effectiveDmgHpCenti(attacker, action), inputs.level);
    if (effHpDamage <= 0) {
      continue; // 実効HPダメージ0
    }
    const t = reachTime(attacker, action, defenderMaster);
    if (t === null) {
      continue; // 封印解除不能
    }
    const effStartup = effectiveStepStartup(attacker, action);
    const tLand = t + effStartup;
    const defSample = sampleAt(inputs.trace, tLand, defenderMaster.unit_id);
    const atkSample = sampleAt(inputs.trace, tLand, attacker.unit_id);
    if (defSample === undefined || atkSample === undefined) {
      continue; // 着弾予測時点で対象が既に消滅している等
    }
    if (effAtk < defSample.defense) {
      continue; // 命中不能
    }
    const effRange = effectiveRange(attacker, action);
    const distanceAtImpact = Math.abs(atkSample.pos - defSample.pos);
    if (distanceAtImpact > effRange) {
      continue; // 射程外化
    }

    const requiredHits = ceilDiv(defenderMaster.hp, effHpDamage);
    const shots = shotsAvailable(attacker, action);
    const refillCycle = refillCycleFor(attacker, shots.limitingCost);
    if (shots.count === 0 && refillCycle === TTK_MAX) {
      continue; // 連射不可・補充不能
    }
    const firstRefillTime = shots.count === 0 ? refillCycle : 0;
    const subsequentRefills = Math.max(requiredHits - Math.max(1, shots.count), 0);
    const cycle = fullCycle(attacker, action);
    // [A-EVAL-TTK] TTK(a→d) = 到達時間(act) + 初回補充時間 + 実効発生ステップ
    //   + (必要ヒット数−1)×フルサイクル + 後続補充回数×リソース補充サイクル
    const candidate = t + effStartup + firstRefillTime + (requiredHits - 1) * cycle + subsequentRefills * refillCycle;
    const clamped = Math.min(Math.max(candidate, 1), TTK_MAX);
    if (clamped < best) {
      best = clamped;
    }
  }
  return best;
}

// [A-EVAL-TTK]「同着の非対称性」。tp = TTK(player -> enemy)、te = TTK(enemy -> player)。
export function xSurvival(tp: number, te: number, scale: number): number {
  const raw = signedRoundDiv((tp - te) * scale, tp + te);
  return tp >= te ? raw + TIE_BONUS : raw;
}
