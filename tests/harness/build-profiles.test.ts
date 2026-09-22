// [V-TEST-BUILD-PROFILES] ビルドプロファイルの編成列・供犠対象・継承配分規則と、[V-TEST-BUILD-METRICS] merge_max。

import { describe, expect, it } from 'vitest';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
import type { AttendantMasterRecord } from '../../src/data/types.js';
import type { InheritTarget } from '../../src/engine/progress/inherit.js';
import {
  buildProfileOf,
  BUILD_PROFILES,
  chooseRefill,
  chooseSacrificeTarget,
  coefficientScore,
  mergeMax,
  type AllocContext,
} from './build-profiles.js';

const action = (classId: string): InheritTarget => ({ kind: 'ACTION', class_id: classId });
const MAX_HP: InheritTarget = { kind: 'MAX_HP' };
const attendants = ATTENDANT_MASTERS as Readonly<Record<string, AttendantMasterRecord>>;

// アクト1〜5の編成を、補充（定員 = アクト番号）と供犠の規則だけで辿る。供犠は当該アクト内で行う。
function lineups(profileId: string): string[][] {
  const profile = buildProfileOf(profileId);
  let party: string[] = [];
  const gone = new Set<string>();
  const result: string[][] = [];
  for (let act = 1; act <= 5; act += 1) {
    while (party.length < act) {
      const pool = Object.values(attendants)
        .filter((record) => record.join_act === act && !gone.has(record.attendant_id))
        .map((record) => record.attendant_id)
        .sort();
      if (pool.length === 0) {
        break;
      }
      const chosen = act === 1 ? pool[0] : chooseRefill(profile, pool);
      party.push(chosen);
      gone.add(chosen);
    }
    const plan = profile.sacrifices.find((entry) => entry.act === act);
    for (let i = 0; i < (plan?.count ?? 0); i += 1) {
      const victim = chooseSacrificeTarget(profile, plan!, party);
      party = party.filter((id) => id !== victim);
    }
    result.push([...party].sort());
  }
  return result;
}

const ctx = (partial: Partial<AllocContext>): AllocContext => ({
  attendantId: 'ATTENDANT_01',
  pool: [],
  picked: [],
  start: { holdsStance: false, holdsSummon: false },
  ...partial,
});

describe('[V-TEST-BUILD-PROFILES]［編成列］［供犠スケジュール］', () => {
  const finals: Record<string, string[]> = {
    'BP-01': ['01', '03', '05', '10', '11'],
    'BP-02': ['01', '02', '07', '12', '15'],
    'BP-03': ['01', '02', '08', '09', '11'],
    'BP-04': ['01', '11', '12', '13', '14'],
    'BP-05': ['01', '02', '04', '10', '11'],
    'BP-06': ['01', '02', '04', '14', '15'],
    'BP-07': ['03', '04', '06', '07', '11'],
  };
  for (const [id, expected] of Object.entries(finals)) {
    it(`${id} のアクト5の編成は最終編成を含む`, () => {
      const final = lineups(id)[4];
      expect(final).toEqual(expected.map((n) => `ATTENDANT_${n}`));
      for (const named of buildProfileOf(id).finalParty) {
        expect(final).toContain(named);
      }
    });
  }

  it('BP-07 はアクト2で従者01を供犠する', () => {
    expect(lineups('BP-07')[1]).toEqual(['ATTENDANT_03']);
  });

  it('BP-04 はアクト4で最終編成外の3名を供犠する', () => {
    expect(lineups('BP-04')[3]).toEqual(['ATTENDANT_01']);
  });

  it('供犠「なし」のプロファイルは供犠スケジュールを持たない', () => {
    expect(buildProfileOf('BP-01').sacrifices).toEqual([]);
    expect(buildProfileOf('BP-05').sacrifices).toEqual([]);
  });

  it('7件のプロファイルを持つ', () => {
    expect(BUILD_PROFILES.map((profile) => profile.id)).toEqual([
      'BP-01',
      'BP-02',
      'BP-03',
      'BP-04',
      'BP-05',
      'BP-06',
      'BP-07',
    ]);
  });
});

describe('[V-TEST-BUILD-PROFILES]［継承配分規則］', () => {
  it('BP-01 は最大攻撃力の武技を選び、体勢・最大HP加算を選ばない', () => {
    const pool = [action('ACT_GUARD_AR204'), action('ACT_HEAVY_AR12'), action('ACT_HEAVY_AR117'), MAX_HP];
    expect(buildProfileOf('BP-01').allocate(ctx({ pool }))).toEqual(action('ACT_HEAVY_AR117'));
  });

  it('BP-02 は体勢を保持していなければ最大展開APの体勢、保持していれば与バフ量を持つ心気を選ぶ', () => {
    const pool = [
      action('ACT_GUARD_AR12'),
      action('ACT_GUARD_AR204'),
      action('ACT_SPEC_BUFF_WALL_SERG'),
      action('ACT_MIND_AR12'),
    ];
    const bp = buildProfileOf('BP-02');
    expect(bp.allocate(ctx({ pool }))).toEqual(action('ACT_GUARD_AR204'));
    expect(bp.allocate(ctx({ pool, start: { holdsStance: true, holdsSummon: false } }))).toEqual(
      action('ACT_SPEC_BUFF_WALL_SERG'),
    );
  });

  it('BP-03 は従者02が最大HP加算、他は加算VPが最大の心気を選ぶ', () => {
    const pool = [action('ACT_MIND_AR12'), action('ACT_SPEC_BUFF_WALL_SERG'), MAX_HP];
    const bp = buildProfileOf('BP-03');
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_02', pool }))).toEqual(MAX_HP);
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_08', pool }))).toEqual(action('ACT_SPEC_BUFF_WALL_SERG'));
  });

  it('BP-04 は係数が寄与する項目数で選び、同一インターミッションで選ばれた項目を避ける', () => {
    // 従者11：atkRate・usesRate。武技は2項目、体勢は usesRate の1項目。
    expect(coefficientScore(attendants.ATTENDANT_11, action('ACT_HEAVY_AR12'))).toBe(2);
    expect(coefficientScore(attendants.ATTENDANT_11, action('ACT_GUARD_AR12'))).toBe(1);
    expect(coefficientScore(attendants.ATTENDANT_11, MAX_HP)).toBe(0);
    const pool = [action('ACT_GUARD_AR12'), action('ACT_HEAVY_AR12'), action('ACT_HEAVY_AR117')];
    const bp = buildProfileOf('BP-04');
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_11', pool }))).toEqual(action('ACT_HEAVY_AR12'));
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_11', pool, picked: [action('ACT_HEAVY_AR12')] }))).toEqual(
      action('ACT_HEAVY_AR117'),
    );
  });

  it('BP-05 は召喚を保持していなければ1枠で召喚を確保し、従者10は常に武技を選ぶ', () => {
    const pool = [action('ACT_SUMMON_AR12'), action('ACT_HEAVY_AR12')];
    const bp = buildProfileOf('BP-05');
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_10', pool }))).toEqual(action('ACT_HEAVY_AR12'));
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_02', pool }))).toEqual(action('ACT_SUMMON_AR12'));
    expect(bp.allocate(ctx({ attendantId: 'ATTENDANT_04', pool, picked: [action('ACT_SUMMON_AR12')] }))).toEqual(
      action('ACT_HEAVY_AR12'),
    );
    expect(
      bp.allocate(ctx({ attendantId: 'ATTENDANT_02', pool, start: { holdsStance: false, holdsSummon: true } })),
    ).toEqual(action('ACT_HEAVY_AR12'));
  });

  it('BP-06 は浄化率・剥奪率を持つアクションを選び、無ければ最大HP加算を選ぶ', () => {
    const bp = buildProfileOf('BP-06');
    expect(bp.allocate(ctx({ pool: [action('ACT_SUMMON_AR12'), action('ACT_GUARD_AR12'), MAX_HP] }))).toEqual(
      action('ACT_GUARD_AR12'),
    );
    expect(bp.allocate(ctx({ pool: [action('ACT_SUMMON_AR12'), MAX_HP] }))).toEqual(MAX_HP);
  });

  it('BP-07 は急襲（思考0・防御効率あり）の武技を選び、重撃・斬撃を選ばない', () => {
    const pool = [action('ACT_HEAVY_AR117'), action('ACT_SLASH_AR12'), action('ACT_RUSH_AR12')];
    expect(buildProfileOf('BP-07').allocate(ctx({ pool }))).toEqual(action('ACT_RUSH_AR12'));
  });
});

describe('[V-TEST-BUILD-METRICS] merge_max', () => {
  it('単一スロットへ統合された枠数を継承実行回数で割る', () => {
    expect(mergeMax([action('A'), action('A'), action('B')])).toBeCloseTo(2 / 3);
    expect(mergeMax([action('A'), action('A')])).toBe(1);
  });

  it('最大HP加算は統合しない', () => {
    expect(mergeMax([MAX_HP, MAX_HP])).toBe(0.5);
  });

  it('継承がなければ値を持たない', () => {
    expect(mergeMax([])).toBeNull();
  });
});
