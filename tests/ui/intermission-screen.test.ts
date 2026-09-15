// [M-INHERIT-MERGE]［UI要件］継承の段の提示：資質に注目している間、右欄が受け継いだ後の姿へ変わる。

import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeDom, type FakeElement } from './fake-dom.js';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import type { ActionMasterRecord } from '../../src/data/types.js';
import { HERO_INIT_UNIT } from '../../src/data/generated/hero-init.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { createContext, MASTERS, playBattle } from '../engine/game-fixtures.js';
import { heroView, inheritOptions } from '../../src/ui/view/intermission-view.js';
import type { IntermissionView } from '../../src/ui/view/screen-view.js';

beforeAll(() => {
  installFakeDom();
});

const actions: Readonly<Record<string, ActionMasterRecord>> = ACTION_MASTERS;
const actionName = (classId: string): string => actions[classId]?.display_name ?? classId;

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

// 第1バトルを制した直後の継承の段（実データ）。
function intermission(): IntermissionView {
  const ctx = createContext({ saves: [] });
  const session = newGameSession(ctx);
  expect(playBattle(session, ctx)).toBe('WIN');
  const { run } = session.data;
  const attendantId = run.party[0]?.attendant_id ?? null;
  return {
    objectiveStringId: null,
    sceneName: '灰の村',
    sceneNumber: '1-02',
    slots: run.party.map((slot) => ({
      attendantId: slot.attendant_id,
      name: slot.attendant_id,
      epithet: '',
      inheritState: slot.inherit_state,
      canSacrifice: false,
    })),
    fallen: [],
    selectedAttendantId: attendantId,
    hero: heroView(run, HERO_INIT_UNIT.display_name, actionName),
    inheritDone: false,
    pool: inheritOptions(run, MASTERS, attendantId, HERO_INIT_UNIT.display_name, actionName),
    canSettle: true,
    isActTransition: false,
    noAttendant: false,
    noticeText: '',
  };
}

describe('[M-INHERIT-MERGE]［UI要件］継承の段の提示', () => {
  it('統合の資質に注目すると、右欄の統合先が受け継いだ後の使用回数へ変わる', async () => {
    const { renderIntermission } = await import('../../src/ui/dom/screens.js');
    const view = intermission();
    const index = view.pool.findIndex((option) => option.kind === 'MERGE' && option.label === '心気（基本）');
    expect(index).toBeGreaterThanOrEqual(0);
    const merge = view.pool[index];
    expect(merge?.improved).toContain('uses');
    expect(merge?.uses).toBe(45); // リナの使用回数係数による実効初期使用回数

    const root = renderIntermission(view, (id) => id, actionName, handlers) as unknown as FakeElement;
    const heroCard = (): FakeElement | undefined =>
      root.find('hero-body')?.findAll('hero-act').find((card) => card.text().includes('心気（基本）'));
    expect(heroCard()?.text()).toContain('10 / 10');

    const card = root.findAll('inherit-card')[index];
    expect(card?.text()).toContain('心気（基本）');
    root.find('pool')?.dispatch('mousemove', { target: card });

    expect(heroCard()?.text()).toContain('45 / 45');
    expect(heroCard()?.className).toContain('changed');

    root.find('pool')?.dispatch('mouseleave', {});
    expect(heroCard()?.text()).toContain('10 / 10');
  });
});
