// [A-EVAL-TTK] 生存項（TTK：Time-To-Kill）。
// 「あと何ステップで殺せるか／殺されるか」を、攻撃側が当該アクションで決着させるまでの攻撃計画を
// 逐次に構成して求める。攻撃計画は、現局面の残り区間の後に「浄化サイクル → 補充サイクル → 射撃サイクル」を
// 必要な順に並べたものであり、各サイクルは 思考 → 発生 → 硬直 の3区間からなる。
// 妨害補正は、防御側の最速スタン武技の着弾（t_deny）が計画中のどの区間に入るかで、[M-PIPE-P2-APPLY]#4 の
// 中断規則をそのまま適用する（思考中：経過思考のリセット、発生中：中断して効果を失う、硬直中：無効）。

import { decayCenti, levelHpDamage } from '../engine/calc.js';
import {
  effectiveAtk,
  effectiveChargePpCenti,
  effectiveCostAp,
  effectiveCostHp,
  effectiveCostPp,
  effectiveCostVp,
  effectiveDeployAp,
  effectiveDmgHpCenti,
  effectiveGainVp,
  effectiveRange,
  effectiveStepRecovery,
  effectiveStepStartup,
  effectiveStepThought,
} from '../engine/effective.js';
import { hasFlag } from '../engine/flags.js';
import { INFINITE_USES } from '../engine/params.js';
import type { ActionInstance, Unit } from '../engine/types.js';
import { floorDiv, roundDiv } from '../num/helpers.js';
import { PURIFY_ITER_MAX, TIE_BONUS, TTK_MAX } from './constants.js';
import { signedRoundDiv } from './fixed.js';
import { sampleAt, type QuiesceTrace } from './quiesce.js';

const SEAL_LIMIT_CENTI = 100;
// 攻撃計画のサイクル数の上限。これを超える計画は TTK_MAX（決着不能）として扱う。
const PLAN_CYCLE_LIMIT = 64;

function ceilDiv(a: number, b: number): number {
  if (a <= 0) {
    return 0;
  }
  return floorDiv(a + b - 1, b);
}

function fullCycle(unit: Unit, action: ActionInstance): number {
  return effectiveStepThought(unit, action) + effectiveStepStartup(unit, action) + effectiveStepRecovery(unit, action);
}

// 保持するアクションのうち flag を持ち、フルサイクルが最短のもの（同値は所持アクション配列インデックス昇順）。
function shortestCycleAction(unit: Unit, flag: 'FLAG_MIND' | 'FLAG_STANCE' | 'FLAG_PURIFY'): ActionInstance | null {
  let best: ActionInstance | null = null;
  for (const action of unit.acts) {
    if (hasFlag(action.sys_flags, flag) && (best === null || fullCycle(unit, action) < fullCycle(unit, best))) {
      best = action;
    }
  }
  return best;
}

// [A-EVAL-TTK]「封印解除回数」。
function sealBreakCount(sealAccumCenti: number, purifyRateCenti: number): number {
  let value = sealAccumCenti;
  let count = 0;
  while (value >= SEAL_LIMIT_CENTI && count <= PURIFY_ITER_MAX + 1) {
    value = decayCenti(value, purifyRateCenti);
    count += 1;
  }
  return count;
}

// 現局面から攻撃側が思考中へ帰着するまでの残り区間。発生中は残り発生に実行中アクションの硬直を加え、
// 硬直中は確定済みの実行中適用硬直までの残りとする。いずれの区間でもスタンは攻撃計画を遅らせない
// （発生中の中断は硬直を中断補正硬直値へ差し替えるが、思考中への帰着時刻は変わらない：[M-PIPE-P2-APPLY]#4）。
function residualBeforeThought(unit: Unit): number {
  if (unit.state === 'STARTUP') {
    const active = unit.acts.find((a) => a.instance_id === unit.last_act?.instance_id);
    if (active === undefined) {
      return 0;
    }
    return Math.max(effectiveStepStartup(unit, active) - unit.elapsed_startup, 0) + effectiveStepRecovery(unit, active);
  }
  if (unit.state === 'RECOVERY') {
    return Math.max(unit.applied_recovery - unit.elapsed_recovery, 0);
  }
  return 0;
}

interface PlanResources {
  hp: number;
  vp: number;
  pp: number;
  ap: number;
  uses: number; // 無限は INFINITE_USES
}

type CycleKind = 'PURIFY' | 'REFILL_MIND' | 'REFILL_STANCE' | 'SHOT';

export interface AttackPlan {
  readonly firstLanding: number; // 初弾着弾ステップ（着弾予測時点の判定に用いる）
  readonly finalLanding: number; // 必要ヒット数目の着弾ステップ
}

// [A-EVAL-TTK]「攻撃計画」。tDeny は防御側の最速スタン着弾（TTK_MAX は妨害なし）。null は決着不能。
export function buildAttackPlan(attacker: Unit, action: ActionInstance, requiredHits: number, tDeny: number): AttackPlan | null {
  const costHp = effectiveCostHp(attacker, action);
  const costVp = effectiveCostVp(attacker, action);
  const costPp = effectiveCostPp(attacker, action);
  const costAp = effectiveCostAp(attacker, action);
  const res: PlanResources = { hp: attacker.hp, vp: attacker.vp, pp: attacker.pp, ap: attacker.ap, uses: action.uses_left };
  if (res.uses !== INFINITE_USES && res.uses < requiredHits) {
    return null; // 使用回数は補充できない
  }
  if (costHp > 0 && res.hp - costHp * requiredHits <= 0) {
    return null; // HPコストは補充できない（[M-PIPE-SUICIDE]）
  }

  const purify = shortestCycleAction(attacker, 'FLAG_PURIFY');
  let purifyLeft = 0;
  if (action.seal_accum >= SEAL_LIMIT_CENTI) {
    if (purify === null) {
      return null;
    }
    purifyLeft = sealBreakCount(action.seal_accum, purify.base_params.purify_rate);
    if (purifyLeft > PURIFY_ITER_MAX) {
      return null;
    }
  }
  const mind = shortestCycleAction(attacker, 'FLAG_MIND');
  const stance = shortestCycleAction(attacker, 'FLAG_STANCE');

  let t = residualBeforeThought(attacker);
  let carriedThought = attacker.state === 'THOUGHT' ? attacker.elapsed_thought : 0;
  let denyPending = tDeny < TTK_MAX;
  let landed = 0;
  let firstLanding = -1;

  for (let cycle = 0; cycle < PLAN_CYCLE_LIMIT; cycle += 1) {
    // 1. 次のサイクルを選ぶ：浄化 → 補充（VP・PP → AP）→ 射撃。
    let kind: CycleKind;
    let cycleAction: ActionInstance;
    if (purifyLeft > 0 && purify !== null) {
      kind = 'PURIFY';
      cycleAction = purify;
    } else if (res.vp < costVp || res.pp < costPp) {
      if (mind === null) {
        return null;
      }
      kind = 'REFILL_MIND';
      cycleAction = mind;
    } else if (res.ap < costAp) {
      if (stance === null || effectiveDeployAp(attacker, stance) < costAp) {
        return null;
      }
      kind = 'REFILL_STANCE';
      cycleAction = stance;
    } else {
      kind = 'SHOT';
      cycleAction = action;
    }

    // 2. サイクルの区間：思考 [t, startupStart)・発生 [startupStart, fire)・硬直 [fire, end)。
    const thought = Math.max(effectiveStepThought(attacker, cycleAction) - carriedThought, 0);
    const startupStart = t + thought;
    const fire = startupStart + effectiveStepStartup(attacker, cycleAction);
    const end = fire + effectiveStepRecovery(attacker, cycleAction);

    // 3. 妨害補正：t_deny が当サイクルの区間に入れば中断規則を適用する（1回のみ）。
    if (denyPending && tDeny >= t && tDeny < fire) {
      denyPending = false;
      if (tDeny < startupStart) {
        // 思考中：経過思考が0へリセットされ、同じサイクルを t_deny から選び直す。
        t = tDeny;
        carriedThought = 0;
        continue;
      }
      // 発生中（発動ステップを除く）：中断して効果を失う。消費は返還されず、硬直明けは通常の終了時刻と一致する。
      if (kind === 'SHOT') {
        payShot(res, costHp, costVp, costPp, costAp);
      }
      t = end;
      carriedThought = 0;
      continue;
    }

    // 4. サイクルの効果。
    carriedThought = 0;
    if (kind === 'PURIFY') {
      purifyLeft -= 1;
    } else if (kind === 'REFILL_MIND') {
      const beforeVp = res.vp;
      const beforePp = res.pp;
      res.vp += effectiveGainVp(attacker, cycleAction);
      res.pp = Math.max(res.pp, roundDiv(res.vp * effectiveChargePpCenti(attacker, cycleAction), 100)); // [M-RESOLVE-MIND]#2〜#4
      if (res.vp === beforeVp && res.pp === beforePp) {
        return null; // 補充が進まない
      }
    } else if (kind === 'REFILL_STANCE') {
      res.ap = effectiveDeployAp(attacker, cycleAction); // [M-RESOLVE-STANCE] 強制上書き
    } else {
      payShot(res, costHp, costVp, costPp, costAp);
      landed += 1;
      if (landed === 1) {
        firstLanding = fire;
      }
      if (landed === requiredHits) {
        return { firstLanding, finalLanding: fire };
      }
    }
    t = end;
  }
  return null;
}

function payShot(res: PlanResources, costHp: number, costVp: number, costPp: number, costAp: number): void {
  res.hp -= costHp;
  res.vp = Math.max(res.vp - costVp, 0);
  res.pp = Math.max(res.pp - costPp, 0);
  res.ap = Math.max(res.ap - costAp, 0);
  if (res.uses !== INFINITE_USES) {
    res.uses -= 1;
  }
}

export interface TtkInputs {
  readonly trace: QuiesceTrace;
  readonly level: number;
}

// 着弾予測時点（[A-EVAL-TTK]［トレース参照時点］）に target へ命中し、射程内にあるか。
function hitsAt(inputs: TtkInputs, shooter: Unit, action: ActionInstance, target: Unit, landing: number): boolean {
  const targetSample = sampleAt(inputs.trace, landing, target.unit_id);
  const shooterSample = sampleAt(inputs.trace, landing, shooter.unit_id);
  if (targetSample === undefined || shooterSample === undefined) {
    return false;
  }
  if (effectiveAtk(shooter, action) < targetSample.defense) {
    return false;
  }
  return Math.abs(shooterSample.pos - targetSample.pos) <= effectiveRange(shooter, action);
}

// [A-EVAL-TTK]「妨害モデル t_deny」：防御側が保有するスタン付き武技のうち、攻撃側へ命中するものの最速の初弾着弾。
// 防御側の攻撃計画（妨害補正なし、必要ヒット数1）で求める。存在しなければ TTK_MAX。
export function denyTime(defender: Unit, attacker: Unit, inputs: TtkInputs): number {
  let best = TTK_MAX;
  for (const action of defender.acts) {
    if (!action.base_params.stun || !hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const plan = buildAttackPlan(defender, action, 1, TTK_MAX);
    if (plan === null || plan.firstLanding >= best) {
      continue;
    }
    if (hitsAt(inputs, defender, action, attacker, plan.firstLanding)) {
      best = plan.firstLanding;
    }
  }
  return best;
}

// TTK(atk_side -> def_side) を、攻撃側マスターの全武技の攻撃計画の最小値として求める。
// 有効HP(d) は対象マスターのHPのみ（[A-EVAL-TTK]）。
export function ttk(attacker: Unit, defenderMaster: Unit, inputs: TtkInputs): number {
  const tDeny = denyTime(defenderMaster, attacker, inputs);
  let best = TTK_MAX;
  for (const action of attacker.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const damage = levelHpDamage(effectiveDmgHpCenti(attacker, action), inputs.level);
    if (damage <= 0) {
      continue; // 実効HPダメージ0
    }
    const requiredHits = ceilDiv(defenderMaster.hp, damage);
    // ［除外条件］命中・射程は妨害補正を含まない計画の初弾着弾時点で判定する。
    const undisturbed = buildAttackPlan(attacker, action, requiredHits, TTK_MAX);
    if (undisturbed === null || !hitsAt(inputs, attacker, action, defenderMaster, undisturbed.firstLanding)) {
      continue;
    }
    const plan = buildAttackPlan(attacker, action, requiredHits, tDeny);
    if (plan === null) {
      continue;
    }
    best = Math.min(best, Math.min(Math.max(plan.finalLanding, 1), TTK_MAX));
  }
  return best;
}

// [A-EVAL-TTK]「同着の非対称性」。tp = TTK(player -> enemy)、te = TTK(enemy -> player)。
export function xSurvival(tp: number, te: number, scale: number): number {
  const raw = signedRoundDiv((tp - te) * scale, tp + te);
  return tp >= te ? raw + TIE_BONUS : raw;
}
