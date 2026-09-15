// [M-UI-SCREENS] 画面の導出、[M-UI-OBJECTIVE] 目的表示、[M-DATA-HELPMASTER] 初出の自動提示と辞典。

import { describe, expect, it } from 'vitest';
import { HELP_MASTERS } from '../../src/data/generated/help-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { RunState } from '../../src/engine/run/state.js';
import {
  DICTIONARY_CATEGORIES,
  dictionaryEntries,
  firstSightHelps,
  objectiveStringId,
  OBJECTIVE_VEIN,
  OBJECTIVE_VOID_LORD,
  sceneNumberOf,
  screenOf,
  titleView,
} from '../../src/ui/view/screen-view.js';
import { createContext } from '../engine/game-fixtures.js';

function runWith(overrides: Partial<RunState>): RunState {
  const session = newGameSession(createContext({ saves: [] }));
  return { ...session.data.run, ...overrides };
}

describe('[M-UI-SCREENS] 画面の導出', () => {
  it('phase から画面が定まり、アクト移行の段は従者補充画面になる', () => {
    expect(screenOf(runWith({ phase: 'PRE_BATTLE' }))).toBe('PRE_BATTLE');
    expect(screenOf(runWith({ phase: 'BATTLE' }))).toBe('BATTLE');
    expect(screenOf(runWith({ phase: 'INTERMISSION', intermission_stage: 'INHERIT' }))).toBe('INTERMISSION');
    expect(screenOf(runWith({ phase: 'INTERMISSION', intermission_stage: 'TRANSITION' }))).toBe('REFILL');
    expect(screenOf(runWith({ phase: 'ENDING' }))).toBe('ENDING');
  });

  it('タイトルは周回終了済みのセーブで進行を再開できない', () => {
    expect(titleView(null)).toEqual({ hasSave: false, runClosed: false });
    const session = newGameSession(createContext({ saves: [] }));
    expect(titleView(session.data)).toEqual({ hasSave: true, runClosed: false });
    expect(titleView({ ...session.data, run: { ...session.data.run, phase: 'ENDING' } })).toEqual({ hasSave: true, runClosed: true });
  });
});

describe('[M-UI-OBJECTIVE] 目的表示の導出', () => {
  it.each([
    [2, OBJECTIVE_VOID_LORD],
    [20, OBJECTIVE_VOID_LORD],
    [21, OBJECTIVE_VEIN],
    [30, OBJECTIVE_VEIN],
    [31, null],
  ])('進行位置 %i の表示', (order, expected) => {
    expect(objectiveStringId(order)).toBe(expected);
  });

  it('進行位置 1 は生じない（バトル前・バトル中は提示しない）', () => {
    expect(objectiveStringId(1)).toBeNull();
  });

  it('シーンIDから表示形を導く', () => {
    expect(sceneNumberOf('SCENE_1_01')).toBe('1-01');
    expect(sceneNumberOf('SCENE_4_08')).toBe('4-08');
  });
});

describe('[M-DATA-HELPMASTER] 初出の自動提示と辞典', () => {
  it('当該シーンの unlock に対応し、未読の解説だけを自動提示する', () => {
    expect(firstSightHelps(SCENE_MASTERS.SCENE_1_01, HELP_MASTERS, {})).toEqual([]); // 1-01 は unlock なし
    expect(firstSightHelps(SCENE_MASTERS.SCENE_1_02, HELP_MASTERS, {})).toEqual(['HELP_RUSH']);
    expect(firstSightHelps(SCENE_MASTERS.SCENE_1_02, HELP_MASTERS, { HELP_RUSH: true })).toEqual([]);
  });

  it('辞典は分類順・表示順に並べ、既読状態を持つ', () => {
    const entries = dictionaryEntries(HELP_MASTERS, { HELP_WATCH: true });
    const categories = entries.map((entry) => DICTIONARY_CATEGORIES.indexOf(entry.category));
    expect(categories).toEqual([...categories].sort((a, b) => a - b));
    expect(entries.find((entry) => entry.helpId === 'HELP_WATCH')?.seen).toBe(true);
    expect(entries.find((entry) => entry.helpId === 'HELP_TIMELINE')?.seen).toBe(false);
  });
});
