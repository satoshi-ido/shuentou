// 行動選択の実行可否判定（[M-PIPE-SUICIDE] を含む）。決定そのもの（AI・プレイヤー・テスト用
// スクリプト）は本モジュールの範囲外であり、[M-PIPE-P8-ORDER] の呼び出し側が DecisionProvider を
// 通じて供給する。M1 時点では評価器・探索器（M2）が存在しないため、実 AI は未実装とする。

import { effectiveCostAp, effectiveCostHp, effectiveCostPp, effectiveCostVp, effectiveStepThought } from './effective.js';
import type { ActionInstance, BattleState, BookProgress, Unit } from './types.js';

const SEAL_LIMIT_CENTI = 100; // 1.00
const SACRAMENT_CLASS_ID = 'ACT_SACRAMENT'; // [M-END-SACRAMENT-PARAMS]（M1範囲外の例外。未生成のため到達しない）

export function isInstant(action: ActionInstance): boolean {
  return action.base_params.step_startup === 0;
}

// [M-PIPE-SUICIDE] HPコスト自滅制限。
function passesSuicidePolicy(unit: Unit, action: ActionInstance, effectiveCostHpValue: number): boolean {
  if (unit.unit_kind === 'MASTER') {
    if (action.master_ref === SACRAMENT_CLASS_ID) {
      return true; // 現在HPを上限に支払う特例（未実装：該当レコード未生成のため到達しない）
    }
    return unit.hp - effectiveCostHpValue > 0;
  }
  // クリーチャー：即時型アクションに限りHPコスト自滅を許可する。通常アクションは制限を受ける。
  if (isInstant(action)) {
    return true;
  }
  return unit.hp - effectiveCostHpValue > 0;
}

// 同一ステップ内・同一ユニット・同一クラスIDの即時型アクション実行を1回に制限する。
function passesSameStepInstantLimit(state: BattleState, unit: Unit, action: ActionInstance): boolean {
  if (!isInstant(action)) {
    return true;
  }
  const used = state.instant_used[unit.unit_id] ?? [];
  return !used.includes(action.master_ref);
}

export function isActionExecutable(state: BattleState, unit: Unit, action: ActionInstance): boolean {
  if (unit.state !== 'THOUGHT') {
    return false;
  }
  if (action.uses_left === 0) {
    return false;
  }
  if (action.seal_accum >= SEAL_LIMIT_CENTI) {
    return false;
  }
  if (unit.elapsed_thought < effectiveStepThought(unit, action)) {
    return false;
  }
  if (unit.vp < effectiveCostVp(unit, action)) {
    return false;
  }
  if (unit.pp < effectiveCostPp(unit, action)) {
    return false;
  }
  if (unit.ap < effectiveCostAp(unit, action)) {
    return false;
  }
  if (!passesSuicidePolicy(unit, action, effectiveCostHp(unit, action))) {
    return false;
  }
  if (!passesSameStepInstantLimit(state, unit, action)) {
    return false;
  }
  return true;
}

export function executableActions(state: BattleState, unit: Unit): ActionInstance[] {
  return unit.acts.filter((action) => isActionExecutable(state, unit, action));
}

// 実行可能なアクションを1件以上持つか（executableActions(...).length > 0 と同値で、最初の1件で打ち切る）。
export function hasExecutableAction(state: BattleState, unit: Unit): boolean {
  return unit.state === 'THOUGHT' && unit.acts.some((action) => isActionExecutable(state, unit, action));
}

// book は定跡を参照した決定主体が返す更新後の定跡進行状態（[A-BOOK-SEMANTICS]）。[M-PIPE-P8-ORDER] の
// 呼び出し側が BattleState へ反映する。
// source は決定の出所（[A-BOOK-SEMANTICS] の定跡 HIT か [A-SEARCH-ALGORITHM] の探索か）。
// [A-SEARCH-REUSE] の記録は探索の結果に対してのみ作る。
export type DecisionSource = 'BOOK' | 'SEARCH';

// AWAIT は「決定がまだ得られていない」ことを表す（[I-ENV-WORKER] ワーカーへの要求が未応答）。
// 受け取った呼び出し側は当該ステップの進行を中断し、応答後に同じ地点から再開する。
export type Decision =
  | { readonly kind: 'PASS'; readonly book?: BookProgress; readonly source?: DecisionSource }
  | { readonly kind: 'ACT'; readonly instanceId: string; readonly book?: BookProgress; readonly source?: DecisionSource }
  | { readonly kind: 'AWAIT' };

// 決定主体が実際に返した決定（AWAIT を除く）。
export type ResolvedDecision = Exclude<Decision, { readonly kind: 'AWAIT' }>;

// 決定主体（AI・プレイヤー・検証用スクリプト）が思考中ユニット1体につき1回呼ばれる。
export type DecisionProvider = (state: BattleState, unit: Unit) => Decision;
