// [M-DATA-AUDIO-CUE]【戦闘の合奏】声のリズムと打弦の旋律、大鐘の譜。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import { SCALE_CENTS, readScore, SCENE_SCORES, SCORE_STEPS, VOICES } from '../../src/ui/audio/ensemble.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;

describe('[M-DATA-AUDIO-CUE] 戦闘の合奏', () => {
  it('譜は声部ごとに、1拍ごとに | で区切った32区切りで書く', () => {
    for (const [sceneId, score] of Object.entries(SCENE_SCORES)) {
      for (const voice of VOICES) {
        expect(score[voice], `${sceneId} ${voice}`).toMatch(/^[x.0-9]{16}\|[x.0-9]{16}$/);
        expect(readScore(voice, score[voice]), `${sceneId} ${voice}`).toHaveLength(SCORE_STEPS);
      }
    }
  });

  it('声と鐘は x を一打とし、打弦は数字を音階の度数として音の高さへ写す', () => {
    expect(readScore('CHANT', 'x.')).toEqual([1, null]);
    const [first, second, , , , sixth] = readScore('DULCIMER', '123456');
    expect(first).toBe(1); // 1度は D
    expect(second).toBeCloseTo(2 ** ((SCALE_CENTS[1] ?? 0) / 1200), 6);
    expect(sixth).toBeCloseTo(2, 6); // 6 は1オクターブ上の1度
    expect(readScore('DULCIMER_HIGH', '0')[0]).toBeCloseTo(2 ** ((SCALE_CENTS[4] ?? 0) / 1200 + 1), 6);
  });

  it('審査範囲の6シーンが譜を持ち、6つの声部が ENSEMBLE の資産を持つ', () => {
    expect(Object.keys(SCENE_SCORES).sort()).toEqual(['SCENE_1_01', 'SCENE_1_02', 'SCENE_2_01', 'SCENE_2_02', 'SCENE_2_03', 'SCENE_2_04']);
    const variants = Object.values(assets)
      .filter((record) => record.slot === 'BGM' && record.cue === 'ENSEMBLE')
      .map((record) => record.variant)
      .sort();
    expect(variants).toEqual([...VOICES].sort());
  });
});
