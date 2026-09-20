// [I-STATE-JSON] 探索器の複製がJSON往復と同じ結果を返すことを検査する。
import { describe, expect, it } from 'vitest';
import { cloneState } from '../../src/ai/clone.js';
import { createDuel, findUnit, makeAction, martialAction, setRecovery, NO_SUMMON_DEPS } from './fixtures.js';
import { advanceStep } from '../../src/engine/pipeline/step.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { referenceProfile } from '../../src/ai/profile.js';

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

describe('[M-STATE-ACTION] バトル中の静的パラメータの不変性', () => {
  it('静的パラメータと系統フラグを凍結してもバトルが進行する', () => {
    // 探索用の複製はこれらを参照共有する（src/ai/clone.ts）。書き込みがあれば strict mode の
    // 代入で TypeError となるため、凍結したまま進行できることが共有の前提を担保する。
    const state = createDuel({
      heroMaxHp: 60,
      heroActs: [
        martialAction('ACT_SLASH', { step_thought: 3, step_startup: 2, cost_pp: 0 }),
        makeAction('ACT_MIND', { gain_vp: 2, charge_pp: 100, step_thought: 2 }),
      ],
      enemyMaxHp: 40,
      enemyActs: [martialAction('ACT_HEAVY', { step_thought: 4, step_startup: 3, stun: true })],
    });
    for (const unit of state.units) {
      if (unit === null) {
        continue;
      }
      for (const action of unit.acts) {
        Object.freeze(action.base_params);
        Object.freeze(action.merge_params);
        Object.freeze(action.sys_flags);
      }
    }
    const provider = createAiDecisionProvider(referenceProfile(), NO_SUMMON_DEPS);
    for (let step = 0; step < 60; step += 1) {
      const { outcome } = advanceStep(state, provider, NO_SUMMON_DEPS);
      if (outcome !== 'NONE') {
        return;
      }
    }
  });
});
