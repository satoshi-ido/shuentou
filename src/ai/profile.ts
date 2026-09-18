// [A-PROFILE-RESOLVE] 実効プロファイル（EffectiveProfile）。
// 全24件のAIプロファイルマスタ（[A-PROFILE-TABLE]）はマスタ側が保持し、本モジュールは
// フィールド構成と、シーンマスタ・敵マスタ・プロファイルからの構築手順を提供する。

import type { AiProfileRecord, EnemyMasterRecord, SceneMasterRecord } from '../data/types.js';
import { BONUS_DEFAULT_PASS, BONUS_REFAI_STANCE, SCALE } from './constants.js';
import type { MirrorStats } from '../engine/run/state.js';
import { floorDiv } from '../num/helpers.js';

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
  // [A-SEARCH-MOVEGEN] 待機手を候補に含めるか。参照プレイヤーAI（[V-TEST-REFAI]）に限り真とする。
  readonly waitMoves: boolean;
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
    waitMoves: false,
  };
}

// [V-TEST-REFAI] 探索深度固定 depth 3 / node 10,000。参照プレイヤーAIは impatience を除く10項を評価する
// （プレイヤー側は難易度カーブ検証のための均一な基準であり、シーン別のeval_maskを適用しない）。
// x_impatience は常に敵側の減点であり、符号を反転して用いると長期化が参照プレイヤーAIの得になるため除く。
export function referenceProfile(): EffectiveProfile {
  return {
    profileId: 'REFAI',
    weightMult: {},
    // [V-TEST-REFAI]「体勢への減点」必要思考0の体勢の反復で決め手へ PP が回らなくなるのを防ぐ。
    actionBonus: { STANCE: BONUS_REFAI_STANCE },
    maxDepth: 3,
    nodeLimit: 10000,
    jointAction: false,
    deferredDecision: false,
    evalMask: ['board', 'copy', 'debuff', 'pp', 'position', 'seal', 'slip', 'survival', 'tempo', 'vp'],
    inertiaSteps: 0,
    expectedLength: 600,
    bookId: null,
    waitMoves: true, // [V-TEST-REFAI]「待機手」
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

// [A-MIRROR-5-09]［動的重みの生成規則］mirror_stats.counts の4要素を評価特徴量キーへ写す。
// 表に現れないキーは生成対象外であり、PROFILE_MIRROR のマスタ値（seal 2.5 等）をそのまま用いる。
// counts の並びは [M-META-MIRRORSTATS] の 武技 / 体勢 / 心気 / 召喚。
const MIRROR_WEIGHT_KEYS: readonly (readonly FeatureKey[])[] = [
  ['survival'], // 武技：削り合いの速度差（[A-EVAL-TTK]）
  ['position'], // 体勢：防壁と配置による被弾の回避（[A-EVAL-BOARD]）
  ['pp', 'vp'], // 心気：リソース循環（[A-EVAL-RESOURCE]）。両キーに同一倍率を与える
  ['board'], // 召喚：生存ユニット数差（[A-EVAL-BOARD]）
];

// mult_scaled(要素) = SCALE + (count(要素) × SCALE) // max(1, total)。値域は [SCALE, 2 × SCALE]。
// weight_mult は centi で保持するため（既定100）、SCALE 単位の倍率を centi へ写して返す。
// 整数除算のみで構成する（[A-CORE-DETERMINISM]#1）。
export function mirrorWeightMult(stats: MirrorStats): Partial<Record<FeatureKey, number>> {
  const total = stats.counts.reduce((sum, count) => sum + count, 0);
  const result: Partial<Record<FeatureKey, number>> = {};
  for (let index = 0; index < MIRROR_WEIGHT_KEYS.length; index += 1) {
    const scaled = total === 0 ? SCALE : SCALE + floorDiv((stats.counts[index] ?? 0) * SCALE, total);
    const centi = floorDiv(scaled * 100, SCALE);
    for (const key of MIRROR_WEIGHT_KEYS[index]) {
      result[key] = centi;
    }
  }
  return result;
}

// [A-PROFILE-RESOLVE] 実効プロファイルの構築。バトル開始時に1度だけ構築し、以降マスタを再参照しない。
// 値はマスタから複製し、レコード側の参照を共有しない。
export interface ProfileSources {
  // [A-MIRROR-5-09] dynamic_weight を持つプロファイルに限り、バトル開始時に固定した鏡像統計を渡す。
  readonly mirrorStats?: MirrorStats | null;
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

export function buildEffectiveProfile({ scene, enemy, profile, mirrorStats }: ProfileSources): EffectiveProfile {
  if (enemy.ai_profile_id === null) {
    throw new Error(`AIを実行しない敵マスター: ${enemy.enemy_id}`); // 手順1（[M-TMPL-VESSEL]）
  }
  if (enemy.ai_profile_id !== profile.profile_id) {
    throw new Error(`敵マスターの参照先と一致しないプロファイル: ${enemy.ai_profile_id} / ${profile.profile_id}`);
  }
  // 手順3（[A-MIRROR-5-09]）。対象は PROFILE_MIRROR の1件のみであり、上表に現れるキーのみを置換する。
  const dynamic =
    profile.dynamic_weight === null
      ? {}
      : mirrorWeightMult(requireValue(mirrorStats ?? null, '鏡像統計', scene.scene_id));
  const evalMask = [...requireValue(scene.eval_mask, '有効特徴量', scene.scene_id)].sort();
  for (const key of evalMask) {
    if (!(FEATURE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`未知の評価特徴量キー: ${scene.scene_id} ${key}`);
    }
  }
  return {
    profileId: profile.profile_id,
    weightMult: { ...copyWeightMult(profile), ...dynamic }, // 手順2・手順3
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
    waitMoves: false, // [A-SEARCH-MOVEGEN] 敵軍AIの探索では待機手を生成しない
  };
}
