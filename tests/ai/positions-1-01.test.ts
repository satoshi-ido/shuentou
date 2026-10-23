// [V-TEST-POSITIONS] 1-01（祠守レフ戦）の実データによる局面。
// T-12：開幕（ステップ0）では実行可能手なしの正常処理としてパスが選ばれ、自動進行する（[V-NUM-OPENING]）。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import { executableActions, type DecisionProvider } from '../../src/engine/decision.js';
import { runStepBody } from '../../src/engine/pipeline/step.js';
import { runStepEnd } from '../../src/engine/pipeline/stepend.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { TTK_MAX } from '../../src/ai/constants.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import { ttk } from '../../src/ai/ttk.js';
import { startBattle } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { createScene } from '../../src/engine/setup.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { defaultProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { createReferenceDecisionProvider } from '../../src/ai/refai.js';
import { createContext } from '../engine/game-fixtures.js';
import { chosenClassId, findUnit, NO_SUMMON_DEPS } from './fixtures.js';

// [A-PROFILE-TABLE] 1-01 に割り当てられた狂乱プロファイルの PASS 減点。
const FRENZY_PASS = -800;

function lefOpening() {
  const state = createScene({
    sceneLevel: 3,
    heroMaxHp: 60,
    heroActionOrder: HERO_INIT_ACTIONS,
    enemyRecord: ENEMY_MASTERS.ENEMY_LEF,
    actionMasters: ACTION_MASTERS,
  });
  return { state, hero: findUnit(state, 'MINE'), enemy: findUnit(state, 'FOE') };
}

describe('[V-TEST-POSITIONS] T-12 実行可能手なしの正常処理・自動進行', () => {
  it('T-12: 既定の PASS 減点下で、敵は心気（無想）を撃たずパスする', () => {
    const { state, hero, enemy } = lefOpening();
    expect(executableActions(state, hero)).toEqual([]);
    expect(executableActions(state, enemy).map((a) => a.master_ref)).toEqual(['ACT_MUSOU_AR3']);
    expect(chosenClassId(state, enemy, defaultProfile())).toBe('PASS');
  });

  // 定跡を無効にすると、敗れる見込みの敵は自身のHPを損耗に数えず（[A-EVAL-TTK]［予測損耗］）、PASS −800 の下では
  // 効果ゼロの心気（無想）を選ぶ。1-01 では定跡 B-01①の待機がパスを与える（[V-NUM-OPENING]）。
  it('T-12: 狂乱プロファイルの PASS −800 下でも、1-01 の定跡によりパスする', () => {
    const { state, enemy } = lefOpening();
    const frenzy: EffectiveProfile = {
      ...defaultProfile(),
      bookId: ENEMY_MASTERS.ENEMY_LEF.book_id,
      actionBonus: { PASS: FRENZY_PASS },
    };
    expect(chosenClassId(state, enemy, frenzy)).toBe('PASS');
  });

  // 再探索抑制（[A-SEARCH-REUSE]）を通さず全ステップで探索するため実行時間が長い。
  // ステップ147の心気は 1-01 の定跡 B-01①が与える（[A-BOOK-TABLE]）。定跡を無効にした探索は、拍止めの
  // 評価と候補手の規則（[A-EVAL-TTK]・[A-SEARCH-MOVEGEN]）のもとで心気を撃たずにパスする（[V-NUM-OPENING]）。
  it('T-12: バトル開始から敵軍AIを通して自動進行し、ステップ147まで行動が発生しない', { timeout: 120_000 }, () => {
    const ctx = {
      ...createContext({ saves: [] }),
      foeDecision: createAiDecisionProvider(
        { ...defaultProfile(), bookId: ENEMY_MASTERS.ENEMY_LEF.book_id, actionBonus: { PASS: FRENZY_PASS } },
        NO_SUMMON_DEPS,
      ),
    };
    const session = newGameSession(ctx);
    expect(startBattle(session, ctx)).toBe('PAUSED');
    const state = session.data.run.battle_state!;
    // [V-NUM-OPENING] ステップ147に心気（基本）が実行可能となり、敵はこれを発生させる。時間停止はその
    // 開始事由（ENEMY_START）で成立し、敵はHPコスト2を支払い済みである。
    expect(state.step).toBe(147);
    expect(state.pause_reason?.code).toBe('ENEMY_START');
    const enemy = findUnit(state, 'FOE');
    expect(enemy.last_act?.class_id).toBe('ACT_MIND_AR3');
    expect(findUnit(state, 'MINE').hp).toBe(60);
    expect(enemy.hp).toBe(8);
  });
});

describe('[V-TEST-POSITIONS] T-19 定跡 B-01 の意図（壁不変条件の実地成立と命中不能技の除外）', () => {
  // 敵は B-01 どおり心気（基本）AR3 → 体勢（基本）AR6（AP23）と進み、主人公は開幕の心気でPP2を得る。
  // 以降の主人公は参照プレイヤーAI（[V-TEST-REFAI]）が操作する。
  function play(until: (state: BattleState, started: readonly string[]) => boolean, limit: number) {
    const { state } = lefOpening();
    const foe = createAiDecisionProvider({ ...defaultProfile(), bookId: 'B-01', actionBonus: { PASS: FRENZY_PASS } }, NO_SUMMON_DEPS);
    const refai = createReferenceDecisionProvider(NO_SUMMON_DEPS);
    const heroStarted: string[] = [];
    const decisionFor: DecisionProvider = (s, u) => {
      if (u.side === 'FOE') {
        return foe(s, u);
      }
      if (s.step <= 147) {
        const mind = executableActions(s, u).find((a) => a.master_ref === 'ACT_MIND_AR3');
        return mind === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: mind.instance_id };
      }
      const decision = refai(s, u);
      if (decision.kind === 'ACT') {
        heroStarted.push(u.acts.find((a) => a.instance_id === decision.instanceId)!.master_ref);
      }
      return decision;
    };
    for (let i = 0; i < limit && !until(state, heroStarted); i += 1) {
      runStepBody(state, decisionFor, NO_SUMMON_DEPS);
      if (until(state, heroStarted)) {
        break;
      }
      runStepEnd(state);
    }
    return { state, heroStarted };
  }

  it('T-19: 主人公は武技AR3・AR6を撃たず、ステップ157に武技（重撃）AR7を選び、体勢AR6の硬直明けの後に着弾させる', { timeout: 300_000 }, () => {
    // 敵の体勢AR6（AP23）が着地して硬直に入った局面（ステップ185、防御力46）。主人公の武技（重撃）AR7 は発生中。
    const landed = play((s) => findUnit(s, 'FOE').state === 'RECOVERY', 400);
    expect(landed.state.step).toBe(185);
    const enemyAt185 = findUnit(landed.state, 'FOE');
    expect(enemyAt185.ap).toBe(23);
    expect(enemyAt185.state).toBe('RECOVERY');
    expect(findUnit(landed.state, 'MINE').last_act?.class_id).toBe('ACT_HEAVY_AR7');
    expect(landed.heroStarted).toEqual(['ACT_HEAVY_AR7']);
    // 着弾（311）は硬直明け（268、AP11）の後であり、攻撃力37で壁を割って HP8 → 2 とする。
    const hit = play((s) => findUnit(s, 'FOE').hp < 8, 400);
    expect(hit.state.step).toBe(311);
    expect(findUnit(hit.state, 'FOE').ap).toBe(11);
    expect(findUnit(hit.state, 'FOE').hp).toBe(2);
    expect(hit.heroStarted).toEqual(['ACT_HEAVY_AR7']);
  });

  it('T-19: TTK(主→敵) は壁を割れない武技AR3・AR6を除外し、武技（重撃）AR7を主軸とする', { timeout: 300_000 }, () => {
    const { state } = play((s) => findUnit(s, 'FOE').state === 'RECOVERY', 400);
    // [A-SEARCH-QUIESCE]［評価対象］生存項は静止局面で求める。
    const quiet = structuredClone(state);
    const { trace } = runQuiescence(quiet, NO_SUMMON_DEPS);
    const hero = findUnit(quiet, 'MINE');
    const enemy = findUnit(quiet, 'FOE');
    const withOnly = (classIds: readonly string[]): Unit => ({ ...hero, acts: hero.acts.filter((a) => classIds.includes(a.master_ref)) });
    const inputs = { trace, level: state.scene_level, offset: trace.length - 1 };
    expect(ttk(withOnly(['ACT_SLASH_AR3', 'ACT_MIND_AR3']), enemy, inputs)).toBe(TTK_MAX);
    expect(ttk(withOnly(['ACT_SLASH_AR6', 'ACT_MIND_AR3']), enemy, inputs)).toBe(TTK_MAX);
    const heavy = ttk(withOnly(['ACT_HEAVY_AR7', 'ACT_MIND_AR3']), enemy, inputs);
    expect(heavy).toBeLessThan(TTK_MAX);
    expect(ttk(hero, enemy, inputs)).toBe(heavy);
  });
});
