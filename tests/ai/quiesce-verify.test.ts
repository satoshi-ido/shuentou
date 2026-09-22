// [A-SEARCH-QUIESCE]［決着の確認］静止探索が返した決着のうち、延長中に敗れる側の決定点が
// 現れたものは確定とせず、決定点1つ分の延長で確認する。

import { describe, expect, it } from 'vitest';
import { QMATE } from '../../src/ai/constants.js';
import { evaluateLeafPosition } from '../../src/ai/evaluate.js';
import { referenceProfile } from '../../src/ai/profile.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import { cloneState } from '../../src/ai/clone.js';
import { decideActionDetailed } from '../../src/ai/search.js';
import type { BattleState } from '../../src/engine/types.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS, setStartup } from './fixtures.js';

// 主人公の致死武技が発生中であり、敵マスターは thought の要否だけが異なる局面を組む。
function lethalInFlight(enemyThought: number): BattleState {
  const state = createDuel({
    heroMaxHp: 60,
    heroActs: [martialAction('ACT_KILL', { atk: 999, dmg_hp: 999, step_startup: 3 })],
    enemyMaxHp: 20,
    enemyActs: [makeAction('ACT_GUARD', { deploy_ap: 30, step_thought: enemyThought, step_startup: 1 })],
  });
  setStartup(findUnit(state, 'MINE'), 'ACT_KILL', 0);
  return state;
}

describe('[A-SEARCH-QUIESCE]［決着の確認］', () => {
  it('延長中に敗れる側の決定点が現れたとき、決着を確認の対象とする', () => {
    const state = lethalInFlight(0);
    const { outcome, decided } = runQuiescence(cloneState(state), NO_SUMMON_DEPS);
    expect(outcome).toBe('WIN');
    expect(decided.FOE).toBe(true);

    const leaf = evaluateLeafPosition(state, referenceProfile(), 0, NO_SUMMON_DEPS);
    expect(leaf.refutableSettlement).toBe(true);
  });

  it('敗れる側に決定点がないとき、決着をそのまま確定として評価する', () => {
    const state = lethalInFlight(50);
    const { outcome, decided } = runQuiescence(cloneState(state), NO_SUMMON_DEPS);
    expect(outcome).toBe('WIN');
    expect(decided.FOE).toBe(false);

    const leaf = evaluateLeafPosition(state, referenceProfile(), 0, NO_SUMMON_DEPS);
    expect(leaf.refutableSettlement).toBe(false);
    expect(leaf.value).toBeLessThan(-QMATE + 100);
  });

  it('確認の延長により、敵の応手で覆る決着は決着のスコアで返さない', () => {
    // 主人公は発生3の致死武技を持ち、敵は即時に実効防御を上げられる。静止探索は敵の応手を
    // 仮定しないため決着を返すが、確認の延長では敵が体勢を選んで生き延びる。
    const state = createDuel({
      heroMaxHp: 60,
      heroActs: [martialAction('ACT_KILL', { atk: 40, dmg_hp: 999, step_startup: 3 })],
      enemyMaxHp: 20,
      enemyActs: [makeAction('ACT_GUARD', { deploy_ap: 60, step_thought: 0, step_startup: 1 })],
    });
    const hero = findUnit(state, 'MINE');
    const result = decideActionDetailed(state, hero, { ...referenceProfile(), maxDepth: 1 }, NO_SUMMON_DEPS);
    // 確認を行わなければ、致死武技が -QMATE 近傍の決着スコアを得て最善手となる。確認の延長では
    // 敵が体勢を選んで生き延びるため、根の確定スコアは通常の評価範囲に収まる。
    expect(Math.abs(result.score)).toBeLessThan(QMATE - 1000);
  });
});
