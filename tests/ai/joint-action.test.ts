// [A-SEARCH-ROOT]［joint action の規則］同時手の組を1エッジ（1 ply・1ノード）として探索すること、
// および [A-LATE-5-10]「探索木内の順序」（自軍 → 敵軍）と根での自軍の決定済み扱い。

import { describe, expect, it } from 'vitest';
import type { BattleState } from '../../src/engine/types.js';
import { cloneState } from '../../src/ai/clone.js';
import { MATE_TH } from '../../src/ai/constants.js';
import { defaultProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { decideActionDetailed } from '../../src/ai/search.js';
import { firstPendingUnit } from '../../src/ai/step-driver.js';
import {
  createDuel,
  findUnit,
  makeAction,
  martialAction,
  moveUnit,
  NO_SUMMON_DEPS,
  placeUnit,
  setStartup,
} from './fixtures.js';

const MIND_M = makeAction('MIND_M', { gain_vp: 10, step_startup: 5 });
const MIND_C = makeAction('MIND_C', { gain_vp: 10, step_startup: 5 });
const MIND_H = makeAction('MIND_H', { gain_vp: 10, step_startup: 5 });

// 敵軍：前列 idx 2 にクリーチャー、後列 idx 3 にマスター（[M-FIELD-GRID]）。自軍：前列 idx 1 に主人公。
// [M-PIPE-P8-ORDER]#1 のループ順ではクリーチャーが先、マスターが後となる。
function jointPosition(): BattleState {
  const state = createDuel({ heroMaxHp: 60, heroActs: [MIND_H], enemyMaxHp: 60, enemyActs: [MIND_M] });
  moveUnit(state, findUnit(state, 'FOE'), 3);
  placeUnit(state, {
    side: 'FOE',
    kind: 'CREATURE',
    pos: 2,
    maxHp: 30,
    acts: [MIND_C],
    counter: { instance_id_seq: state.instance_id_seq + 100 },
  });
  return state;
}

const profileOf = (partial: Partial<EffectiveProfile>): EffectiveProfile => ({
  ...defaultProfile(),
  nodeLimit: 100_000,
  ...partial,
});

describe('[A-SEARCH-ROOT]［joint action の規則］', () => {
  it('組は1手・1ノードであり、深さ1の根で全組（2×2）を評価する', () => {
    const state = jointPosition();
    const creature = findUnit(state, 'FOE', 'CREATURE');
    const joint = decideActionDetailed(state, creature, profileOf({ maxDepth: 1, jointAction: true }), NO_SUMMON_DEPS);
    const single = decideActionDetailed(state, creature, profileOf({ maxDepth: 1, jointAction: false }), NO_SUMMON_DEPS);
    expect(joint.nodesConsumed).toBe(4);
    expect(single.nodesConsumed).toBe(2);
  });

  it('相方が思考中でなければ単独の手に退化する', () => {
    const state = jointPosition();
    setStartup(findUnit(state, 'FOE'), 'MIND_M', 0);
    const creature = findUnit(state, 'FOE', 'CREATURE');
    const result = decideActionDetailed(state, creature, profileOf({ maxDepth: 1, jointAction: true }), NO_SUMMON_DEPS);
    expect(result.nodesConsumed).toBe(2);
  });

  it('ループ順で後のユニットへの問い合わせでは、先のユニットを相方としない', () => {
    const state = jointPosition();
    const master = findUnit(state, 'FOE');
    const result = decideActionDetailed(state, master, profileOf({ maxDepth: 1, jointAction: true }), NO_SUMMON_DEPS);
    expect(result.nodesConsumed).toBe(2);
  });

  it('根では組の両手にアクション種別ボーナスを加算する', () => {
    const state = jointPosition();
    const creature = findUnit(state, 'FOE', 'CREATURE');
    const scoreOf = (actionBonus: EffectiveProfile['actionBonus'], jointAction: boolean) =>
      decideActionDetailed(state, creature, profileOf({ maxDepth: 1, jointAction, actionBonus }), NO_SUMMON_DEPS);
    const base = scoreOf({ PASS: -5000 }, true);
    const bonused = scoreOf({ PASS: -5000, MIND: 300 }, true);
    expect(bonused.decision).toEqual(base.decision);
    expect(bonused.score - base.score).toBe(600);
    const singleBase = scoreOf({ PASS: -5000 }, false);
    const singleBonused = scoreOf({ PASS: -5000, MIND: 300 }, false);
    expect(singleBonused.score - singleBase.score).toBe(300);
  });

  // [D-05] joint action のシーンでも3経路で手・スコア・消費ノード数が一致する。
  it('[D-05] 初回探索・別局面を挟んだ再探索・復帰後の再探索で一致する', () => {
    const prof = profileOf({ maxDepth: 3, nodeLimit: 20_000, jointAction: true });
    const baseline = jointPosition();
    const first = decideActionDetailed(cloneState(baseline), findUnit(baseline, 'FOE', 'CREATURE'), prof, NO_SUMMON_DEPS);
    const other = jointPosition();
    setStartup(findUnit(other, 'FOE'), 'MIND_M', 2);
    decideActionDetailed(other, findUnit(other, 'FOE', 'CREATURE'), prof, NO_SUMMON_DEPS);
    const restored = cloneState(baseline);
    const again = decideActionDetailed(restored, findUnit(restored, 'FOE', 'CREATURE'), prof, NO_SUMMON_DEPS);
    expect(again).toEqual(first);
    expect(restored).toEqual(baseline); // [A-CORE-DETERMINISM]#6 探索は局面を変更しない
  });
});

describe('[A-LATE-5-10]「探索木内の順序」', () => {
  it('同一ステップ内の決定点を、既定では敵軍 → 自軍、反転時は自軍 → 敵軍の順に並べる', () => {
    const state = jointPosition();
    expect(firstPendingUnit(state, [])?.side).toBe('FOE');
    expect(firstPendingUnit(state, [], true)?.side).toBe('MINE');
  });

  // 敵は次のステップに着弾する致死の一撃を、主人公は即発の致死の一撃を持つ。
  function lethalRace(): BattleState {
    const foeStrike = martialAction('FOE_STRIKE', { atk: 99, dmg_hp: 5000, step_startup: 1 });
    const heroStrike = martialAction('HERO_STRIKE', { atk: 99, dmg_hp: 5000, step_startup: 0, step_recovery: 1 });
    return createDuel({ heroMaxHp: 60, heroActs: [heroStrike], enemyMaxHp: 60, enemyActs: [foeStrike] });
  }

  it('反転時の根では、同一ステップの自軍の決定を済んだものとして扱う', () => {
    const state = lethalRace();
    const foe = findUnit(state, 'FOE');
    // 既定の順序では、敵の着手に主人公が同じステップで即発の一撃を返すため、敵は勝ちを見込めない。
    const normal = decideActionDetailed(state, foe, profileOf({ maxDepth: 2 }), NO_SUMMON_DEPS);
    expect(normal.score).toBeLessThan(0);
    // 反転時は主人公の当該ステップの決定が済んでおり、敵の一撃が次のステップの冒頭で先に着弾する。
    const deferred = decideActionDetailed(state, foe, profileOf({ maxDepth: 2, deferredDecision: true }), NO_SUMMON_DEPS);
    expect(deferred.score).toBeGreaterThanOrEqual(MATE_TH);
    expect(deferred.decision.kind).toBe('ACT');
  });
});
