// [V-NUM-STEP157] ステップ157の候補手評価（定跡無効時の単体検証）と [V-TEST-POSITIONS] T-18。
// 各候補手を適用した局面の TTK(敵→主)・TTK(主→敵)・x_survival・生存項＋PASS減点が、[A-EVAL-TTK] の
// 算出手続きの出力として掲載値と一致することを確認する。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import type { Decision, DecisionProvider } from '../../src/engine/decision.js';
import { executableActions } from '../../src/engine/decision.js';
import { advanceStep, runStepBody, type StepDeps } from '../../src/engine/pipeline/step.js';
import { createScene } from '../../src/engine/setup.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { applyMove } from '../../src/ai/apply.js';
import { cloneState } from '../../src/ai/clone.js';
import { SCALE } from '../../src/ai/constants.js';
import { signedRoundDiv } from '../../src/ai/fixed.js';
import { defaultProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import { decideActionDetailed } from '../../src/ai/search.js';
import { damageBy, projectedLoss, settlementOf, ttk, xSurvival } from '../../src/ai/ttk.js';

const PREFERRED_CLASS_ID = 'ACT_MIND_AR3';
const W_SURVIVAL = 4000;
const FRENZY_PASS = 0; // [A-PROFILE-TABLE] 狂乱プロファイル

const scriptedDecision: DecisionProvider = (state: BattleState, unit: Unit): Decision => {
  const preferred = executableActions(state, unit).find((action) => action.master_ref === PREFERRED_CLASS_ID);
  if (preferred !== undefined) {
    return { kind: 'ACT', instanceId: preferred.instance_id };
  }
  return { kind: 'PASS' };
};

const deps: StepDeps = {
  createCreature: () => {
    throw new Error('この局面では召喚は発生しない');
  },
};

function step157State(): BattleState {
  const state = createScene({
    sceneLevel: 3,
    heroMaxHp: 60,
    heroActionOrder: HERO_INIT_ACTIONS,
    enemyRecord: ENEMY_MASTERS.ENEMY_LEF,
    actionMasters: ACTION_MASTERS,
  });
  for (let i = 0; i < 157; i += 1) {
    advanceStep(state, scriptedDecision, deps);
  }
  runStepBody(state, scriptedDecision, deps);
  return state;
}

function findUnit(state: BattleState, side: 'MINE' | 'FOE'): Unit {
  const unit = state.units.find((u) => u !== null && u.side === side) ?? null;
  if (unit === null) {
    throw new Error(`ユニットが見つからない: ${side}`);
  }
  return unit;
}

interface Row {
  readonly te: number;
  readonly tp: number;
  readonly xSurvivalMilli: number;
  readonly total: number;
}

function rowAfter(classIdOrPass: string): Row {
  const state = step157State();
  const enemy = findUnit(state, 'FOE');
  const move =
    classIdOrPass === 'PASS'
      ? ({ kind: 'PASS' } as const)
      : ({ kind: 'ACT', action: enemy.acts.find((a) => a.master_ref === classIdOrPass)! } as const);
  applyMove(state, enemy, move, deps);
  // [A-SEARCH-QUIESCE]［評価対象］TTK は静止局面で求め、延長ステップ数 q を加えて本局面基準へ換算する。
  const quiet = cloneState(state);
  const { trace } = runQuiescence(quiet, deps);
  const inputs = { trace, level: state.scene_level, offset: trace.length - 1 };
  const mine = findUnit(quiet, 'MINE');
  const foe = findUnit(quiet, 'FOE');
  const tp = ttk(mine, foe, inputs);
  const te = ttk(foe, mine, inputs);
  // [A-EVAL-TTK]［予測損耗］本局面では延長中の決定点からの計画は現れない。
  const s = settlementOf(tp, te);
  const toMine = s.enemyWins ? 0 : damageBy(foe, mine, inputs, s.horizon);
  const toFoe = s.playerWins ? 0 : damageBy(mine, foe, inputs, s.horizon);
  const x = xSurvival(projectedLoss(mine, toMine, s.enemyWins, SCALE), projectedLoss(foe, toFoe, s.playerWins, SCALE));
  const survival = signedRoundDiv(W_SURVIVAL * x, SCALE);
  return {
    te,
    tp,
    xSurvivalMilli: signedRoundDiv(x * 1000, SCALE),
    total: survival + (classIdOrPass === 'PASS' ? FRENZY_PASS : 0),
  };
}

describe('[V-NUM-STEP157] 候補手評価（定跡無効）', () => {
  it.each([
    { move: 'ACT_GUARD_AR3', label: '体勢 AR3（AP16）', expected: { te: 745, tp: 505, xSurvivalMilli: -816, total: -3266 } },
    { move: 'ACT_GUARD_AR6', label: '体勢 AR6（AP23）', expected: { te: 734, tp: 494, xSurvivalMilli: -816, total: -3266 } },
    { move: 'ACT_HEAVY_AR3', label: '武技（重撃）AR3', expected: { te: 942, tp: 784, xSurvivalMilli: -600, total: -2398 } },
    { move: 'PASS', label: 'パス', expected: { te: 705, tp: 547, xSurvivalMilli: -517, total: -2066 } },
  ])('$label', ({ move, expected }) => {
    expect(rowAfter(move)).toEqual(expected);
  });
});

describe('[V-TEST-POSITIONS] T-18 パスへの負のボーナスと妨害モデル（定跡無効）', () => {
  const frenzy: EffectiveProfile = { ...defaultProfile(), actionBonus: { PASS: FRENZY_PASS } };

  function chosen(prof: EffectiveProfile): string {
    const state = step157State();
    const enemy = findUnit(state, 'FOE');
    const { decision } = decideActionDetailed(state, enemy, prof, deps);
    return decision.kind === 'PASS' ? 'PASS' : enemy.acts.find((a) => a.instance_id === decision.instanceId)!.master_ref;
  }

  // 敵は PP2 を温存すれば返し刃（[M-TMPL-ENEMY-SPECIAL]［1-01・1-02 の特殊枠］）で主人公の予測損耗を大きくできるため、
  // 生存項ではパスが最上位となり、既定の PASS 減点（−400、[A-PROFILE-BONUS]）や −1000 の下でも残る。
  it('T-18: 生存項のみの比較では、PASS 0・−400・−1000 のいずれの下でもパスを選ぶ', () => {
    expect(chosen({ ...frenzy, evalMask: ['survival'], maxDepth: 1 })).toBe('PASS');
    expect(chosen({ ...defaultProfile(), evalMask: ['survival'], maxDepth: 1 })).toBe('PASS');
    expect(chosen({ ...defaultProfile(), actionBonus: { PASS: -1000 }, evalMask: ['survival'], maxDepth: 1 })).toBe('PASS');
  });

  // 1-01 の実効プロファイルによる探索の選択は T-18 の期待手としない（[V-TEST-POSITIONS] T-18）。
  // [V-NUM-STEP157] の算出値（パス）として検証する。
  it('[V-NUM-STEP157] 1-01 の実効プロファイルによる探索ではパスを選ぶ', () => {
    expect(chosen(frenzy)).toBe('PASS');
  });
});
