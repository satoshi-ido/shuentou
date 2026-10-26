// [M-DATA-ASSETMASTER]［構えの選択］発生中のユニットが示す系統ごとの構えの画。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import type { SysFlag, Unit } from '../../src/engine/types.js';
import { pickAsset } from '../../src/ui/assets/resolve.js';
import { stancePoseOf } from '../../src/ui/view/figure-motion.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;

function unitIn(state: Unit['state'], flags: SysFlag[]): Unit {
  return {
    state,
    last_act: { instance_id: 'I0001', class_id: 'ACT_TEST', sys_flags: flags, params: {}, uses_left_before: 1, is_copy: false },
  } as unknown as Unit;
}

describe('[M-DATA-ASSETMASTER]［構えの選択］', () => {
  it('系統フラグを武技・体勢・心気（召喚を含む）の順に当てはめる', () => {
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_MARTIAL']))).toBe('MARTIAL');
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_MARTIAL', 'FLAG_STANCE']))).toBe('MARTIAL');
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_PURIFY', 'FLAG_STANCE']))).toBe('STANCE');
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_STANCE', 'FLAG_SUMMON']))).toBe('STANCE');
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_MIND', 'FLAG_PURIFY']))).toBe('MIND');
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_SUMMON']))).toBe('MIND');
    expect(stancePoseOf(unitIn('STARTUP', ['FLAG_SWAP']))).toBeNull();
    expect(stancePoseOf(unitIn('STARTUP', []))).toBeNull();
  });

  it('発生中でないユニットは構えを示さない', () => {
    expect(stancePoseOf(unitIn('RECOVERY', ['FLAG_MARTIAL']))).toBeNull();
    expect(stancePoseOf(unitIn('THOUGHT', ['FLAG_MARTIAL']))).toBeNull();
  });

  it('盤面に立つ姿の立ち絵は、どれも3つの構えの画を持ち、condition を引き継ぐ', () => {
    const bases = Object.values(assets).filter(
      (record) =>
        record.slot === 'STANDING' && (record.pose ?? null) === null && ['HERO', 'ENEMY', 'CREATURE'].includes(record.owner_kind),
    );
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      for (const pose of ['MARTIAL', 'STANCE', 'MIND'] as const) {
        const posed = assets[`${base.asset_id}_${pose}`];
        expect(posed?.pose, base.asset_id).toBe(pose);
        expect(posed?.condition ?? null, base.asset_id).toBe(base.condition ?? null);
      }
    }
  });

  it('構えは STANDING に限り、同じ所有者・構え・条件の画は高々1件である', () => {
    const keys: Record<string, number> = {};
    for (const record of Object.values(assets)) {
      if ((record.pose ?? null) === null) {
        continue;
      }
      expect(record.slot, record.asset_id).toBe('STANDING');
      const key = `${record.owner_kind}/${record.owner_id}/${record.pose}/${record.condition ?? ''}`;
      keys[key] = (keys[key] ?? 0) + 1;
    }
    expect(Object.entries(keys).filter(([, count]) => count > 1)).toEqual([]);
  });

  it('構えの画は条件の成立する版を選び、構えを持たない選び方には構えの画が混ざらない', () => {
    const act2 = (condition: string): boolean => condition === 'ActNumber == 2';
    const act1 = (): boolean => false;
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2, 'MARTIAL')?.asset_id).toBe('ASSET_HERO_STANDING_COAT_ACT2_MARTIAL');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act1, 'MARTIAL')?.asset_id).toBe('ASSET_HERO_STANDING_MARTIAL');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', null, 'STANCE')?.asset_id).toBe('ASSET_HERO_STANDING_STANCE');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2)?.asset_id).toBe('ASSET_HERO_STANDING_COAT_ACT2');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act1)?.asset_id).toBe('ASSET_HERO_STANDING');
    expect(pickAsset(assets, 'ENEMY', 'ENEMY_DORN', 'STANDING', act1, 'MIND')?.asset_id).toBe('ASSET_DORN_STANDING_MIND');
  });
});
