// [V-TEST-BUILD-PROFILES] ビルドプロファイル BP-01〜BP-07 と、その通しプレイ（[V-TEST-NONFUNC] D-10〜D-12）。
//
// 各プロファイルは編成列・供犠スケジュール・継承配分規則・戦闘方針の4項で定義される。探索と重みは
// 方針によらず同一であり（[V-TEST-REFAI]）、方針の違いは継承と補充の選び方に限られる。このため
// 戦闘方針は [V-TEST-REFAI] の維持規則（攻撃型・防御型は体力・リソース生成手段・射程の維持、
// バランス型は［役割充足による選択］）を含み、維持規則が選んだ枠を除く枠に継承配分規則を用いる。
// 継承配分規則が選べない場合は戦闘方針の継承規則で選ぶ。閾値による供犠の独立発動は適用しない。
//
// 読み替え（[V-TEST-BUILD-PROFILES] の文言の解釈）：
// ・編成列：アクト移行の補充では、アクト5の最終編成に名指しされた従者を優先し、残りを従者ID昇順で満たす。
// ・供犠：対象は名指しの従者、無ければ最終編成外の従者01以外を従者ID降順。時機は当該アクト内で
//   ［供犠の実行］の条件（閾値またはボス前）が成立した最初のインターミッションとし、成立しないまま
//   ボス前に至った場合はそこで強制する。複数回はボス側から逆算して配置する。「なし」は一切行わない。
// ・継承配分規則：プール中の最大値を選び、同値はプールの走査順とする。同一インターミッションで全枠が
//   同じ項目を選べば [M-INHERIT-MERGE] により1スロットへ統合される。

import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import type { ActionParams, AttendantMasterRecord } from '../../src/data/types.js';
import { deriveSysFlags } from '../../src/engine/flags.js';
import {
  confirmInherit,
  confirmRefill,
  confirmSacrifice,
  enterTransition,
  settleIntermission,
} from '../../src/engine/game/intermission.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import { inheritPool, type InheritTarget } from '../../src/engine/progress/inherit.js';
import { isActTransition, refillCapacity, refillPool } from '../../src/engine/progress/refill.js';
import { sceneByOrder } from '../../src/engine/run/masters.js';
import type { BattleState } from '../../src/engine/types.js';
import { referenceProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import {
  chooseByRole,
  chooseInherit,
  chooseMindRefill,
  missingBreaker,
  mindShort,
  createRun,
  HARD_STEP_CAP,
  MASTERS,
  mindUsesLeft,
  needsBossSacrifice,
  needsSacrifice,
  playScene,
  ROLE_HP_STALE_INTERMISSIONS,
  type RefPolicy,
  type SceneOutcome,
} from './runner.js';

const RINA = 'ATTENDANT_01';

type ActionRecord = (typeof ACTION_MASTERS)[keyof typeof ACTION_MASTERS];
type ActionTarget = { readonly kind: 'ACTION'; readonly class_id: string };

interface SacrificePlan {
  readonly act: number;
  readonly count: number;
  readonly target?: string; // 名指しの対象（BP-07 の従者01）
}

// 継承配分の入力。start はインターミッション開始時点の手持ちの判定であり、同一インターミッションの
// 全枠で共通に用いる（全枠が同じ項目を選び統合されるため）。
export interface AllocContext {
  readonly attendantId: string;
  readonly pool: readonly InheritTarget[];
  readonly picked: readonly InheritTarget[];
  readonly start: { readonly holdsStance: boolean; readonly holdsSummon: boolean };
}

export interface BuildProfile {
  readonly id: string;
  readonly finalParty: readonly string[]; // アクト5の最終編成に名指しされた従者
  readonly sacrifices: readonly SacrificePlan[];
  readonly policy: RefPolicy;
  readonly allocate: (ctx: AllocContext) => InheritTarget | null;
}

function recordOf(classId: string): ActionRecord | undefined {
  return ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
}

function flagsOf(record: ActionRecord): readonly string[] {
  return deriveSysFlags(record.params as ActionParams);
}

function actions(pool: readonly InheritTarget[]): ActionTarget[] {
  return pool.filter((entry): entry is ActionTarget => entry.kind === 'ACTION');
}

// プール中で pred を満たす項目のうち key が最大のもの（同値は走査順で最初）。
function bestBy(
  pool: readonly InheritTarget[],
  pred: (record: ActionRecord) => boolean,
  key: (record: ActionRecord) => readonly number[],
): ActionTarget | null {
  let best: { entry: ActionTarget; key: readonly number[] } | null = null;
  for (const entry of actions(pool)) {
    const record = recordOf(entry.class_id);
    if (record === undefined || !pred(record)) {
      continue;
    }
    const k = key(record);
    if (best === null || compareKeys(k, best.key) > 0) {
      best = { entry, key: k };
    }
  }
  return best?.entry ?? null;
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

function isMartial(record: ActionRecord): boolean {
  return !record.is_root && record.params.atk > 0 && flagsOf(record).includes('FLAG_MARTIAL');
}

function isStance(record: ActionRecord): boolean {
  return flagsOf(record).includes('FLAG_STANCE');
}

function isMind(record: ActionRecord): boolean {
  return flagsOf(record).includes('FLAG_MIND');
}

function isSummon(record: ActionRecord): boolean {
  return flagsOf(record).includes('FLAG_SUMMON');
}

// [A-PROFILE-BONUS] RUSH（急襲系）：FLAG_MARTIAL かつ step_thought == 0 かつ def_efficiency > 0.00。
function isRush(record: ActionRecord): boolean {
  return isMartial(record) && record.params.step_thought === 0 && record.params.def_efficiency > 0;
}

function buffTotal(record: ActionRecord): number {
  return Object.values(record.params.give_buff as Record<string, number>).reduce((sum, value) => sum + value, 0);
}

function maxHp(pool: readonly InheritTarget[]): InheritTarget | null {
  return pool.find((entry) => entry.kind === 'MAX_HP') ?? null;
}

const byAtk = (record: ActionRecord): readonly number[] => [record.params.atk, record.params.dmg_hp];

// [M-DATA-COEFFKEYS] 係数キーと乗算先。向きが減少のキーは 1.00 未満、増加のキーは 1.00 超が改善である。
const DECREASING_KEYS: Readonly<Record<string, readonly (keyof ActionParams)[]>> = {
  thRate: ['step_thought'],
  stRate: ['step_startup'],
  rcRate: ['step_recovery'],
  costRate: ['cost_hp', 'cost_vp', 'cost_pp', 'cost_ap'],
  decayApRate: ['decay_ap'],
};
const INCREASING_KEYS: Readonly<Record<string, readonly (keyof ActionParams)[]>> = {
  deployRate: ['deploy_ap'],
  rangeRate: ['range'],
  atkRate: ['atk'],
  dmgRate: ['dmg_hp', 'dmg_vp', 'dmg_pp', 'dmg_ap'],
  gainVpRate: ['gain_vp'],
  chargePpRate: ['charge_pp'],
  purifyRate: ['purify_rate'],
  stripRate: ['strip_rate'],
};

function nonZero(value: unknown): boolean {
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return false;
}

// BP-04：従者の改善方向の係数が作用する項目の数。usesRate は全アクションの使用回数に作用する。
export function coefficientScore(attendant: AttendantMasterRecord, target: InheritTarget): number {
  const coeffs = attendant.coeffs as Readonly<Record<string, number>>;
  if (target.kind === 'MAX_HP') {
    return (coeffs.hpAddRate ?? 100) > 100 ? 1 : 0;
  }
  const record = recordOf(target.class_id);
  if (record === undefined) {
    return 0;
  }
  const params = record.params as unknown as Record<string, unknown>;
  let score = 0;
  for (const [key, targets] of Object.entries(DECREASING_KEYS)) {
    if ((coeffs[key] ?? 100) < 100 && targets.some((name) => nonZero(params[name]))) {
      score += 1;
    }
  }
  for (const [key, targets] of Object.entries(INCREASING_KEYS)) {
    if ((coeffs[key] ?? 100) > 100 && targets.some((name) => nonZero(params[name]))) {
      score += 1;
    }
  }
  if ((coeffs.giveBuffRate ?? 100) > 100 && nonZero(params.give_buff)) {
    score += 1;
  }
  if ((coeffs.giveDebuffRate ?? 100) > 100 && nonZero(params.give_debuff)) {
    score += 1;
  }
  if ((coeffs.usesRate ?? 100) > 100) {
    score += 1;
  }
  return score;
}

function attendantOf(attendantId: string): AttendantMasterRecord {
  return (ATTENDANT_MASTERS as Readonly<Record<string, AttendantMasterRecord>>)[attendantId];
}

function sameTarget(a: InheritTarget, b: InheritTarget): boolean {
  return a.kind === b.kind && (a.kind === 'MAX_HP' || (b.kind === 'ACTION' && a.class_id === b.class_id));
}

export const BUILD_PROFILES: readonly BuildProfile[] = [
  {
    // 全枠を単一スロットへ統合。対象は継承プール中の最大攻撃力の武技。
    id: 'BP-01',
    finalParty: ['ATTENDANT_01', 'ATTENDANT_03', 'ATTENDANT_05', 'ATTENDANT_10', 'ATTENDANT_11'],
    sacrifices: [],
    policy: 'ATTACK',
    allocate: ({ pool }) => bestBy(pool, isMartial, byAtk),
  },
  {
    // 体勢を保持していなければ全枠を最大展開APの体勢へ。保持していれば与バフ量合計が最大の心気へ。
    id: 'BP-02',
    finalParty: ['ATTENDANT_01', 'ATTENDANT_07', 'ATTENDANT_12', 'ATTENDANT_15'],
    sacrifices: [{ act: 4, count: 1 }],
    policy: 'DEFENSE',
    allocate: ({ pool, start }) => {
      const stance = bestBy(pool, isStance, (record) => [record.params.deploy_ap]);
      if (!start.holdsStance) {
        return stance;
      }
      return bestBy(pool, (record) => isMind(record) && buffTotal(record) > 0, (record) => [buffTotal(record)]) ?? stance;
    },
  },
  {
    // 従者02は常に最大HP加算。他は加算VPが最大の心気へ統合する。
    id: 'BP-03',
    finalParty: ['ATTENDANT_01', 'ATTENDANT_02', 'ATTENDANT_08', 'ATTENDANT_09'],
    sacrifices: [{ act: 3, count: 1 }],
    policy: 'BALANCE',
    allocate: ({ attendantId, pool }) =>
      attendantId === 'ATTENDANT_02' ? maxHp(pool) : bestBy(pool, isMind, (record) => [record.params.gain_vp]),
  },
  {
    // 各従者が自身の係数が寄与する項目を持つ別スロットへ分散する（同一インターミッションの重複を避ける）。
    id: 'BP-04',
    finalParty: ['ATTENDANT_01', 'ATTENDANT_11', 'ATTENDANT_12', 'ATTENDANT_13', 'ATTENDANT_14'],
    sacrifices: [{ act: 4, count: 3 }],
    policy: 'BALANCE',
    allocate: ({ attendantId, pool, picked }) => {
      const attendant = attendantOf(attendantId);
      let best: { target: InheritTarget; score: number } | null = null;
      for (const target of pool) {
        if (target.kind === 'ACTION' && picked.some((entry) => sameTarget(entry, target))) {
          continue;
        }
        const score = coefficientScore(attendant, target);
        if (score > 0 && (best === null || score > best.score)) {
          best = { target, score };
        }
      }
      return best?.target ?? null;
    },
  },
  {
    // 従者10は常に最大攻撃力の武技へ。召喚を保持していなければ他の1枠が召喚を確保する。
    id: 'BP-05',
    finalParty: ['ATTENDANT_01', 'ATTENDANT_10'],
    sacrifices: [],
    policy: 'ATTACK',
    allocate: ({ attendantId, pool, picked, start }) => {
      if (attendantId === 'ATTENDANT_10') {
        return bestBy(pool, isMartial, byAtk);
      }
      const summonPicked = picked.some((entry) => entry.kind === 'ACTION' && isSummon(recordOf(entry.class_id)!));
      if (!start.holdsSummon && !summonPicked) {
        const summon = bestBy(pool, isSummon, () => [0]);
        if (summon !== null) {
          return summon;
        }
      }
      return bestBy(pool, isMartial, byAtk);
    },
  },
  {
    // 浄化率・剥奪率を持つアクションを優先。無ければ最大HP加算。
    id: 'BP-06',
    finalParty: ['ATTENDANT_01', 'ATTENDANT_14', 'ATTENDANT_15'],
    sacrifices: [{ act: 4, count: 1 }],
    policy: 'DEFENSE',
    allocate: ({ pool }) =>
      bestBy(
        pool,
        (record) => record.params.purify_rate > 0 || record.params.strip_rate > 0,
        (record) => [Math.max(record.params.purify_rate, record.params.strip_rate)],
      ) ?? maxHp(pool),
  },
  {
    // 全枠を単一の武技（急襲）スロットへ統合。
    id: 'BP-07',
    finalParty: ['ATTENDANT_03', 'ATTENDANT_04', 'ATTENDANT_06'],
    sacrifices: [{ act: 2, count: 1, target: RINA }],
    policy: 'ATTACK',
    allocate: ({ pool }) => bestBy(pool, isRush, byAtk),
  },
];

export function buildProfileOf(id: string): BuildProfile {
  const profile = BUILD_PROFILES.find((entry) => entry.id === id);
  if (profile === undefined) {
    throw new Error(`未知のビルドプロファイル: ${id}`);
  }
  return profile;
}

// ［編成列］補充では最終編成に名指しされた従者を優先し、残りを従者ID昇順で満たす。
export function chooseRefill(profile: BuildProfile, pool: readonly string[]): string {
  return pool.find((attendantId) => profile.finalParty.includes(attendantId)) ?? [...pool].sort()[0];
}

// ［供犠スケジュール］対象：名指し、無ければ最終編成外の従者01以外を従者ID降順。
export function chooseSacrificeTarget(
  profile: BuildProfile,
  plan: SacrificePlan,
  party: readonly string[],
): string | null {
  if (plan.target !== undefined) {
    return party.includes(plan.target) ? plan.target : null;
  }
  const candidates = party.filter((id) => id !== RINA).sort().reverse();
  return candidates.find((id) => !profile.finalParty.includes(id)) ?? candidates[0] ?? null;
}

function sceneOf(sceneId: string) {
  return SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS];
}

function actFinalOrder(act: number): number {
  let order = 0;
  for (const scene of Object.values(SCENE_MASTERS)) {
    if (scene.act === act) {
      order = Math.max(order, scene.order);
    }
  }
  return order;
}

// [V-TEST-REFAI]［役割充足による選択］最大HP加算が途絶したインターミッションの連続回数（周回ごと）。
const HP_GAIN_SINCE = new WeakMap<object, number>();

const isRanged = (record: ActionRecord): boolean => !record.is_root && record.params.range >= 2 && record.params.atk > 0;

// [V-TEST-REFAI] 戦闘方針の維持規則。インターミッション開始時の判定を保持し、枠ごとに維持の対象を返す
// （該当しなければ null）。攻撃型・防御型の読み替えはそれぞれ1枠に限り、体力 → 壁割り → リソース生成手段 →
// 射程の順に優先する。バランス型は枠ごとに［役割充足による選択］を判定する。
export function maintenanceRules(run: GameSession['data']['run'], policy: RefPolicy) {
  const hpBase = sceneByOrder(MASTERS, sceneOf(run.current_scene_id).order - 1).hp_bonus_base ?? 0;
  const since = HP_GAIN_SINCE.get(run) ?? 0;
  let hpGained = false;
  let raiseHp = run.hero_max_hp < hpBase;
  let needBreaker = missingBreaker(run);
  let refillMind = mindUsesLeft(run) <= 1 || mindShort(run, inheritPool(run, MASTERS));
  let needRange = !holds(run, isRanged);
  return {
    next(pool: readonly InheritTarget[]): InheritTarget | null {
      if (policy === 'BALANCE') {
        return chooseByRole(run, pool, hpBase, !hpGained && since >= ROLE_HP_STALE_INTERMISSIONS);
      }
      if (policy === 'PASSIVE') {
        return null;
      }
      if (raiseHp) {
        raiseHp = false;
        const hp = maxHp(pool);
        if (hp !== null) {
          return hp;
        }
      }
      // [V-TEST-REFAI]［壁割りの維持］
      if (needBreaker !== null) {
        const breakerId = needBreaker;
        needBreaker = null;
        const breaker = pool.find((entry) => entry.kind === 'ACTION' && entry.class_id === breakerId);
        if (breaker !== undefined) {
          return breaker;
        }
      }
      if (refillMind) {
        refillMind = false;
        const mind = chooseMindRefill(pool);
        if (mind !== null) {
          return mind;
        }
      }
      if (needRange) {
        needRange = false;
        return bestBy(pool, isRanged, byAtk);
      }
      return null;
    },
    record(target: InheritTarget): void {
      hpGained = hpGained || target.kind === 'MAX_HP';
    },
    settle(): void {
      if (policy === 'BALANCE') {
        HP_GAIN_SINCE.set(run, hpGained ? 0 : since + 1);
      }
    },
  };
}

// アクトごとに実行した供犠の数（周回ごと）。
const SACRIFICES_DONE = new WeakMap<object, Record<number, number>>();

// ［供犠スケジュール］時機：当該アクト内で［供犠の実行］の条件が成立した最初のインターミッション。
// 残りのインターミッション数が残りの供犠数に達した場合は強制する。アクト移行の段では行わない。
export function scheduledSacrifice(
  profile: BuildProfile,
  run: GameSession['data']['run'],
): string | null {
  if (isActTransition(run, MASTERS)) {
    return null;
  }
  const next = sceneOf(run.current_scene_id);
  const plan = profile.sacrifices.find((entry) => entry.act === next.act);
  if (plan === undefined) {
    return null;
  }
  const done = SACRIFICES_DONE.get(run)?.[next.act] ?? 0;
  const remaining = plan.count - done;
  if (remaining <= 0) {
    return null;
  }
  const intermissionsLeft = actFinalOrder(next.act) - next.order + 1;
  const due = needsSacrifice(run) || needsBossSacrifice(run) || remaining >= intermissionsLeft;
  if (!due) {
    return null;
  }
  return chooseSacrificeTarget(
    profile,
    plan,
    run.party.map((slot) => slot.attendant_id),
  );
}

function holds(run: GameSession['data']['run'], pred: (record: ActionRecord) => boolean): boolean {
  return run.hero_acts.some((action) => {
    const record = recordOf(action.master_ref);
    return action.uses_left !== 0 && record !== undefined && pred(record);
  });
}

// [V-TEST-BUILD-METRICS] merge_max：単一スロットへ統合された継承枠数 ÷ 当該インターミッションの継承実行回数。
// 最大HP加算は統合の対象外であり（[M-INHERIT-MERGE]）、1枠ずつ数える。
export function mergeMax(picks: readonly InheritTarget[]): number | null {
  if (picks.length === 0) {
    return null;
  }
  const groups: Record<string, number> = {};
  let largest = 0;
  for (const pick of picks) {
    if (pick.kind === 'MAX_HP') {
      largest = Math.max(largest, 1);
      continue;
    }
    groups[pick.class_id] = (groups[pick.class_id] ?? 0) + 1;
    largest = Math.max(largest, groups[pick.class_id]);
  }
  return largest / picks.length;
}

// ビルドプロファイルのインターミッション。継承 → 供犠 → アクト移行時の補充 → 決済の順に行う。
export function playBuildIntermission(
  session: GameSession,
  ctx: GameContext,
  profile: BuildProfile,
  turn: number,
): { readonly mergeMax: number | null; readonly sacrificed: string | null } {
  const run = session.data.run;
  const start = { holdsStance: holds(run, isStance), holdsSummon: holds(run, isSummon) };
  const picks: InheritTarget[] = [];
  const maintenance = maintenanceRules(run, profile.policy);
  for (const member of [...run.party].sort((left, right) => left.attendant_id.localeCompare(right.attendant_id))) {
    if (member.inherit_state !== 'UNUSED') {
      continue;
    }
    const pool = inheritPool(run, MASTERS);
    const target =
      maintenance.next(pool) ??
      profile.allocate({ attendantId: member.attendant_id, pool, picked: picks, start }) ??
      chooseInherit(pool, profile.policy, turn);
    if (target !== null) {
      confirmInherit(session, ctx, member.attendant_id, target);
      maintenance.record(target);
      picks.push(target);
    }
  }
  maintenance.settle();

  const victim = scheduledSacrifice(profile, run);
  if (victim !== null) {
    const act = sceneOf(run.current_scene_id).act;
    confirmSacrifice(session, ctx, victim);
    const done = SACRIFICES_DONE.get(run) ?? {};
    done[act] = (done[act] ?? 0) + 1;
    SACRIFICES_DONE.set(run, done);
  }

  if (isActTransition(run, MASTERS)) {
    enterTransition(session, ctx);
    while (refillCapacity(run, MASTERS) > 0) {
      const pool = refillPool(run, MASTERS);
      if (pool.length === 0) {
        break;
      }
      confirmRefill(session, ctx, chooseRefill(profile, pool));
    }
  }
  settleIntermission(session, ctx);
  return { mergeMax: mergeMax(picks), sacrificed: victim };
}

export interface BuildSceneRecord {
  readonly outcome: SceneOutcome;
  // [V-TEST-BUILD-METRICS] sys_ratio の元となる、当該バトルの主人公マスターの系統別実行回数
  // （武技 / 体勢 / 心気 / 召喚：[M-META-MIRRORSTATS] と同一）。
  readonly counts: readonly number[];
  // 当該シーンの直前インターミッションの merge_max（1-01 は null）。
  readonly mergeMaxBefore: number | null;
  readonly party: readonly string[];
  // 当該シーン開始時の主人公の現在HP・最大HP。
  readonly heroHp: readonly [number, number];
}

export interface BuildRunOutcome {
  readonly profileId: string;
  readonly scenes: readonly BuildSceneRecord[];
  readonly completed: boolean;
}

// [V-TEST-NONFUNC] D-10 ビルドプロファイルで1-01〜lastOrder を通しプレイする。
export function playBuildRun(
  profile: BuildProfile,
  weights: EffectiveProfile = referenceProfile(),
  lastOrder = 30,
): BuildRunOutcome {
  const { session, ctx } = createRun();
  const scenes: BuildSceneRecord[] = [];
  let mergeBefore: number | null = null;
  for (let turn = 0; turn < lastOrder; turn += 1) {
    const holder: { state: BattleState | null } = { state: null };
    const party = session.data.run.party.map((slot) => slot.attendant_id);
    const heroHp = [session.data.run.hero_hp, session.data.run.hero_max_hp] as const;
    const outcome = playScene(
      session,
      ctx,
      profile.policy,
      (state) => {
        holder.state = state;
      },
      weights,
      HARD_STEP_CAP,
    );
    const counts = holder.state === null ? [0, 0, 0, 0] : [...holder.state.mirror_tally.counts];
    scenes.push({ outcome, counts, mergeMaxBefore: mergeBefore, party, heroHp });
    if (!outcome.measured || outcome.result !== 'WIN') {
      return { profileId: profile.id, scenes, completed: false };
    }
    if (turn + 1 >= lastOrder) {
      break;
    }
    mergeBefore = playBuildIntermission(session, ctx, profile, turn).mergeMax;
  }
  return { profileId: profile.id, scenes, completed: true };
}
