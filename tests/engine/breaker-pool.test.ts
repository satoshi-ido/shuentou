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
  it('4件が担当シーンの進行順で昇順に並ぶ', () => {
    expect(BREAKERS.map((entry) => entry.class_id)).toEqual([
      'ACT_SPEC_BREAK_VOLG',
      'ACT_SPEC_BREAK_ASHAL',
      'ACT_SPEC_BREAK_ZEFAL',
      'ACT_SPEC_BREAK_ZOL_VOD',
    ]);
    // 2-01・2-04・3-06・4-08 の進行順。
    expect(BREAKERS.map((entry) => entry.order)).toEqual([3, 6, 12, 20]);
    for (const entry of BREAKERS) {
      expect(sceneByOrder(MASTERS, entry.order)).toBeDefined();
    }
  });
});

describe('[M-INHERIT-POOL]［壁割り手段の常設］', () => {
  it('担当シーンのクリア直後はプールに載る', () => {
    expect(poolAfterClearing(3)).toContain('ACT_SPEC_BREAK_VOLG'); // 2-01
    expect(poolAfterClearing(6)).toContain('ACT_SPEC_BREAK_ASHAL'); // 2-04
  });

  it('カバー区間の各インターミッションで載り続ける', () => {
    // 2-01 の担当は 2-02・2-03 のクリア後も入手できる（カバー区間 2-02〜2-04）。
    for (const order of [3, 4, 5]) {
      expect(poolAfterClearing(order)).toContain('ACT_SPEC_BREAK_VOLG');
    }
  });

  it('次の担当が登場すると前任は外れる', () => {
    // 2-04 をクリアした時点でカバー区間は 2-04 の担当へ移る。
    expect(poolAfterClearing(6)).not.toContain('ACT_SPEC_BREAK_VOLG');
    expect(poolAfterClearing(6)).toContain('ACT_SPEC_BREAK_ASHAL');
  });

  it('担当シーンより前のインターミッションには載らない', () => {
    expect(poolAfterClearing(1)).not.toContain('ACT_SPEC_BREAK_VOLG'); // 1-01 クリア後
    expect(poolAfterClearing(2)).not.toContain('ACT_SPEC_BREAK_VOLG'); // 1-02 クリア後
  });

  it('重複して載せない', () => {
    // 2-01 の直後は敵マスターの所持としても常設としても該当するが、1件に限る。
    const pool = poolAfterClearing(3);
    expect(pool.filter((classId) => classId === 'ACT_SPEC_BREAK_VOLG')).toHaveLength(1);
  });

  it('最終区間（4-08 の担当）は 5-10 まで載り続ける', () => {
    const lastOrder = Object.values(SCENE_MASTERS).find((scene) => scene.scene_id === 'SCENE_5_10')?.order ?? 0;
    expect(lastOrder).toBe(30);
    for (const order of [20, 25, 29]) {
      expect(poolAfterClearing(order)).toContain('ACT_SPEC_BREAK_ZOL_VOD');
    }
  });
});
