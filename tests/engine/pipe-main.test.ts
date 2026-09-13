// [M-PIPE-MAIN] [M-RESOLVE-ORDER] ヘッドレス実行の受け入れ検証（M1）。
// [V-NUM-OPENING]・[V-NUM-STEP157] の実数値一致を検証する。
// M2（評価器・探索器）は未実装のため、本テストは実AIではなく、両陣営とも
// 「ACT_MIND_AR3 が実行可能ならそれを選び、そうでなければパスする」という
// 固定スクリプトの決定主体（DecisionProvider）でヘッドレスパイプラインを駆動する。
// この局面ではそれ以外の選択が現に発生しないことを [V-NUM-OPENING] 自身が示している
// （主人公は他の全アクションでコストまたは必要思考が未充足、敵の心気（無想）は評価上
// 不採択となる——後者の評価はAI／評価器の領分であり、M1のスクリプトは単にそれを選ばない）。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import type { Decision, DecisionProvider } from '../../src/engine/decision.js';
import { executableActions } from '../../src/engine/decision.js';
import { advanceStep, runStepBody, type StepDeps } from '../../src/engine/pipeline/step.js';
import { createScene } from '../../src/engine/setup.js';
import type { BattleState, Unit } from '../../src/engine/types.js';

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

function createLefScene(): BattleState {
  return createScene({
    sceneLevel: 3,
    heroMaxHp: 60,
    heroActionOrder: HERO_INIT_ACTIONS,
    enemyRecord: ENEMY_MASTERS.ENEMY_LEF,
    actionMasters: ACTION_MASTERS,
  });
}

function findUnit(state: BattleState, side: 'MINE' | 'FOE'): Unit {
  const unit = state.units.find((u) => u !== null && u.side === side) ?? null;
  if (unit === null) {
    throw new Error(`ユニットが見つからない: ${side}`);
  }
  return unit;
}

describe('[M-PIPE-MAIN][M-RESOLVE-ORDER] 1-01 祠守レフ戦のヘッドレス実行', () => {
  it('[V-NUM-OPENING] 開幕147ステップは両軍とも行動不能', () => {
    const state = createLefScene();
    for (let i = 0; i < 147; i += 1) {
      advanceStep(state, scriptedDecision, deps);
    }
    // ステップ147到達直前（ステップ0〜146処理後）までは実質的な行動が発生しない。
    const hero = findUnit(state, 'MINE');
    const enemy = findUnit(state, 'FOE');
    expect(hero.hp).toBe(60);
    expect(hero.pp).toBe(0);
    expect(hero.vp).toBe(0);
    expect(hero.state).toBe('THOUGHT');
    expect(enemy.hp).toBe(10);
    expect(enemy.pp).toBe(0);
    expect(enemy.vp).toBe(0);
    expect(enemy.state).toBe('THOUGHT');
  });

  it('[V-NUM-STEP157] ステップ157の局面が実数値と一致する', () => {
    const state = createLefScene();
    // ステップ0〜156を通常どおり完了させ（[M-PIPE-STEPEND] の一斉加算を含む）、
    // ステップ157は《処理1》〜《処理8》のみを実行する。[V-NUM-STEP157] の局面は
    // 「ステップ157の候補手評価」、すなわち同ステップの《処理8》時点の値
    // （そのステップ自身の一斉加算が適用される前の経過ステップ数）を指すため。
    for (let i = 0; i < 157; i += 1) {
      advanceStep(state, scriptedDecision, deps);
    }
    runStepBody(state, scriptedDecision, deps);
    const hero = findUnit(state, 'MINE');
    const enemy = findUnit(state, 'FOE');

    expect(hero.hp).toBe(58);
    expect(hero.ap).toBe(0);
    expect(hero.pp).toBe(2);
    expect(hero.vp).toBe(2);
    expect(hero.elapsed_thought).toBe(0);
    expect(hero.state).toBe('THOUGHT');
    expect(hero.pos_idx).toBe(1);

    expect(enemy.hp).toBe(8);
    expect(enemy.ap).toBe(0);
    expect(enemy.pp).toBe(2);
    expect(enemy.vp).toBe(2);
    expect(enemy.elapsed_thought).toBe(0);
    expect(enemy.state).toBe('THOUGHT');
    expect(enemy.pos_idx).toBe(2);

    expect(Math.abs(hero.pos_idx - enemy.pos_idx)).toBe(1); // [M-FIELD-DISTANCE] 距離1
  });
});
