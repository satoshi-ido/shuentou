// [A-SEARCH-MOVEGEN] [A-TIE-BREAK] 候補手の生成順序：瞬動 → 即発 → 通常 → パス。
// 同ランク内は所持アクション配列インデックス昇順（安定ソートにより保持される）。

import { describe, expect, it } from 'vitest';
import type { Unit } from '../../src/engine/types.js';
import { generateMoves } from '../../src/ai/movegen.js';
import { createDuel, makeAction } from './fixtures.js';

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
