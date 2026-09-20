// [I-STATE-JSON] 探索器の複製がJSON往復と同じ結果を返すことを検査する。
import { describe, expect, it } from 'vitest';
import { cloneState } from '../../src/ai/clone.js';
import { createDuel, findUnit, makeAction, martialAction, setRecovery } from './fixtures.js';

const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('[I-STATE-JSON] 探索器の状態複製', () => {
  it('バトルステートの複製がJSON往復と一致する', () => {
    const state = createDuel({
      heroMaxHp: 60,
      heroActs: [martialAction('ACT_SLASH', { step_thought: 10 }), makeAction('ACT_GUARD', { deploy_ap: 20 })],
      enemyMaxHp: 40,
      enemyActs: [martialAction('ACT_HEAVY', { step_startup: 9, stun: true })],
    });
    setRecovery(findUnit(state, 'FOE'), 'ACT_HEAVY', 4, 1);
    expect(cloneState(state)).toEqual(jsonClone(state));
  });

  it('複製は元のステートと独立である', () => {
    const state = createDuel({
      heroMaxHp: 30,
      heroActs: [martialAction('ACT_SLASH', {})],
      enemyMaxHp: 30,
      enemyActs: [martialAction('ACT_SLASH', {})],
    });
    const copy = cloneState(state);
    const hero = findUnit(copy, 'MINE');
    hero.hp -= 7;
    hero.acts[0].uses_left -= 1;
    expect(findUnit(state, 'MINE').hp).toBe(30);
    expect(findUnit(state, 'MINE').acts[0].uses_left).not.toBe(hero.acts[0].uses_left);
  });

  it('JSONで表現できる値（配列・素のオブジェクト・null・真偽値）を保つ', () => {
    const value = { a: [1, 2, [3, null]], b: { c: true, d: 'x' }, e: null, f: -1 };
    expect(cloneState(value)).toEqual(jsonClone(value));
  });
});
