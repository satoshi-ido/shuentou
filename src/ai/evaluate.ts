// [A-EVAL-FORM] [A-EVAL-MATE] [A-EVAL-PHASE] [A-EVAL-REFIMPL] 評価器本体。
// E(state) = Σ(w_i × x_i)。AI側（FOE）視点、AI有利を正とする。
//
// 簡略化の開示：[A-EVAL-MATE]「両軍マスター同時消滅」（+MATE−ply−Δ）は、[M-PIPE-P5-DISCARD] /
// [M-PIPE-INSTANT] が勝敗を WIN/LOSS の2値のみで返し、同時消滅か否かの情報が撤去（物理撤去で
// ステートから消える）後には残らないため、本実装では区別しない（常に単独決着として scoring する）。
// 該当するのは即時型アクションが両軍マスターを同時に葬る極めて狭いケースのみであり、
// [V-TEST-POSITIONS] T-15 の評価順序（自軍優位）自体には影響しない。

import type { BattleOutcome } from '../engine/pipeline/p5-discard.js';
import type { StepDeps } from '../engine/pipeline/step.js';
import type { BattleState, Side, Unit } from '../engine/types.js';
import { floorDiv } from '../num/helpers.js';
import { cloneState } from './clone.js';
import { MATE } from './constants.js';
import { clamp, signedRoundDiv } from './fixed.js';
import {
  xBoard,
  xCopy,
  xDebuff,
  xImpatience,
  xPosition,
  xPp,
  xSeal,
  xSlip,
  xTempo,
  xVp,
} from './features.js';
import { type FeatureKey, BASE_WEIGHTS, type EffectiveProfile, weightMultOf } from './profile.js';
import { runQuiescence } from './quiesce.js';
import { ttk, xSurvival } from './ttk.js';
import { SCALE } from './constants.js';

const INT32_MAX = 2147483647;
const INT32_MIN = -2147483648;

// [A-EVAL-MATE]「詰み成立時のスコア」。
export function mateScore(outcome: BattleOutcome, ply: number): number {
  if (outcome === 'WIN') {
    return -MATE + ply; // 敵マスター消滅かつプレイヤー生存
  }
  return MATE - ply; // プレイヤーマスター消滅かつ敵マスター生存（同時消滅も同一式で扱う。上部注記）
}

function masterOf(state: BattleState, side: Side): Unit | undefined {
  return state.units.find((u): u is Unit => u !== null && u.side === side && u.unit_kind === 'MASTER');
}

// [A-EVAL-PHASE] φ = 1 − (敵マスター現在HP / 最大HP) による重み倍率（centi、既定100）。
function phaseMultiplierCenti(key: FeatureKey, phiCenti: number): number {
  if (phiCenti < 25) {
    if (key === 'pp' || key === 'vp') return 150;
    if (key === 'impatience') return 50;
    return 100;
  }
  if (phiCenti > 75) {
    if (key === 'survival') return 130;
    if (key === 'pp' || key === 'vp') return 50;
    if (key === 'impatience') return 200;
    return 100;
  }
  return 100;
}

function featureValue(state: BattleState, key: FeatureKey, prof: EffectiveProfile, tp: number, te: number): number {
  switch (key) {
    case 'survival':
      return xSurvival(tp, te, SCALE);
    case 'tempo':
      return xTempo(state);
    case 'board':
      return xBoard(state);
    case 'slip':
      return xSlip(state);
    case 'impatience':
      return xImpatience(state, prof.expectedLength);
    case 'debuff':
      return xDebuff(state);
    case 'pp':
      return xPp(state);
    case 'seal':
      return xSeal(state);
    case 'vp':
      return xVp(state);
    case 'position':
      return xPosition(state);
    case 'copy':
      return xCopy(state);
    default:
      return 0;
  }
}

// [A-EVAL-REFIMPL] evaluate(state, prof, ply)。ply は静止探索中に決着した場合の詰みスコアにのみ用いる。
// deps（CreatureFactory）は [A-EVAL-REFIMPL]「Layer 1が提供すべき純関数」を実際に
// 呼び出すための配線であり、M1の他モジュール（[M-PIPE-P8-DECISION] 等）と同様に注入する。
export function evaluate(state: BattleState, prof: EffectiveProfile, ply: number, deps: StepDeps): number {
  // 特徴量（x_tempo・x_board 等）とTTKの攻撃側・防御側は、決定点そのものの状態（state）を
  // 用いる。静止探索は [A-EVAL-TTK]「着弾予測時点」の防御力・距離を求めるための補助トレースに
  // すぎず、その延長状態自体を「評価対象の局面」にしてはならない（延長でSTARTUP/RECOVERYが
  // 完了し、tempo等が実勢と異なる値になってしまう）。このため quiesce には独立したクローンを渡す。
  const foeMaster = masterOf(state, 'FOE');
  const mineMaster = masterOf(state, 'MINE');
  if (foeMaster === undefined) {
    return -MATE;
  }
  if (mineMaster === undefined) {
    return MATE;
  }

  // [A-SEARCH-QUIESCE] 葉は静止局面まで進めてから評価する。延長中に決着した局面は決着項で評価する
  // （着弾済みの致命打をトレースの欠落として「命中不能」と扱わないため）。
  const { trace, outcome } = runQuiescence(cloneState(state), deps);
  if (outcome !== 'NONE') {
    return mateScore(outcome, ply);
  }
  const tp = ttk(mineMaster, foeMaster, { trace, level: state.scene_level });
  const te = ttk(foeMaster, mineMaster, { trace, level: state.scene_level });
  const phiCenti = 100 - floorDiv(foeMaster.hp * 100, Math.max(foeMaster.max_hp, 1));

  let total = 0;
  for (const key of prof.evalMask) {
    const x = featureValue(state, key, prof, tp, te);
    const weight = BASE_WEIGHTS[key];
    const mult = signedRoundDiv(weightMultOf(prof, key) * phaseMultiplierCenti(key, phiCenti), 100);
    const effectiveWeight = signedRoundDiv(weight * mult, 100);
    total += signedRoundDiv(effectiveWeight * x, SCALE);
  }
  return clamp(total, INT32_MIN, INT32_MAX);
}
