// [V-TEST-REFAI] 参照プレイヤーAI。
// 「無操作型」（常にパス）と、探索ベースの参照AI（[decideAction] をプレイヤー側へ適用したもの）
// が、実際のバトル進行（[M-PIPE-MAIN]）にDecisionProviderとして結線できることを確認する。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import type { Decision } from '../../src/engine/decision.js';
import { advanceStep, type StepDeps } from '../../src/engine/pipeline/step.js';
import { createScene } from '../../src/engine/setup.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { defaultProfile } from '../../src/ai/profile.js';
import { createReferenceDecisionProvider, passiveDecisionProvider } from '../../src/ai/refai.js';

const deps: StepDeps = {
  createCreature: () => {
    throw new Error('1-01（祠守レフ戦）では召喚は発生しない');
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

describe('[V-TEST-REFAI] 参照プレイヤーAI', () => {
  it('無操作型：常にパスを返す', () => {
    const state = createLefScene();
    const hero = state.units.find((u): u is Unit => u !== null && u.side === 'MINE')!;
    const decision: Decision = passiveDecisionProvider(state, hero);
    expect(decision).toEqual({ kind: 'PASS' });
  });

  it('探索ベースの参照AI（MINE側）と敵AI（FOE側）を同時に結線し、10ステップ進行できる', () => {
    const state = createLefScene();
    const enemyProvider = createAiDecisionProvider(defaultProfile(), deps);
    const referenceProvider = createReferenceDecisionProvider(deps);

    const combined = (s: BattleState, unit: Unit): Decision =>
      unit.side === 'FOE' ? enemyProvider(s, unit) : referenceProvider(s, unit);

    for (let i = 0; i < 10; i += 1) {
      expect(() => advanceStep(state, combined, deps)).not.toThrow();
    }

    const hero = state.units.find((u): u is Unit => u !== null && u.side === 'MINE');
    const enemy = state.units.find((u): u is Unit => u !== null && u.side === 'FOE');
    expect(hero).toBeDefined();
    expect(enemy).toBeDefined();
  });
});
