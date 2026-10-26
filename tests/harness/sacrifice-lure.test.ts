// [V-TEST-REFAI]［供犠の誘いの検証］の目標。1シーンあたり数千歩を敵軍AIの探索で戦うため実行時間が長い。

import { describe, expect, it } from 'vitest';
import { lureTrial } from './sacrifice-lure.js';
import { impulsiveStandIn, responsiveStandIn } from './stand-ins.js';

// 供犠しても勝利を目標としない継承（[V-TEST-REFAI]［供犠の誘いの検証］「目標」の例外）。
const SACRIFICE_EXEMPT = ['ACT_MUSOU_AR3', 'ACT_HEAVY_AR3'];

describe('[V-TEST-REFAI]［供犠の誘いの検証］', () => {
  it('代理1（直情型）：1-01 で HP を半分以上失い、供犠しなければいずれを継承しても 1-02 で HP が尽き、心気（無想）AR3・武技（重撃）AR3 以外を継承して供犠すれば勝つ', { timeout: 3_600_000 }, () => {
    const { scene101, kept, sacrificed } = lureTrial(impulsiveStandIn, true);
    console.log(JSON.stringify({ stand: 'impulsive', scene101, kept, sacrificed }));
    expect(scene101.result).toBe('WIN');
    expect(scene101.minHp).toBeLessThanOrEqual(29);
    expect(Object.keys(kept).length).toBeGreaterThan(0);
    for (const [label, battle] of Object.entries(kept)) {
      expect([label, battle.result, battle.rootLoss]).toEqual([label, 'LOSS', false]);
    }
    expect(Object.keys(sacrificed).length).toBeGreaterThan(0);
    for (const [label, battle] of Object.entries(sacrificed)) {
      if (SACRIFICE_EXEMPT.includes(label)) continue;
      expect([label, battle.result]).toEqual([label, 'WIN']);
    }
  });

  it('代理2（応手型）：1-01 で HP を保ち、いずれを継承しても供犠せずに 1-02 に勝つ', { timeout: 3_600_000 }, () => {
    const { scene101, kept } = lureTrial(responsiveStandIn, false);
    console.log(JSON.stringify({ stand: 'responsive', scene101, kept }));
    expect(scene101.result).toBe('WIN');
    expect(scene101.minHp).toBeGreaterThanOrEqual(45);
    expect(Object.keys(kept).length).toBeGreaterThan(0);
    for (const [label, battle] of Object.entries(kept)) {
      expect([label, battle.result]).toEqual([label, 'WIN']);
    }
  });
});
