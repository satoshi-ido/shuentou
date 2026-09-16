// [M-DATA-AUDIO-CUE] 発火契機と音声資産の対応。[I-PLAN-ASSETS]［空実装に対しても検査する経路］

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { ActionCue, BattleCue } from '../../src/engine/cue.js';
import { bgmAssetOf, globalAssetOf, seAssetOf } from '../../src/ui/audio/cues.js';
import { RecordingAudioDriver } from '../../src/ui/audio/driver.js';

const trigger = (flags: ActionCue['sysFlags']): BattleCue => ({
  kind: 'ACTION_TRIGGER',
  unitId: 'U0000',
  posIdx: 2,
  classId: 'ACT_TEST',
  sysFlags: flags,
});

describe('[M-DATA-AUDIO-CUE] 契機と資産の対応', () => {
  it('発動は系統ごとの資産を引く', () => {
    expect(seAssetOf(trigger(['FLAG_MARTIAL']), ASSET_MASTERS)).toBe('ASSET_SE_ACTION_MARTIAL');
    expect(seAssetOf(trigger(['FLAG_MIND']), ASSET_MASTERS)).toBe('ASSET_SE_ACTION_MIND');
    expect(seAssetOf(trigger(['FLAG_STANCE']), ASSET_MASTERS)).toBe('ASSET_SE_ACTION_STANCE');
    expect(seAssetOf(trigger([]), ASSET_MASTERS)).toBeNull(); // 系統を持たないアクションは鳴らさない
  });

  it('命中・回避・消滅は共通の資産を引く', () => {
    expect(seAssetOf({ kind: 'HIT', unitId: 'U1', posIdx: 1, classId: 'A', sysFlags: [] }, ASSET_MASTERS)).toBe('ASSET_SE_HIT');
    expect(seAssetOf({ kind: 'MISS', unitId: 'U1', posIdx: 1, classId: 'A', sysFlags: [] }, ASSET_MASTERS)).toBe('ASSET_SE_MISS');
    expect(seAssetOf({ kind: 'UNIT_DESTROY', unitId: 'U1', posIdx: 1 }, ASSET_MASTERS)).toBe('ASSET_SE_UNIT_DESTROY');
  });

  it('操作と自動時間停止の契機も資産を持つ', () => {
    expect(globalAssetOf('UI_CONFIRM', ASSET_MASTERS)).toBe('ASSET_SE_UI_CONFIRM');
    expect(globalAssetOf('UI_CANCEL', ASSET_MASTERS)).toBe('ASSET_SE_UI_CANCEL');
    expect(globalAssetOf('WATCH_PAUSE', ASSET_MASTERS)).toBe('ASSET_SE_WATCH_PAUSE');
  });

  it('BGM はシーンに紐づく資産を選び、インターミッションは共通の資産を選ぶ', () => {
    expect(bgmAssetOf('BATTLE', 'SCENE_1_01', ASSET_MASTERS)).toBe('ASSET_BGM_1_01');
    expect(bgmAssetOf('BATTLE', 'SCENE_1_02', ASSET_MASTERS)).toBe('ASSET_BGM_1_02');
    expect(bgmAssetOf('BATTLE', 'SCENE_9_99', ASSET_MASTERS)).toBeNull();
    expect(bgmAssetOf('INTERMISSION', 'SCENE_1_01', ASSET_MASTERS)).toBe('ASSET_BGM_INTERMISSION');
  });

  it('[M-UI-CONFIG] 音量設定は以後の再生に適用される', () => {
    const driver = new RecordingAudioDriver();
    driver.setVolumes(40, 10);
    driver.playBgm('BATTLE', 'ASSET_BGM_1_01');
    driver.playSe('HIT', 'ASSET_SE_HIT');
    expect(driver.events).toEqual([
      { kind: 'BGM', cue: 'BATTLE', assetId: 'ASSET_BGM_1_01', volume: 40 },
      { kind: 'SE', cue: 'HIT', assetId: 'ASSET_SE_HIT', volume: 10 },
    ]);
  });
});
