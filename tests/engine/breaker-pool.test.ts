// [M-INHERIT-POOL]［壁割り手段の常設］[M-GUARD-BREAKER] の担当が、カバー区間の各インターミッションで
// 継承プールに載ることを検査する。

import { describe, expect, it } from 'vitest';
import { BREAKERS } from '../../src/data/generated/breaker-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { inheritPool } from '../../src/engine/progress/inherit.js';
import { createInitialRun } from '../../src/engine/run/newgame.js';
import { sceneByOrder } from '../../src/engine/run/masters.js';
import { MASTERS } from '../harness/runner.js';

// order のシーンをクリアした直後のインターミッションにおけるプール。
function poolAfterClearing(order: number): string[] {
  const run = createInitialRun(MASTERS);
  run.current_scene_id = sceneByOrder(MASTERS, order + 1).scene_id;
  run.phase = 'INTERMISSION';
  return inheritPool(run, MASTERS)
    .filter((target): target is { kind: 'ACTION'; class_id: string } => target.kind === 'ACTION')
    .map((target) => target.class_id);
}

describe('[M-GUARD-BREAKER] 担当表', () => {
  it('2件が担当シーンの進行順で昇順に並ぶ', () => {
    expect(BREAKERS.map((entry) => entry.class_id)).toEqual(['ACT_SPEC_BREAK_ZEFAL', 'ACT_SPEC_BREAK_ZOL_VOD']);
    // 3-06・4-08 の進行順。1-01〜3-06 は主人公初期キットの区間である。
    expect(BREAKERS.map((entry) => entry.order)).toEqual([12, 20]);
    for (const entry of BREAKERS) {
      expect(sceneByOrder(MASTERS, entry.order)).toBeDefined();
    }
  });
});

describe('[M-INHERIT-POOL]［壁割り手段の常設］', () => {
  it('担当シーンのクリア直後はプールに載る', () => {
    expect(poolAfterClearing(12)).toContain('ACT_SPEC_BREAK_ZEFAL'); // 3-06
    expect(poolAfterClearing(20)).toContain('ACT_SPEC_BREAK_ZOL_VOD'); // 4-08
  });

  it('カバー区間の各インターミッションで載り続ける', () => {
    // 3-06 の担当は 4-01〜4-07 のクリア後も入手できる（カバー区間 4-01〜4-08）。
    for (const order of [12, 13, 16, 19]) {
      expect(poolAfterClearing(order)).toContain('ACT_SPEC_BREAK_ZEFAL');
    }
  });

  it('次の担当が登場すると前任は外れる', () => {
    // 4-08 をクリアした時点でカバー区間は 4-08 の担当へ移る。
    expect(poolAfterClearing(20)).not.toContain('ACT_SPEC_BREAK_ZEFAL');
    expect(poolAfterClearing(20)).toContain('ACT_SPEC_BREAK_ZOL_VOD');
  });

  it('担当シーンより前のインターミッションには載らない', () => {
    for (const order of [1, 3, 6, 11]) {
      expect(poolAfterClearing(order)).not.toContain('ACT_SPEC_BREAK_ZEFAL');
    }
  });

  it('重複して載せない', () => {
    // 3-06 の直後は敵マスターの所持としても常設としても該当するが、1件に限る。
    const pool = poolAfterClearing(12);
    expect(pool.filter((classId) => classId === 'ACT_SPEC_BREAK_ZEFAL')).toHaveLength(1);
  });

  it('最終区間（4-08 の担当）は 5-10 まで載り続ける', () => {
    const lastOrder = Object.values(SCENE_MASTERS).find((scene) => scene.scene_id === 'SCENE_5_10')?.order ?? 0;
    expect(lastOrder).toBe(30);
    for (const order of [20, 25, 29]) {
      expect(poolAfterClearing(order)).toContain('ACT_SPEC_BREAK_ZOL_VOD');
    }
  });
});
