// [A-BOOK-SEMANTICS] 定跡手のセマンティクス：lookup の状態遷移・恒久ブロック判定・定跡手の解決。
// lookup は引数のステートを変更せず、更新後の定跡進行状態を戻り値に含める。
// DYNAMIC（MIRROR_FIRST_SYSTEM）の解決は鏡像統計（[M-META-MIRRORSTATS]）を要するため、5-09 の投入時に追加する。

import type { BookMasterRecord } from '../data/types.js';
import { executableActions } from '../engine/decision.js';
import { effectiveCostAp, effectiveCostPp } from '../engine/effective.js';
import { hasFlag } from '../engine/flags.js';
import type { ActionInstance, BattleState, BookProgress, Unit } from '../engine/types.js';

const SEAL_LIMIT_CENTI = 100;

export type BookLookup =
  | { readonly kind: 'MOVE'; readonly instanceId: string; readonly progress: BookProgress }
  | { readonly kind: 'PASS_MOVE'; readonly progress: BookProgress }
  | { readonly kind: 'BOOK_MISS'; readonly progress: BookProgress };

function miss(state: BattleState, aborted: boolean): BookLookup {
  return { kind: 'BOOK_MISS', progress: { book_index: state.book_index, book_aborted: aborted, book_wait_elapsed: null } };
}

// [A-BOOK-SEMANTICS]［定跡手の解決］所持アクション配列を先頭から走査し、class_id が一致する最初の要素。
function resolveFixed(unit: Unit, classId: string): ActionInstance | undefined {
  return unit.acts.find((action) => action.master_ref === classId);
}

// [A-BOOK-SEMANTICS]「is_permanently_blocked の判定条件」。
function isPermanentlyBlocked(state: BattleState, unit: Unit, action: ActionInstance): boolean {
  if (action.seal_accum >= SEAL_LIMIT_CENTI || action.uses_left === 0) {
    return true; // 1
  }
  if (unit.pp < effectiveCostPp(unit, action) && !unit.acts.some((a) => hasFlag(a.sys_flags, 'FLAG_MIND'))) {
    return true; // 2
  }
  if (unit.ap < effectiveCostAp(unit, action) && !unit.acts.some((a) => hasFlag(a.sys_flags, 'FLAG_STANCE'))) {
    return true; // 3
  }
  // 4 待機中にスタン中断を受けて経過思考が0へリセットされた。
  return state.book_wait_elapsed !== null && unit.elapsed_thought < state.book_wait_elapsed;
}

export function lookupBook(state: BattleState, unit: Unit, book: BookMasterRecord): BookLookup {
  if (state.book_aborted || state.book_index >= book.steps.length) {
    return { kind: 'BOOK_MISS', progress: { book_index: state.book_index, book_aborted: state.book_aborted, book_wait_elapsed: null } };
  }
  const step = book.steps[state.book_index];
  if (step.kind !== 'FIXED' || step.class_id === null) {
    throw new Error(`未対応の定跡手: ${book.book_id} #${state.book_index + 1} ${step.kind}`);
  }
  const action = resolveFixed(unit, step.class_id);
  if (action === undefined) {
    return miss(state, true); // ［定跡手の解決］3.
  }
  if (executableActions(state, unit).includes(action)) {
    return {
      kind: 'MOVE',
      instanceId: action.instance_id,
      progress: { book_index: state.book_index + 1, book_aborted: false, book_wait_elapsed: null },
    };
  }
  if (step.can_wait && !isPermanentlyBlocked(state, unit, action)) {
    return {
      kind: 'PASS_MOVE',
      progress: { book_index: state.book_index, book_aborted: false, book_wait_elapsed: unit.elapsed_thought },
    };
  }
  return miss(state, true);
}
