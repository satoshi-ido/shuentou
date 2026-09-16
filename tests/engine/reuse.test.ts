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
    state.ai_reuse[enemy.unit_id] = { hash: 1, until: 2, executable: [] };
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
    updateReuse(state, enemy, true, 30);
    expect(isSearchSuppressed(state, enemy)).toBe(true);
  });

  it('惰性：期限内かつ実行可能手の集合が同一なら抑制し、集合が変われば解除する', () => {
    const { state, enemy } = duel();
    enemy.elapsed_thought = 10; // 心気のみ実行可能
    updateReuse(state, enemy, true, 30);
    state.step += 5;
    enemy.elapsed_thought += 5;
    expect(isSearchSuppressed(state, enemy)).toBe(true); // ハッシュは変わるが惰性が成立
    enemy.elapsed_thought = 20; // 武技も実行可能になり集合が変化
    expect(isSearchSuppressed(state, enemy)).toBe(false);
  });

  it('惰性は期限を過ぎると解除する', () => {
    const { state, enemy } = duel();
    updateReuse(state, enemy, true, 30);
    state.step += 30;
    enemy.vp += 1; // 盤面ハッシュは変わるが実行可能手の集合は変わらない
    expect(isSearchSuppressed(state, enemy)).toBe(true);
    state.step += 1;
    expect(isSearchSuppressed(state, enemy)).toBe(false);
  });

  it('行動の確定では記録を削除する', () => {
    const { state, enemy } = duel();
    updateReuse(state, enemy, true, 30);
    updateReuse(state, enemy, false, 30);
    expect(state.ai_reuse[enemy.unit_id]).toBeUndefined();
    expect(isSearchSuppressed(state, enemy)).toBe(false);
  });
});
