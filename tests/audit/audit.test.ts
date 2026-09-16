// [V-AUDIT-SCRIPT] [V-TEST-NONFUNC] 静的監査。テスト名は [I-PLAN-WORKFLOW]［テスト名］に従い
// 検証条件の連番をそのまま用いる。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import {
  audit,
  buildAuditInput,
  maxEffectiveWall,
  poolOf,
  ROOT_THOUGHT,
} from '../../tools/audit/lib.js';

const result = audit();
const rowOf = (sceneId: string) => {
  const row = result.rows.find((entry: { scene_id: string }) => entry.scene_id === sceneId);
  if (row === undefined) {
    throw new Error(`監査行が見つからない: ${sceneId}`);
  }
  return row;
};

describe('[V-AUDIT-SCRIPT] 走査範囲', () => {
  it('全30シーンを走査する（5-11 は [M-TMPL-VESSEL] により除外）', () => {
    expect(result.rows).toHaveLength(30);
    expect(result.rows.map((row: { scene_id: string }) => row.scene_id)).not.toContain('SCENE_5_11');
  });

  it('ROOT_THOUGHT は [M-BASE-AR-SYSTEM] の定義値 550 の転記である', () => {
    expect(ROOT_THOUGHT).toBe(550);
  });
});

describe('D-03 壁不変条件', () => {
  it('全シーンで wall(N) <= pool_max_atk(N) が成立する', () => {
    expect(result.fails.filter((entry: string) => entry.startsWith('D-03'))).toEqual([]);
  });

  it('[M-GUARD-BREAKER] の各区間で境界シーンの等号が成立する', () => {
    // 担当シーンの要求基礎攻撃力と、当該区間の最大壁が一致すること。
    expect(rowOf('SCENE_2_04').wall).toBe(48); // 2-01 ヴォルグの要求値
    expect(rowOf('SCENE_3_06').wall).toBe(72); // 2-04 アシャルの要求値
    expect(rowOf('SCENE_5_10').wall).toBe(152); // 4-08 ゾル＝ヴォドの要求値
    expect(rowOf('SCENE_2_04').pool_max_atk).toBe(48);
    expect(rowOf('SCENE_3_06').pool_max_atk).toBe(72);
    expect(rowOf('SCENE_5_10').pool_max_atk).toBe(152);
  });

  it('[M-DATA-HERO-INIT]［監査上の扱い］1-01 の pool_max_atk は ACT_HEAVY_AR15 の 27 である', () => {
    expect(rowOf('SCENE_1_01').pool_max_atk).toBe(ACTION_MASTERS.ACT_HEAVY_AR15.params.atk);
    expect(rowOf('SCENE_1_01').pool_max_atk).toBe(27);
  });
});

describe('D-04a 初弾到達速度', () => {
  it('全シーンで first_hit(プール, wall=0) < ROOT_THOUGHT が成立する', () => {
    expect(result.fails.filter((entry: string) => entry.startsWith('D-04a'))).toEqual([]);
    for (const row of result.rows) {
      expect(row.first_hit_open).toBeLessThan(ROOT_THOUGHT);
    }
  });
});

describe('D-04b 想定戦闘長内の壁貫通', () => {
  it('全シーンで first_hit(プール, wall) <= expected_length が成立する', () => {
    expect(result.warns.filter((entry: string) => entry.startsWith('D-04b'))).toEqual([]);
  });
});

describe('D-06 非対称窓における実効上限', () => {
  it('[M-GUARD-ASYM] の実効壁は 4-03 が 104、4-04 が 110 である', () => {
    expect(rowOf('SCENE_4_03').wall).toBe(69);
    expect(rowOf('SCENE_4_03').effective_wall).toBe(104);
    expect(rowOf('SCENE_4_04').wall).toBe(73);
    expect(rowOf('SCENE_4_04').effective_wall).toBe(110);
  });

  it('4-05 以降は主人公側の攻撃力バフが相殺するため基礎値監査と一致する', () => {
    for (const sceneId of ['SCENE_4_05', 'SCENE_4_06', 'SCENE_5_10']) {
      expect(rowOf(sceneId).effective_wall).toBe(rowOf(sceneId).wall);
    }
  });

  it('実効壁は全シーンで pool_max_atk を超えない', () => {
    expect(result.warns.filter((entry: string) => entry.startsWith('D-06'))).toEqual([]);
  });
});

describe('D-07 射程到達性不変条件', () => {
  it('全シーンで worst_distance(N) <= max_range(N) が成立する', () => {
    expect(result.fails.filter((entry: string) => entry.startsWith('D-07'))).toEqual([]);
  });

  it('[M-GUARD-REACH] 位置干渉の初出 3-02 以降は range = 3 が 2-01 のクリアで入手済みである', () => {
    expect(ACTION_MASTERS.ACT_SPEC_BREAK_VOLG.params.range).toBe(3);
    expect(ENEMY_MASTERS.ENEMY_VOLG.acts).toContain('ACT_SPEC_BREAK_VOLG');
    expect(rowOf('SCENE_3_02').max_range).toBe(3);
    expect(rowOf('SCENE_3_02').worst_distance).toBe(2);
  });
});

describe('[M-TMPL-ENEMY-FINAL] 5-10 武技（特殊）の基礎攻撃力', () => {
  it('プレイヤーが 5-10 で到達しうる実効防壁の上限以上である', () => {
    const scenes = buildAuditInput({ actions: ACTION_MASTERS, enemies: ENEMY_MASTERS, scenes: SCENE_MASTERS });
    const index = scenes.findIndex((scene: { scene_id: string }) => scene.scene_id === 'SCENE_5_10');
    const bound = maxEffectiveWall(poolOf(scenes, index), ATTENDANT_MASTERS);
    expect(bound).toBe(355);
    expect(ACTION_MASTERS.ACT_SPEC_TERMINUS_VEIN.params.atk).toBeGreaterThanOrEqual(bound);
  });
});

describe('[M-GUARD-BREAKER]［火力の要求］', () => {
  // 壁割り担当と要求基礎攻撃力は [M-GUARD-BREAKER] の表による。
  const BREAKERS: readonly (readonly [string, number])[] = [
    ['ACT_SPEC_BREAK_VOLG', 48],
    ['ACT_SPEC_BREAK_ASHAL', 72],
    ['ACT_SPEC_BREAK_ZEFAL', 110],
    ['ACT_SPEC_BREAK_ZOL_VOD', 152],
  ];

  it('各担当が要求基礎攻撃力を満たす', () => {
    for (const [classId, required] of BREAKERS) {
      expect(ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS].params.atk).toBeGreaterThanOrEqual(required);
    }
  });

  it('HPダメージ係数が dmg_hp / atk = 0.38 / 3.46 を下回らない', () => {
    for (const [classId] of BREAKERS) {
      const params = ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS].params;
      // centi 同士で比較する。dmg_hp(centi) * 346 >= atk * 38 * 100
      expect(params.dmg_hp * 346).toBeGreaterThanOrEqual(params.atk * 38 * 100);
    }
  });

  it('[M-GUARD-REACH] 2-01 の担当は range = 3 を併せ持つ', () => {
    expect(ACTION_MASTERS.ACT_SPEC_BREAK_VOLG.params.range).toBe(3);
  });
});
