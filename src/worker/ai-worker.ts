// [I-ENV-WORKER] 探索ワーカーのエントリ。メインスレッドから BattleState を受け取り、決定を返す。
// 探索器・評価器（[A-DESIGN-LAYERS] Layer 3・Layer 2）をこのスレッドで実行する。

import { AI_PROFILE_MASTERS } from '../data/generated/ai-profile-masters.js';
import { CREATURE_MASTERS } from '../data/generated/creature-masters.js';
import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../data/generated/enemy-masters.js';
import { SCENE_MASTERS } from '../data/generated/scene-masters.js';
import type { AiProfileRecord, EnemyMasterRecord, SceneMasterRecord } from '../data/types.js';
import type { AiDecisionRequest, AiDecisionResponse } from '../engine/ai-request.js';
import type { MirrorStats } from '../engine/run/state.js';
import { createCreatureFactory } from '../engine/creature.js';
import type { StepDeps } from '../engine/pipeline/step.js';
import type { BattleState, Unit } from '../engine/types.js';
import { buildEffectiveProfile, type EffectiveProfile } from '../ai/profile.js';
import { decideActionDetailed } from '../ai/search.js';

// [M-RESOLVE-SUMMON] 探索中の召喚もマスタから実体化する。joint_action のシーン（[A-DIFF-CONFIG]）は
// クリーチャーの手を含めて評価するため、探索木の内部でもクリーチャーを生成できなければならない。
const deps: StepDeps = {
  createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }),
};

// [A-PROFILE-RESOLVE] 構築のタイミングはバトル開始時であり、以降マスタを再参照しない。
// ワーカーはシーンごとに1度だけ構築し、同一バトル中は同じ実効プロファイルを用いる。
const profileCache: Record<string, EffectiveProfile> = {};
const scenes: Readonly<Record<string, SceneMasterRecord>> = SCENE_MASTERS;
const enemies: Readonly<Record<string, EnemyMasterRecord>> = ENEMY_MASTERS;
const profiles: Readonly<Record<string, AiProfileRecord>> = AI_PROFILE_MASTERS;

function profileOf(sceneId: string, mirrorStats: MirrorStats | null): EffectiveProfile {
  const cached = profileCache[sceneId];
  if (cached !== undefined) {
    return cached;
  }
  const scene = scenes[sceneId];
  if (scene === undefined) {
    throw new Error(`未知のシーンID: ${sceneId}`);
  }
  const enemy = enemies[scene.enemy_id];
  if (enemy === undefined) {
    throw new Error(`未知の敵マスターID: ${scene.enemy_id}`);
  }
  if (enemy.ai_profile_id === null) {
    throw new Error(`AIを実行しない敵マスター: ${enemy.enemy_id}`);
  }
  const record = profiles[enemy.ai_profile_id];
  if (record === undefined) {
    throw new Error(`未知のAIプロファイルID: ${enemy.ai_profile_id}`);
  }
  const profile = buildEffectiveProfile({ scene, enemy, profile: record, mirrorStats });
  if (record.dynamic_weight === null) {
    // [A-MIRROR-5-09] 動的重みは鏡像統計に依存するため、周回をまたいで使い回さない。
    profileCache[sceneId] = profile;
  }
  return profile;
}

function unitOf(state: BattleState, unitId: string): Unit {
  const unit = state.units.find((candidate): candidate is Unit => candidate !== null && candidate.unit_id === unitId);
  if (unit === undefined) {
    throw new Error(`ユニットが見つからない: ${unitId}`);
  }
  return unit;
}

// 1件の要求を処理する。探索は常に完走させ、実時間に起因する打ち切りを発生させない（[I-ENV-WORKER]）。
export function handleRequest(request: AiDecisionRequest): AiDecisionResponse {
  const unit = unitOf(request.state, request.unitId);
  const result = decideActionDetailed(request.state, unit, profileOf(request.sceneId, request.state.mirror_snapshot), deps);
  return {
    requestId: request.requestId,
    unitId: request.unitId,
    decision: result.decision,
    nodesConsumed: result.nodesConsumed,
  };
}

// ワーカースレッドとしての配線。テストからは handleRequest を直接呼ぶ。
declare const self: { onmessage: ((event: { data: AiDecisionRequest }) => void) | null; postMessage: (message: AiDecisionResponse) => void } | undefined;

if (typeof self !== 'undefined' && self !== null) {
  self.onmessage = (event) => {
    self.postMessage(handleRequest(event.data));
  };
}
