// [V-TEST-REFAI]［攻撃型の武技の選択］1サイクルあたりの与ダメージで武技を選ぶ。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { deriveSysFlags } from '../../src/engine/flags.js';
import type { InheritTarget } from '../../src/engine/progress/inherit.js';
import { chooseAttackDps } from './runner.js';

const target = (classId: string): InheritTarget => ({ kind: 'ACTION', class_id: classId });
function held(classId: string, usesLeft: number) {
  const record = ACTION_MASTERS[classId as keyof typeof ACTION_MASTERS];
  return { uses_left: usesLeft, sys_flags: deriveSysFlags(record.params) as readonly string[], base_params: record.params };
}

// 攻撃力は重撃が高いが、発生が長く、1サイクルあたりの与ダメージは急襲が上回る組。
const POOL = [target('ACT_HEAVY_AR3'), target('ACT_RUSH_AR12')];

describe('chooseAttackDps', () => {
  it('最大実効攻撃力ではなく、PPの補充を含む1サイクルあたりの与ダメージが最大の武技を選ぶ', () => {
    expect(ACTION_MASTERS.ACT_HEAVY_AR3.params.atk).toBeGreaterThan(ACTION_MASTERS.ACT_RUSH_AR12.params.atk);
    const run = { hero_acts: [held('ACT_MIND_AR12', 40)] };
    expect(chooseAttackDps(run, POOL)).toEqual(target('ACT_RUSH_AR12'));
  });

  it('残り使用回数0の心気とPPコストを要する心気は補充に用いず、補充の歩数を一律 10^9 とする', () => {
    // 補充の歩数が一律に大きいと、HPダメージの大きい武技が選ばれる。
    expect(ACTION_MASTERS.ACT_HEAVY_AR3.params.dmg_hp).toBeGreaterThan(ACTION_MASTERS.ACT_RUSH_AR12.params.dmg_hp);
    const run = { hero_acts: [held('ACT_MIND_AR12', 0), held('ACT_SPEC_BUFF_STEP_THOUGHT_HAUSEN', 3)] };
    expect(chooseAttackDps(run, POOL)).toEqual(target('ACT_HEAVY_AR3'));
  });

  it('武技が無ければ最大HP加算を選び、それも無ければ null を返す', () => {
    const run = { hero_acts: [held('ACT_MIND_AR12', 40)] };
    expect(chooseAttackDps(run, [target('ACT_MIND_AR24'), { kind: 'MAX_HP' }])).toEqual({ kind: 'MAX_HP' });
    expect(chooseAttackDps(run, [target('ACT_MIND_AR24')])).toBeNull();
  });
});
