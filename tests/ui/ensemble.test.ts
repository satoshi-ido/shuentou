// [M-DATA-AUDIO-CUE]【戦闘の合奏】打楽器のリズム、打弦の旋律、弦の和音、大鐘の譜。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import { phrasesOf, SCALE_CENTS, readScore, SCENE_SCORES, SCORE_STEPS, VOICES } from '../../src/ui/audio/ensemble.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;
const rateOfCents = (cents: number): number => 2 ** (cents / 1200);

describe('[M-DATA-AUDIO-CUE] 戦闘の合奏', () => {
  it('譜は声部ごとに、1拍ごとに | で区切り、句の数×64区切りで書く', () => {
    for (const [sceneId, score] of Object.entries(SCENE_SCORES)) {
      const beats = phrasesOf(sceneId) * 4;
      for (const voice of VOICES) {
        expect(score[voice], `${sceneId} ${voice}`).toMatch(new RegExp(`^([x.1-8]{16}\\|){${beats - 1}}[x.1-8]{16}$`));
        expect(readScore(voice, score[voice]), `${sceneId} ${voice}`).toHaveLength(SCORE_STEPS * phrasesOf(sceneId));
      }
    }
  });

  it('旋律と和音は山場（周期が2句以上のシーン）に限り、通常のシーンは打楽器と拍ごとに等間隔の鐘のみ', () => {
    for (const [sceneId, score] of Object.entries(SCENE_SCORES)) {
      const silent = (voice: (typeof VOICES)[number]): boolean => readScore(voice, score[voice]).every((rate) => rate === null);
      const melodic = !(silent('DULCIMER') && silent('DULCIMER_HIGH') && silent('STRINGS'));
      expect(melodic, sceneId).toBe(phrasesOf(sceneId) > 1);
      if (phrasesOf(sceneId) === 1) {
        // 鐘は拍ごとに1打、拍の中の同じ位置に置く（等間隔）。
        const beats = score.BELL.split('|');
        const offsets = beats.map((beat) => [...beat].findIndex((mark) => mark !== '.'));
        expect(beats.every((beat) => [...beat].filter((mark) => mark !== '.').length === 1), sceneId).toBe(true);
        expect(new Set(offsets).size, sceneId).toBe(1);
      }
    }
  });

  it('1周期の句の数は、通常のシーンで1、各アクトの最後のシーンで2、5-10 で4', () => {
    expect(phrasesOf('SCENE_1_01')).toBe(1);
    expect(['SCENE_1_02', 'SCENE_2_04', 'SCENE_3_06', 'SCENE_4_08'].map(phrasesOf)).toEqual([2, 2, 2, 2]);
    expect(phrasesOf('SCENE_5_10')).toBe(4);
  });

  it('音階は D の和声的短音階で、短3度・短6度・導音を持つ', () => {
    expect(SCALE_CENTS).toEqual([0, 200, 300, 500, 700, 800, 1100]);
  });

  it('打楽器と鐘は x を一打とし、打弦は数字を音階の度数として音の高さへ写す', () => {
    expect(readScore('DRUM_HIGH', 'x.')).toEqual([1, null]);
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
