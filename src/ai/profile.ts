// [A-PROFILE-RESOLVE] 実効プロファイル（EffectiveProfile）。
// 全30体分のAIプロファイルマスタ（[A-PROFILE-TABLE]）はM5の範囲であるため、本モジュールは
// フィールド構成と1-01用の既定値（[A-DIFF-CONFIG]）のみを提供する。

import type { AiProfileRecord, EnemyMasterRecord, SceneMasterRecord } from '../data/types.js';
import { BONUS_DEFAULT_PASS } from './constants.js';

export const FEATURE_KEYS = [
  'board',
  'copy',
  'debuff',
  'impatience',
  'position',
  'pp',
  'seal',
  'slip',
  'survival',
  'tempo',
  'vp',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// [A-EVAL-WEIGHTS] 推奨初期重み。
export const BASE_WEIGHTS: Readonly<Record<FeatureKey, number>> = {
  survival: 4000,
  tempo: 1200,
  board: 900,
  slip: 800,
  impatience: 800,
  debuff: 700,
  pp: 600,
  seal: 500,
  vp: 400,
  position: 350,
  copy: 300,
};

export const ACTION_TAGS = [
  'MIND',
  'MARTIAL',
  'STANCE',
  'SUMMON',
  'SWAP',
  'RUSH',
  'HEAVY',
  'INTERFERE',
  'STRIP_VP',
  'STRIP_PP',
  'STRIP_AP',
  'DEBUFF',
  'SEAL',
  'SLIP',
  'COPY',
  'SELF_HARM',
  'PASS',
] as const;
export type ActionTag = (typeof ACTION_TAGS)[number];

// [A-PROFILE-RESOLVE]「フィールド構成」。
export interface EffectiveProfile {
  readonly profileId: string;
  readonly weightMult: Readonly<Partial<Record<FeatureKey, number>>>; // centi。既定100（×1.00）
  readonly actionBonus: Readonly<Partial<Record<ActionTag, number>>>; // 固定小数。既定は[A-PROFILE-BONUS]の表（PASSのみ既定非0）
  readonly maxDepth: number;
  readonly nodeLimit: number;
  readonly jointAction: boolean;
  readonly deferredDecision: boolean;
  readonly evalMask: readonly FeatureKey[]; // 昇順ソート済み（[I-STATE-JSON]）
  readonly inertiaSteps: number;
  readonly expectedLength: number;
  readonly bookId: string | null;
}

// [A-DIFF-CONFIG] 1-01 の設定値。M5（全30シーン投入）までの既定プロファイルとして用いる。
export function defaultProfile(): EffectiveProfile {
  return {
    profileId: 'DEFAULT',
    weightMult: {},
    actionBonus: {},
    maxDepth: 3,
    nodeLimit: 3000,
    jointAction: false,
    deferredDecision: false,
    evalMask: ['board', 'survival', 'tempo'],
    inertiaSteps: 30,
    expectedLength: 600,
    bookId: null,
  };
}

// [V-TEST-REFAI] 探索深度固定 depth 3 / node 10,000。参照プレイヤーAIは全11項を評価する
// （プレイヤー側は難易度カーブ検証のための均一な基準であり、シーン別のeval_maskを適用しない）。
export function referenceProfile(): EffectiveProfile {
  return {
    profileId: 'REFAI',
    weightMult: {},
    actionBonus: {},
    maxDepth: 3,
    nodeLimit: 10000,
    jointAction: false,
    deferredDecision: false,
    evalMask: ['board', 'copy', 'debuff', 'impatience', 'pp', 'position', 'seal', 'slip', 'survival', 'tempo', 'vp'],
    inertiaSteps: 0,
    expectedLength: 600,
    bookId: null,
  };
}

export function weightMultOf(prof: EffectiveProfile, key: FeatureKey): number {
  return prof.weightMult[key] ?? 100;
}

export function actionBonusOf(prof: EffectiveProfile, tag: ActionTag): number {
  const override = prof.actionBonus[tag];
  if (override !== undefined) {
    return override;
  }
  return tag === 'PASS' ? BONUS_DEFAULT_PASS : 0;
}

// [A-PROFILE-RESOLVE] 実効プロファイルの構築。バトル開始時に1度だけ構築し、以降マスタを再参照しない。
// 値はマスタから複製し、レコード側の参照を共有しない。
export interface ProfileSources {
  readonly scene: SceneMasterRecord;
  readonly enemy: EnemyMasterRecord;
  readonly profile: AiProfileRecord;
}

function requireValue<T>(value: T | null, label: string, sceneId: string): T {
  if (value === null) {
    throw new Error(`シーンマスタに${label}がない: ${sceneId}`);
  }
  return value;
}

function copyWeightMult(record: AiProfileRecord): Partial<Record<FeatureKey, number>> {
  const result: Partial<Record<FeatureKey, number>> = {};
  for (const [key, value] of Object.entries(record.weight_mult)) {
    if (!(FEATURE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`未知の評価特徴量キー: ${record.profile_id} ${key}`);
    }
    result[key as FeatureKey] = value;
  }
  return result;
}

function copyActionBonus(record: AiProfileRecord): Partial<Record<ActionTag, number>> {
  const result: Partial<Record<ActionTag, number>> = {};
  for (const [key, value] of Object.entries(record.action_bonus)) {
    if (!(ACTION_TAGS as readonly string[]).includes(key)) {
      throw new Error(`未知のアクション種別タグ: ${record.profile_id} ${key}`);
    }
    result[key as ActionTag] = value;
  }
  return result;
}

export function buildEffectiveProfile({ scene, enemy, profile }: ProfileSources): EffectiveProfile {
  if (enemy.ai_profile_id === null) {
    throw new Error(`AIを実行しない敵マスター: ${enemy.enemy_id}`); // 手順1（[M-TMPL-VESSEL]）
  }
  if (enemy.ai_profile_id !== profile.profile_id) {
    throw new Error(`敵マスターの参照先と一致しないプロファイル: ${enemy.ai_profile_id} / ${profile.profile_id}`);
  }
  if (profile.dynamic_weight !== null) {
    // 手順3（[A-MIRROR-5-09]）。対象は PROFILE_MIRROR の1件のみであり、5-09 の投入時に実装する。
    throw new Error(`動的重み生成は未実装: ${profile.profile_id}`);
  }
  const evalMask = [...requireValue(scene.eval_mask, '有効特徴量', scene.scene_id)].sort();
  for (const key of evalMask) {
    if (!(FEATURE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`未知の評価特徴量キー: ${scene.scene_id} ${key}`);
    }
  }
  return {
    profileId: profile.profile_id,
    weightMult: copyWeightMult(profile), // 手順2
    actionBonus: copyActionBonus(profile),
    // 手順4：シーンマスタから写す（値の正本は [A-DIFF-CONFIG]）。
    maxDepth: requireValue(scene.max_depth, '探索深度', scene.scene_id),
    nodeLimit: requireValue(scene.node_limit, 'ノード数上限', scene.scene_id),
    jointAction: scene.joint_action,
    deferredDecision: scene.deferred_decision,
    evalMask: evalMask as readonly FeatureKey[],
    inertiaSteps: requireValue(scene.inertia_steps, '惰性ステップ数', scene.scene_id),
    expectedLength: requireValue(scene.expected_length, '想定戦闘長', scene.scene_id),
    bookId: enemy.book_id ?? null, // 手順5
  };
}
