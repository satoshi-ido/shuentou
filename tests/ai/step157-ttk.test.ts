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
import { ttk, xSurvival } from '../../src/ai/ttk.js';

const PREFERRED_CLASS_ID = 'ACT_MIND_AR3';
const W_SURVIVAL = 4000;
const FRENZY_PASS = -800; // [A-PROFILE-TABLE] 狂乱プロファイル

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
  const { trace } = runQuiescence(cloneState(state), deps);
  const inputs = { trace, level: state.scene_level };
  const tp = ttk(findUnit(state, 'MINE'), findUnit(state, 'FOE'), inputs);
  const te = ttk(findUnit(state, 'FOE'), findUnit(state, 'MINE'), inputs);
  const x = xSurvival(tp, te, SCALE);
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
    { move: 'ACT_GUARD_AR3', label: '体勢 AR3（AP16）', expected: { te: 999, tp: 787, xSurvivalMilli: -119, total: -477 } },
    { move: 'ACT_GUARD_AR6', label: '体勢 AR6（AP23）', expected: { te: 999, tp: 875, xSurvivalMilli: -66, total: -266 } },
    { move: 'ACT_HEAVY_AR3', label: '武技（重撃）AR3', expected: { te: 787, tp: 681, xSurvivalMilli: -72, total: -289 } },
    { move: 'PASS', label: 'パス', expected: { te: 607, tp: 437, xSurvivalMilli: -163, total: -1452 } },
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

  it('T-18: 生存項のみの比較（PASS −800 を加味）では体勢AR6を選ぶ', () => {
    expect(chosen({ ...frenzy, evalMask: ['survival'], maxDepth: 1 })).toBe('ACT_GUARD_AR6');
  });

  it('T-18: 1-01 の実効プロファイルによる探索では非パス手（武技（重撃）AR3）を選ぶ', () => {
    expect(chosen(frenzy)).toBe('ACT_HEAVY_AR3');
  });
});
