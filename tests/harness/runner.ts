// [V-TEST-REFAI] 参照プレイヤーAIによる通しプレイのハーネス。
// D-02（全30シーンの通しプレイと無限ループ検出）・D-08（位置干渉の反復による膠着）・
// D-09（命中機会窓の実測）が共通して要する「1周を最後まで自動で進める」手段を提供する。
//
// 戦闘そのものは敵AIと同一の探索器を陣営を反転して用いる（[V-TEST-REFAI]「別実装を作らない」）。
// 方針が定めるのは継承の選択規則と従者構成であり、探索の設定は depth 3 / node 10,000 で共通である。

import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { AI_PROFILE_MASTERS } from '../../src/data/generated/ai-profile-masters.js';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
import { BREAKERS } from '../../src/data/generated/breaker-masters.js';
import { BOOK_MASTERS } from '../../src/data/generated/book-masters.js';
import { CREATURE_MASTERS } from '../../src/data/generated/creature-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { createCreatureFactory } from '../../src/engine/creature.js';
import { executableActions, type DecisionProvider } from '../../src/engine/decision.js';
import {
  instruct,
  resumeBattle,
  resumeTime,
  startBattle,
  type AdvanceOptions,
  type BattleResult,
} from '../../src/engine/game/battle.js';
import { confirmInherit, confirmRefill, confirmSacrifice, enterTransition, settleIntermission } from '../../src/engine/game/intermission.js';
import { evalCallCount, resetEvalCallCount } from '../../src/ai/evaluate.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import { inheritPool, previewInherit, type InheritTarget } from '../../src/engine/progress/inherit.js';
import { deriveSysFlags } from '../../src/engine/flags.js';
import { INFINITE_USES } from '../../src/engine/params.js';
import { isActTransition, refillCapacity, refillPool } from '../../src/engine/progress/refill.js';
import { sceneByOrder, type GameMasters } from '../../src/engine/run/masters.js';
import type { StepDeps } from '../../src/engine/pipeline/step.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { buildEffectiveProfile, referenceProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { ROLE_HP_STALE_INTERMISSIONS } from '../../src/ai/refai.js';

export const MASTERS: GameMasters = {
  actions: ACTION_MASTERS,
  enemies: ENEMY_MASTERS,
  scenes: SCENE_MASTERS,
  books: BOOK_MASTERS,
  breakers: BREAKERS,
  creatures: CREATURE_MASTERS,
  attendants: ATTENDANT_MASTERS,
  heroInitActions: HERO_INIT_ACTIONS,
  crossIds: [],
  echoIds: [],
  helpIds: [],
};

export const STEP_DEPS: StepDeps = {
  createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }),
};

// [V-TEST-REFAI] 4方針。継承の選択規則と従者構成を定める。
export type RefPolicy = 'ATTACK' | 'DEFENSE' | 'BALANCE' | 'PASSIVE';

// [V-TEST-REFAI]「従者構成」。優先する従者IDを並べ、残りは決定論規約に従い従者ID昇順で充足する。
const PARTY_PREFERENCE: Readonly<Record<RefPolicy, readonly string[]>> = {
  ATTACK: ['ATTENDANT_11', 'ATTENDANT_13'], // ダリウス／ザイル優先
  DEFENSE: ['ATTENDANT_12', 'ATTENDANT_07'], // メイア／バルデス優先
  BALANCE: [],
  PASSIVE: [],
};

function instructableMine(state: BattleState): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.side === 'MINE' && unit.state === 'THOUGHT');
}

// [A-PROFILE-RESOLVE] 敵軍の実効プロファイルは進行中のシーンから構築する。
function createFoeDecision(currentSession: () => GameSession): DecisionProvider {
  const cache: Record<string, DecisionProvider> = {};
  return (state, unit) => {
    const sceneId = currentSession().data.run.current_scene_id;
    let provider = cache[sceneId];
    if (provider === undefined) {
      const scene = SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS];
      const enemy = ENEMY_MASTERS[scene.enemy_id as keyof typeof ENEMY_MASTERS];
      const profileId = enemy.ai_profile_id;
      if (profileId === null) {
        // [M-TMPL-VESSEL] AI無効。固定行動周期を先頭から循環実行する。
        provider = (s, u) => {
          const options = executableActions(s, u);
          return options.length === 0 ? { kind: 'PASS' } : { kind: 'ACT', instanceId: options[0].instance_id };
        };
      } else {
        provider = createAiDecisionProvider(
          buildEffectiveProfile({
            scene,
            enemy,
            profile: AI_PROFILE_MASTERS[profileId as keyof typeof AI_PROFILE_MASTERS],
            // [A-MIRROR-5-09] 5-09 はバトル開始時に固定した鏡像統計から重みを生成する。
            mirrorStats: state.mirror_snapshot,
          }),
          STEP_DEPS,
        );
      }
      if (state.mirror_snapshot === null) {
        cache[sceneId] = provider;
      }
    }
    return provider(state, unit);
  };
}

export interface HarnessContext extends GameContext {
  readonly saves: string[];
}

// セッションは文脈の生成後に作られるため、進行中のセッションは呼び出しごとに引き直す。
export function createHarnessContext(currentSession: () => GameSession): HarnessContext {
  const saves: string[] = [];
  return {
    masters: MASTERS,
    foeDecision: createFoeDecision(currentSession),
    stepDeps: STEP_DEPS,
    persist: (serialized) => {
      saves.push(serialized);
    },
    saves,
  };
}

export interface SceneOutcome {
  readonly scene_id: string;
  readonly result: BattleResult;
  readonly steps: number; // 決着ステップ（打ち切り時は打ち切り位置）
  readonly limit: number; // expected_length の3.0倍（[V-TEST-NONFUNC] D-02）
  // D-02・D-08 の合否。「決着」は勝敗の確定であり、敗北も決着に数える（[V-TEST-REFAI] の目標勝率は
  // ボスで 40%・5-10 で 25% を見込むため、1試行の敗北は膠着の徴候ではない）。
  readonly within: boolean;
  // [V-TEST-NONFUNC]［測定の打ち切り］false は「測定不能」。勝敗を記録せず、D-02・D-08 の合否判定
  // および win_rate の分母から除く。決着上限の超過（within === false）とは区別する。
  readonly measured: boolean;
}

// [V-TEST-NONFUNC]［測定の打ち切り］1試行1シーンあたりの E(state) 呼び出し回数の上限。
export const EVAL_CALL_LIMIT = 10_000_000;

// 決着上限を超えても計測を続けるための安全弁。無限ループの検出そのものは within が担う。
export const HARD_STEP_CAP = 20000;

// [V-TEST-NONFUNC] D-02「決着上限」：expected_length の3.0倍。
export function decisionLimit(expectedLength: number | null): number {
  return expectedLength === null ? Number.MAX_SAFE_INTEGER : expectedLength * 3;
}

// ステップ境界ごとの観測点。[V-TEST-NONFUNC] D-09 の命中機会窓はここで採る。
export type StepObserver = (state: BattleState) => void;

// 時間停止中の1手。参照プレイヤーAI（[V-TEST-REFAI] depth 3 / node 10,000 / best_reply）が決める。
function playOneOperation(
  session: GameSession,
  ctx: GameContext,
  policy: RefPolicy,
  options: AdvanceOptions,
  playerProfile: EffectiveProfile,
): BattleResult {
  const state = session.data.run.battle_state;
  if (state === null) {
    throw new Error('バトル中ではない');
  }
  if (policy === 'PASSIVE') {
    return resumeTime(session, ctx, options); // 無操作型：常にパス
  }
  // [V-TEST-REFAI]［決定点］参照プレイヤーAIは敵軍AIと同じく、行動を確定できるステップごとに決定する。
  // 次のステップに手動停止（[M-PIPE-PAUSE-TRIGGER]#4）を要求し、停止条件の成立を待たずに決定点を得る。
  const next: AdvanceOptions = { ...options, stopAtStep: state.step + 1 };
  const provider = createAiDecisionProvider(playerProfile, STEP_DEPS);
  for (const unit of instructableMine(state)) {
    // 実行可能なアクションが無い間はパスしか選べないため、探索を行わない。
    if (executableActions(state, unit).length === 0) {
      continue;
    }
    const decision = provider(state, unit);
    if (decision.kind === 'ACT') {
      return instruct(session, ctx, unit.unit_id, decision.instanceId, next);
    }
  }
  return resumeTime(session, ctx, next);
}

// [V-TEST-REFAI]「体勢への減点」防御型の戦闘では適用しない（STANCE = 0）。他の方針は与えた重みのまま用いる。
export function battleProfileFor(policy: RefPolicy, profile: EffectiveProfile): EffectiveProfile {
  return policy === 'DEFENSE' ? { ...profile, actionBonus: { ...profile.actionBonus, STANCE: 0 } } : profile;
}

// 観測子を与えた場合は [M-UI-PLAYBACK] の歩進上限を1に絞り、ステップ境界ごとに観測点を通す
// （実バトルと同じ進行経路のまま計測するため、別の駆動系を作らない）。
export function advanceOptionsFor(observe?: StepObserver): AdvanceOptions {
  return observe === undefined ? {} : { maxSteps: 1 };
}

// 開始済みのバトルを決着まで進める。開始手段（startBattle / rollbackBattle）は呼び出し側が与える。
export function driveBattle(
  session: GameSession,
  ctx: GameContext,
  policy: RefPolicy,
  playerProfile: EffectiveProfile,
  initial: BattleResult,
  observe?: StepObserver,
  // 打ち切り歩数の上書き。既定は [V-TEST-NONFUNC] D-02 の決着上限であり、勝敗そのものを数える
  // 測定（[V-TEST-REFAI] の win_rate）は決着まで進める必要があるため安全弁を渡す。
  abortAt?: number,
  // [V-TEST-NONFUNC]［測定の打ち切り］E(state) 呼び出し回数の上限。既定は EVAL_CALL_LIMIT。
  evalLimit: number = EVAL_CALL_LIMIT,
): SceneOutcome {
  const sceneId = session.data.run.current_scene_id;
  const scene = SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS];
  const limit = decisionLimit(scene.expected_length);
  const options = advanceOptionsFor(observe);
  // [V-TEST-NONFUNC] D-02 の決着上限で打ち切る。上限を越えた戦闘はその時点で D-02 に不合格が
  // 確定しており、以降を進めても判定は変わらない。expected_length を持たないシーン（5-11）は
  // D-02 の対象外（[M-TMPL-VESSEL]）であり上限を導けないため、安全弁のみを用いる。
  const abortStep = abortAt ?? (scene.expected_length === null ? HARD_STEP_CAP : limit);
  // [A-LATE-5-10]「探索木内の順序」参照プレイヤーAIの探索も、決定順を反転するシーンでは自軍 → 敵軍の順に並べる。
  const battleProfile = battleProfileFor(policy, playerProfile);
  const profile: EffectiveProfile = scene.deferred_decision ? { ...battleProfile, deferredDecision: true } : battleProfile;

  let result = initial;
  // [V-TEST-NONFUNC]［測定の打ち切り］シーンごとに計数を始める。
  resetEvalCallCount();
  // 開始手段の内部で決着した場合（時間停止が一度も成立しないまま敗北した等）も、
  // 決着ステップを取り違えないよう現在値から数え始める。
  let steps = session.data.run.battle_state?.step ?? 0;
  while (result === 'PAUSED' || result === 'RUNNING') {
    const state = session.data.run.battle_state;
    if (state !== null && observe !== undefined) {
      observe(state);
    }
    steps = state?.step ?? steps;
    if (steps > abortStep) {
      return { scene_id: sceneId, result, steps, limit, within: false, measured: true };
    }
    if (evalCallCount() > evalLimit) {
      // 測定不能。勝敗を確定させずに打ち切る（[V-TEST-NONFUNC]［測定の打ち切り］）。
      return { scene_id: sceneId, result, steps, limit, within: false, measured: false };
    }
    result =
      result === 'RUNNING'
        ? // 観測時の1歩進行（maxSteps）から再開する場合も、同じステップの手動停止要求を引き継ぐ。
          resumeBattle(session, ctx, policy === 'PASSIVE' || state === null ? options : { ...options, stopAtStep: state.step })
        : playOneOperation(session, ctx, policy, options, profile);
    // 勝利時はバトルクリア共通決済（[M-PROG-CLEAR]）が run.battle_state を破棄する。進行は同じ
    // BattleState を更新し続けるため、呼び出し前に保持した参照から決着ステップを読む（破棄後の
    // run.battle_state を引くと、時間停止を挟まず決着した区間が数えられず、最後の停止位置になる）。
    steps = state?.step ?? steps;
  }
  return {
    scene_id: sceneId,
    result,
    steps,
    limit,
    within: (result === 'WIN' || result === 'LOSS') && steps <= limit,
    measured: true,
  };
}

// 1シーンをバトル開始から決着まで進める。
export function playScene(
  session: GameSession,
  ctx: GameContext,
  policy: RefPolicy,
  observe?: StepObserver,
  // [V-TEST-REFAI]［重み摂動プロファイル群］測定時は摂動した重みを与える。省略時は無摂動。
  playerProfile: EffectiveProfile = referenceProfile(),
  abortAt?: number,
  evalLimit?: number,
): SceneOutcome {
  const started = startBattle(session, ctx, advanceOptionsFor(observe));
  return driveBattle(session, ctx, policy, playerProfile, started, observe, abortAt, evalLimit);
}

// [V-TEST-REFAI]「継承の選択規則」。
export function chooseInherit(pool: readonly InheritTarget[], policy: RefPolicy, turn: number): InheritTarget | null {
  const actions = pool.filter((target): target is { kind: 'ACTION'; class_id: string } => target.kind === 'ACTION');
  const maxHp = pool.find((target) => target.kind === 'MAX_HP') ?? null;
  const paramOf = (target: { class_id: string }, key: 'atk' | 'dmg_hp' | 'deploy_ap' | 'gain_vp') =>
    ACTION_MASTERS[target.class_id as keyof typeof ACTION_MASTERS].params[key];
  const flagged = (target: { class_id: string }, key: 'atk' | 'deploy_ap' | 'charge_pp') =>
    paramOf(target as { class_id: string }, key as 'atk' | 'deploy_ap') > 0;

  if (policy === 'ATTACK') {
    // 常に最大実効攻撃力の武技を選ぶ。同値なら最大HPダメージ。
    const martial = actions.filter((target) => flagged(target, 'atk'));
    if (martial.length === 0) {
      return maxHp;
    }
    return martial.reduce((best, target) => {
      const byAtk = paramOf(target, 'atk') - paramOf(best, 'atk');
      return byAtk > 0 || (byAtk === 0 && paramOf(target, 'dmg_hp') > paramOf(best, 'dmg_hp')) ? target : best;
    });
  }
  if (policy === 'DEFENSE') {
    // 常に最大展開APの体勢を選ぶ。無ければ最大HP加算。
    const stances = actions.filter((target) => flagged(target, 'deploy_ap'));
    if (stances.length === 0) {
      return maxHp ?? actions[0] ?? null;
    }
    return stances.reduce((best, target) => (paramOf(target, 'deploy_ap') > paramOf(best, 'deploy_ap') ? target : best));
  }
  // バランス型：武技・心気・体勢を循環選択する。
  // [V-TEST-REFAI]［循環選択における系統内の選択］選んだ系統の中では特性パラメータが最大の項目を選ぶ。
  // 武技は基礎攻撃力、心気は加算VP、体勢は展開AP。
  const cycle: Array<'atk' | 'gain_vp' | 'deploy_ap'> = ['atk', 'gain_vp', 'deploy_ap'];
  for (let offset = 0; offset < cycle.length; offset += 1) {
    const key = cycle[(turn + offset) % cycle.length];
    const candidates = actions.filter(
      (target) => ACTION_MASTERS[target.class_id as keyof typeof ACTION_MASTERS].params[key] > 0,
    );
    if (candidates.length > 0) {
      return candidates.reduce((best, target) => (paramOf(target, key) > paramOf(best, key) ? target : best));
    }
  }
  return maxHp ?? actions[0] ?? null;
}

// [V-TEST-REFAI]［役割充足による選択］バランス型の継承枠ごとに、未充足の役割を順に満たす。
// 役割は枠ごとに、直前の枠の継承を反映した手持ちで判定する。すべて充足していれば循環選択に従う。
const ROLE_BREAKER_USES = 2;
const ROLE_RANGED_USES = 3;
export const ROLE_MIND_USES = 5;
const BREAKER_IDS: readonly string[] = BREAKERS.map((breaker) => breaker.class_id);

type ActionRecord = (typeof ACTION_MASTERS)[keyof typeof ACTION_MASTERS];

function recordOf(classId: string): ActionRecord | undefined {
  return ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
}

function hasUses(usesLeft: number, required: number): boolean {
  return usesLeft === INFINITE_USES || usesLeft >= required;
}

// [M-GUARD-BREAKER] 次に挑むシーンのカバー区間を担当する壁割りのクラスID。
export function breakerForScene(sceneId: string): string | null {
  const scene = SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS];
  if (scene === undefined) {
    return null;
  }
  let best: { class_id: string; order: number } | null = null;
  for (const breaker of BREAKERS) {
    if (breaker.order < scene.order && (best === null || breaker.order > best.order)) {
      best = breaker;
    }
  }
  return best?.class_id ?? null;
}

// [V-TEST-REFAI]［壁割りの維持］次に挑むシーンのカバー区間を担当する壁割りを、残り使用回数2以上で
// 保持していないとき、そのクラスID。保持している、または担当がないときは null。
export function missingBreaker(run: {
  current_scene_id: string;
  hero_acts: readonly { master_ref: string; uses_left: number }[];
}): string | null {
  const breakerId = breakerForScene(run.current_scene_id);
  if (breakerId === null) {
    return null;
  }
  const held = run.hero_acts.some((act) => act.master_ref === breakerId && hasUses(act.uses_left, ROLE_BREAKER_USES));
  return held ? null : breakerId;
}

// 反復射程：射程2以上の武技のうち、マスター根源武技と壁割り担当を除くもの。
function isSustainedRanged(record: ActionRecord): boolean {
  return (
    !record.is_root && !BREAKER_IDS.includes(record.class_id) && record.params.range >= 2 && record.params.atk > 0
  );
}

// [V-TEST-REFAI]［役割充足による選択］最大HP加算を最後に継承してから経過したインターミッション数（周回ごと）。
const HP_GAIN_SINCE = new WeakMap<object, number>();

// 途絶とみなす回数は [M-GUARD-LETHAL] と共有するため参照プレイヤーAIのモジュールに置く。
export { ROLE_HP_STALE_INTERMISSIONS };

export function chooseByRole(
  run: {
    current_scene_id: string;
    hero_max_hp: number;
    hero_acts: readonly { master_ref: string; uses_left: number; sys_flags: readonly string[] }[];
  },
  pool: readonly InheritTarget[],
  hpBonusBase: number,
  // 直近 ROLE_HP_STALE_INTERMISSIONS 回のインターミッションで最大HP加算を継承していないとき真。
  hpStale = false,
): InheritTarget | null {
  const actions = pool.filter((entry): entry is { kind: 'ACTION'; class_id: string } => entry.kind === 'ACTION');
  // 1. 体力：最大HPが hp_bonus_base を下回るとき、または最大HPの加算が長く途絶えているとき。
  if (run.hero_max_hp < hpBonusBase || hpStale) {
    const hp = pool.find((entry) => entry.kind === 'MAX_HP');
    if (hp !== undefined) {
      return hp;
    }
  }
  // 2. 壁割り
  const breakerId = breakerForScene(run.current_scene_id);
  if (
    breakerId !== null &&
    !run.hero_acts.some((act) => act.master_ref === breakerId && hasUses(act.uses_left, ROLE_BREAKER_USES))
  ) {
    const breaker = actions.find((entry) => entry.class_id === breakerId);
    if (breaker !== undefined) {
      return breaker;
    }
  }
  // 3. 反復射程
  const holdsRanged = run.hero_acts.some((act) => {
    const record = recordOf(act.master_ref);
    return record !== undefined && isSustainedRanged(record) && hasUses(act.uses_left, ROLE_RANGED_USES);
  });
  if (!holdsRanged) {
    let best: { entry: { kind: 'ACTION'; class_id: string }; atk: number } | null = null;
    for (const entry of actions) {
      const record = recordOf(entry.class_id);
      if (record !== undefined && isSustainedRanged(record) && (best === null || record.params.atk > best.atk)) {
        best = { entry, atk: record.params.atk };
      }
    }
    if (best !== null) {
      return best.entry;
    }
  }
  // 4. 心気（残り使用回数、または心気1回の出力が次の壁割りに足りないとき）
  if (mindUsesLeft(run) < ROLE_MIND_USES || mindShort(run, pool)) {
    const mind = chooseMindRefill(pool);
    if (mind !== null) {
      return mind;
    }
  }
  return null;
}

// [V-TEST-REFAI]［リソース生成手段の維持］主人公が保持する FLAG_MIND のアクションの残り使用回数の合計。
// 無限回数は枯渇しないため上限値として扱う。
export function mindUsesLeft(run: { hero_acts: readonly { sys_flags: readonly string[]; uses_left: number }[] }): number {
  let total = 0;
  for (const action of run.hero_acts) {
    if (!action.sys_flags.includes('FLAG_MIND')) {
      continue;
    }
    if (action.uses_left === INFINITE_USES) {
      return Number.MAX_SAFE_INTEGER;
    }
    total += action.uses_left;
  }
  return total;
}

// 心気1回（VP 0 から）で得る PP の100倍：gain_vp × charge_pp（centi）。[M-RESOLVE-MIND] の PP = VP × 充填率による。
function mindYieldCenti(classId: string): number {
  const record = ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
  if (record === undefined || !deriveSysFlags(record.params).includes('FLAG_MIND')) {
    return -1;
  }
  return record.params.gain_vp * record.params.charge_pp;
}

// 継承プールの FLAG_MIND を持つ項目のうち、心気1回の PP が最大のもの（同値ならプールの走査順で最初のもの）。
export function chooseMindRefill(pool: readonly InheritTarget[]): InheritTarget | null {
  let best: { target: InheritTarget; yieldCenti: number } | null = null;
  for (const target of pool) {
    if (target.kind !== 'ACTION') {
      continue;
    }
    const yieldCenti = mindYieldCenti(target.class_id);
    if (yieldCenti < 0) {
      continue;
    }
    if (best === null || yieldCenti > best.yieldCenti) {
      best = { target, yieldCenti };
    }
  }
  return best?.target ?? null;
}

// [V-TEST-REFAI]［心気の出力］保持する心気のいずれも、次に挑むシーンの壁割り担当の PP コストを心気1回
// （VP 0 から）で賄えず、かつ継承プールに、より出力が高く MIND_SHORT_USES 回で賄える心気があるとき真。
const MIND_SHORT_USES = 2;
export function mindShort(
  run: { current_scene_id: string; hero_acts: readonly { master_ref: string; uses_left: number }[] },
  pool: readonly InheritTarget[],
): boolean {
  const breakerId = breakerForScene(run.current_scene_id);
  const breaker = breakerId === null ? undefined : ACTION_MASTERS[breakerId as keyof typeof ACTION_MASTERS];
  if (breaker === undefined) {
    return false;
  }
  let held = -1;
  for (const act of run.hero_acts) {
    if (act.uses_left !== 0) {
      held = Math.max(held, mindYieldCenti(act.master_ref));
    }
  }
  if (held >= breaker.params.cost_pp * 100) {
    return false;
  }
  const offer = chooseMindRefill(pool);
  if (offer === null || offer.kind !== 'ACTION') {
    return false;
  }
  // 出力が上回り、かつ2回で壁割りの PP コストを賄える心気に限る（VP は心気のたびに累積する）。
  // 出力が上回るだけの心気まで選ぶと、壁割りに届かない小刻みな更新が継承枠を占め、他の役割が痩せる。
  const offered = mindYieldCenti(offer.class_id);
  return offered > held && offered * MIND_SHORT_USES >= breaker.params.cost_pp * 100;
}

// [V-TEST-REFAI]［供犠の実行］対象は同行従者のうち従者01（リナ）以外を従者ID降順に並べた先頭。
// リナのみのときは供犠しない（同行従者0人では継承・供犠が行えない：[M-PROG-NOATTENDANT]）。
const FIXED_ATTENDANT_ID = 'ATTENDANT_01';

export function sacrificeTarget(run: { party: readonly { attendant_id: string }[] }): string | null {
  const victims = run.party
    .map((member) => member.attendant_id)
    .filter((attendantId) => attendantId !== FIXED_ATTENDANT_ID)
    .sort()
    .reverse();
  return victims[0] ?? null;
}

// [V-TEST-REFAI]［供犠の実行］判定：現在HP × 3 < 最大HP。
export function needsSacrifice(run: { hero_hp: number; hero_max_hp: number }): boolean {
  return run.hero_hp * 3 < run.hero_max_hp;
}

// [V-TEST-REFAI]［供犠の実行］「ボス前の供犠」次に挑むシーンが当該アクトの最終シーンであり、
// 現在HPが最大HP未満であるとき、閾値に依らず供犠する。インターミッションの時点で
// current_scene_id は次に挑むシーンを指す。
export function needsBossSacrifice(run: {
  current_scene_id: string;
  hero_hp: number;
  hero_max_hp: number;
}): boolean {
  const next = SCENE_MASTERS[run.current_scene_id as keyof typeof SCENE_MASTERS];
  if (next === undefined) {
    return false;
  }
  const afterNext = sceneByOrder(MASTERS, next.order + 1);
  const isActFinal = afterNext === undefined || afterNext.act !== next.act;
  return isActFinal && run.hero_hp < run.hero_max_hp;
}

// [V-TEST-REFAI]［体力の維持］判定に用いる、直前にクリアしたシーン。継承プールの提示元と同じである。
function clearedSceneOf(run: { current_scene_id: string }) {
  const current = SCENE_MASTERS[run.current_scene_id as keyof typeof SCENE_MASTERS];
  return sceneByOrder(MASTERS, current.order - 1);
}

// [V-TEST-REFAI]［効果のない継承の除外］継承しても主人公の手持ちが変わらない項目（既存スロットへの統合で
// 基礎値がいずれも改善せず、実効初期使用回数が当該スロットの残り使用回数を上回らないもの）を継承プールから除く。
export function usefulPool(run: GameSession['data']['run'], attendantId: string): InheritTarget[] {
  return inheritPool(run, MASTERS).filter((target) => {
    const preview = previewInherit(run, MASTERS, attendantId, target);
    if (preview.kind !== 'MERGE') {
      return true;
    }
    const existing = run.hero_acts.find((action) => action.instance_id === preview.existingInstanceId);
    return preview.improved.length > 0 || (existing !== undefined && existing.uses_left < preview.usesInitial);
  });
}

// インターミッションを決済まで進める。継承・補充はいずれも決定論規約（従者ID昇順）に従う。
export function playIntermission(session: GameSession, ctx: GameContext, policy: RefPolicy, turn: number): void {
  const run = session.data.run;
  if (policy === 'BALANCE') {
    // [V-TEST-REFAI]［役割充足による選択］体力の役割は、最大HP加算の途絶が続くときにも未充足とする。
    const since = HP_GAIN_SINCE.get(run) ?? 0;
    let hpGained = false;
    for (const member of [...run.party].sort((left, right) => left.attendant_id.localeCompare(right.attendant_id))) {
      if (member.inherit_state !== 'UNUSED') {
        continue;
      }
      const pool = usefulPool(run, member.attendant_id);
      const stale: boolean = !hpGained && since >= ROLE_HP_STALE_INTERMISSIONS;
      const target: InheritTarget | null =
        chooseByRole(run, pool, clearedSceneOf(run).hp_bonus_base ?? 0, stale) ?? chooseInherit(pool, policy, turn);
      if (target !== null) {
        confirmInherit(session, ctx, member.attendant_id, target);
        hpGained = hpGained || target.kind === 'MAX_HP';
      }
    }
    HP_GAIN_SINCE.set(run, hpGained ? 0 : since + 1);
  } else if (policy !== 'PASSIVE') {
    // [V-TEST-REFAI]［体力の維持］［リソース生成手段の維持］いずれも判定はインターミッション開始時に
    // 1度だけ行い、読み替えはそれぞれ当該インターミッションの継承枠1件に限る。体力が優先する。
    // [V-TEST-REFAI]［射程の維持］射程2以上の武技（マスター根源武技を除く）を保持しないとき、
    // その回の継承枠1件に限り、プールの射程2以上の武技のうち基礎攻撃力が最大のものを選ぶ。
    let needRange =
      !run.hero_acts.some((act) => {
        const master = ACTION_MASTERS[act.master_ref as keyof typeof ACTION_MASTERS];
        return master !== undefined && !master.is_root && master.params.range >= 2 && master.params.atk > 0;
      });
    let raiseHp = run.hero_max_hp < (clearedSceneOf(run).hp_bonus_base ?? 0);
    let refillMind =
      (policy === 'ATTACK' || policy === 'DEFENSE') && (mindUsesLeft(run) < ROLE_MIND_USES || mindShort(run, inheritPool(run, MASTERS)));
    // [V-TEST-REFAI]［壁割りの維持］体力に次いで優先する。
    let needBreaker = missingBreaker(run);
    for (const member of [...run.party].sort((left, right) => left.attendant_id.localeCompare(right.attendant_id))) {
      if (member.inherit_state !== 'UNUSED') {
        continue;
      }
      const pool = usefulPool(run, member.attendant_id);
      const hp = raiseHp ? (pool.find((entry) => entry.kind === 'MAX_HP') ?? null) : null;
      const breaker =
        hp === null && needBreaker !== null
          ? (pool.find((entry) => entry.kind === 'ACTION' && entry.class_id === needBreaker) ?? null)
          : null;
      const refill = hp === null && breaker === null && refillMind ? chooseMindRefill(pool) : null;
      const ranged =
        hp === null && breaker === null && refill === null && needRange
          ? (pool
              .filter((entry): entry is { kind: 'ACTION'; class_id: string } => entry.kind === 'ACTION')
              .filter((entry) => {
                const master = ACTION_MASTERS[entry.class_id as keyof typeof ACTION_MASTERS];
                return master !== undefined && !master.is_root && master.params.range >= 2 && master.params.atk > 0;
              })
              .reduce<{ kind: 'ACTION'; class_id: string } | null>((best, entry) => {
                if (best === null) return entry;
                const a = ACTION_MASTERS[entry.class_id as keyof typeof ACTION_MASTERS].params.atk;
                const b = ACTION_MASTERS[best.class_id as keyof typeof ACTION_MASTERS].params.atk;
                return a > b ? entry : best;
              }, null) ?? null)
          : null;
      const target = hp ?? breaker ?? refill ?? ranged ?? chooseInherit(pool, policy, turn);
      if (target === null) {
        continue;
      }
      if (hp !== null) {
        raiseHp = false;
      } else if (breaker !== null) {
        needBreaker = null;
      } else if (refill !== null) {
        refillMind = false;
      } else if (ranged !== null) {
        needRange = false;
      }
      confirmInherit(session, ctx, member.attendant_id, target);
    }
  }

  // [V-TEST-REFAI]［供犠の実行］継承をすべて終えた後に1度だけ判定する。アクト最終シーンのクリア後は
  // アクト移行で全回復するため行わない（[M-PROG-REFILL]）。
  // 「ボス前の供犠」は閾値に依らず発動する。
  if (
    policy !== 'PASSIVE' &&
    !isActTransition(run, MASTERS) &&
    (needsSacrifice(run) || needsBossSacrifice(run))
  ) {
    const victim = sacrificeTarget(run);
    if (victim !== null) {
      confirmSacrifice(session, ctx, victim);
    }
  }

  if (isActTransition(run, MASTERS)) {
    enterTransition(session, ctx);
    const preference = PARTY_PREFERENCE[policy];
    // refillCapacity は残り補充可能数（定員 − 現在の人数）であり、現在の人数と比べない。
    while (refillCapacity(run, MASTERS) > 0) {
      const pool = refillPool(run, MASTERS);
      if (pool.length === 0) {
        break;
      }
      const preferred = preference.find((attendantId) => pool.includes(attendantId));
      confirmRefill(session, ctx, preferred ?? [...pool].sort()[0]);
    }
  }
  settleIntermission(session, ctx);
}

export interface RunOutcome {
  readonly scenes: readonly SceneOutcome[];
  readonly completed: boolean;
}

// 新規セッションと、そのセッションを引く文脈の組。
export function createRun(): { session: GameSession; ctx: HarnessContext } {
  let started: GameSession | null = null;
  const ctx = createHarnessContext(() => {
    if (started === null) {
      throw new Error('セッションが未生成である');
    }
    return started;
  });
  const session = newGameSession(ctx);
  started = session;
  return { session, ctx };
}

// 1-01 から、決着に失敗するか全シーンを抜けるまで通しプレイする。
// observeFor はシーンごとに観測子を作る。D-09 は系列をシーン単位で持つため、1周分を1度に採れる。
export function playRun(
  policy: RefPolicy,
  lastOrder = 30,
  observeFor?: (sceneId: string) => StepObserver,
  playerProfile: EffectiveProfile = referenceProfile(),
  abortAt?: number,
  evalLimit?: number,
): RunOutcome {
  const { session, ctx } = createRun();

  const scenes: SceneOutcome[] = [];
  for (let turn = 0; turn < lastOrder; turn += 1) {
    const observe = observeFor?.(session.data.run.current_scene_id);
    const outcome = playScene(session, ctx, policy, observe, playerProfile, abortAt, evalLimit);
    scenes.push(outcome);
    // [V-TEST-NONFUNC]［測定の打ち切り］測定不能となった試行は以降のシーンを未測定とする。
    if (!outcome.measured || outcome.result !== 'WIN') {
      return { scenes, completed: false };
    }
    if (turn + 1 >= lastOrder) {
      break;
    }
    playIntermission(session, ctx, policy, turn);
  }
  return { scenes, completed: true };
}
