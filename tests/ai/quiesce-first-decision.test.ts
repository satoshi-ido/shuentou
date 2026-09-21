// [A-SEARCH-QUIESCE]［延長中の決定点］[A-EVAL-TTK]［延長中の決定点からの計画］
// 発生の長い手の直後の葉で、延長中に相手が行動しうる時間を TTK に算入する。

import { describe, expect, it } from 'vitest';
import { cloneState } from '../../src/ai/clone.js';
import { evaluateLeafPosition } from '../../src/ai/evaluate.js';
import { referenceProfile } from '../../src/ai/profile.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import type { BattleState } from '../../src/engine/types.js';
import { createDuel, findUnit, martialAction, NO_SUMMON_DEPS, setStartup } from './fixtures.js';

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
