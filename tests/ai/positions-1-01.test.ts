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
import { startBattle } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { createScene } from '../../src/engine/setup.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { buildEffectiveProfile, defaultProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { AI_PROFILE_MASTERS } from '../../src/data/generated/ai-profile-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { createReferenceDecisionProvider } from '../../src/ai/refai.js';
import { createContext } from '../engine/game-fixtures.js';
import { chosenClassId, findUnit, NO_SUMMON_DEPS } from './fixtures.js';

// [A-PROFILE-TABLE] 1-01 に割り当てられた狂乱プロファイルの PASS 減点。
const FRENZY_PASS = 0;

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

  // 1-01 では定跡 B-01①の待機がパスを与える（[V-NUM-OPENING]）。PASS 0 は既定の −400 より緩く、
  // 定跡を無効にした探索も効果ゼロの心気（無想）を選ばない。
  it('T-12: 狂乱プロファイルの PASS 0 の下で、定跡の有無によらずパスする', () => {
    const { state, enemy } = lefOpening();
    const frenzy: EffectiveProfile = {
      ...defaultProfile(),
      bookId: ENEMY_MASTERS.ENEMY_LEF.book_id,
      actionBonus: { PASS: FRENZY_PASS },
    };
    expect(chosenClassId(state, enemy, frenzy)).toBe('PASS');
    expect(chosenClassId(state, enemy, { ...frenzy, bookId: null })).toBe('PASS');
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

describe('[V-TEST-POSITIONS] T-19 定跡 B-01 の消化後に PP を温存し、武技（重撃）へ応じる', () => {
  // 敵は B-01①の心気（基本）AR3 の後、1-01 の実効プロファイル（狂乱、PASS 0）で探索する。主人公は開幕の心気で
  // PP2 を得て、以降は参照プレイヤーAI（[V-TEST-REFAI]、PASS −1200）が操作する。heavyAt を与えると、主人公は
  // 参照プレイヤーAIに代えて、そのステップに武技（重撃）AR7 を撃ち、以後はパスする。
  function play(limit: number, heavyAt: number | null = null) {
    const { state } = lefOpening();
    const foe = createAiDecisionProvider(
      buildEffectiveProfile({ scene: SCENE_MASTERS.SCENE_1_01, enemy: ENEMY_MASTERS.ENEMY_LEF, profile: AI_PROFILE_MASTERS.PROFILE_FRENZY }),
      NO_SUMMON_DEPS,
    );
    const refai = createReferenceDecisionProvider(NO_SUMMON_DEPS);
    const started: string[] = [];
    const record = (s: BattleState, u: Unit, decision: ReturnType<DecisionProvider>) => {
      if (decision.kind === 'ACT') {
        started.push(`${s.step}:${u.side}:${u.acts.find((a) => a.instance_id === decision.instanceId)!.master_ref}`);
      }
      return decision;
    };
    const decisionFor: DecisionProvider = (s, u) => {
      if (u.side === 'FOE') {
        return record(s, u, foe(s, u));
      }
      if (s.step <= 147) {
        const mind = executableActions(s, u).find((a) => a.master_ref === 'ACT_MIND_AR3');
        return mind === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: mind.instance_id };
      }
      if (heavyAt === null) {
        return record(s, u, refai(s, u));
      }
      const heavy = executableActions(s, u).find((a) => a.master_ref === 'ACT_HEAVY_AR7');
      return record(s, u, s.step === heavyAt && heavy !== undefined ? { kind: 'ACT', instanceId: heavy.instance_id } : { kind: 'PASS' });
    };
    const foeHp: number[] = [];
    for (let i = 0; i < limit; i += 1) {
      runStepBody(state, decisionFor, NO_SUMMON_DEPS);
      foeHp.push(findUnit(state, 'FOE').hp);
      runStepEnd(state);
    }
    return { state, started, foeHp };
  }

  it('T-19: 敵は心気の後に PP2 を温存し、主人公の武技（重撃）AR7 の着弾に体勢AR6 の壁を合わせて防ぐ', { timeout: 600_000 }, () => {
    const { started, foeHp } = play(600);
    // 敵は定跡の心気の後に手を出さず、主人公が武技AR6（発生14）で先に打つ（HP8→5）。敵は返し刃（武技（特殊）、実効HPダメージ9）で応じる。
    // 主人公が心気で PP を補って武技（重撃）AR7（発生154、ステップ593に着弾）を撃つと、敵は心気で PP を補い、
    // 体勢AR6（発生28・硬直83、防御力46）を着弾に重なる 526 に発生させる。攻撃力37は壁を割れず、HP は3のまま。
    expect(started).toEqual([
      '147:FOE:ACT_MIND_AR3',
      '199:MINE:ACT_SLASH_AR6',
      '268:FOE:ACT_SPEC_RIPOSTE_LEF',
      '429:MINE:ACT_MIND_AR3',
      '439:MINE:ACT_HEAVY_AR7',
      '485:FOE:ACT_MIND_AR3',
      '526:FOE:ACT_GUARD_AR6',
    ]);
    expect(foeHp[212]).toBe(8);
    expect(foeHp[213]).toBe(5);
    expect(foeHp[485]).toBe(3); // 心気のHPコスト2
    expect(foeHp[593]).toBe(3); // 武技（重撃）AR7 の着弾を壁が防ぐ
    expect(foeHp[599]).toBe(3);
  });

  // 主人公がPPを得た直後（ステップ157）に武技（重撃）AR7（発生154、ステップ311に着弾）を撃つ局面。敵は思考中で、
  // 必要思考0の手（体勢・武技（重撃）AR3）では間に合わない。武技（重撃）AR3（発生236）は着弾が遅れて無防備な溜めを
  // 突かれる。敵は返し刃（必要思考42・発生14）が実行可能となるステップ199まで待ち、発生中の溜めを中断する（着弾213、主人公HP58→49）。
  it('T-19: 主人公がステップ157に撃つ武技（重撃）AR7 を、敵は返し刃で中断する', { timeout: 600_000 }, () => {
    const { started, foeHp, state } = play(320, 157);
    expect(started).toEqual(['147:FOE:ACT_MIND_AR3', '157:MINE:ACT_HEAVY_AR7', '199:FOE:ACT_SPEC_RIPOSTE_LEF']);
    expect(findUnit(state, 'MINE').hp).toBe(49);
    expect(foeHp[311]).toBe(8); // 中断された武技（重撃）は着弾しない
  });
});
