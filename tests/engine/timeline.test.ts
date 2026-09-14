// [M-UI-TIMELINE]

import { describe, expect, it } from 'vitest';
import { simulateTimeline, timelineSpan } from '../../src/engine/timeline.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS, setStartup } from '../ai/fixtures.js';

const WAIT = makeAction('ACT_WAIT', { gain_vp: 1, step_thought: 999, step_startup: 5, step_recovery: 5 });

describe('[M-UI-TIMELINE] 未来予測シミュレーション', () => {
  it('発生中 → 硬直中 → 思考中の区間を並べ、思考中は表示枠の末尾までの継続区間とする', () => {
    const BIG = martialAction('HERO_BIG', { atk: 0, dmg_hp: 0, step_startup: 10, step_recovery: 5 });
    const state = createDuel({ heroMaxHp: 60, heroActs: [BIG], enemyMaxHp: 60, enemyActs: [WAIT] });
    state.step = 100;
    const hero = findUnit(state, 'MINE');
    const enemy = findUnit(state, 'FOE');
    setStartup(hero, 'HERO_BIG', 4);
    enemy.ap = 99; // 武技は回避され、盤面は変わらない
    enemy.elapsed_thought = 30;
    const before = JSON.stringify(state);

    const timeline = simulateTimeline(state, 30, NO_SUMMON_DEPS);

    expect(JSON.stringify(state)).toBe(before);
    expect(timeline.start).toBe(100);
    const heroLane = timeline.lanes.find((lane) => lane.unitId === hero.unit_id);
    expect(heroLane?.segments).toEqual([
      { kind: 'STARTUP', start: 100, length: 6, instanceId: hero.last_act?.instance_id, elapsedAtStart: 4, required: 10 },
      { kind: 'RECOVERY', start: 106, length: 5, instanceId: hero.last_act?.instance_id, elapsedAtStart: 0, required: 5 },
      { kind: 'THOUGHT', start: 111, length: 19, instanceId: null, elapsedAtStart: 0, required: null },
    ]);
    const enemyLane = timeline.lanes.find((lane) => lane.unitId === enemy.unit_id);
    expect(enemyLane?.segments).toEqual([
      { kind: 'THOUGHT', start: 100, length: 30, instanceId: null, elapsedAtStart: 30, required: null },
    ]);
  });

  it('展開中のスタンで経過思考が0へ戻った時点で思考中区間を分ける', () => {
    const STUN = martialAction('FOE_STUN', { atk: 5, dmg_hp: 0, stun: true, step_startup: 10, step_recovery: 5 });
    const state = createDuel({ heroMaxHp: 60, heroActs: [WAIT], enemyMaxHp: 60, enemyActs: [STUN] });
    const hero = findUnit(state, 'MINE');
    hero.elapsed_thought = 50;
    setStartup(findUnit(state, 'FOE'), 'FOE_STUN', 7);

    const timeline = simulateTimeline(state, 25, NO_SUMMON_DEPS);

    expect(timeline.lanes.find((lane) => lane.unitId === hero.unit_id)?.segments).toEqual([
      { kind: 'THOUGHT', start: 0, length: 3, instanceId: null, elapsedAtStart: 50, required: null },
      { kind: 'THOUGHT', start: 3, length: 22, instanceId: null, elapsedAtStart: 0, required: null },
    ]);
  });

  it('表示枠を越える区間は枠の末尾で切り詰め、以降は展開しない', () => {
    const LONG = martialAction('HERO_LONG', { atk: 0, dmg_hp: 0, step_startup: 100, step_recovery: 5 });
    const state = createDuel({ heroMaxHp: 60, heroActs: [LONG], enemyMaxHp: 60, enemyActs: [WAIT] });
    const hero = findUnit(state, 'MINE');
    setStartup(hero, 'HERO_LONG', 0);

    const timeline = simulateTimeline(state, 20, NO_SUMMON_DEPS);

    expect(timeline.lanes.find((lane) => lane.unitId === hero.unit_id)?.segments).toEqual([
      { kind: 'STARTUP', start: 0, length: 20, instanceId: hero.last_act?.instance_id, elapsedAtStart: 0, required: 100 },
    ]);
  });
});

describe('[M-UI-TIMELINE] 表示枠の幅', () => {
  it('実効必要発生＋実効必要硬直の平均の1.4倍を四捨五入する', () => {
    const A = makeAction('A', { gain_vp: 1, step_startup: 10, step_recovery: 5 }); // 15
    const B = makeAction('B', { gain_vp: 1, step_startup: 20, step_recovery: 10 }); // 30
    const state = createDuel({ heroMaxHp: 60, heroActs: [A], enemyMaxHp: 60, enemyActs: [B] });
    expect(timelineSpan(state)).toBe(32); // round(22.5 × 1.4) = round(31.5)
  });

  it('300以上の長さを除外し、20〜60 にクランプし、該当なしは 22 とする', () => {
    const SHORT = makeAction('S', { gain_vp: 1, step_startup: 1, step_recovery: 0 });
    const HUGE = makeAction('H', { gain_vp: 1, step_startup: 300, step_recovery: 0 });
    const FLASH = makeAction('F', { gain_vp: 1, step_startup: 0, step_recovery: 0 });
    const LONG = makeAction('L', { gain_vp: 1, step_startup: 200, step_recovery: 50 });
    expect(timelineSpan(createDuel({ heroMaxHp: 1, heroActs: [SHORT], enemyMaxHp: 1, enemyActs: [HUGE] }))).toBe(20);
    expect(timelineSpan(createDuel({ heroMaxHp: 1, heroActs: [LONG], enemyMaxHp: 1, enemyActs: [FLASH] }))).toBe(60);
    expect(timelineSpan(createDuel({ heroMaxHp: 1, heroActs: [FLASH], enemyMaxHp: 1, enemyActs: [HUGE] }))).toBe(22);
  });
});
