// [V-TEST-REFAI]［リソース生成手段の維持］攻撃型・防御型が心気を絶やさないための読み替え。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { deriveSysFlags } from '../../src/engine/flags.js';
import { INFINITE_USES } from '../../src/engine/params.js';
import type { ActionMasterRecord } from '../../src/data/types.js';
import type { InheritTarget } from '../../src/engine/progress/inherit.js';
import { chooseMindRefill, mindUsesLeft } from './runner.js';

function act(classId: string, usesLeft: number) {
  const record = ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
  return { sys_flags: deriveSysFlags(record.params) as readonly string[], uses_left: usesLeft };
}
const target = (classId: string): InheritTarget => ({ kind: 'ACTION', class_id: classId });

describe('mindUsesLeft', () => {
  it('FLAG_MIND を持つ所持アクションの残り回数を合計する', () => {
    expect(mindUsesLeft({ hero_acts: [act('ACT_MIND_AR3', 4), act('ACT_SLASH_AR3', 9)] })).toBe(4);
    expect(mindUsesLeft({ hero_acts: [act('ACT_MIND_AR3', 1), act('ACT_MUSOU_AR3', 2)] })).toBe(3);
  });

  it('心気を保持しないとき0となり、読み替えの条件（5未満）を満たす', () => {
    expect(mindUsesLeft({ hero_acts: [act('ACT_SLASH_AR3', 9), act('ACT_HEAVY_AR15', 7)] })).toBe(0);
  });

  it('無限回数は枯渇しないため上限として扱う', () => {
    expect(mindUsesLeft({ hero_acts: [act('ACT_MIND_AR3', INFINITE_USES)] })).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('chooseMindRefill', () => {
  it('FLAG_MIND を持つ項目のうち加算VPが最大のものを選ぶ', () => {
    const pool = [target('ACT_SLASH_AR3'), target('ACT_MIND_AR3'), target('ACT_MIND_AR6')];
    const chosen = chooseMindRefill(pool);
    expect(chosen).toEqual(target('ACT_MIND_AR6'));
    expect(ACTION_MASTERS.ACT_MIND_AR6.params.gain_vp).toBeGreaterThan(ACTION_MASTERS.ACT_MIND_AR3.params.gain_vp);
  });

  it('加算VPを持たない無想より基本を優先する', () => {
    expect(ACTION_MASTERS.ACT_MUSOU_AR3.params.gain_vp).toBe(0);
    expect(chooseMindRefill([target('ACT_MUSOU_AR3'), target('ACT_MIND_AR3')])).toEqual(target('ACT_MIND_AR3'));
  });

  it('PPコストを要する心気（特殊の自己強化等）は PP 0 から実行できないため選ばない', () => {
    const costly = ACTION_MASTERS.ACT_SPEC_BUFF_STEP_THOUGHT_HAUSEN.params;
    expect(costly.cost_pp).toBeGreaterThan(0);
    expect(costly.gain_vp * costly.charge_pp).toBeGreaterThan(ACTION_MASTERS.ACT_MIND_AR24.params.gain_vp * ACTION_MASTERS.ACT_MIND_AR24.params.charge_pp);
    const pool = [target('ACT_SPEC_BUFF_STEP_THOUGHT_HAUSEN'), target('ACT_MIND_AR24')];
    expect(chooseMindRefill(pool)).toEqual(target('ACT_MIND_AR24'));
    expect(chooseMindRefill([target('ACT_SPEC_BUFF_STEP_THOUGHT_HAUSEN')])).toBeNull();
  });

  it('最大HP加算および心気以外しかない場合は null を返し、本来の規則へ委ねる', () => {
    expect(chooseMindRefill([{ kind: 'MAX_HP' }, target('ACT_SLASH_AR3')])).toBeNull();
    expect(chooseMindRefill([])).toBeNull();
  });

  it('各シーンの敵マスターは心気（基本）を共通基底に持つため、プールは常に候補を含む', () => {
    // [M-TMPL-ENEMY-PRINCIPLE]［敵マスターの基本型所持構成］心気（基本）AR ≒ L * 1.0。
    for (const enemy of Object.values(ENEMY_MASTERS)) {
      if (enemy.audit_exempt) {
        continue; // [M-TMPL-VESSEL] 依代は継承プールを持たない
      }
      const pool = enemy.acts
        .filter((classId) => {
          const record: ActionMasterRecord = ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
          return record.inheritable && record.base_uses !== INFINITE_USES;
        })
        .map((classId) => target(classId));
      expect(chooseMindRefill(pool)).not.toBeNull();
    }
  });
});
