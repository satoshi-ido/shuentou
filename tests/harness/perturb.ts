// [V-TEST-REFAI]［重み摂動プロファイル群］勝率の測定に用いる23件のプロファイル。
// 乱数を用いない列挙であり、同一の操作列を与えれば同一の結果を返す（[A-CORE-DETERMINISM]#1）。

import { FEATURE_KEYS, referenceProfile, type EffectiveProfile, type FeatureKey } from '../../src/ai/profile.js';
import { roundDiv } from '../../src/num/helpers.js';
import { playRun, type RefPolicy } from './runner.js';

// 倍率は centi（既定100）。[V-TUNING]「各項を±20%変動させたプロファイル群」による。
const DOWN = 80;
const UP = 120;

export interface PerturbedProfile {
  readonly id: string; // 無摂動は 'BASE'、以降は `<キー>_<倍率>`
  readonly key: FeatureKey | null; // 摂動した特徴量キー。無摂動は null
  readonly multCenti: number;
  readonly profile: EffectiveProfile;
}

// ［順序］無摂動を先頭に置き、以降は特徴量キーの昇順、各キーにつき ×0.80・×1.20 の順とする。
export function perturbationSet(): PerturbedProfile[] {
  const base = referenceProfile();
  const result: PerturbedProfile[] = [{ id: 'BASE', key: null, multCenti: 100, profile: base }];
  for (const key of [...FEATURE_KEYS].sort()) {
    for (const multCenti of [DOWN, UP]) {
      result.push({
        id: `${key}_${multCenti}`,
        key,
        multCenti,
        // 摂動するのは参照プレイヤーAIの重みに限る。敵側の実効プロファイルには触れない。
        profile: { ...base, profileId: `REFAI_${key}_${multCenti}`, weightMult: { ...base.weightMult, [key]: multCenti } },
      });
    }
  }
  return result;
}

// [V-TEST-BUILD-METRICS] win_rate は勝利数 ÷ 試行数。centi で返す（100 = 100%）。
export function winRateCenti(wins: number, trials: number): number {
  if (trials === 0) {
    throw new Error('試行数が0の勝率は定義されない');
  }
  return roundDiv(wins * 100, trials);
}

export interface WinRateResult {
  readonly scene_id: string;
  readonly wins: number;
  readonly trials: number;
  readonly win_rate: number; // centi
  readonly losses: readonly string[]; // 敗北した摂動プロファイルのID（昇順の試行順）
}

// [V-TEST-REFAI]『勝率』は摂動プロファイル群での勝利数比。方針を固定して1シーンぶんを測る。
// 到達手段は playRun と同一であり、lastOrder までを通しプレイしてその最終シーンの勝敗を数える。
export function measureWinRate(policy: RefPolicy, lastOrder: number): WinRateResult {
  let sceneId = '';
  let wins = 0;
  const losses: string[] = [];
  const set = perturbationSet();
  for (const entry of set) {
    const run = playRun(policy, lastOrder, undefined, entry.profile);
    const final = run.scenes[run.scenes.length - 1];
    if (final === undefined) {
      throw new Error('到達したシーンがない');
    }
    sceneId = final.scene_id;
    if (final.result === 'WIN' && run.scenes.length === lastOrder) {
      wins += 1;
    } else {
      losses.push(entry.id);
    }
  }
  return { scene_id: sceneId, wins, trials: set.length, win_rate: winRateCenti(wins, set.length), losses };
}
