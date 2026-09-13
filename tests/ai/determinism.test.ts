// [D-05] 同一盤面ハッシュに対し、(a) 初回探索、(b) 別局面を1手挟んだ後の再探索、
// (c) アンドゥ復帰後の再探索、の3経路で decide_action の返り値と探索ノード数を比較する。
// アンドゥ・ロールバック（[M-REWIND-UNDO]・[M-REWIND-ROLLBACK]）はM3の範囲だが、
// decide_action が BattleState の純関数であること（[A-CORE-DETERMINISM]#6）そのものは
// JSON往復クローンへの再適用で検証できる：(c)「アンドゥ復帰後」の局面は、内部状態を保持しない
// 純関数であれば同一構造のクローンと区別できないためである。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import type { Decision, DecisionProvider } from '../../src/engine/decision.js';
import { executableActions } from '../../src/engine/decision.js';
import { advanceStep, runStepBody, type StepDeps } from '../../src/engine/pipeline/step.js';
import { createScene } from '../../src/engine/setup.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { cloneState } from '../../src/ai/clone.js';
import { defaultProfile } from '../../src/ai/profile.js';
import { decideActionDetailed } from '../../src/ai/search.js';

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

describe('[D-05] decide_action の決定論性', () => {
  it('初回探索・別局面を挟んだ再探索・アンドゥ復帰後の再探索の3経路で一致する', () => {
    const prof = { ...defaultProfile(), maxDepth: 2, nodeLimit: 2000 };

    // (a) 初回探索。
    const baseline = cloneState(step157State());
    const resultA = decideActionDetailed(baseline, findUnit(baseline, 'FOE'), prof, deps);

    // (b) 別局面を1手挟む：baseline とは無関係な局面（1ステップ進めた別クローン）で
    // 探索を行い、内部キャッシュ等を経由した汚染がないことを確認する（結果自体は使わない）。
    const otherScene = cloneState(baseline);
    advanceStep(otherScene, scriptedDecision, deps);
    runStepBody(otherScene, scriptedDecision, deps);
    decideActionDetailed(otherScene, findUnit(otherScene, 'FOE'), prof, deps);

    // (c) アンドゥ復帰後：baseline と同一構造のクローンへ「復帰」して再探索する。
    const restored = cloneState(baseline);
    const resultC = decideActionDetailed(restored, findUnit(restored, 'FOE'), prof, deps);

    // 経路(b)の直後に同じ局面へ戻って再探索した経路も比較する。
    const resultBState = cloneState(baseline);
    const resultB = decideActionDetailed(resultBState, findUnit(resultBState, 'FOE'), prof, deps);

    expect(resultB.decision).toEqual(resultA.decision);
    expect(resultB.score).toBe(resultA.score);
    expect(resultB.nodesConsumed).toBe(resultA.nodesConsumed);

    expect(resultC.decision).toEqual(resultA.decision);
    expect(resultC.score).toBe(resultA.score);
    expect(resultC.nodesConsumed).toBe(resultA.nodesConsumed);

    // decide_action 自身は state を変更しない（[A-CORE-DETERMINISM]#6）。
    expect(baseline).toEqual(cloneState(step157State()));
  });
});
