// [A-SEARCH-MOVEGEN] [A-TIE-BREAK] 候補手の生成順序：瞬動 → 即発 → 通常 → パス。
// 同ランク内は所持アクション配列インデックス昇順（安定ソートにより保持される）。

import { describe, expect, it } from 'vitest';
import type { Unit } from '../../src/engine/types.js';
import { runStepEnd } from '../../src/engine/pipeline/stepend.js';
import { applyMove } from '../../src/ai/apply.js';
import { BONUS_DEFAULT_PASS, RESWAP_PENALTY } from '../../src/ai/constants.js';
import { generateMoves, isReswap, reswapPenaltyOf, type AiMove } from '../../src/ai/movegen.js';
import { createDuel, makeAction, moveUnit, NO_SUMMON_DEPS, placeUnit } from './fixtures.js';

function findUnit(state: ReturnType<typeof createDuel>, side: 'MINE' | 'FOE'): Unit {
  const unit = state.units.find((u) => u !== null && u.side === side) ?? null;
  if (unit === null) {
    throw new Error(`ユニットが見つからない: ${side}`);
  }
  return unit;
}

describe('[A-TIE-BREAK] generateMoves の優先度', () => {
  it('瞬動 → 即発 → 通常（配列インデックス昇順） → パス の順に並ぶ', () => {
    const normalA = makeAction('ACT_NORMAL_A', { step_startup: 5, step_recovery: 5 });
    const instantQuick = makeAction('ACT_INSTANT_QUICK', { step_startup: 0, step_recovery: 0 });
    const instantSlow = makeAction('ACT_INSTANT_SLOW', { step_startup: 0, step_recovery: 5 });
    const normalB = makeAction('ACT_NORMAL_B', { step_startup: 5, step_recovery: 5 });

    const state = createDuel({
      heroMaxHp: 10,
      heroActs: [makeAction('ACT_HERO_NOOP', { step_startup: 5 })],
      enemyMaxHp: 10,
      enemyActs: [normalA, instantQuick, instantSlow, normalB],
    });
    const enemy = findUnit(state, 'FOE');

    const moves = generateMoves(state, enemy);
    const order = moves.map((m) => (m.kind === 'PASS' ? 'PASS' : m.action.master_ref));

    expect(order).toEqual(['ACT_INSTANT_QUICK', 'ACT_INSTANT_SLOW', 'ACT_NORMAL_A', 'ACT_NORMAL_B', 'PASS']);
  });
});

describe('[A-PROFILE-BONUS] 再交代の判定', () => {
  const SWAP = makeAction('ACT_SWAP', { is_swap: true, step_startup: 0, step_recovery: 0 });
  const WAIT = makeAction('ACT_WAIT', { gain_vp: 1, step_thought: 500 });

  // 敵マスター（後列）と前列のクリーチャーの組。クリーチャーが隊列交代を実行し、ステップ境界を越える。
  function afterSwap(boundaries: number) {
    const state = createDuel({ heroMaxHp: 10, heroActs: [WAIT], enemyMaxHp: 10, enemyActs: [SWAP, WAIT] });
    const master = findUnit(state, 'FOE');
    moveUnit(state, master, 3);
    const creature = placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 2, maxHp: 10, acts: [SWAP, WAIT], counter: { instance_id_seq: 50 } });
    const swapOf = (unit: Unit): AiMove => ({ kind: 'ACT', action: unit.acts.find((a) => a.master_ref === 'ACT_SWAP')! });
    applyMove(state, creature, swapOf(creature), NO_SUMMON_DEPS);
    for (let i = 0; i < boundaries; i += 1) {
      runStepEnd(state);
    }
    return { state, master, creature, swapOf };
  }

  it('直前のステップで交代した実行者の隊列交代は再交代とし、パスの既定減点より1大きい減点を課す', () => {
    const { state, creature, swapOf } = afterSwap(1);
    expect(creature.elapsed_thought).toBe(1);
    expect(isReswap(state, creature, swapOf(creature))).toBe(true);
    expect(RESWAP_PENALTY).toBe(BONUS_DEFAULT_PASS - 1);
    expect(reswapPenaltyOf(state, creature, swapOf(creature))).toBe(RESWAP_PENALTY);
  });

  it('相方が直前のステップで交代した場合も再交代とする', () => {
    const { state, master, swapOf } = afterSwap(1);
    expect(isReswap(state, master, swapOf(master))).toBe(true);
  });

  it('交代から2ステップ以上経過した組の隊列交代は再交代としない', () => {
    const { state, master, creature, swapOf } = afterSwap(2);
    expect(creature.elapsed_thought).toBe(2);
    expect(isReswap(state, creature, swapOf(creature))).toBe(false);
    expect(isReswap(state, master, swapOf(master))).toBe(false);
    expect(reswapPenaltyOf(state, creature, swapOf(creature))).toBe(0);
  });

  it('隊列交代以外の手とパスは再交代としない', () => {
    const { state, creature } = afterSwap(1);
    const wait: AiMove = { kind: 'ACT', action: creature.acts.find((a) => a.master_ref === 'ACT_WAIT')! };
    expect(isReswap(state, creature, wait)).toBe(false);
    expect(isReswap(state, creature, { kind: 'PASS' })).toBe(false);
  });
});
