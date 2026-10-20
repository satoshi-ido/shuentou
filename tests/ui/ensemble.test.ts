// [M-DATA-AUDIO-CUE]【戦闘の合奏】声のリズム、打弦の旋律、弦の和音、大鐘の譜。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import { SCALE_CENTS, readScore, SCENE_SCORES, SCORE_STEPS, VOICES } from '../../src/ui/audio/ensemble.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;
const rateOfCents = (cents: number): number => 2 ** (cents / 1200);

describe('[M-DATA-AUDIO-CUE] 戦闘の合奏', () => {
  it('譜は声部ごとに、1拍ごとに | で区切った4拍・64区切りで書く', () => {
    for (const [sceneId, score] of Object.entries(SCENE_SCORES)) {
      for (const voice of VOICES) {
        expect(score[voice], `${sceneId} ${voice}`).toMatch(/^([x.1-8]{16}\|){3}[x.1-8]{16}$/);
        expect(readScore(voice, score[voice]), `${sceneId} ${voice}`).toHaveLength(SCORE_STEPS);
      }
    }
  });

  it('音階は D の和声的短音階で、短3度・短6度・導音を持つ', () => {
    expect(SCALE_CENTS).toEqual([0, 200, 300, 500, 700, 800, 1100]);
  });

  it('声と鐘は x を一打とし、打弦は数字を音階の度数として音の高さへ写す', () => {
    expect(readScore('CHANT', 'x.')).toEqual([1, null]);
    const [first, third, seventh, octave] = readScore('DULCIMER', '1378');
    expect(first).toBe(1); // 1度は D
    expect(third).toBeCloseTo(rateOfCents(300), 6); // F（短3度）
    expect(seventh).toBeCloseTo(rateOfCents(1100), 6); // C♯（導音）
    expect(octave).toBeCloseTo(2, 6); // 8 は1オクターブ上の D
  });

  it('和音の声部は根音から音階の音を3度ずつ重ねる（V は導音を含む長三和音）', () => {
    const chordOf = (mark: string): number[] => [0, 1, 2].map((tone) => readScore('STRINGS', mark, tone)[0] ?? 0);
    const [root, third, fifth] = chordOf('5'); // A・C♯・E
    expect(root).toBeCloseTo(rateOfCents(700), 6);
    expect(third).toBeCloseTo(rateOfCents(1100), 6);
    expect(fifth).toBeCloseTo(rateOfCents(1400), 6);
    const [vi, viThird, viFifth] = chordOf('6'); // B♭・D・F
    expect(vi).toBeCloseTo(rateOfCents(800), 6);
    expect(viThird).toBeCloseTo(rateOfCents(1200), 6);
    expect(viFifth).toBeCloseTo(rateOfCents(1500), 6);
  });

  it('審査範囲の6シーンが譜を持ち、声部の鳴らす資産が ENSEMBLE にそろう', () => {
    expect(Object.keys(SCENE_SCORES).sort()).toEqual(['SCENE_1_01', 'SCENE_1_02', 'SCENE_2_01', 'SCENE_2_02', 'SCENE_2_03', 'SCENE_2_04']);
    const variants = Object.values(assets)
      .filter((record) => record.slot === 'BGM' && record.cue === 'ENSEMBLE')
      .map((record) => record.variant)
      .sort();
    expect(variants).toEqual([...VOICES].sort());
  });
});
