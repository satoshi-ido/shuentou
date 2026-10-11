// [A-SEARCH-QUIESCE]［延長中の決定点］[A-EVAL-TTK]［延長中の決定点からの計画］
// 発生の長い手の直後の葉で、延長中に相手が行動しうる時間を TTK に算入する。

import { describe, expect, it } from 'vitest';
import { cloneState } from '../../src/ai/clone.js';
import { evaluateLeafPosition } from '../../src/ai/evaluate.js';
import { referenceProfile } from '../../src/ai/profile.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import type { BattleState } from '../../src/engine/types.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS, placeUnit, setStartup } from './fixtures.js';

// 敵マスターは必要思考10・必要発生30の致死武技を持つ。主人公は必要発生90の武技を発生中である。
function heroCommitted(): BattleState {
  const state = createDuel({
    heroMaxHp: 100,
    heroActs: [martialAction('HERO_LONG', { atk: 5, dmg_hp: 100, step_startup: 90, step_recovery: 10 })],
    enemyMaxHp: 1000,
    enemyActs: [martialAction('FOE_KILL', { atk: 40, dmg_hp: 99900, step_thought: 10, step_startup: 30, step_recovery: 10 })],
  });
  setStartup(findUnit(state, 'MINE'), 'HERO_LONG', 0);
  return state;
}

describe('[A-SEARCH-QUIESCE]［延長中の決定点］', () => {
  it('発生中の主人公は決定点を持たず、敵マスターは必要思考を満たした時点が最初の決定点となる', () => {
    const { firstDecision, trace } = runQuiescence(cloneState(heroCommitted()), NO_SUMMON_DEPS);
    expect(firstDecision.FOE?.index).toBe(10);
    // 主人公の最初の決定点は着地後であり、延長の範囲内に現れない。
    expect(firstDecision.MINE === null || firstDecision.MINE.index >= trace.length - 1).toBe(true);
    // 記録は当該時点の両マスターの写しであり、延長の進行に追従しない。
    expect(firstDecision.FOE?.foe.elapsed_thought).toBe(10);
  });
});

describe('[A-EVAL-TTK]［延長中の決定点からの計画］', () => {
  // 敵マスターの致死武技の必要思考だけが異なる2局面を比べる。延長中（主人公の発生90歩）に敵が行動
  // しうる局面（必要思考10）は、行動しえない局面（必要思考95）より主人公にとって明確に悪い。
  // 延長中の敵の行動を評価から落とすと、両者の te は 120 と 125 でほぼ並ぶ（実測で差は52）。
  function leafValue(enemyThought: number): number {
    const state = createDuel({
      heroMaxHp: 100,
      heroActs: [martialAction('HERO_LONG', { atk: 5, dmg_hp: 100, step_startup: 90, step_recovery: 10 })],
      enemyMaxHp: 1000,
      enemyActs: [
        martialAction('FOE_KILL', { atk: 40, dmg_hp: 99900, step_thought: enemyThought, step_startup: 30, step_recovery: 10 }),
      ],
    });
    setStartup(findUnit(state, 'MINE'), 'HERO_LONG', 0);
    return evaluateLeafPosition(state, referenceProfile(), 1, NO_SUMMON_DEPS).value;
  }

  it('延長中に行動しうる相手の TTK を、その最初の決定点から数える', () => {
    // 評価値は敵軍側が正。実測では 4339 と 3732（補正なしでは 3784 と 3732）。
    expect(leafValue(10) - leafValue(95)).toBeGreaterThanOrEqual(300);
  });
});

describe('[A-EVAL-TTK]［延長中の決定点からの計画］延長中の妨害', () => {
  // 主人公は思考中（経過思考30）で、必要思考40・必要発生5の致死武技と、今すぐ実行できる心気を持つ（添字0が決定点）。
  // 敵クリーチャーはスタン付き武技（必要発生8）を発生中であり、延長中に着弾して主人公の経過思考を0へ戻す。
  // 敵マスターはスタン付き武技を持たないため、［妨害補正］の t_deny には該当が無い。
  function thinkingHero(): BattleState {
    const state = createDuel({
      heroMaxHp: 100,
      heroActs: [
        martialAction('HERO_SLOW', { atk: 40, dmg_hp: 99900, step_thought: 40, step_startup: 5, step_recovery: 10 }),
        makeAction('HERO_MIND', { gain_vp: 1, step_startup: 200 }),
      ],
      enemyMaxHp: 1000,
      enemyActs: [makeAction('FOE_WAIT', { gain_vp: 1, step_thought: 999 })],
    });
    findUnit(state, 'MINE').elapsed_thought = 30;
    const creature = placeUnit(state, {
      side: 'FOE',
      kind: 'CREATURE',
      pos: 3,
      maxHp: 10,
      acts: [martialAction('FOE_STUN', { atk: 40, range: 3, dmg_hp: 100, stun: true, step_startup: 8, step_recovery: 60 })],
      counter: { instance_id_seq: 500 },
    });
    setStartup(creature, 'FOE_STUN', 0);
    return state;
  }

  it('延長中に思考中のマスターの経過思考が0へ戻った添字を記録する', () => {
    const { thoughtLost, firstDecision } = runQuiescence(cloneState(thinkingHero()), NO_SUMMON_DEPS);
    expect(firstDecision.MINE?.index).toBe(0);
    expect(thoughtLost.MINE).toEqual([8]);
    expect(thoughtLost.FOE).toEqual([]);
  });

  it('参照プレイヤーAIの探索では、決定点からの計画が延長中の経過思考の喪失でやり直しとなる', () => {
    const value = (traceDeny: boolean) =>
      evaluateLeafPosition(thinkingHero(), { ...referenceProfile(), traceDeny }, 1, NO_SUMMON_DEPS).value;
    // 評価値は敵軍側が正。数えない場合、添字0からの計画（残り思考10＋発生5）が妨害なしで成立し、主人公に有利となる。
    expect(value(true)).toBeGreaterThan(value(false));
  });
});
