// [A-EVAL-TTK] [V-NUM-STEP157] ステップ157の候補手評価（[V-TEST-POSITIONS] T-18 の局面）を、
// 定跡を無効化した単体検証として再現する。合本の表に掲載された TTK(敵→主) の実数値と、
// 本実装の ttk()/quiesce() の出力が一致することを確認する。
//
// TTK(主→敵) は本実装では検証対象としない（[src/ai/ttk.ts] 冒頭コメントの開示：多段命中かつ
// リソース補充を要する場合に合本掲載値と数ステップのずれが生じるため）。到達時間・妨害モデル・
// 着弾予測時点の防御力／距離の検証は TTK(敵→主) の4例（体勢AR3・体勢AR6・武技重撃AR3・パス）で
// 十分に行える。

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
import { runQuiescence } from '../../src/ai/quiesce.js';
import { ttk } from '../../src/ai/ttk.js';

const PREFERRED_CLASS_ID = 'ACT_MIND_AR3';

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

// TTK(敵→主) のみを返す（上部コメントの理由により TTK(主→敵) は対象外）。
function teAfter(state: BattleState, instanceIdOrPass: string | null): number {
  const clone = cloneState(state);
  const enemy = findUnit(clone, 'FOE');
  const move =
    instanceIdOrPass === null
      ? ({ kind: 'PASS' } as const)
      : ({ kind: 'ACT', action: enemy.acts.find((a) => a.instance_id === instanceIdOrPass)! } as const);
  applyMove(clone, enemy, move, deps);
  const hero = findUnit(clone, 'MINE');
  const enemyAfter = findUnit(clone, 'FOE');
  const { trace } = runQuiescence(cloneState(clone), deps);
  return ttk(enemyAfter, hero, { trace, level: clone.scene_level });
}

describe('[V-NUM-STEP157] 候補手評価（定跡無効時の単体検証）TTK(敵→主)', () => {
  it('体勢AR3: 708', () => {
    const state = step157State();
    const enemy = findUnit(state, 'FOE');
    const guard3 = enemy.acts.find((a) => a.master_ref === 'ACT_GUARD_AR3')!;
    expect(teAfter(state, guard3.instance_id)).toBe(708);
  });

  it('体勢AR6: 662', () => {
    const state = step157State();
    const enemy = findUnit(state, 'FOE');
    const guard6 = enemy.acts.find((a) => a.master_ref === 'ACT_GUARD_AR6')!;
    expect(teAfter(state, guard6.instance_id)).toBe(662);
  });

  it('武技（重撃）AR3: 787（発生236の投資が妨害の遮蔽として働く）', () => {
    const state = step157State();
    const enemy = findUnit(state, 'FOE');
    const heavy3 = enemy.acts.find((a) => a.master_ref === 'ACT_HEAVY_AR3')!;
    expect(teAfter(state, heavy3.instance_id)).toBe(787);
  });

  it('パス: 607（妨害補正が有効に働く）', () => {
    const state = step157State();
    expect(teAfter(state, null)).toBe(607);
  });
});
