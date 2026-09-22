// [V-TEST-NONFUNC] D-01a 5-10（depth 7 / node 8,000）の最悪局面で、node_limit 到達による打ち切りが働き、
// 直前深さの結果が採用されること（[A-SEARCH-ALGORITHM]「NodeBudget 例外 → 直前深さの結果を採用して打ち切り」）。
//
// 局面は M6 の通しプレイ（ビルドプロファイル BP-03・重み摂動 vp ×1.20）の 5-10 ステップ145における
// 敵マスターの決定点である。観測した 5-10 の全決定のうち、深さ7の完了に要するノード数が最大であった
// （191,337）。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { AI_PROFILE_MASTERS } from '../../src/data/generated/ai-profile-masters.js';
import { CREATURE_MASTERS } from '../../src/data/generated/creature-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { createCreatureFactory } from '../../src/engine/creature.js';
import type { StepDeps } from '../../src/engine/pipeline/step.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { buildEffectiveProfile } from '../../src/ai/profile.js';
import fixtureSource from './fixtures/d01a-5-10-worst.json?raw';
import { decideActionDetailed } from '../../src/ai/search.js';

const fixture = JSON.parse(fixtureSource) as {
  readonly unitId: string;
  readonly state: BattleState;
};

const deps: StepDeps = {
  createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }),
};

const scene = SCENE_MASTERS.SCENE_5_10;
const enemy = ENEMY_MASTERS[scene.enemy_id as keyof typeof ENEMY_MASTERS];
const prof = buildEffectiveProfile({
  scene,
  enemy,
  profile: AI_PROFILE_MASTERS[enemy.ai_profile_id as keyof typeof AI_PROFILE_MASTERS],
  mirrorStats: null,
});

function unitOf(state: BattleState): Unit {
  return state.units.find((unit): unit is Unit => unit !== null && unit.unit_id === fixture.unitId)!;
}

describe('[V-TEST-NONFUNC] D-01a node_limit による打ち切り', () => {
  const state = structuredClone(fixture.state);
  const result = decideActionDetailed(state, unitOf(state), prof, deps);

  it('5-10 の設定は depth 7 / node 8,000 である（[A-DIFF-CONFIG]）', () => {
    expect(prof.maxDepth).toBe(7);
    expect(prof.nodeLimit).toBe(8000);
  });

  it('最悪局面ではノード予算を使い切り、max_depth に達する前に打ち切る', () => {
    expect(result.nodesConsumed).toBe(8000);
    expect(result.depthCompleted).toBeGreaterThan(0);
    expect(result.depthCompleted).toBeLessThan(prof.maxDepth);
  });

  it('打ち切り時は直前深さ（完了した最大の深さ）の結果を採用する', () => {
    const copy = structuredClone(fixture.state);
    const shallow = decideActionDetailed(copy, unitOf(copy), { ...prof, maxDepth: result.depthCompleted }, deps);
    expect(shallow.depthCompleted).toBe(result.depthCompleted);
    expect(shallow.decision).toEqual(result.decision);
    expect(shallow.score).toBe(result.score);
  });

  it('打ち切りは決定論的に成立する（同一局面で手・スコア・消費ノード数・完了深さが一致）', () => {
    const copy = structuredClone(fixture.state);
    expect(decideActionDetailed(copy, unitOf(copy), prof, deps)).toEqual(result);
    expect(copy).toEqual(fixture.state); // [A-CORE-DETERMINISM]#6 探索は局面を変更しない
  });
});
