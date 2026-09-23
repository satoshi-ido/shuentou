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
import { cloneBattleState } from './clone.js';
import { MATE, QMATE } from './constants.js';
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
import { newTtkCache, ttk, xSurvival } from './ttk.js';
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

// [A-EVAL-MATE]「静止探索中の決着」。延長中は相手の新規行動を仮定しないため確定した詰みではなく、
// 絶対値を MATE_TH 未満に保って早期打ち切り・自滅ポリシーの対象から外す。q は決着までの延長ステップ数。
export function quiescenceMateScore(outcome: BattleOutcome, ply: number, q: number): number {
  if (outcome === 'WIN') {
    return -QMATE + ply + q;
  }
  return QMATE - ply - q;
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
  return evaluateLeafPosition(state, prof, ply, deps).value;
}

// [A-SEARCH-QUIESCE]［評価対象］［決着の確認］葉ノードの評価値と、その値が「敗れる側に決定点が
// 現れた決着」であるか（確認の延長の対象であるか）を返す。
export interface LeafEvaluation {
  readonly value: number;
  readonly refutableSettlement: boolean;
}

// [V-TEST-NONFUNC]［測定の打ち切り］通しプレイの測定は、1試行1シーンあたりの E(state) の
// 呼び出し回数で打ち切りを判定する。決定論的な量であり（[A-CORE-DETERMINISM]#1）、実時間に
// 依らず同一の入力に対して同一の値を返す。
let evalCalls = 0;

export function evalCallCount(): number {
  return evalCalls;
}

export function resetEvalCallCount(): void {
  evalCalls = 0;
}

export function evaluateLeafPosition(
  state: BattleState,
  prof: EffectiveProfile,
  ply: number,
  deps: StepDeps,
): LeafEvaluation {
  evalCalls += 1;
  if (masterOf(state, 'FOE') === undefined) {
    return { value: -MATE, refutableSettlement: false };
  }
  if (masterOf(state, 'MINE') === undefined) {
    return { value: MATE, refutableSettlement: false };
  }

  // [A-SEARCH-QUIESCE]［評価対象］葉は静止局面まで進め、その静止局面を評価する。発生中アクションの
  // 完了効果（心気のVP・PP、体勢のAP、武技の着弾・スタン）は静止局面のステートに反映済みとなる。
  // 延長中に決着した局面は「静止探索中の決着」のスコアで評価する（ply は葉ノードの値）。state は変更しない。
  const quiet = cloneBattleState(state);
  const { trace, outcome, decided, firstDecision } = runQuiescence(quiet, deps);
  if (outcome !== 'NONE') {
    // [A-SEARCH-QUIESCE]［決着の確認］敗れる側に決定点が現れた決着は確定とせず、呼び出し側が
    // 決定点1つ分の延長で確認する。
    const loser = outcome === 'WIN' ? 'FOE' : 'MINE';
    return { value: quiescenceMateScore(outcome, ply, trace.length - 1), refutableSettlement: decided[loser] };
  }
  const foeMaster = masterOf(quiet, 'FOE');
  const mineMaster = masterOf(quiet, 'MINE');
  if (foeMaster === undefined || mineMaster === undefined) {
    throw new Error('静止探索が決着を返さずにマスターが消滅した');
  }
  // 延長したステップ数 q。トレースは葉ノードを添字0として記録されている。
  const inputs = { trace, level: quiet.scene_level, offset: trace.length - 1, cache: newTtkCache() };
  // [A-EVAL-TTK]［延長中の決定点からの計画］延長中に決定点を持った陣営は、その時点からの計画と比べて小さい方を採る。
  let tp = ttk(mineMaster, foeMaster, inputs);
  let te = ttk(foeMaster, mineMaster, inputs);
  const mineFirst = firstDecision.MINE;
  if (mineFirst !== null && mineFirst.index < inputs.offset) {
    tp = Math.min(tp, ttk(mineFirst.mine, mineFirst.foe, { ...inputs, offset: mineFirst.index }));
  }
  const foeFirst = firstDecision.FOE;
  if (foeFirst !== null && foeFirst.index < inputs.offset) {
    te = Math.min(te, ttk(foeFirst.foe, foeFirst.mine, { ...inputs, offset: foeFirst.index }));
  }
  const phiCenti = 100 - floorDiv(foeMaster.hp * 100, Math.max(foeMaster.max_hp, 1));

  let total = 0;
  for (const key of prof.evalMask) {
    const x = featureValue(quiet, key, prof, tp, te);
    const weight = BASE_WEIGHTS[key];
    const mult = signedRoundDiv(weightMultOf(prof, key) * phaseMultiplierCenti(key, phiCenti), 100);
    const effectiveWeight = signedRoundDiv(weight * mult, 100);
    total += signedRoundDiv(effectiveWeight * x, SCALE);
  }
  return { value: clamp(total, INT32_MIN, INT32_MAX), refutableSettlement: false };
}
