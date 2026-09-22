// [M-META-MIRRORSTATS] 鏡像統計。系統別実行回数・初手系統の判定と、5-08 クリアでの確定。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { deriveSysFlags } from '../../src/engine/flags.js';
import { countExecution, createMirrorStats, firstSystemOf, MIRROR_COUNT_ORDER } from '../../src/engine/mirror.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { settleBattleClear } from '../../src/engine/progress/clear.js';
import { createInitialRun } from '../../src/engine/run/newgame.js';
import { createScene } from '../../src/engine/setup.js';
import { MASTERS } from '../harness/runner.js';
import type { ActionInstance } from '../../src/engine/types.js';

// マスタのレコードから、判定に必要な最小のインスタンスを起こす。
function instanceOf(classId: string): ActionInstance {
  const record = ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
  if (record === undefined) {
    throw new Error(`未知のアクションクラスID: ${classId}`);
  }
  const params = record.params;
  return {
    instance_id: `IID_${classId}`,
    master_ref: classId,
    sys_flags: deriveSysFlags(params),
    base_params: params,
    merge_params: params,
    uses_initial: 1,
    uses_left: 1,
    seal_accum: 0,
    is_copy: false,
    copy_fixation: 0,
  };
}

const index = (system: string) => MIRROR_COUNT_ORDER.indexOf(system as (typeof MIRROR_COUNT_ORDER)[number]);

describe('[M-STATE-RUNSTATE] counts の並び', () => {
  it('武技 / 体勢 / 心気 / 召喚 の順の4要素である', () => {
    expect([...MIRROR_COUNT_ORDER]).toEqual(['MARTIAL', 'STANCE', 'MIND', 'SUMMON']);
    expect(createMirrorStats().counts).toEqual([0, 0, 0, 0]);
    expect(createMirrorStats().first_system).toBe('NONE');
  });
});

describe('[M-META-MIRRORSTATS] first_system の確定規則', () => {
  it('単体アクションは自身の系統を採る', () => {
    expect(firstSystemOf(instanceOf('ACT_SLASH_AR3'))).toBe('MARTIAL');
    expect(firstSystemOf(instanceOf('ACT_GUARD_AR3'))).toBe('STANCE');
    expect(firstSystemOf(instanceOf('ACT_MIND_AR3'))).toBe('MIND');
    expect(firstSystemOf(instanceOf('ACT_SUMMON_AR4'))).toBe('SUMMON');
  });

  it('複合アクションは 召喚 → 心気 → 武技 → 体勢 の解決順で最初に該当する系統を採る', () => {
    // 5-04 の複合特殊は体勢と武技を内包する（[M-BASE-AR-COMPOSITE]）。解決順により武技が先に該当する。
    const composite = instanceOf('ACT_SPEC_DEBUFF_WALL_ERNA_080');
    expect(composite.sys_flags).toContain('FLAG_STANCE');
    expect(composite.sys_flags).toContain('FLAG_MARTIAL');
    expect(firstSystemOf(composite)).toBe('MARTIAL');

    // 4-03 の特殊は体勢に与バフ量を持つため FLAG_MIND を伴う。心気が体勢に優先する。
    const buffStance = instanceOf('ACT_SPEC_BUFF_WALL_SERG');
    expect(buffStance.sys_flags).toContain('FLAG_MIND');
    expect(buffStance.sys_flags).toContain('FLAG_STANCE');
    expect(firstSystemOf(buffStance)).toBe('MIND');
  });

  it('隊列交代は系統を持たず、値を更新しない', () => {
    expect(firstSystemOf(instanceOf('ACT_SWAP_SINGLE'))).toBe('NONE');
    const stats = createMirrorStats();
    countExecution(stats, instanceOf('ACT_SWAP_SINGLE'));
    expect(stats.counts).toEqual([0, 0, 0, 0]);
    expect(stats.first_system).toBe('NONE');
  });
});

describe('[M-META-MIRRORSTATS] counts の計上', () => {
  it('内包する系統をそれぞれ1回として数える', () => {
    const stats = createMirrorStats();
    countExecution(stats, instanceOf('ACT_SLASH_AR3'));
    countExecution(stats, instanceOf('ACT_SLASH_AR3'));
    countExecution(stats, instanceOf('ACT_GUARD_AR3'));
    expect(stats.counts[index('MARTIAL')]).toBe(2);
    expect(stats.counts[index('STANCE')]).toBe(1);
    expect(stats.counts[index('MIND')]).toBe(0);
    expect(stats.counts[index('SUMMON')]).toBe(0);
  });

  it('複合アクションは内包する全系統へ計上する', () => {
    const stats = createMirrorStats();
    countExecution(stats, instanceOf('ACT_SPEC_DEBUFF_WALL_ERNA_080'));
    expect(stats.counts[index('MARTIAL')]).toBe(1);
    expect(stats.counts[index('STANCE')]).toBe(1);
  });

  it('初手系統は最初の1回だけを記録し、以降の実行で上書きしない', () => {
    const stats = createMirrorStats();
    countExecution(stats, instanceOf('ACT_MIND_AR3'));
    countExecution(stats, instanceOf('ACT_SLASH_AR3'));
    expect(stats.first_system).toBe('MIND');
  });
});

describe('[M-PROG-CLEAR]［確定タイミング］5-08 のバトルクリア決済', () => {
  function runAt(sceneId: string) {
    const scene = SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS];
    const battle = createScene({
      sceneLevel: scene.level,
      heroMaxHp: 60,
      heroActionOrder: HERO_INIT_ACTIONS,
      enemyRecord: ENEMY_MASTERS[scene.enemy_id as keyof typeof ENEMY_MASTERS],
      actionMasters: ACTION_MASTERS,
    });
    countExecution(battle.mirror_tally, instanceOf('ACT_SLASH_AR3'));
    countExecution(battle.mirror_tally, instanceOf('ACT_GUARD_AR3'));
    const run = createInitialRun(MASTERS);
    run.current_scene_id = sceneId;
    run.phase = 'BATTLE';
    run.battle_state = battle;
    return run;
  }

  it('5-08 をクリアすると当該バトルの集計が mirror_stats へ確定する', () => {
    const run = runAt('SCENE_5_08');
    expect(run.mirror_stats).toBeNull();
    settleBattleClear(run, MASTERS);
    expect(run.mirror_stats?.counts[index('MARTIAL')]).toBe(1);
    expect(run.mirror_stats?.counts[index('STANCE')]).toBe(1);
    expect(run.mirror_stats?.first_system).toBe('MARTIAL');
  });

  it('5-08 以外のクリアでは確定しない', () => {
    const run = runAt('SCENE_5_07');
    settleBattleClear(run, MASTERS);
    expect(run.mirror_stats).toBeNull();
  });
});
