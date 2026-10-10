// [A-EVAL-TTK]［攻撃計画の構成］［妨害補正］の算出手続き。

import { describe, expect, it } from 'vitest';
import { TTK_MAX } from '../../src/ai/constants.js';
import { cloneState } from '../../src/ai/clone.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import { buildAttackPlan, denyTime, ttk } from '../../src/ai/ttk.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS, setRecovery, setStartup } from './fixtures.js';

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

describe('[A-EVAL-TTK]［妨害補正］思考の待機のみを要するスタン', () => {
  // 防御側（主人公）のスタン付き武技：必要思考20・発生5。経過思考16（残り4）。
  const STUN = martialAction('STUN', { atk: 10, dmg_hp: 10, stun: true, cost_pp: 3, step_thought: 20, step_startup: 5, step_recovery: 5 });

  function deny(pp: number, thoughtDeny: boolean | undefined): number {
    const state = createDuel({ heroMaxHp: 60, heroActs: [STUN], enemyMaxHp: 60, enemyActs: [WAIT] });
    const defender = findUnit(state, 'MINE');
    defender.elapsed_thought = 16;
    defender.pp = pp;
    const { trace } = runQuiescence(cloneState(state), NO_SUMMON_DEPS);
    return denyTime(defender, findUnit(state, 'FOE'), { trace, level: state.scene_level, offset: 0, thoughtDeny });
  }

  it('参照プレイヤーAIの探索では、着弾を残りの必要思考＋必要発生とする', () => {
    expect(deny(3, true)).toBe(4 + 5);
  });

  it('敵軍AIの探索（既定）では数えない', () => {
    expect(deny(3, false)).toBe(TTK_MAX);
    expect(deny(3, undefined)).toBe(TTK_MAX);
  });

  it('補充を要するもの（PP不足）は参照プレイヤーAIの探索でも数えない', () => {
    expect(deny(2, true)).toBe(TTK_MAX);
  });
});

describe('[A-EVAL-TTK]［射撃アクション］着弾の待機', () => {
  // 攻撃側（主人公）の武技：攻撃力110・必要発生5。防御側（敵）は防御効率2.00のアクションの硬直中（AP100、防御力200）で、
  // 硬直満了の後は AP50（防御力50）となる。初弾の着弾予測時点（5）は硬直中と重なる。
  const BREAK = martialAction('BREAK', { atk: 110, range: 2, dmg_hp: 6000, step_startup: 5 });
  const MUSOU = makeAction('MUSOU', { def_efficiency: 200, decay_ap: 50, step_recovery: 40 });

  function tp(landingWait: boolean | undefined): number {
    const state = createDuel({ heroMaxHp: 60, heroActs: [BREAK], enemyMaxHp: 60, enemyActs: [MUSOU] });
    const enemy = findUnit(state, 'FOE');
    enemy.ap = 100;
    setRecovery(enemy, 'MUSOU', 40, 0);
    const { trace } = runQuiescence(cloneState(state), NO_SUMMON_DEPS);
    const offset = trace.length - 1;
    return ttk(findUnit(state, 'MINE'), enemy, { trace, level: state.scene_level, offset, landingWait });
  }

  it('参照プレイヤーAIの探索では除外せず、命中する最初の着弾予測時点まで待機する', () => {
    // 硬直満了の帰結は添字 末尾 + 残り硬直40 + 1 = 41 以降に適用される（［トレース参照時点］）。
    expect(tp(true)).toBe(41);
  });

  it('敵軍AIの探索（既定）では初弾の着弾予測時点で除外する', () => {
    expect(tp(false)).toBe(TTK_MAX);
    expect(tp(undefined)).toBe(TTK_MAX);
  });
});
