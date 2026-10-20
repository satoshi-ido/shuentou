// [M-UI-SCREENS]［開発用のシーン選択］任意のシーンのバトル開始前演出から始めるセーブデータ。

import { describe, expect, it } from 'vitest';
import { sceneEntries, sceneJumpData, sceneSelectEnabled } from '../../src/ui/dev/scene-select.js';
import { MASTERS } from '../engine/game-fixtures.js';

describe('[M-UI-SCREENS] 開発用のシーン選択', () => {
  it('起動時に ?scene-select を指定したときに限って出す', () => {
    expect(sceneSelectEnabled('?scene-select')).toBe(true);
    expect(sceneSelectEnabled('')).toBe(false);
  });

  it('全シーンを順に並べる', () => {
    const entries = sceneEntries(MASTERS);
    expect(entries[0]).toEqual({ sceneId: 'SCENE_1_01', order: 1, label: '1-01 拾い物' });
    expect(entries.map((entry) => entry.order)).toEqual([...entries.map((entry) => entry.order)].sort((a, b) => a - b));
  });

  it('選んだシーンのバトル開始前演出から、初見の版で始める', () => {
    const data = sceneJumpData(MASTERS, 'SCENE_2_04');
    expect(data.run.current_scene_id).toBe('SCENE_2_04');
    expect(data.run.phase).toBe('PRE_BATTLE');
    expect(data.run.party.map((slot) => slot.attendant_id)).toEqual(['ATTENDANT_01', 'ATTENDANT_02']); // アクト2の定員2
    expect(data.run.foreknown_scenes).toEqual([]);
    expect(data.meta.furthest_order).toBe(6);
  });
});
