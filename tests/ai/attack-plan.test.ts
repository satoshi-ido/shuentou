// [A-EVAL-TTK]［攻撃計画の構成］［妨害補正］の算出手続き。

import { describe, expect, it } from 'vitest';
import { TTK_MAX } from '../../src/ai/constants.js';
import { buildAttackPlan } from '../../src/ai/ttk.js';
import { createDuel, findUnit, makeAction, martialAction, setStartup } from './fixtures.js';

// 心気（基本）AR3 相当：必要思考147・発生10・加算VP2・PP充填効率1.00（フルサイクル157）。
const MIND = makeAction('MIND', { gain_vp: 2, charge_pp: 100, step_thought: 147, step_startup: 10, step_recovery: 0 });
// 武技（重撃）AR15 相当：必要思考0・発生105・PPコスト5。
const HEAVY = martialAction('HEAVY', { atk: 27, range: 2, dmg_hp: 298, cost_pp: 5, step_startup: 105, step_recovery: 0 });
// 武技（基本）AR6 相当：必要思考42・発生14・硬直56・PPコスト2。
const SLASH = martialAction('SLASH', { atk: 8, dmg_hp: 93, cost_pp: 2, step_thought: 42, step_startup: 14, step_recovery: 56 });
const WAIT = makeAction('WAIT', { gain_vp: 1, step_thought: 999 });

function hero(pp: number, vp: number, acts = [MIND, HEAVY, SLASH]) {
  const state = createDuel({ heroMaxHp: 60, heroActs: acts, enemyMaxHp: 60, enemyActs: [WAIT] });
  const unit = findUnit(state, 'MINE');
  unit.pp = pp;
  unit.vp = vp;
  return unit;
}

const actionOf = (unit: ReturnType<typeof hero>, classId: string) => unit.acts.find((a) => a.master_ref === classId)!;

describe('[A-EVAL-TTK]［攻撃計画の構成］補充回数', () => {
  it('必要コストに到達するまで補充を反復する（PP2・VP2 → PP4 → PP6 の2回）', () => {
    const unit = hero(2, 2);
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, TTK_MAX)).toEqual({ firstLanding: 419, finalLanding: 419 });
  });

  it('1回の補充で足りる場合は1回（PP4・VP4 → PP6）', () => {
    const unit = hero(4, 4);
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, TTK_MAX)?.finalLanding).toBe(157 + 105);
  });

  it('射撃ごとにコストを差し引き、不足したときだけ補充を挟む（AR6 ×3、PP2・VP2）', () => {
    const unit = hero(2, 2);
    // 56 → 硬直112 → 心気269（PP4）→ 325 → 硬直381 → 437（PP2 が残るため補充なし）
    expect(buildAttackPlan(unit, actionOf(unit, 'SLASH'), 3, TTK_MAX)).toEqual({ firstLanding: 56, finalLanding: 437 });
  });

  it('補充手段を持たない、または使用回数が必要ヒット数に満たない計画は構成できない', () => {
    const noMind = hero(2, 2, [HEAVY]);
    expect(buildAttackPlan(noMind, actionOf(noMind, 'HEAVY'), 1, TTK_MAX)).toBeNull();
    const limited = hero(10, 10, [makeAction('FEW', { range: 1, atk: 1, dmg_hp: 100, step_startup: 1 }, 200)]);
    expect(buildAttackPlan(limited, limited.acts[0], 3, TTK_MAX)).toBeNull();
  });

  it('発生中の局面は残り発生と実行中アクションの必要硬直を残り区間とし、経過思考は持ち越さない', () => {
    const unit = hero(6, 6);
    setStartup(unit, 'SLASH', 10); // 残り発生4 + 硬直56
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, TTK_MAX)?.finalLanding).toBe(60 + 105);
  });

  it('思考中の局面は経過思考を最初のサイクルにだけ持ち越す', () => {
    const unit = hero(2, 2);
    unit.elapsed_thought = 100;
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, TTK_MAX)?.finalLanding).toBe(47 + 10 + 157 + 105);
  });
});

describe('[A-EVAL-TTK]［妨害補正］', () => {
  it('思考区間への着弾は経過思考を0へ戻し、t_deny から同じサイクルをやり直す', () => {
    const unit = hero(2, 2);
    // 2回目の心気の思考区間 [157, 304) に 236 で着弾 → 236 + 157 + 105
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, 236)?.finalLanding).toBe(236 + 157 + 105);
  });

  it('発生区間への着弾はサイクルの効果を失わせ、終了時刻から選び直す（射撃は消費を返還しない）', () => {
    const unit = hero(2, 2);
    // 重撃の発生区間 [314, 419) に 315 → 419 で終了、PP1 から心気1回（576）→ 681
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, 315)?.finalLanding).toBe(681);
  });

  it('補充サイクルの発生区間への着弾は補充を無効にする', () => {
    const unit = hero(2, 2);
    // 1回目の心気の発生区間 [147, 157) に 150 → 補充なしで 157、以後2回の心気 → 471 + 105
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, 150)?.finalLanding).toBe(471 + 105);
  });

  it('発動ステップ以降・硬直区間・残り区間への着弾は無効', () => {
    const unit = hero(2, 2);
    expect(buildAttackPlan(unit, actionOf(unit, 'SLASH'), 1, 56)?.finalLanding).toBe(56); // 同一ステップの発動（相打ち）
    const recovering = hero(6, 6);
    setStartup(recovering, 'SLASH', 10);
    expect(buildAttackPlan(recovering, actionOf(recovering, 'HEAVY'), 1, 30)?.finalLanding).toBe(165);
  });

  it('妨害補正は1回に限り適用する', () => {
    const unit = hero(2, 2);
    expect(buildAttackPlan(unit, actionOf(unit, 'HEAVY'), 1, 10)?.finalLanding).toBe(10 + 314 + 105);
  });
});
