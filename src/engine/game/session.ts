// [M-META-PENDING] [M-META-COMMIT] [M-META-FLUSH] [M-META-SAVEDATA] [M-STATE-HISTORY]
// セーブデータ1件を単位とする操作の共通手続き：確定操作の記録・保留の決済・オートセーブ。

import type { DecisionProvider } from '../decision.js';
import type { SideLoopState } from '../pipeline/p8-decision.js';
import type { RewindPendingType, SaveData } from '../meta/types.js';
import type { StepDeps } from '../pipeline/step.js';
import type { GameMasters } from '../run/masters.js';
import { toHistoryEntry } from '../run/snapshot.js';
import type { RunState } from '../run/state.js';

export interface GameContext {
  readonly masters: GameMasters;
  // 敵軍AIの決定主体。[I-ENV-LAYOUT] により src/engine は src/ai を参照しないため注入する。
  readonly foeDecision: DecisionProvider;
  readonly stepDeps: StepDeps;
  // [I-STATE-SNAPSHOT] 保存先（端末ローカルストレージ）への書き込み。値はJSON文字列。
  readonly persist: (serialized: string) => void;
}

// [I-ENV-WORKER] 決定待ちで中断した《処理8》の進行状態。応答後に同じ地点から再開する。
export interface PendingStep {
  preDone: boolean;
  loop: SideLoopState;
}

export interface GameSession {
  data: SaveData;
  // 決定待ちで中断しているとき非Null。時間停止中・決着後は常に Null。
  pending_step?: PendingStep | null;
  // 直近のバトル開始時点のラン進行ステート。phase == BATTLE の間のみ非Null。
  // バトル開始時ロールバックの復帰先であり、同区間のオートセーブが保存するラン進行ステートでもある。
  battle_start_run: RunState | null;
}

// [M-STATE-HISTORY]［保存契機］の番号。SETTLEMENT はインターミッション決済の確定。
export type ConfirmOperation = 1 | 2 | 3 | 4 | 5 | 'SETTLEMENT';

// [I-STATE-SNAPSHOT] セーブデータの永続化はJSON文字列化。
// ［バトル中の保存を行わない］phase == BATTLE の間はバトル開始時のラン進行ステートを保存する。
export function autosave(session: GameSession, ctx: GameContext): void {
  const run = session.data.run.phase === 'BATTLE' && session.battle_start_run !== null ? session.battle_start_run : session.data.run;
  const { save_version, meta, pending } = session.data;
  ctx.persist(JSON.stringify({ save_version, meta, pending, run }));
}

// [M-META-PENDING]［保留の単一性］
export function markPending(session: GameSession, type: Exclude<RewindPendingType, 'NONE'>): void {
  session.data.pending.rewind_pending = true;
  session.data.pending.rewind_pending_type = type;
}

function settlePending(session: GameSession): void {
  session.data.meta.total_rewind_count += 1;
  session.data.pending.rewind_pending = false;
  session.data.pending.rewind_pending_type = 'NONE';
}

// [M-META-COMMIT] 確定イベント表。
function isCommitEvent(type: RewindPendingType, operation: ConfirmOperation): boolean {
  if (type === 'UNDO' || type === 'ROLLBACK_BATTLE') {
    return operation !== 'SETTLEMENT';
  }
  if (type === 'ROLLBACK_INTERMISSION') {
    return operation === 3 || operation === 4 || operation === 'SETTLEMENT';
  }
  return false;
}

export function commitOnOperation(session: GameSession, operation: ConfirmOperation, ctx: GameContext): void {
  const { pending } = session.data;
  if (pending.rewind_pending && isCommitEvent(pending.rewind_pending_type, operation)) {
    settlePending(session);
    autosave(session, ctx); // [M-META-SAVEDATA]［保存契機］巻き戻しの確定イベント成立時
  }
}

// [M-META-FLUSH] total_rewind_count の読み出しは本関数に限る。
export function readTotalRewindCount(session: GameSession): number {
  if (session.data.pending.rewind_pending) {
    settlePending(session);
  }
  return session.data.meta.total_rewind_count;
}

// 確定操作1〜5の共通前処理：保留の決済と、適用前ステートの HistoryStack へのプッシュ。
export function beginConfirmOperation(session: GameSession, operation: 1 | 2 | 3 | 4 | 5, ctx: GameContext): void {
  commitOnOperation(session, operation, ctx);
  const { run } = session.data;
  run.history_stack.push(toHistoryEntry(run));
}
