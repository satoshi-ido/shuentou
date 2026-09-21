// [V-TEST-REFAI]［役割充足による選択］役割の判定順と充足条件。

import { describe, expect, it } from 'vitest';
import type { InheritTarget } from '../../src/engine/progress/inherit.js';
import { breakerForScene, chooseByRole } from './runner.js';

const action = (classId: string): InheritTarget => ({ kind: 'ACTION', class_id: classId });
const held = (masterRef: string, usesLeft: number, sysFlags: string[] = []) => ({
  master_ref: masterRef,
  uses_left: usesLeft,
  sys_flags: sysFlags,
});
const MIND_FULL = held('ACT_MIND_AR12', 10, ['FLAG_MIND']);

describe('[V-TEST-REFAI]［役割充足による選択］', () => {
  it('次に挑むシーンの担当を [M-GUARD-BREAKER] のカバー区間から引く', () => {
    expect(breakerForScene('SCENE_2_01')).toBeNull(); // 初期キットの区間
    expect(breakerForScene('SCENE_3_01')).toBe('ACT_SPEC_BREAK_ASHAL');
    expect(breakerForScene('SCENE_4_01')).toBe('ACT_SPEC_BREAK_ZEFAL');
  });

  it('体力が未充足なら最大HP加算を最優先で選ぶ', () => {
    const run = { current_scene_id: 'SCENE_3_02', hero_max_hp: 200, hero_acts: [MIND_FULL] };
    const pool: InheritTarget[] = [action('ACT_SPEC_BREAK_ASHAL'), { kind: 'MAX_HP' }];
    expect(chooseByRole(run, pool, 212)).toEqual({ kind: 'MAX_HP' });
  });

  it('担当の残り使用回数が2未満なら壁割りを選ぶ', () => {
    const run = {
      current_scene_id: 'SCENE_3_02',
      hero_max_hp: 284,
      hero_acts: [MIND_FULL, held('ACT_SPEC_BREAK_ASHAL', 1), held('ACT_HEAVY_AR9', 10)],
    };
    const pool: InheritTarget[] = [action('ACT_HEAVY_AR9'), action('ACT_SPEC_BREAK_ASHAL')];
    expect(chooseByRole(run, pool, 212)).toEqual(action('ACT_SPEC_BREAK_ASHAL'));
  });

  it('反復射程は壁割り担当を数えず、壁割り以外の射程武技を選ぶ', () => {
    const run = {
      current_scene_id: 'SCENE_3_02',
      hero_max_hp: 284,
      hero_acts: [MIND_FULL, held('ACT_SPEC_BREAK_ASHAL', 5)],
    };
    const pool: InheritTarget[] = [action('ACT_SPEC_BREAK_ASHAL'), action('ACT_HEAVY_AR9')];
    expect(chooseByRole(run, pool, 212)).toEqual(action('ACT_HEAVY_AR9'));
  });

  it('すべての役割が充足していれば null を返し、循環選択に委ねる', () => {
    const run = {
      current_scene_id: 'SCENE_3_02',
      hero_max_hp: 284,
      hero_acts: [MIND_FULL, held('ACT_SPEC_BREAK_ASHAL', 5), held('ACT_HEAVY_AR9', 10)],
    };
    const pool: InheritTarget[] = [action('ACT_SPEC_BREAK_ASHAL'), action('ACT_HEAVY_AR9')];
    expect(chooseByRole(run, pool, 212)).toBeNull();
  });
});
