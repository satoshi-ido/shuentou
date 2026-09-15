// [M-REWIND-UNDO] [M-REWIND-ROLLBACK] [M-STATE-HISTORY] [M-STATE-IMSNAPSHOT] [M-META-PENDING]
// アンドゥ・ロールバック。いずれも実行時点では total_rewind_count を加算せず保留とする（[M-META-COMMIT]）。

import { cloneRun, fromHistoryEntry, fromImSnapshot } from '../run/snapshot.js';
import { enterBattle, type AdvanceOptions, type BattleResult } from './battle.js';
import { markPending, type GameContext, type GameSession } from './session.js';

export function canUndo(session: GameSession): boolean {
  const { run } = session.data;
  return run.phase !== 'ENDING' && run.history_stack.length > 0;
}

// 確定操作1単位で巻き戻す。敵軍AIの行動決定状態は記録時点のまま復元され、再計算しない。
export function undo(session: GameSession): void {
  const { run } = session.data;
  const remaining = [...run.history_stack];
  const entry = remaining.pop();
  if (entry === undefined || !canUndo(session)) {
    throw new Error('アンドゥできる履歴がない');
  }
  session.data.run = fromHistoryEntry(entry, run, remaining);
  session.pending_step = null; // [I-ENV-WORKER] 局面が変わるため進行中の要求の応答は破棄する
  markPending(session, 'UNDO');
}

// バトル開始時ロールバック：ステップ0へ巻き戻し、最初の時間停止まで進める。
export function rollbackBattle(session: GameSession, ctx: GameContext, options: AdvanceOptions = {}): BattleResult {
  if (session.data.run.phase !== 'BATTLE' || session.battle_start_run === null) {
    throw new Error('バトル開始時ロールバックはバトル中に限る');
  }
  session.data.run = cloneRun(session.battle_start_run); // HistoryStack は空（［破棄契機］3.）
  session.pending_step = null;
  markPending(session, 'ROLLBACK_BATTLE');
  return enterBattle(session, ctx, options);
}

export function rollbackOrders(session: GameSession): number[] {
  return session.data.run.im_snapshots.map((snapshot) => snapshot.order);
}

// 過去インターミッションへのロールバック：復帰先より大きい order のスナップショットを破棄して復元する。
export function rollbackIntermission(session: GameSession, order: number): void {
  const { run } = session.data;
  const snapshot = run.im_snapshots.find((entry) => entry.order === order);
  if (snapshot === undefined || run.phase === 'ENDING') {
    throw new Error(`復帰先のインターミッションがない: ${order}`);
  }
  const kept = run.im_snapshots.filter((entry) => entry.order <= order);
  session.data.run = fromImSnapshot(snapshot, kept);
  session.pending_step = null;
  session.battle_start_run = null;
  markPending(session, 'ROLLBACK_INTERMISSION');
}
