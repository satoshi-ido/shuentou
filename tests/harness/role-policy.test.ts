// [V-TEST-REFAI]［役割充足による選択］役割の判定順と充足条件。

import { describe, expect, it } from 'vitest';
import type { InheritTarget } from '../../src/engine/progress/inherit.js';
import { BONUS_REFAI_STANCE } from '../../src/ai/constants.js';
import { referenceProfile } from '../../src/ai/profile.js';
import {
  battleProfileFor,
  breakerForScene,
  chooseByRole,
  chooseMindRefill,
  mindShort,
  ROLE_HP_STALE_INTERMISSIONS,
} from './runner.js';

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

  it('最大HPが hp_bonus_base 以上でも、最大HP加算の途絶が続くときは最大HP加算を選ぶ', () => {
    const run = { current_scene_id: 'SCENE_3_02', hero_max_hp: 284, hero_acts: [MIND_FULL] };
    const pool: InheritTarget[] = [action('ACT_SPEC_BREAK_ASHAL'), { kind: 'MAX_HP' }];
    expect(chooseByRole(run, pool, 212, true)).toEqual({ kind: 'MAX_HP' });
    expect(chooseByRole(run, pool, 212, false)).toEqual(action('ACT_SPEC_BREAK_ASHAL'));
  });

  it('途絶とみなすのは直近3回のインターミッションで最大HP加算がないとき', () => {
    expect(ROLE_HP_STALE_INTERMISSIONS).toBe(3);
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

describe('[V-TEST-REFAI]「体勢への減点」の方針別の適用', () => {
  it('防御型の戦闘では体勢の減点を外し、他の方針は与えた重みのまま用いる', () => {
    const base = referenceProfile();
    expect(base.actionBonus.STANCE).toBe(BONUS_REFAI_STANCE);
    expect(battleProfileFor('DEFENSE', base).actionBonus.STANCE).toBe(0);
    for (const policy of ['ATTACK', 'BALANCE'] as const) {
      expect(battleProfileFor(policy, base)).toBe(base);
    }
  });
});

describe('[V-TEST-REFAI]［心気の出力］', () => {
  // 3-01 の後（次に挑むシーンは 3-02。壁割り担当 ACT_SPEC_BREAK_ASHAL の PP コスト12）。
  const runBefore302 = (heroActs: ReturnType<typeof held>[]) => ({ current_scene_id: 'SCENE_3_02', hero_acts: heroActs });
  const HELD_AR4 = held('ACT_MIND_AR4', 30, ['FLAG_MIND']); // 心気1回の PP 2.32

  it('保持する心気で壁割りを賄えず、2回で賄える高出力の心気がプールにあれば不足とする', () => {
    expect(mindShort(runBefore302([HELD_AR4]), [action('ACT_MIND_AR12')])).toBe(true); // 8.04 × 2 ≥ 12
  });

  it('プールの心気が2回でも賄えない小刻みな更新であれば不足としない', () => {
    expect(mindShort(runBefore302([HELD_AR4]), [action('ACT_MIND_AR9')])).toBe(false); // 5.22 × 2 < 12
  });

  it('保持する心気が1回で壁割りを賄えれば不足としない', () => {
    expect(mindShort(runBefore302([held('ACT_MIND_AR19', 30, ['FLAG_MIND'])]), [action('ACT_MIND_AR24')])).toBe(false); // 12.65 ≥ 12
  });

  it('プールの心気は心気1回の PP が最大のものを選ぶ', () => {
    expect(chooseMindRefill([action('ACT_MIND_AR9'), action('ACT_MIND_AR12'), action('ACT_MIND_AR8')])).toEqual(action('ACT_MIND_AR12'));
  });
});
