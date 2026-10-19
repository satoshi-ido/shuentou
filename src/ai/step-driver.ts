// 探索器のための「次の決定点まで進める」手続き（[A-SEARCH-NODE]「子ノードへの遷移」）。
// [M-PIPE-MAIN] の《処理1》〜《処理7》をそのまま再利用し、《処理8》相当（決定点の発見）のみを
// 探索用に差し替える。DecisionProvider は「決定を返す」契約のため、決定そのものに評価値を
// 添えて呼び出し元へ返せない（[M-PIPE-P8-DECISION] の runP8Decision は BattleOutcome のみを返す）。
// このため探索の再帰（[src/ai/search.ts]）は runP8Decision を経由せず、本モジュールが提供する
// 「次の思考中ユニットを1体返す」問い合わせと組み合わせて値を持つ再帰を組み立てる。

import { hasExecutableAction } from '../engine/decision.js';
import { runP1Freeze } from '../engine/pipeline/p1-freeze.js';
import { runP2Apply, type P2Deps } from '../engine/pipeline/p2-apply.js';
import { runP3Recovery } from '../engine/pipeline/p3-recovery.js';
import { runP4Slip } from '../engine/pipeline/p4-slip.js';
import { runP5Discard, type BattleOutcome } from '../engine/pipeline/p5-discard.js';
import { runP6Advance } from '../engine/pipeline/p6-advance.js';
import { runP7Landing } from '../engine/pipeline/p7-landing.js';
import { runStepEnd } from '../engine/pipeline/stepend.js';
import type { BattleState, Unit } from '../engine/types.js';

export type PreP8Deps = P2Deps;

// 《処理1》〜《処理7》（[M-PIPE-MAIN] state.step !== 0 の分岐）。
export function runPreP8(state: BattleState, deps: PreP8Deps): BattleOutcome {
  if (state.step === 0) {
    return 'NONE';
  }
  const { firingUnitIds, defenseSnapshot } = runP1Freeze(state);
  runP2Apply(state, firingUnitIds, defenseSnapshot, deps);
  const recoveryCompleteIds = runP3Recovery(state);
  runP4Slip(state, recoveryCompleteIds);
  const outcome = runP5Discard(state);
  if (outcome !== 'NONE') {
    return outcome;
  }
  runP6Advance(state);
  runP7Landing(state, recoveryCompleteIds);
  return 'NONE';
}

// [M-PIPE-P8-ORDER] 敵軍（FOE）を先に、続いて自軍（MINE）を評価する順序で、
// まだ決定を経ていない思考中ユニットを1体返す。呼び出し側が「1体決定するたびに再度問い合わせる」
// ことで #1・#3 の逐次ループと同義になる（joint action の相方は探索器が組として扱う：[A-SEARCH-ROOT]）。
// [A-SEARCH-NODE] 決定点は「行動を確定できる瞬間」であるため、実行可能アクションを持たない
// ユニットは対象としない。passedUnitIds は当該ステップ内でパスを採択したユニットであり、
// [M-PIPE-P8-ORDER]#1「パス採択時：残る思考中ユニットの評価へ移行」に従い同ステップ内では再度問わない。
// [A-LATE-5-10]「探索木内の順序」mineFirst のとき自軍（MINE）を先に問う。
export function firstPendingUnit(state: BattleState, passedUnitIds: readonly string[], mineFirst = false): Unit | undefined {
  const candidates = state.units.filter(
    (unit): unit is Unit =>
      unit !== null &&
      unit.state === 'THOUGHT' &&
      !passedUnitIds.includes(unit.unit_id) &&
      hasExecutableAction(state, unit),
  );
  const order: readonly Unit['side'][] = mineFirst ? ['MINE', 'FOE'] : ['FOE', 'MINE'];
  for (const side of order) {
    const first = candidates.filter((unit) => unit.side === side).sort((a, b) => a.pos_idx - b.pos_idx)[0];
    if (first !== undefined) {
      return first;
    }
  }
  return undefined;
}

// 全生存ユニットが思考中で、思考の蓄積だけではいずれのアクションも実行可能にならない局面。
// 新たな行動が入らない限りコスト・封印・使用回数は変化しないため、以後の進行で決定点は生じない。
export function isStalled(state: BattleState): boolean {
  return state.units.every((unit) => {
    if (unit === null) {
      return true;
    }
    if (unit.state !== 'THOUGHT') {
      return false;
    }
    const matured: Unit = { ...unit, elapsed_thought: Number.MAX_SAFE_INTEGER };
    return !hasExecutableAction(state, matured);
  });
}

export { runStepEnd };
export type { BattleOutcome };
