// [M-DATA-ASSETMASTER]［構えの選択］実行中アクションに応じて示す系統ごとの構えと振り抜きの画。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import type { AssetMasterRecord } from '../../src/data/types.js';
import { PARAM_IDS } from '../../src/engine/params.js';
import type { SysFlag, Unit } from '../../src/engine/types.js';
import { frameCount, pickAsset } from '../../src/ui/assets/resolve.js';
import { stancePoseOf } from '../../src/ui/view/figure-motion.js';

const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;

// 必要発生 20・必要硬直 40 のアクションを持つユニット。
function unitIn(
  state: Unit['state'],
  flags: SysFlag[],
  progress: { elapsedStartup?: number; elapsedRecovery?: number; appliedRecovery?: number } = {},
): Unit {
  return {
    state,
    buff: Object.fromEntries(PARAM_IDS.map((id) => [id, 0])),
    debuff: Object.fromEntries(PARAM_IDS.map((id) => [id, 0])),
    elapsed_startup: progress.elapsedStartup ?? 20,
    elapsed_recovery: progress.elapsedRecovery ?? 0,
    applied_recovery: progress.appliedRecovery ?? 40,
    acts: [{ instance_id: 'I0001', base_params: { step_startup: 20, step_recovery: 40 } }],
    last_act: { instance_id: 'I0001', class_id: 'ACT_TEST', sys_flags: flags, params: {}, uses_left_before: 1, is_copy: false },
  } as unknown as Unit;
}

describe('[M-DATA-ASSETMASTER]［構えの選択］', () => {
  it('発生中は系統フラグを武技・体勢・心気（召喚を含む）の順に当てはめた構えを示す', () => {
    const startup = (flags: SysFlag[]) => stancePoseOf(unitIn('STARTUP', flags, { elapsedStartup: 5 }));
    expect(startup(['FLAG_MARTIAL'])).toEqual({ pose: 'MARTIAL', phase: 'STARTUP' });
    expect(startup(['FLAG_MARTIAL', 'FLAG_STANCE'])?.pose).toBe('MARTIAL');
    expect(startup(['FLAG_PURIFY', 'FLAG_STANCE'])?.pose).toBe('STANCE');
    expect(startup(['FLAG_STANCE', 'FLAG_SUMMON'])?.pose).toBe('STANCE');
    expect(startup(['FLAG_MIND', 'FLAG_PURIFY'])?.pose).toBe('MIND');
    expect(startup(['FLAG_SUMMON'])?.pose).toBe('MIND');
    expect(startup(['FLAG_SWAP'])).toBeNull();
    expect(startup([])).toBeNull();
  });

  it('溜めを持つ構えは、発生の区間を段の数＋1に等分して段を進め、補正で進捗が戻れば前の段へ戻る', () => {
    const two = () => 2;
    const startup = (elapsedStartup: number, required = 20) => {
      const unit = unitIn('STARTUP', ['FLAG_MARTIAL'], { elapsedStartup });
      (unit.acts[0] as { base_params: { step_startup: number } }).base_params.step_startup = required;
      return unit;
    };
    // 必要発生 21：7 から1段目、14 から2段目
    expect(stancePoseOf(startup(6, 21), two)).toEqual({ pose: 'MARTIAL', phase: 'STARTUP' });
    expect(stancePoseOf(startup(7, 21), two)).toEqual({ pose: 'MARTIAL', phase: 'CHARGE', frame: 1 });
    expect(stancePoseOf(startup(13, 21), two)).toEqual({ pose: 'MARTIAL', phase: 'CHARGE', frame: 1 });
    expect(stancePoseOf(startup(14, 21), two)).toEqual({ pose: 'MARTIAL', phase: 'CHARGE', frame: 2 });
    expect(stancePoseOf(startup(21, 21), two)).toEqual({ pose: 'MARTIAL', phase: 'CHARGE', frame: 2 });
    // 1段なら進捗 1/2 から
    expect(stancePoseOf(startup(9), () => 1)).toEqual({ pose: 'MARTIAL', phase: 'STARTUP' });
    expect(stancePoseOf(startup(10), () => 1)).toEqual({ pose: 'MARTIAL', phase: 'CHARGE', frame: 1 });
    // 溜めを持たない構えは構えのまま
    expect(stancePoseOf(startup(19))).toEqual({ pose: 'MARTIAL', phase: 'STARTUP' });
    // 必要発生ステップ数が延びて進捗が戻れば、前の段へ戻る
    expect(stancePoseOf(startup(14, 40), two)).toEqual({ pose: 'MARTIAL', phase: 'CHARGE', frame: 1 });
  });

  it('発動した後の硬直は、終わりまで振り抜きを示す', () => {
    const recovery = (elapsedRecovery: number) => stancePoseOf(unitIn('RECOVERY', ['FLAG_MARTIAL'], { elapsedRecovery }));
    expect(recovery(0)).toEqual({ pose: 'MARTIAL', phase: 'FOLLOW' });
    expect(recovery(20)).toEqual({ pose: 'MARTIAL', phase: 'FOLLOW' });
    expect(recovery(39)).toEqual({ pose: 'MARTIAL', phase: 'FOLLOW' });
  });

  it('スタン中断による硬直（経過発生が必要発生に満たない）は、系統によらずやられを示す', () => {
    const stunned = (flags: SysFlag[]) => stancePoseOf(unitIn('RECOVERY', flags, { elapsedStartup: 12, appliedRecovery: 48 }));
    expect(stunned(['FLAG_MARTIAL'])).toEqual({ pose: 'STAGGER', phase: null });
    expect(stunned(['FLAG_MIND'])).toEqual({ pose: 'STAGGER', phase: null });
    expect(stunned(['FLAG_SWAP'])).toEqual({ pose: 'STAGGER', phase: null });
  });

  it('思考中は構えを示さない', () => {
    expect(stancePoseOf(unitIn('THOUGHT', ['FLAG_MARTIAL']))).toBeNull();
  });

  it('盤面に立つ姿の立ち絵は、どれも3つの構えと3つの振り抜きとやられの画を持ち、condition を引き継ぐ', () => {
    const bases = Object.values(assets).filter(
      (record) =>
        record.slot === 'STANDING' && (record.pose ?? null) === null && ['HERO', 'ENEMY', 'CREATURE'].includes(record.owner_kind),
    );
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      for (const pose of ['MARTIAL', 'STANCE', 'MIND'] as const) {
        for (const [suffix, phase] of [
          ['', 'STARTUP'],
          ['_FOLLOW', 'FOLLOW'],
        ] as const) {
          const posed = assets[`${base.asset_id}_${pose}${suffix}`];
          expect(posed?.pose, base.asset_id).toBe(pose);
          expect(posed?.pose_phase, base.asset_id).toBe(phase);
          expect(posed?.condition ?? null, base.asset_id).toBe(base.condition ?? null);
        }
      }
      const stagger = assets[`${base.asset_id}_STAGGER`];
      expect(stagger?.pose, base.asset_id).toBe('STAGGER');
      expect(stagger?.pose_phase ?? null, base.asset_id).toBeNull();
      expect(stagger?.condition ?? null, base.asset_id).toBe(base.condition ?? null);
      // 倒れの画はセインと敵マスターに限る（[M-DATA-ASSETMASTER]［構えの選択］「倒れの画」）
      const down = assets[`${base.asset_id}_DOWN`];
      if (base.owner_kind === 'CREATURE') {
        expect(down, base.asset_id).toBeUndefined();
      } else {
        expect(down?.pose, base.asset_id).toBe('DOWN');
        expect(down?.pose_phase ?? null, base.asset_id).toBeNull();
        expect(down?.condition ?? null, base.asset_id).toBe(base.condition ?? null);
      }
    }
  });

  it('構えは STANDING に限り、系統の構えは構えの段を必ず持ち、やられは持たず、同じ所有者・構え・段・条件の画は高々1件である', () => {
    const keys: Record<string, number> = {};
    for (const record of Object.values(assets)) {
      if ((record.pose ?? null) === null) {
        expect(record.pose_phase ?? null, record.asset_id).toBeNull();
        continue;
      }
      expect(record.slot, record.asset_id).toBe('STANDING');
      if (record.pose === 'STAGGER' || record.pose === 'DOWN') {
        expect(record.pose_phase ?? null, record.asset_id).toBeNull();
      } else {
        expect(record.pose_phase ?? null, record.asset_id).not.toBeNull();
      }
      expect(record.pose_phase === 'CHARGE' || record.pose_phase === 'SWING', record.asset_id).toBe((record.frame ?? null) !== null);
      const key = `${record.owner_kind}/${record.owner_id}/${record.pose}/${record.pose_phase}/${record.frame ?? ''}/${record.condition ?? ''}`;
      keys[key] = (keys[key] ?? 0) + 1;
    }
    expect(Object.entries(keys).filter(([, count]) => count > 1)).toEqual([]);
  });

  it('構えの画は条件の成立する版を選び、構えを持たない選び方には構えの画が混ざらない', () => {
    const act2 = (condition: string): boolean => condition === 'ActNumber == 2';
    const act1 = (): boolean => false;
    const martial = { pose: 'MARTIAL', phase: 'STARTUP' } as const;
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2, martial)?.asset_id).toBe('ASSET_HERO_STANDING_COAT_ACT2_MARTIAL');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act1, martial)?.asset_id).toBe('ASSET_HERO_STANDING_MARTIAL');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', null, { pose: 'STANCE', phase: 'FOLLOW' })?.asset_id).toBe(
      'ASSET_HERO_STANDING_STANCE_FOLLOW',
    );
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2, { pose: 'MIND', phase: 'FOLLOW' })?.asset_id).toBe(
      'ASSET_HERO_STANDING_COAT_ACT2_MIND_FOLLOW',
    );
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2, { pose: 'STAGGER', phase: null })?.asset_id).toBe(
      'ASSET_HERO_STANDING_COAT_ACT2_STAGGER',
    );
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2, { pose: 'DOWN', phase: null })?.asset_id).toBe('ASSET_HERO_STANDING_COAT_ACT2_DOWN');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act2)?.asset_id).toBe('ASSET_HERO_STANDING_COAT_ACT2');
    expect(pickAsset(assets, 'HERO', null, 'STANDING', act1)?.asset_id).toBe('ASSET_HERO_STANDING');
  });

  it('中割りは順の1から連なるコマを選び、いずれかに実体が無ければ示さない', () => {
    const swing = (frame: number): AssetMasterRecord => ({
      asset_id: `ASSET_T_STANDING_MARTIAL_SWING_${frame}`,
      owner_kind: 'ENEMY',
      owner_id: 'ENEMY_T',
      slot: 'STANDING',
      cue: null,
      pose: 'MARTIAL',
      pose_phase: 'SWING',
      frame,
      path: frame === 2 ? 'placeholder:t' : 'art/standing/hero-martial-charge-1.png',
    });
    const withGap = { a: swing(1), b: swing(2), c: swing(3) };
    expect(frameCount(withGap, 'ENEMY', 'ENEMY_T', null, 'MARTIAL', 'SWING')).toBe(0);
    expect(frameCount({ a: swing(1), c: swing(3) }, 'ENEMY', 'ENEMY_T', null, 'MARTIAL', 'SWING')).toBe(1);
    expect(frameCount(withGap, 'ENEMY', 'ENEMY_T', null, 'STANCE', 'SWING')).toBe(0);
    expect(pickAsset(withGap, 'ENEMY', 'ENEMY_T', 'STANDING', null, { pose: 'MARTIAL', phase: 'SWING', frame: 3 })?.asset_id).toBe(
      'ASSET_T_STANDING_MARTIAL_SWING_3',
    );
    expect(pickAsset(withGap, 'ENEMY', 'ENEMY_T', 'STANDING', null, { pose: 'MARTIAL', phase: 'FOLLOW' })).toBeNull();
  });
});
