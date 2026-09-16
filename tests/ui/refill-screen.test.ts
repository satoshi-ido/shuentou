// [M-PROG-REFILL] アクト移行の段の提示：壇・移行の決済・補充候補プールの3要素。

import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeDom, type FakeElement } from './fake-dom.js';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
import { HERO_INIT_UNIT } from '../../src/data/generated/hero-init.js';
import { enterTransition, settleIntermission } from '../../src/engine/game/intermission.js';
import { confirmRefill } from '../../src/engine/game/intermission.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameSession } from '../../src/engine/game/session.js';
import type { RunState } from '../../src/engine/run/state.js';
import { createContext, MASTERS, playBattle } from '../engine/game-fixtures.js';
import { refillView } from '../../src/ui/view/intermission-view.js';
import { attendantEpithet, attendantName } from '../../src/ui/view/screen-view.js';

beforeAll(() => {
  installFakeDom();
});

const handlers = {
  onNewGame: () => undefined,
  onContinue: () => undefined,
  onOpenConfig: () => undefined,
  onOpenDictionary: () => undefined,
  onCloseOverlay: () => undefined,
  onConfigChange: () => undefined,
  onShowHelp: () => undefined,
  onStartBattle: () => undefined,
  onInherit: () => undefined,
  onSacrifice: () => undefined,
  onSelectAttendant: () => undefined,
  onSettleIntermission: () => undefined,
  onRefill: () => undefined,
  onUndo: () => undefined,
  onRollbackBattle: () => undefined,
  onRollbackIntermission: () => undefined,
};

// アクト1最終シーンを制し、アクト移行の段へ進んだ局面。
function transition(): { session: GameSession; ctx: ReturnType<typeof createContext>; run: RunState } {
  const ctx = createContext({ saves: [] });
  const session = newGameSession(ctx);
  expect(playBattle(session, ctx)).toBe('WIN');
  settleIntermission(session, ctx);
  expect(playBattle(session, ctx)).toBe('WIN');
  enterTransition(session, ctx);
  expect(session.data.run.intermission_stage).toBe('TRANSITION');
  return { session, ctx, run: session.data.run };
}

function viewOf(run: RunState) {
  return refillView(
    run,
    MASTERS,
    HERO_INIT_UNIT.display_name,
    (attendantId) => attendantName(ATTENDANT_MASTERS, attendantId),
    (attendantId) => attendantEpithet(ATTENDANT_MASTERS, attendantId),
    (slotCount, remainCount) => `残り ${remainCount} / ${slotCount}`,
    '',
  );
}

describe('[M-PROG-REFILL] アクト移行の提示', () => {
  it('移行の決済は、インターミッション開始時からの前後で示す', () => {
    const view = viewOf(transition().run);
    expect([view.fromAct, view.toAct]).toEqual([1, 2]);
    expect([view.capacityBefore, view.capacityAfter]).toEqual([1, 2]);
    expect(view.survivors.map((entry) => entry.name)).toEqual(['リナ']);
    expect(view.slotCount).toBe(1);
    expect(view.filledCount).toBe(0);
    expect(view.remainCount).toBe(1);
    expect(view.heroHpAfter).toBe(60); // 全回復ボーナスの適用後
    expect(view.shortText).not.toBe('');
    // 候補は係数を伴う（[M-DATA-COEFFKEYS]）。
    const gald = view.pool.find((candidate) => candidate.name === 'ガルド');
    expect(gald?.joined).toBe(false);
    expect(gald?.coeffs.map((coeff) => `${coeff.label} ${coeff.text}`)).toContain('使用回数 ×3.00');
    expect(gald?.coeffs.every((coeff) => coeff.gain)).toBe(true);
  });

  it('壇は継続・空き枠・主人公・候補を並べ、迎え入れた従者は結ばれたものとして示す', async () => {
    const { renderRefill } = await import('../../src/ui/dom/screens.js');
    const { session, ctx, run } = transition();
    const before = renderRefill(viewOf(run), handlers) as unknown as FakeElement;
    expect(before.findAll('rfig').map((node) => node.className)).toEqual([
      'rfig alive',
      'rfig slot', // 残りの補充可能数1枠
      'rfig master',
      'rfig dead',
      'rfig dead',
    ]);
    expect(before.findAll('cand')).toHaveLength(2);
    expect(before.findAll('cand').every((card) => card.disabled)).toBe(false);
    expect(before.find('refill-side')?.text()).toContain('残り 1 / 1');

    confirmRefill(session, ctx, 'ATTENDANT_02');
    const after = renderRefill(viewOf(session.data.run), handlers) as unknown as FakeElement;
    // 空き枠は埋まり、迎え入れた従者は壇の候補側で結ばれたものとなる。
    expect(after.findAll('rfig').map((node) => node.className)).toEqual([
      'rfig alive',
      'rfig master',
      'rfig dead picked',
      'rfig dead',
    ]);
    expect(after.find('picked')?.text()).toContain('結ばれた');
    // 迎え入れた候補と、定員を満たした後の候補は、いずれも押せない。
    expect(after.findAll('cand').every((card) => card.disabled)).toBe(true);
    expect(after.find('refill-side')?.text()).not.toContain('残り');
  });
});
