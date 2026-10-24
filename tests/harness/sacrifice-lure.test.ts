// [V-TEST-REFAI]［供犠の誘いの検証］の目標。1シーンあたり数千歩を敵軍AIの探索で戦うため実行時間が長い。

import { describe, expect, it } from 'vitest';
import { lureTrial } from './sacrifice-lure.js';
import { impulsiveStandIn, responsiveStandIn } from './stand-ins.js';

describe('[V-TEST-REFAI]［供犠の誘いの検証］', () => {
  it('代理1（直情型）：1-01 で HP を半分以上失い、供犠しなければ 1-02 で HP が尽き、供犠すれば勝つ', { timeout: 3_600_000 }, () => {
    const { scene101, kept, sacrificed } = lureTrial(impulsiveStandIn, true);
    console.log(JSON.stringify({ stand: 'impulsive', scene101, kept, sacrificed }));
    expect(scene101.result).toBe('WIN');
    expect(scene101.minHp).toBeLessThanOrEqual(29);
    expect(kept?.result).toBe('LOSS');
    expect(kept?.rootLoss).toBe(false);
    expect(sacrificed?.result).toBe('WIN');
  });

  it('代理2（応手型）：1-01 で HP を保ち、供犠せずに 1-02 に勝つ', { timeout: 3_600_000 }, () => {
    const { scene101, kept } = lureTrial(responsiveStandIn, false);
    console.log(JSON.stringify({ stand: 'responsive', scene101, kept }));
    expect(scene101.result).toBe('WIN');
    expect(scene101.minHp).toBeGreaterThanOrEqual(45);
    expect(kept?.result).toBe('WIN');
  });
});
