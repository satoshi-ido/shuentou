// [V-TEST-REFAI]［役割充足による選択］役割の判定順と充足条件。

import { describe, expect, it } from 'vitest';
import type { InheritTarget } from '../../src/engine/progress/inherit.js';
import { BONUS_REFAI_STANCE } from '../../src/ai/constants.js';
import { referenceProfile } from '../../src/ai/profile.js';
import {
  battleProfileFor,
  beforeVesselScene,
  breakerForScene,
  chooseByRole,
  chooseMindRefill,
  missingBreaker,
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

describe('[V-TEST-REFAI]［壁割りの維持］「5-10 の前の補充」', () => {
  const ZOL_VOD = 'ACT_SPEC_BREAK_ZOL_VOD';
  const member = (attendantId: string, inheritState = 'UNUSED') => ({ attendant_id: attendantId, inherit_state: inheritState });
  const run = (sceneId: string, usesLeft: number, party: ReturnType<typeof member>[]) => ({
    current_scene_id: sceneId,
    hero_max_hp: 1000,
    hero_acts: [MIND_FULL, held(ZOL_VOD, usesLeft)],
    party,
  });
  const pool: InheritTarget[] = [{ kind: 'MAX_HP' }, action(ZOL_VOD)];

  it('依代のシーンの直前のシーン（5-10）に挑む回に限る', () => {
    expect(beforeVesselScene({ current_scene_id: 'SCENE_5_10' })).toBe(true);
    expect(beforeVesselScene({ current_scene_id: 'SCENE_5_09' })).toBe(false);
    expect(beforeVesselScene({ current_scene_id: 'SCENE_4_08' })).toBe(false);
  });

  it('判定の残り使用回数は、未継承の同行従者が継承した場合の実効初期使用回数の最大とする', () => {
    // 従者01 の使用回数係数450 → 5回、従者11 の300 → 3回（基礎使用回数1回）。
    expect(missingBreaker(run('SCENE_5_10', 4, [member('ATTENDANT_01'), member('ATTENDANT_11')]))).toBe(ZOL_VOD);
    expect(missingBreaker(run('SCENE_5_10', 5, [member('ATTENDANT_01'), member('ATTENDANT_11')]))).toBeNull();
    expect(missingBreaker(run('SCENE_5_10', 2, [member('ATTENDANT_01', 'SPENT'), member('ATTENDANT_11')]))).toBe(ZOL_VOD);
    expect(missingBreaker(run('SCENE_5_10', 3, [member('ATTENDANT_01', 'SPENT'), member('ATTENDANT_11')]))).toBeNull();
    expect(missingBreaker(run('SCENE_5_09', 2, [member('ATTENDANT_01'), member('ATTENDANT_11')]))).toBeNull();
  });

  it('［役割充足による選択］では当該回に限り壁割りを体力に先立てる', () => {
    const party = [member('ATTENDANT_01'), member('ATTENDANT_11')];
    expect(chooseByRole(run('SCENE_5_10', 2, party), pool, 2000)).toEqual(action(ZOL_VOD));
    expect(chooseByRole(run('SCENE_5_09', 1, party), pool, 2000)).toEqual({ kind: 'MAX_HP' });
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

  it('2回後の PP は [M-RESOLVE-MIND] の目標PPと同じく四捨五入して壁割りの PP コストと比べる', () => {
    // 4-01 の後（次に挑むシーンは 4-02。壁割り担当 ACT_SPEC_BREAK_ZEFAL の PP コスト26）。
    const runBefore402 = { current_scene_id: 'SCENE_4_02', hero_acts: [held('ACT_MIND_AR12', 45, ['FLAG_MIND'])] };
    expect(mindShort(runBefore402, [action('ACT_MIND_AR20')])).toBe(true); // round(12.95 × 2) = 26 ≥ 26
  });

  it('保持する心気が1回で壁割りを賄えれば不足としない', () => {
    expect(mindShort(runBefore302([held('ACT_MIND_AR19', 30, ['FLAG_MIND'])]), [action('ACT_MIND_AR24')])).toBe(false); // 12.65 ≥ 12
  });

  it('プールの心気は心気1回の PP が最大のものを選ぶ', () => {
    expect(chooseMindRefill([action('ACT_MIND_AR9'), action('ACT_MIND_AR12'), action('ACT_MIND_AR8')])).toEqual(action('ACT_MIND_AR12'));
  });
});
