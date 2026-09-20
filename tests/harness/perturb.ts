// [V-TEST-REFAI]［重み摂動プロファイル群］勝率の測定に用いる21件のプロファイル。
// 乱数を用いない列挙であり、同一の操作列を与えれば同一の結果を返す（[A-CORE-DETERMINISM]#1）。

import { referenceProfile, type EffectiveProfile, type FeatureKey } from '../../src/ai/profile.js';
import { roundDiv } from '../../src/num/helpers.js';
import {
  advanceOptionsFor,
  driveBattle,
  createRun,
  playIntermission,
  playRun,
  playScene,
  HARD_STEP_CAP,
  type RefPolicy,
  type SceneOutcome,
  type StepObserver,
} from './runner.js';
import { rollbackBattle } from '../../src/engine/game/rewind.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';

// 倍率は centi（既定100）。[V-TUNING]「各項を±20%変動させたプロファイル群」による。
const DOWN = 80;
const UP = 120;

export interface PerturbedProfile {
  readonly id: string; // 無摂動は 'BASE'、以降は `<キー>_<倍率>`
  readonly key: FeatureKey | null; // 摂動した特徴量キー。無摂動は null
  readonly multCenti: number;
  readonly profile: EffectiveProfile;
}

// ［構成］参照プレイヤーAIの評価項（[V-TEST-REFAI]「評価項」の10項）のうち1項のみを摂動する。
// ［順序］無摂動を先頭に置き、以降は特徴量キーの昇順、各キーにつき ×0.80・×1.20 の順とする。
export function perturbationSet(): PerturbedProfile[] {
  const base = referenceProfile();
  const result: PerturbedProfile[] = [{ id: 'BASE', key: null, multCenti: 100, profile: base }];
  for (const key of [...base.evalMask].sort()) {
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
  // [V-TEST-NONFUNC]［測定の打ち切り］測定不能となった試行は分母から除く。
  let unmeasured = 0;
  for (const entry of set) {
    // 勝利数を数える測定であり、決着上限で打ち切ると勝敗が観測できないため安全弁まで進める。
    const run = playRun(policy, lastOrder, undefined, entry.profile, HARD_STEP_CAP);
    const final = run.scenes[run.scenes.length - 1];
    if (final === undefined) {
      throw new Error('到達したシーンがない');
    }
    sceneId = final.scene_id;
    if (!final.measured) {
      unmeasured += 1;
      continue;
    }
    if (final.result === 'WIN' && run.scenes.length === lastOrder) {
      wins += 1;
    } else {
      losses.push(entry.id);
    }
  }
  const trials = set.length - unmeasured;
  return { scene_id: sceneId, wins, trials, win_rate: winRateCenti(wins, trials), losses };
}

export interface SceneAttempts {
  readonly outcome: SceneOutcome;
  readonly attempts: number; // 最初の挑戦を1と数える
  readonly rewinds: number; // rollbackBattle の回数（= attempts - 1）
  readonly profileId: string; // 決着させた摂動プロファイルのID
}

// [V-TEST-REFAI]［重み摂動プロファイル群］敗北時は次の摂動へ切り替え、[M-REWIND-ROLLBACK] の
// バトル開始時ロールバックで再挑戦する。摂動を替えなければ参照プレイヤーAIは決定論により同一の
// 敗北を再生産するため、切り替えが再挑戦の意味を持たせる唯一の手段である。
export function playSceneWithRetry(
  session: GameSession,
  ctx: GameContext,
  policy: RefPolicy,
  observe?: StepObserver,
): SceneAttempts {
  const ladder = perturbationSet();
  let outcome = playScene(session, ctx, policy, observe, ladder[0].profile);
  for (let attempt = 1; attempt < ladder.length; attempt += 1) {
    // 突破できたシーンのみ再挑戦を打ち切る。敗北のほか、決着上限での打ち切り（[V-TEST-NONFUNC] D-02）も
    // 「当該シーンを突破していない」状態であり、次の摂動を試す対象である。
    if (outcome.result === 'WIN') {
      return { outcome, attempts: attempt, rewinds: attempt - 1, profileId: ladder[attempt - 1].id };
    }
    const resumed = rollbackBattle(session, ctx, advanceOptionsFor(observe));
    outcome = driveBattle(session, ctx, policy, ladder[attempt].profile, resumed, observe);
  }
  return {
    outcome,
    attempts: ladder.length,
    rewinds: ladder.length - 1,
    profileId: ladder[ladder.length - 1].id,
  };
}

export interface RetryRunOutcome {
  readonly scenes: readonly SceneAttempts[];
  readonly completed: boolean;
  readonly rewinds: number; // 周回を通じた rollbackBattle の総数
}

// [V-TEST-NONFUNC] D-02「全30シーンを参照プレイヤーAIで通しプレイ」。敗北したシーンは
// 摂動を切り替えて再挑戦し、摂動群を使い切っても勝てない場合にそこで打ち切る。
export function playRunWithRetry(
  policy: RefPolicy,
  lastOrder = 30,
  observeFor?: (sceneId: string) => StepObserver,
  // 長時間の測定のため、1シーン決着ごとに経過を報告する受け口を置く。
  report?: (attempt: SceneAttempts) => void,
): RetryRunOutcome {
  const { session, ctx } = createRun();
  const scenes: SceneAttempts[] = [];
  let rewinds = 0;

  for (let turn = 0; turn < lastOrder; turn += 1) {
    const observe = observeFor?.(session.data.run.current_scene_id);
    const attempt = playSceneWithRetry(session, ctx, policy, observe);
    scenes.push(attempt);
    rewinds += attempt.rewinds;
    report?.(attempt);
    if (attempt.outcome.result !== 'WIN') {
      return { scenes, completed: false, rewinds };
    }
    if (turn + 1 >= lastOrder) {
      break;
    }
    playIntermission(session, ctx, policy, turn);
  }
  return { scenes, completed: true, rewinds };
}
