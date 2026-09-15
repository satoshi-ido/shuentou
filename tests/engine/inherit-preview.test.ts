// [M-INHERIT-MERGE]［UI要件］確定前のプレビュー：統合後の実効値と改善項目。

import { describe, expect, it } from 'vitest';
import { previewInherit } from '../../src/engine/progress/inherit.js';
import { applyInherit } from '../../src/engine/progress/inherit.js';
import { inheritPool } from '../../src/engine/progress/inherit.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { createContext, MASTERS, playBattle } from './game-fixtures.js';
import type { RunState } from '../../src/engine/run/state.js';

function intermissionRun(): RunState {
  const ctx = createContext({ saves: [] });
  const session = newGameSession(ctx);
  playBattle(session, ctx); // 1-01 を突破して継承の段へ
  return session.data.run;
}

describe('[M-INHERIT-MERGE] 継承プレビュー', () => {
  it('ステートを変更せず、新規スロットと統合を区別する', () => {
    const run = intermissionRun();
    const attendantId = run.party[0]?.attendant_id;
    expect(attendantId).toBeDefined();
    const target = inheritPool(run, MASTERS).find((entry) => entry.kind === 'ACTION');
    expect(target).toBeDefined();

    const before = JSON.stringify(run);
    const first = previewInherit(run, MASTERS, attendantId!, target!);
    expect(JSON.stringify(run)).toBe(before); // 見込みの算出はステートを変更しない
    expect(['NEW_SLOT', 'MERGE']).toContain(first.kind);

    applyInherit(run, MASTERS, attendantId!, target!);
    // 同一のプール項目を重ねた場合は統合になる（改善項目は0件でもよい）。
    const second = previewInherit(run, MASTERS, attendantId!, target!);
    expect(second.kind).toBe('MERGE');
    if (second.kind === 'MERGE') {
      const slot = run.hero_acts.find((action) => action.master_ref === second.classId);
      expect(second.usesInitial).toBeGreaterThanOrEqual(slot?.uses_initial ?? 0);
    }
  });

  it('最大HP加算は加算後の最大HPを示す', () => {
    const run = intermissionRun();
    const attendantId = run.party[0]?.attendant_id;
    const target = inheritPool(run, MASTERS).find((entry) => entry.kind === 'MAX_HP');
    if (attendantId === undefined || target === undefined) {
      return; // 当該シーンに最大HP加算が無い場合
    }
    const preview = previewInherit(run, MASTERS, attendantId, target);
    expect(preview.kind).toBe('MAX_HP');
    if (preview.kind === 'MAX_HP') {
      expect(preview.maxHpAfter).toBe(preview.maxHpBefore + preview.add);
      expect(preview.add).toBeGreaterThan(0);
    }
  });
});
