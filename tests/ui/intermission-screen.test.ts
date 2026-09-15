// [M-INHERIT-MERGE]［UI要件］継承の段の提示：資質に注目している間、右欄が受け継いだ後の姿へ変わる。

import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeDom, type FakeElement } from './fake-dom.js';
import type { HeroView, InheritOptionView, IntermissionView } from '../../src/ui/view/screen-view.js';

beforeAll(() => {
  installFakeDom();
});

const HERO_ACT = {
  instanceId: 'IID0000',
  name: '心気（基本）',
  steps: { thought: 147, startup: 10, recovery: 5 },
  costs: [],
  range: null,
  atk: null,
  uses: '10 / 10',
} as const;

const hero: HeroView = { name: 'セイン', hp: 60, maxHp: 60, acts: [HERO_ACT] };

function mergeOption(): InheritOptionView {
  return {
    target: { kind: 'ACTION', class_id: 'ACT_MIND_AR3' },
    label: '心気（基本）',
    kind: 'MERGE',
    steps: { thought: 147, startup: 10, recovery: 5 },
    costs: [],
    range: null,
    atk: null,
    uses: 45,
    hpAdd: null,
    boosted: ['uses'],
    improved: ['uses'],
    heroAfter: { ...hero, acts: [{ ...HERO_ACT, uses: '45 / 45' }] },
    changedInstanceId: 'IID0000',
  };
}

function view(): IntermissionView {
  return {
    objectiveStringId: null,
    sceneName: '灰の村',
    sceneNumber: '1-02',
    slots: [{ attendantId: 'ATTENDANT_01', name: 'リナ', epithet: '灯し直しの手', inheritState: 'UNUSED', canSacrifice: true }],
    fallen: [],
    selectedAttendantId: 'ATTENDANT_01',
    hero,
    inheritDone: false,
    pool: [mergeOption()],
    canSettle: true,
    isActTransition: false,
    noAttendant: false,
    noticeText: '',
  };
}

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

describe('[M-INHERIT-MERGE]［UI要件］継承の段の提示', () => {
  it('資質に注目すると、右欄が受け継いだ後の使用回数へ変わる', async () => {
    const { renderIntermission } = await import('../../src/ui/dom/screens.js');
    const root = renderIntermission(view(), (id) => id, (classId) => classId, handlers) as unknown as FakeElement;

    const body = root.find('hero-body');
    expect(body?.text()).toContain('10 / 10');

    const pool = root.find('pool');
    const card = root.find('inherit-card');
    expect(pool).not.toBeNull();
    expect(card).not.toBeNull();
    pool?.dispatch('mousemove', { target: card });

    expect(root.find('hero-body')?.text()).toContain('45 / 45');
    expect(root.find('hero-act')?.className).toContain('changed');

    pool?.dispatch('mouseleave', {});
    expect(root.find('hero-body')?.text()).toContain('10 / 10');
  });
});
