// [S-LOOK-PRINCIPLE]【盤面の大きさ】人物ごとの立ち絵の表示の大きさ（art/heights.js）。

import { describe, expect, it } from 'vitest';
import { FIGURE_HEIGHTS } from '../../art/heights.js';
import { targetOf } from '../../art/image.js';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import { ART_FILES, STANDING_BODIES } from '../../src/ui/assets/art-manifest.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;
const entries = Object.entries(FIGURE_HEIGHTS as Record<string, { height: number; body?: number }>);

describe('[S-LOOK-PRINCIPLE]【盤面の大きさ】', () => {
  it('表の立ち絵は構えを持たない STANDING であり、高さは上限 104 ドット以内、背丈は高さ以内である', () => {
    for (const [id, entry] of entries) {
      const record = assets[id];
      expect(record?.slot, id).toBe('STANDING');
      expect(record?.pose ?? null, id).toBeNull();
      expect(entry.height, id).toBeLessThanOrEqual(104);
      expect(entry.body ?? entry.height, id).toBeLessThanOrEqual(entry.height);
    }
  });

  it('実体のある元の立ち絵は、どれも表に載り（同じ画を共有するものは代表が載り）、目録に背丈が書き出される', () => {
    const bases = Object.values(assets).filter(
      (record) => record.slot === 'STANDING' && (record.pose ?? null) === null && ART_FILES.includes(record.path),
    );
    expect(bases.length).toBeGreaterThan(0);
    const tabled = new Set(entries.map(([id]) => `art/${targetOf(id)?.file}`));
    for (const record of bases) {
      expect(tabled.has(record.path), record.asset_id).toBe(true);
      expect(STANDING_BODIES[record.path], record.asset_id).toBeDefined();
    }
  });
});
