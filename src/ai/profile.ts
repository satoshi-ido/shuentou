// [A-PROFILE-RESOLVE] 実効プロファイル（EffectiveProfile）。
// 全30体分のAIプロファイルマスタ（[A-PROFILE-TABLE]）はM5の範囲であるため、本モジュールは
// フィールド構成と1-01用の既定値（[A-DIFF-CONFIG]）のみを提供する。

import { BONUS_DEFAULT_PASS } from './constants.js';

export type FeatureKey =
  | 'survival'
  | 'tempo'
  | 'board'
  | 'slip'
  | 'impatience'
  | 'debuff'
  | 'pp'
  | 'seal'
  | 'vp'
  | 'position'
  | 'copy';

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

export type ActionTag =
  | 'MIND'
  | 'MARTIAL'
  | 'STANCE'
  | 'SUMMON'
  | 'SWAP'
  | 'RUSH'
  | 'HEAVY'
  | 'INTERFERE'
  | 'STRIP_VP'
  | 'STRIP_PP'
  | 'STRIP_AP'
  | 'DEBUFF'
  | 'SEAL'
  | 'SLIP'
  | 'COPY'
  | 'SELF_HARM'
  | 'PASS';

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
