// [M-PIPE-MAIN] バトル進行メインループ（8段階処理パイプライン）。
// ステップ0の特例：《処理1》〜《処理7》を一律スキップし、初期ステータスのまま《処理8》から開始する。
//
// runStepBody（《処理1》〜《処理8》）と [M-PIPE-STEPEND]（ステップ境界の一斉加算）を分けて
// 公開する。P1の発動判定・P8の決定はいずれも「そのステップの一斉加算が行われる前」の経過
// ステップ数を参照する（[M-PIPE-P1-FREEZE] の判定式・[M-PIPE-P8-ORDER] の実行可否判定）ため、
// ステップ内の観測点（例：[V-NUM-STEP157] の局面）は本来 runStepBody 完了直後・stepEnd 適用前を指す。
// advanceStep は両者を合成した通常のステップ実行手段として提供する。

import type { DecisionProvider } from '../decision.js';
import type { CreatureFactory } from '../resolve/summon.js';
import type { BattleState } from '../types.js';
import { runP1Freeze } from './p1-freeze.js';
import { runP2Apply } from './p2-apply.js';
import { runP3Recovery } from './p3-recovery.js';
import { runP4Slip } from './p4-slip.js';
import { runP5Discard, type BattleOutcome } from './p5-discard.js';
import { runP6Advance } from './p6-advance.js';
import { runP7Landing } from './p7-landing.js';
import { runP8Decision } from './p8-decision.js';
import { runStepEnd } from './stepend.js';

export interface StepDeps {
  readonly createCreature: CreatureFactory;
}

export interface StepResult {
  readonly outcome: BattleOutcome;
}

// 《処理1》〜《処理8》。[M-PIPE-STEPEND] の一斉加算は含まない。
export function runStepBody(state: BattleState, decisionFor: DecisionProvider, deps: StepDeps): BattleOutcome {
  let outcome: BattleOutcome = 'NONE';

  if (state.step !== 0) {
    const { firingUnitIds, defenseSnapshot } = runP1Freeze(state);
    runP2Apply(state, firingUnitIds, defenseSnapshot, deps);
    const recoveryCompleteIds = runP3Recovery(state);
    runP4Slip(state, recoveryCompleteIds);
    outcome = runP5Discard(state);
    if (outcome === 'NONE') {
      runP6Advance(state);
      runP7Landing(state, recoveryCompleteIds);
    }
  }

  if (outcome === 'NONE') {
    outcome = runP8Decision(state, decisionFor, deps);
  }
  return outcome;
}

export function advanceStep(state: BattleState, decisionFor: DecisionProvider, deps: StepDeps): StepResult {
  const outcome = runStepBody(state, decisionFor, deps);
  runStepEnd(state);
  return { outcome };
}
