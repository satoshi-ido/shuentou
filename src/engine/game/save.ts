// [M-META-SAVEDATA] [I-STATE-SNAPSHOT] ニューゲーム・ロード。

import type { SaveData } from '../meta/types.js';
import { cloneRun } from '../run/snapshot.js';
import { createNewGame, SAVE_VERSION } from '../run/newgame.js';
import { enterBattle, type BattleResult } from './battle.js';
import { markPending, type GameContext, type GameSession } from './session.js';

export function newGameSession(ctx: GameContext): GameSession {
  return { data: createNewGame(ctx.masters), battle_start_run: null };
}

export type LoadResult =
  | { readonly ok: true; readonly session: GameSession; readonly battle: BattleResult | null }
  | { readonly ok: false; readonly reason: 'VERSION_MISMATCH'; readonly save_version: number };

// ［データバージョン］不一致時はマイグレーションを行わずロードを拒否する。
export function loadGame(serialized: string, ctx: GameContext): LoadResult {
  const data = JSON.parse(serialized) as SaveData;
  if (data.save_version !== SAVE_VERSION) {
    return { ok: false, reason: 'VERSION_MISMATCH', save_version: data.save_version };
  }
  const session: GameSession = { data, battle_start_run: null };
  if (data.run.phase !== 'BATTLE') {
    return { ok: true, session, battle: null };
  }
  // ［バトル中の保存を行わない］直近のバトル開始時セーブからの再開は ROLLBACK_BATTLE の保留を立てる。
  markPending(session, 'ROLLBACK_BATTLE');
  session.battle_start_run = cloneRun(data.run);
  return { ok: true, session, battle: enterBattle(session, ctx) };
}
