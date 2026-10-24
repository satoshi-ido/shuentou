// [A-SEARCH-REUSE] 盤面ハッシュ・惰性・記録。

import { describe, expect, it } from 'vitest';
import { boardHash, isSearchSuppressed, updateReuse } from '../../src/engine/reuse.js';
import { allWatchFlags } from '../../src/engine/watch.js';
import { createDuel, findUnit, makeAction, martialAction } from '../ai/fixtures.js';

const MIND = makeAction('MIND', { gain_vp: 2, charge_pp: 100, step_thought: 10, step_startup: 5, step_recovery: 5 });
const HIT = martialAction('HIT', { atk: 5, dmg_hp: 100, step_thought: 20, step_startup: 5, step_recovery: 5 });

function duel() {
  const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [MIND, HIT] });
  return { state, enemy: findUnit(state, 'FOE') };
}

describe('[A-SEARCH-REUSE]［盤面ハッシュ］', () => {
  it('step・監視系・停止事由・抑制記録を含めない', () => {
    const { state, enemy } = duel();
    const before = boardHash(state);
    state.step += 1;
    state.watching[enemy.acts[0].instance_id] = allWatchFlags(true);
    state.watch_prev_met[enemy.acts[0].instance_id] = allWatchFlags(true);
    state.pause_reason = { code: 'MANUAL_PAUSE', unit_id: null, instance_id: null, watch_kind: null, remaining_steps: null };
    state.ai_reuse[enemy.unit_id] = { hash: 1 };
    expect(boardHash(state)).toBe(before);
  });

  it('経過ステップ数を含むため、経過思考が進むと変化する', () => {
    const { state, enemy } = duel();
    const before = boardHash(state);
    enemy.elapsed_thought += 1;
    expect(boardHash(state)).not.toBe(before);
  });
});

describe('[A-SEARCH-REUSE]［記録と適用］', () => {
  it('盤面ハッシュが一致する間は抑制が成立する', () => {
    const { state, enemy } = duel();
    expect(isSearchSuppressed(state, enemy)).toBe(false);
    updateReuse(state, enemy, true);
    expect(isSearchSuppressed(state, enemy)).toBe(true);
  });

  // 惰性は M9 で廃した（[A-SEARCH-REUSE]「惰性の廃止」）。盤面が変われば次の決定点で探索する。
  it('盤面ハッシュが変われば抑制しない（惰性を持たない）', () => {
    const { state, enemy } = duel();
    updateReuse(state, enemy, true);
    state.step += 1;
    enemy.elapsed_thought += 1;
    expect(isSearchSuppressed(state, enemy)).toBe(false);
  });

  it('行動の確定では記録を削除する', () => {
    const { state, enemy } = duel();
    updateReuse(state, enemy, true);
    updateReuse(state, enemy, false);
    expect(state.ai_reuse[enemy.unit_id]).toBeUndefined();
    expect(isSearchSuppressed(state, enemy)).toBe(false);
  });
});
