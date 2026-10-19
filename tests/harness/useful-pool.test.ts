// [V-TEST-REFAI]［効果のない継承の除外］継承しても手持ちが変わらない項目を継承プールから除く。

import { describe, expect, it } from 'vitest';
import { applyInherit, inheritPool, previewInherit } from '../../src/engine/progress/inherit.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { RunState } from '../../src/engine/run/state.js';
import { createContext, MASTERS, playBattle } from '../engine/game-fixtures.js';
import { usefulPool } from './runner.js';

function intermissionRun(): RunState {
  const ctx = createContext({ saves: [] });
  const session = newGameSession(ctx);
  playBattle(session, ctx); // 1-01 を突破して継承の段へ
  return session.data.run;
}

describe('usefulPool', () => {
  it('既存スロットへの統合で基礎値も残り使用回数も改善しない項目を除き、残り使用回数が減っていれば残す', () => {
    const run = intermissionRun();
    const attendantId = run.party[0]!.attendant_id;
    const target = inheritPool(run, MASTERS).find(
      (entry) => entry.kind === 'ACTION' && previewInherit(run, MASTERS, attendantId, entry).kind === 'NEW_SLOT',
    )!;
    expect(target).toBeDefined();
    expect(usefulPool(run, attendantId)).toContainEqual(target); // 新規スロットは手持ちを変える

    applyInherit(run, MASTERS, attendantId, target);
    const merge = previewInherit(run, MASTERS, attendantId, target);
    expect(merge.kind).toBe('MERGE');
    if (merge.kind !== 'MERGE') {
      return;
    }
    // 同じ従者で同じ項目を重ねても基礎値は改善せず、満タンのスロットの残り使用回数も増えない。
    expect(merge.improved).toEqual([]);
    const slot = run.hero_acts.find((action) => action.instance_id === merge.existingInstanceId)!;
    expect(slot.uses_left).toBe(merge.usesInitial);
    expect(usefulPool(run, attendantId)).not.toContainEqual(target);
    expect(usefulPool(run, attendantId).length).toBe(inheritPool(run, MASTERS).length - 1);

    // 使用して残り使用回数が減ったスロットへの統合は補充となるため残す。
    slot.uses_left -= 1;
    expect(usefulPool(run, attendantId)).toContainEqual(target);
  });
});
