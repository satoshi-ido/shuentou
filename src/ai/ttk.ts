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
import { defenseFromApAndEfficiency } from '../engine/calc.js';
import { INFINITE_USES } from '../engine/params.js';
import type { ActionInstance, Unit } from '../engine/types.js';
import { roundDiv } from '../num/helpers.js';
import { PURIFY_ITER_MAX, TIE_BONUS, TTK_MAX } from './constants.js';
import { signedRoundDiv } from './fixed.js';
import { sampleAt, type QuiesceTrace } from './quiesce.js';

const SEAL_LIMIT_CENTI = 100;
// 攻撃計画のサイクル数の上限。これを超える計画は TTK_MAX（決着不能）として扱う。
const PLAN_CYCLE_LIMIT = 64;

// アクションの実効値は、計画の構成中は変化しない（計画は局所の資源だけを更新する）。
// 局面ごとに一度だけ確定して表に持ち、サイクルごとの再計算をやめる。
interface ActionMetrics {
  readonly thought: number;
  readonly startup: number;
  readonly recovery: number;
  readonly cycle: number;
  readonly costHp: number;
  readonly costVp: number;
  readonly costPp: number;
  readonly costAp: number;
  readonly deployAp: number;
  readonly gainVp: number;
  readonly chargePp: number;
  readonly damage: number;
  readonly martial: boolean;
}

export interface PlanContext {
  readonly unit: Unit;
  readonly level: number;
  // 実効値は参照されたアクションに限り、初回の参照時に確定する（武技と補充アクション以外は参照されない）。
  readonly metrics: Record<string, ActionMetrics>;
  readonly purify: ActionInstance | null;
  readonly mind: ActionInstance | null;
  readonly stance: ActionInstance | null;
}

function metricsOf(unit: Unit, action: ActionInstance, level: number): ActionMetrics {
  const thought = effectiveStepThought(unit, action);
  const startup = effectiveStepStartup(unit, action);
  const recovery = effectiveStepRecovery(unit, action);
  return {
    thought,
    startup,
    recovery,
    cycle: thought + startup + recovery,
    costHp: effectiveCostHp(unit, action),
    costVp: effectiveCostVp(unit, action),
    costPp: effectiveCostPp(unit, action),
    costAp: effectiveCostAp(unit, action),
    deployAp: effectiveDeployAp(unit, action),
    gainVp: effectiveGainVp(unit, action),
    chargePp: effectiveChargePpCenti(unit, action),
    damage: levelHpDamage(effectiveDmgHpCenti(unit, action), level),
    martial: hasFlag(action.sys_flags, 'FLAG_MARTIAL'),
  };
}

// 系統ごとの補充アクション（フルサイクル最短、同値は所持アクション配列インデックス昇順）も併せて確定する。
export function planContext(unit: Unit, level: number): PlanContext {
  const metrics: Record<string, ActionMetrics> = {};
  const metricAt = (action: ActionInstance): ActionMetrics =>
    (metrics[action.instance_id] ??= metricsOf(unit, action, level));
  let purify: ActionInstance | null = null;
  let mind: ActionInstance | null = null;
  let stance: ActionInstance | null = null;
  for (const action of unit.acts) {
    if (hasFlag(action.sys_flags, 'FLAG_PURIFY') && (purify === null || metricAt(action).cycle < metricAt(purify).cycle)) {
      purify = action;
    }
    if (hasFlag(action.sys_flags, 'FLAG_MIND') && (mind === null || metricAt(action).cycle < metricAt(mind).cycle)) {
      mind = action;
    }
    if (hasFlag(action.sys_flags, 'FLAG_STANCE') && (stance === null || metricAt(action).cycle < metricAt(stance).cycle)) {
      stance = action;
    }
  }
  return { unit, level, metrics, purify, mind, stance };
}

function metric(ctx: PlanContext, action: ActionInstance): ActionMetrics {
  return (ctx.metrics[action.instance_id] ??= metricsOf(ctx.unit, action, ctx.level));
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
// ctx は攻撃側の planContext。補充アクションの選定（フルサイクル最短、同値は配列インデックス昇順）と
// 実効値は planContext が確定したものを用いる。本関数は打点を用いないため、省略時のレベルは問わない。
export function buildAttackPlan(
  attacker: Unit,
  action: ActionInstance,
  requiredHits: number,
  tDeny: number,
  ctx: PlanContext = planContext(attacker, 0),
): AttackPlan | null {
  const shotMetrics = metric(ctx, action);
  const costHp = shotMetrics.costHp;
  const costVp = shotMetrics.costVp;
  const costPp = shotMetrics.costPp;
  const costAp = shotMetrics.costAp;
  const res: PlanResources = { hp: attacker.hp, vp: attacker.vp, pp: attacker.pp, ap: attacker.ap, uses: action.uses_left };
  if (res.uses !== INFINITE_USES && res.uses < requiredHits) {
    return null; // 使用回数は補充できない
  }
  if (costHp > 0 && res.hp - costHp * requiredHits <= 0) {
    return null; // HPコストは補充できない（[M-PIPE-SUICIDE]）
  }

  const purify = ctx.purify;
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
  const mind = ctx.mind;
  const stance = ctx.stance;

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
      if (stance === null || metric(ctx, stance).deployAp < costAp) {
        return null;
      }
      kind = 'REFILL_STANCE';
      cycleAction = stance;
    } else {
      kind = 'SHOT';
      cycleAction = action;
    }

    // 2. サイクルの区間：思考 [t, startupStart)・発生 [startupStart, fire)・硬直 [fire, end)。
    const cycleMetrics = metric(ctx, cycleAction);
    const thought = Math.max(cycleMetrics.thought - carriedThought, 0);
    const startupStart = t + thought;
    const fire = startupStart + cycleMetrics.startup;
    const end = fire + cycleMetrics.recovery;

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
      res.vp += cycleMetrics.gainVp;
      res.pp = Math.max(res.pp, roundDiv(res.vp * cycleMetrics.chargePp, 100)); // [M-RESOLVE-MIND]#2〜#4
      if (res.vp === beforeVp && res.pp === beforePp) {
        return null; // 補充が進まない
      }
    } else if (kind === 'REFILL_STANCE') {
      res.ap = cycleMetrics.deployAp; // [M-RESOLVE-STANCE] 強制上書き
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

// [A-EVAL-TTK]［射撃アクション］射撃を1アクションに固定せず、累積HPダメージが有効HPに達するまで
// 射撃列を構成する。act の残り使用回数が尽きた後は代替武技へ引き継ぐ。資源・時間・妨害補正は引き継ぐ。
interface PlanState {
  hp: number;
  vp: number;
  pp: number;
  ap: number;
  uses: Record<string, number>;
}

function usesOf(res: PlanState, action: ActionInstance): number {
  const value = res.uses[action.instance_id];
  return value === undefined ? action.uses_left : value;
}

function spendUse(res: PlanState, action: ActionInstance): void {
  const value = usesOf(res, action);
  if (value !== INFINITE_USES) {
    res.uses[action.instance_id] = value - 1;
  }
}

// [A-EVAL-TTK]［射撃アクション］残り有効HPを削るのに要する時間が最小のものを整数比較で選ぶ
// （同値は所持アクション配列インデックス昇順）。
interface Candidate {
  readonly action: ActionInstance;
  readonly damage: number;
  readonly cycle: number;
}

// 代替武技の候補。打点とフルサイクルは局面ごとに一度だけ確定する（計画の構成では変わらない）。
function substituteCandidates(ctx: PlanContext): Candidate[] {
  const candidates: Candidate[] = [];
  for (const action of ctx.unit.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL') || action.seal_accum >= SEAL_LIMIT_CENTI) {
      continue;
    }
    const m = metric(ctx, action);
    if (m.damage <= 0) {
      continue;
    }
    candidates.push({ action, damage: m.damage, cycle: Math.max(m.cycle, 1) });
  }
  return candidates;
}

function pickSubstitute(
  candidates: readonly Candidate[],
  res: PlanState,
  excluded: readonly string[],
  remaining: number,
): ActionInstance | null {
  let best: Candidate | null = null;
  let bestUseful = 0;
  for (const candidate of candidates) {
    if (excluded.includes(candidate.action.instance_id) || usesOf(res, candidate.action) === 0) {
      continue;
    }
    const useful = Math.min(candidate.damage, remaining);
    if (best === null || useful * best.cycle > bestUseful * candidate.cycle) {
      best = candidate;
      bestUseful = useful;
    }
  }
  return best === null ? null : best.action;
}

function buildPlan(
  ctx: PlanContext,
  act: ActionInstance,
  defender: Unit,
  inputs: TtkInputs,
  tDeny: number,
): AttackPlan | null {
  const attacker = ctx.unit;
  const res: PlanState = { hp: attacker.hp, vp: attacker.vp, pp: attacker.pp, ap: attacker.ap, uses: {} };
  const purify = ctx.purify;
  let purifyLeft = 0;
  if (act.seal_accum >= SEAL_LIMIT_CENTI) {
    if (purify === null) {
      return null;
    }
    purifyLeft = sealBreakCount(act.seal_accum, purify.base_params.purify_rate);
    if (purifyLeft > PURIFY_ITER_MAX) {
      return null;
    }
  }
  const mind = ctx.mind;
  const stance = ctx.stance;

  // 代替武技の候補は、実際に必要になった時点で一度だけ組み立てる。
  let candidateCache: Candidate[] | null = null;
  const candidatesOf = (): Candidate[] => {
    if (candidateCache === null) {
      candidateCache = substituteCandidates(ctx);
    }
    return candidateCache;
  };

  let remaining = defender.hp;
  let t = residualBeforeThought(attacker);
  let carriedThought = attacker.state === 'THOUGHT' ? attacker.elapsed_thought : 0;
  let denyPending = tDeny < TTK_MAX;
  let firstLanding = -1;
  const excluded: string[] = [];
  const checked: string[] = [];

  for (let cycle = 0; cycle < PLAN_CYCLE_LIMIT; cycle += 1) {
    // ［射撃アクション］act の計画上の残り使用回数がある限り act、尽きたら代替武技。
    const shot =
      usesOf(res, act) !== 0 && !excluded.includes(act.instance_id)
        ? act
        : pickSubstitute(candidatesOf(), res, excluded, remaining);
    if (shot === null) {
      return null;
    }
    const shotMetrics = metric(ctx, shot);
    const costHp = shotMetrics.costHp;
    const costVp = shotMetrics.costVp;
    const costPp = shotMetrics.costPp;
    const costAp = shotMetrics.costAp;
    if (costHp > 0 && res.hp - costHp <= 0) {
      excluded.push(shot.instance_id); // HPコストは補充できない（[M-PIPE-SUICIDE]）
      continue;
    }

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
      if (stance === null || metric(ctx, stance).deployAp < costAp) {
        return null;
      }
      kind = 'REFILL_STANCE';
      cycleAction = stance;
    } else {
      kind = 'SHOT';
      cycleAction = shot;
    }

    const cycleMetrics = kind === 'SHOT' ? shotMetrics : metric(ctx, cycleAction);
    const thought = Math.max(cycleMetrics.thought - carriedThought, 0);
    const startupStart = t + thought;
    const fire = startupStart + cycleMetrics.startup;
    const end = fire + cycleMetrics.recovery;

    // ［除外条件］各アクションにつき初弾の着弾予測時点で1度だけ命中・射程を判定する。
    if (kind === 'SHOT' && !checked.includes(shot.instance_id)) {
      checked.push(shot.instance_id);
      if (!hitsAt(inputs, attacker, shot, defender, fire, shot.instance_id !== act.instance_id)) {
        excluded.push(shot.instance_id);
        continue;
      }
    }

    if (denyPending && tDeny >= t && tDeny < fire) {
      denyPending = false;
      if (tDeny < startupStart) {
        t = tDeny;
        carriedThought = 0;
        continue;
      }
      if (kind === 'SHOT') {
        res.hp -= costHp;
        res.vp = Math.max(res.vp - costVp, 0);
        res.pp = Math.max(res.pp - costPp, 0);
        res.ap = Math.max(res.ap - costAp, 0);
        spendUse(res, shot);
      }
      t = end;
      carriedThought = 0;
      continue;
    }

    carriedThought = 0;
    if (kind === 'PURIFY') {
      purifyLeft -= 1;
    } else if (kind === 'REFILL_MIND') {
      const beforeVp = res.vp;
      const beforePp = res.pp;
      res.vp += cycleMetrics.gainVp;
      res.pp = Math.max(res.pp, roundDiv(res.vp * cycleMetrics.chargePp, 100));
      if (res.vp === beforeVp && res.pp === beforePp) {
        return null;
      }
    } else if (kind === 'REFILL_STANCE') {
      res.ap = cycleMetrics.deployAp;
    } else {
      res.hp -= costHp;
      res.vp = Math.max(res.vp - costVp, 0);
      res.pp = Math.max(res.pp - costPp, 0);
      res.ap = Math.max(res.ap - costAp, 0);
      spendUse(res, shot);
      remaining -= shotMetrics.damage;
      if (firstLanding < 0) {
        firstLanding = fire;
      }
      if (remaining <= 0) {
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
  // [A-SEARCH-QUIESCE]［評価対象］延長したステップ数 q。攻撃計画は静止局面を 0 とし、トレースは
  // 葉ノードを添字0として記録するため、計画上のステップ t は添字 q + t で参照する。
  readonly offset: number;
  // 1回の葉の評価の中で共有する表（newTtkCache）。評価の間ユニットは変更されないため、同じユニットの
  // 計画文脈・想定体勢を一度だけ求める。省略時は毎回求める。
  readonly cache?: TtkCache;
}

type Guard = { readonly at: number; readonly defense: number } | null;

export interface TtkCache {
  readonly contexts: WeakMap<Unit, PlanContext>;
  readonly guards: WeakMap<Unit, Guard>;
}

export function newTtkCache(): TtkCache {
  return { contexts: new WeakMap(), guards: new WeakMap() };
}

// 葉の評価では同じユニットが攻撃側（ttk）と防御側（denyTime）の双方で参照される。
function contextOf(inputs: TtkInputs, unit: Unit): PlanContext {
  const cached = inputs.cache?.contexts.get(unit);
  if (cached !== undefined) {
    return cached;
  }
  const ctx = planContext(unit, inputs.level);
  inputs.cache?.contexts.set(unit, ctx);
  return ctx;
}

// [A-EVAL-TTK]［代替武技に対する防御側の体勢］防御側が最大展開APの体勢を1度だけ張るものとし、
// その完了以降の着弾予測時点では、トレース由来の防御力と想定体勢による防御力の大きい方を用いる。
// 想定体勢は実効展開APが最大のもの（同値は所持アクション配列インデックス昇順）で、実効消費コストを
// 防御側の現在値で満たせるものに限る。減衰（[M-CALC-DECAY]）は織り込まない。
function projectedGuard(inputs: TtkInputs, target: Unit): Guard {
  const cached = inputs.cache?.guards.get(target);
  if (cached !== undefined) {
    return cached;
  }
  const guard = computeProjectedGuard(target);
  inputs.cache?.guards.set(target, guard);
  return guard;
}

function computeProjectedGuard(target: Unit): Guard {
  let best: ActionInstance | null = null;
  let bestAp = 0;
  for (const candidate of target.acts) {
    if (!hasFlag(candidate.sys_flags, 'FLAG_STANCE')) {
      continue;
    }
    if (
      effectiveCostVp(target, candidate) > target.vp ||
      effectiveCostPp(target, candidate) > target.pp ||
      effectiveCostAp(target, candidate) > target.ap ||
      effectiveCostHp(target, candidate) >= target.hp
    ) {
      continue;
    }
    const ap = effectiveDeployAp(target, candidate);
    if (ap > bestAp) {
      best = candidate;
      bestAp = ap;
    }
  }
  if (best === null) {
    return null;
  }
  const at =
    residualBeforeThought(target) +
    Math.max(effectiveStepThought(target, best) - (target.state === 'THOUGHT' ? target.elapsed_thought : 0), 0) +
    effectiveStepStartup(target, best);
  return { at, defense: defenseFromApAndEfficiency(bestAp, 100) };
}

// 着弾予測時点（[A-EVAL-TTK]［トレース参照時点］）に target へ命中し、射程内にあるか。
function hitsAt(
  inputs: TtkInputs,
  shooter: Unit,
  action: ActionInstance,
  target: Unit,
  landing: number,
  substitute = false,
): boolean {
  const targetSample = sampleAt(inputs.trace, inputs.offset + landing, target.unit_id);
  const shooterSample = sampleAt(inputs.trace, inputs.offset + landing, shooter.unit_id);
  if (targetSample === undefined || shooterSample === undefined) {
    return false;
  }
  let defense = targetSample.defense;
  // ［代替武技に対する防御側の体勢］代替武技による射撃に限り、防御側の想定体勢を織り込む。
  if (substitute) {
    const guard = projectedGuard(inputs, target);
    if (guard !== null && landing >= guard.at) {
      defense = Math.max(defense, guard.defense);
    }
  }
  if (effectiveAtk(shooter, action) < defense) {
    return false;
  }
  return Math.abs(shooterSample.pos - targetSample.pos) <= effectiveRange(shooter, action);
}

// [A-EVAL-TTK]［妨害補正］：防御側が保有するスタン付き武技のうち、発生中のもの、または今すぐ実行できるものについて、
// 着弾ステップにおいて攻撃側へ命中するものの最速の着弾。補充・浄化・思考の待機を要するものは数えない。
// 存在しなければ TTK_MAX。
export function denyTime(defender: Unit, attacker: Unit, inputs: TtkInputs): number {
  let best = TTK_MAX;
  for (const action of defender.acts) {
    if (!action.base_params.stun || !hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const landing = inFlightLanding(defender, action) ?? readyLanding(defender, action);
    if (landing === null || landing >= best) {
      continue;
    }
    if (hitsAt(inputs, defender, action, attacker, landing)) {
      best = landing;
    }
  }
  return best;
}

// ［妨害補正］発生中のスタン付き武技の着弾までの残りステップ（残り発生）。
function inFlightLanding(unit: Unit, action: ActionInstance): number | null {
  if (unit.state !== 'STARTUP' || unit.last_act?.instance_id !== action.instance_id) {
    return null;
  }
  return Math.max(effectiveStepStartup(unit, action) - unit.elapsed_startup, 0);
}

// ［妨害補正］今すぐ実行できるスタン付き武技の着弾ステップ（必要発生実効値）。実行できる条件は
// [A-SEARCH-MOVEGEN] の対象ユニット・対象アクションに従う（防御側はマスターであり、HPコストの自滅は選べない）。
function readyLanding(unit: Unit, action: ActionInstance): number | null {
  const ready =
    unit.state === 'THOUGHT' &&
    action.uses_left !== 0 &&
    action.seal_accum < SEAL_LIMIT_CENTI &&
    unit.elapsed_thought >= effectiveStepThought(unit, action) &&
    unit.vp >= effectiveCostVp(unit, action) &&
    unit.pp >= effectiveCostPp(unit, action) &&
    unit.ap >= effectiveCostAp(unit, action) &&
    unit.hp > effectiveCostHp(unit, action);
  return ready ? effectiveStepStartup(unit, action) : null;
}

// TTK(atk_side -> def_side) を、攻撃側マスターの全武技の攻撃計画の最小値として求める。
// 有効HP(d) は対象マスターのHPのみ（[A-EVAL-TTK]）。返り値は葉ノード基準であり、静止局面を基準とする
// 最終着弾ステップに q を加えてからクランプする（[A-EVAL-TTK]「同着の非対称性」）。
export function ttk(attacker: Unit, defenderMaster: Unit, inputs: TtkInputs): number {
  const tDeny = denyTime(defenderMaster, attacker, inputs);
  const ctx = contextOf(inputs, attacker);
  let best = TTK_MAX;
  for (const action of attacker.acts) {
    if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      continue;
    }
    const m = metric(ctx, action);
    if (m.damage <= 0) {
      continue; // 実効HPダメージ0
    }
    // ［除外条件］命中・射程は妨害補正を含まない計画の初弾着弾時点で判定する。
    // ［射撃アクション］単独計画で削り切れない場合も、代替武技へ引き継ぐ計画として構成する。
    // 命中・射程は各アクションの初弾着弾時点で判定する（buildPlan 内）。
    const plan = buildPlan(ctx, action, defenderMaster, inputs, tDeny);
    if (plan === null) {
      continue;
    }
    best = Math.min(best, Math.min(Math.max(inputs.offset + plan.finalLanding, 1), TTK_MAX));
  }
  return best;
}

// [A-EVAL-TTK]「同着の非対称性」。tp = TTK(player -> enemy)、te = TTK(enemy -> player)。
export function xSurvival(tp: number, te: number, scale: number): number {
  const raw = signedRoundDiv((tp - te) * scale, tp + te);
  return tp >= te ? raw + TIE_BONUS : raw;
}
