// [M-UI-VIEWPORT] [M-UI-CONFIG] [M-UI-PLAYBACK] [I-PLAN-ASSETS]

import { describe, expect, it } from 'vitest';
import { RecordingAudioDriver } from '../../src/ui/audio/driver.js';
import { placeholderHue, placeholderInitial, portraitSvg } from '../../src/ui/assets/placeholder.js';
import { CONFIG_STORAGE_KEY, defaultConfig, loadConfig, parseConfig, saveConfig } from '../../src/ui/config.js';
import { PlaybackLoop, runFrame, stepsPerFrame } from '../../src/ui/playback.js';
import { fitViewport } from '../../src/ui/viewport.js';

describe('[M-UI-VIEWPORT] 論理解像度の等倍拡縮', () => {
  it('16:9 の表示領域では整数でない比率でも全体を収める', () => {
    expect(fitViewport(1920, 1080)).toEqual({ scale: 1.5, offsetX: 0, offsetY: 0 });
    const narrow = fitViewport(1000, 1000);
    expect(narrow.scale).toBeCloseTo(1000 / 1280);
    expect(narrow.offsetX).toBe(0);
    expect(narrow.offsetY).toBeCloseTo((1000 - 720 * (1000 / 1280)) / 2);
  });

  it('論理解像度を下回る領域でも縮小して収める', () => {
    expect(fitViewport(640, 360).scale).toBe(0.5);
  });
});

describe('[M-UI-CONFIG] 表示・音響設定', () => {
  it('既定値を持つ', () => {
    expect(defaultConfig()).toEqual({
      bgmVolume: 80,
      seVolume: 80,
      defaultPlaybackSpeed: 'X1',
      textSpeed: 'NORMAL',
      simplifyEffects: false,
      watchDefault: { READY: false, STUN: false, HIT_FRONT: false, HIT_BACK: false, EVADE: false },
    });
  });

  it('セーブデータとは別のキーへ保存し、読み戻す', () => {
    const store: Record<string, string> = {};
    const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) };
    const config = { ...defaultConfig(), bgmVolume: 10, defaultPlaybackSpeed: 'X3' as const, watchDefault: { ...defaultConfig().watchDefault, EVADE: true } };
    saveConfig(storage, config);
    expect(Object.keys(store)).toEqual([CONFIG_STORAGE_KEY]);
    expect(loadConfig(storage)).toEqual(config);
  });

  it('欠落・範囲外・型違いの項目は項目単位で既定値に戻す', () => {
    const parsed = parseConfig(JSON.stringify({ bgmVolume: 101, seVolume: 30, textSpeed: 'TURBO', watchDefault: { STUN: true, READY: 'yes' } }));
    expect(parsed).toEqual({ ...defaultConfig(), seVolume: 30, watchDefault: { ...defaultConfig().watchDefault, STUN: true } });
    expect(parseConfig('not json')).toEqual(defaultConfig());
    expect(parseConfig(null)).toEqual(defaultConfig());
  });
});

describe('[M-UI-PLAYBACK] バトル再生速度', () => {
  it('1フレームあたりの歩進は PAUSE 0 / X1 1 / X2 2 / X3 4', () => {
    expect(['PAUSE', 'X1', 'X2', 'X3'].map((s) => stepsPerFrame(s as 'PAUSE'))).toEqual([0, 1, 2, 4]);
  });

  it('停止が成立したステップで歩進を打ち切り、残りを繰り越さない', () => {
    let steps = 0;
    expect(runFrame('X3', () => (steps += 1) < 2)).toBe(2);
    expect(steps).toBe(2);
    expect(runFrame('PAUSE', () => true)).toBe(0);
  });

  it('再生ループはフレームごとに onFrame を呼び、false で停止する', () => {
    const queue: (() => void)[] = [];
    let frames = 0;
    const loop = new PlaybackLoop({ request: (cb) => queue.push(cb), cancel: () => undefined }, () => (frames += 1) < 3);
    loop.start();
    for (let i = 0; i < 10 && queue.length > 0; i += 1) {
      queue.shift()!();
    }
    expect(frames).toBe(3);
    expect(loop.running).toBe(false);
  });
});

describe('[I-PLAN-ASSETS] プレースホルダ', () => {
  it('色相と頭文字を asset_id から決定論的に導出する', () => {
    expect(placeholderInitial('ASSET_HERO_PORTRAIT')).toBe('H');
    expect(placeholderHue('ASSET_A')).toBe(placeholderHue('ASSET_A'));
    expect(placeholderHue('ASSET_A')).toBe([...'ASSET_A'].reduce((s, c) => s + c.charCodeAt(0), 0) % 360);
    expect(portraitSvg('ASSET_X')).toBe(portraitSvg('ASSET_X'));
    expect(portraitSvg('ASSET_X', true)).toContain('saturate');
  });

  it('空実装の音声ドライバは音量設定と SILENCE の呼び出し経路を記録する', () => {
    const audio = new RecordingAudioDriver();
    audio.setVolumes(30, 70);
    audio.playBgm('BATTLE', 'ASSET_BGM_1_01');
    audio.playSe('HIT', 'ASSET_SE_HIT');
    audio.silence();
    expect(audio.events).toEqual([
      { kind: 'BGM', cue: 'BATTLE', assetId: 'ASSET_BGM_1_01', volume: 30 },
      { kind: 'SE', cue: 'HIT', assetId: 'ASSET_SE_HIT', volume: 70 },
      { kind: 'SILENCE' },
    ]);
  });
});
