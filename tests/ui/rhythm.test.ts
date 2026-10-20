// [M-DATA-AUDIO-CUE]【打楽器の型】打楽器の型と、打楽器の一打の資産。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import { DRUMS, RHYTHM_STEPS, SCENE_RHYTHMS } from '../../src/ui/audio/rhythm.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;

describe('[M-DATA-AUDIO-CUE] 打楽器の型', () => {
  it('型は打楽器ごとに16区切りの x と . で書く', () => {
    for (const [sceneId, rhythm] of Object.entries(SCENE_RHYTHMS)) {
      for (const drum of DRUMS) {
        expect(rhythm[drum], `${sceneId} ${drum}`).toMatch(new RegExp(`^[x.]{${RHYTHM_STEPS}}$`));
      }
    }
  });

  it('審査範囲の6シーンが型を持ち、4つの打楽器が DRUM の資産を持つ', () => {
    expect(Object.keys(SCENE_RHYTHMS).sort()).toEqual(['SCENE_1_01', 'SCENE_1_02', 'SCENE_2_01', 'SCENE_2_02', 'SCENE_2_03', 'SCENE_2_04']);
    const variants = Object.values(assets)
      .filter((record) => record.slot === 'BGM' && record.cue === 'DRUM')
      .map((record) => record.variant)
      .sort();
    expect(variants).toEqual([...DRUMS].sort());
  });
});
