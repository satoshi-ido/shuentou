// [V-TEST-REFAI] 参照プレイヤーAIによる通しプレイのハーネス。
// D-02（全30シーンの通しプレイと無限ループ検出）・D-08（位置干渉の反復による膠着）・
// D-09（命中機会窓の実測）が共通して要する「1周を最後まで自動で進める」手段を提供する。
//
// 戦闘そのものは敵AIと同一の探索器を陣営を反転して用いる（[V-TEST-REFAI]「別実装を作らない」）。
// 方針が定めるのは継承の選択規則と従者構成であり、探索の設定は depth 3 / node 10,000 で共通である。

import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { AI_PROFILE_MASTERS } from '../../src/data/generated/ai-profile-masters.js';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
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
import { confirmInherit, confirmRefill, enterTransition, settleIntermission } from '../../src/engine/game/intermission.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import { inheritPool, type InheritTarget } from '../../src/engine/progress/inherit.js';
import { deriveSysFlags } from '../../src/engine/flags.js';
import { INFINITE_USES } from '../../src/engine/params.js';
import { isActTransition, refillCapacity, refillPool } from '../../src/engine/progress/refill.js';
import type { GameMasters } from '../../src/engine/run/masters.js';
import type { StepDeps } from '../../src/engine/pipeline/step.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { buildEffectiveProfile, referenceProfile, type EffectiveProfile } from '../../src/ai/profile.js';

export const MASTERS: GameMasters = {
  actions: ACTION_MASTERS,
  enemies: ENEMY_MASTERS,
  scenes: SCENE_MASTERS,
  books: BOOK_MASTERS,
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
  readonly limit: number; // expected_length の1.5倍（[V-TEST-NONFUNC] D-02）
  // D-02・D-08 の合否。「決着」は勝敗の確定であり、敗北も決着に数える（[V-TEST-REFAI] の目標勝率は
  // ボスで 40%・5-10 で 25% を見込むため、1試行の敗北は膠着の徴候ではない）。
  readonly within: boolean;
}

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
  const provider = createAiDecisionProvider(playerProfile, STEP_DEPS);
  for (const unit of instructableMine(state)) {
    const decision = provider(state, unit);
    if (decision.kind === 'ACT') {
      return instruct(session, ctx, unit.unit_id, decision.instanceId, options);
    }
  }
  return resumeTime(session, ctx, options);
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
): SceneOutcome {
  const sceneId = session.data.run.current_scene_id;
  const scene = SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS];
  const limit = decisionLimit(scene.expected_length);
  const options = advanceOptionsFor(observe);
  // [V-TEST-NONFUNC] D-02 の決着上限で打ち切る。上限を越えた戦闘はその時点で D-02 に不合格が
  // 確定しており、以降を進めても判定は変わらない。expected_length を持たないシーン（5-11）は
  // D-02 の対象外（[M-TMPL-VESSEL]）であり上限を導けないため、安全弁のみを用いる。
  const abortStep = abortAt ?? (scene.expected_length === null ? HARD_STEP_CAP : limit);

  let result = initial;
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
      return { scene_id: sceneId, result, steps, limit, within: false };
    }
    result =
      result === 'RUNNING'
        ? resumeBattle(session, ctx, options)
        : playOneOperation(session, ctx, policy, options, playerProfile);
    steps = session.data.run.battle_state?.step ?? steps;
  }
  return { scene_id: sceneId, result, steps, limit, within: (result === 'WIN' || result === 'LOSS') && steps <= limit };
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
): SceneOutcome {
  const started = startBattle(session, ctx, advanceOptionsFor(observe));
  return driveBattle(session, ctx, policy, playerProfile, started, observe, abortAt);
}

// [V-TEST-REFAI]「継承の選択規則」。
function chooseInherit(pool: readonly InheritTarget[], policy: RefPolicy, turn: number): InheritTarget | null {
  const actions = pool.filter((target): target is { kind: 'ACTION'; class_id: string } => target.kind === 'ACTION');
  const maxHp = pool.find((target) => target.kind === 'MAX_HP') ?? null;
  const paramOf = (target: { class_id: string }, key: 'atk' | 'dmg_hp' | 'deploy_ap') =>
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
  const cycle: Array<'atk' | 'charge_pp' | 'deploy_ap'> = ['atk', 'charge_pp', 'deploy_ap'];
  for (let offset = 0; offset < cycle.length; offset += 1) {
    const key = cycle[(turn + offset) % cycle.length];
    const found = actions.find(
      (target) => ACTION_MASTERS[target.class_id as keyof typeof ACTION_MASTERS].params[key] > 0,
    );
    if (found !== undefined) {
      return found;
    }
  }
  return maxHp ?? actions[0] ?? null;
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

// 継承プールの FLAG_MIND を持つ項目のうち加算VPが最大のもの（同値ならプールの走査順で最初のもの）。
export function chooseMindRefill(pool: readonly InheritTarget[]): InheritTarget | null {
  let best: { target: InheritTarget; gainVp: number } | null = null;
  for (const target of pool) {
    if (target.kind !== 'ACTION') {
      continue;
    }
    const record = ACTION_MASTERS[target.class_id as keyof typeof ACTION_MASTERS];
    if (record === undefined || !deriveSysFlags(record.params).includes('FLAG_MIND')) {
      continue;
    }
    if (best === null || record.params.gain_vp > best.gainVp) {
      best = { target, gainVp: record.params.gain_vp };
    }
  }
  return best?.target ?? null;
}

// インターミッションを決済まで進める。継承・補充はいずれも決定論規約（従者ID昇順）に従う。
export function playIntermission(session: GameSession, ctx: GameContext, policy: RefPolicy, turn: number): void {
  const run = session.data.run;
  if (policy !== 'PASSIVE') {
    // [V-TEST-REFAI]［リソース生成手段の維持］判定はインターミッション開始時に1度だけ行い、
    // 読み替えは当該インターミッションの継承枠1件に限る。
    let refillMind = (policy === 'ATTACK' || policy === 'DEFENSE') && mindUsesLeft(run) <= 1;
    for (const member of [...run.party].sort((left, right) => left.attendant_id.localeCompare(right.attendant_id))) {
      if (member.inherit_state !== 'UNUSED') {
        continue;
      }
      const pool = inheritPool(run, MASTERS);
      const refill = refillMind ? chooseMindRefill(pool) : null;
      const target = refill ?? chooseInherit(pool, policy, turn);
      if (target === null) {
        continue;
      }
      if (refill !== null) {
        refillMind = false;
      }
      confirmInherit(session, ctx, member.attendant_id, target);
    }
  }

  if (isActTransition(run, MASTERS)) {
    enterTransition(session, ctx);
    const preference = PARTY_PREFERENCE[policy];
    while (run.party.length < refillCapacity(run, MASTERS)) {
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
): RunOutcome {
  const { session, ctx } = createRun();

  const scenes: SceneOutcome[] = [];
  for (let turn = 0; turn < lastOrder; turn += 1) {
    const observe = observeFor?.(session.data.run.current_scene_id);
    const outcome = playScene(session, ctx, policy, observe, playerProfile, abortAt);
    scenes.push(outcome);
    if (outcome.result !== 'WIN') {
      return { scenes, completed: false };
    }
    if (turn + 1 >= lastOrder) {
      break;
    }
    playIntermission(session, ctx, policy, turn);
  }
  return { scenes, completed: true };
}
