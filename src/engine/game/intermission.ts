// [M-INHERIT-POOL] [M-PROG-SACRIFICE] [M-PROG-REFILL] [M-META-COUNTERS] [M-META-SAVEDATA]
// インターミッションの操作（確定操作3〜5・アクト移行の段への移行・インターミッション決済の確定）。

import { applyInherit, canInherit, type InheritTarget } from '../progress/inherit.js';
import {
  applyEnterTransition,
  applyRefill,
  applySettleIntermission,
  canEnterTransition,
  canRefill,
  canSettleIntermission,
} from '../progress/refill.js';
import { applySacrifice, canSacrifice } from '../progress/sacrifice.js';
import { autosave, beginConfirmOperation, commitOnOperation, readTotalRewindCount, type GameContext, type GameSession } from './session.js';

// 確定操作3：継承の確定。
export function confirmInherit(session: GameSession, ctx: GameContext, attendantId: string, target: InheritTarget): void {
  if (!canInherit(session.data.run, ctx.masters, attendantId, target)) {
    throw new Error(`継承を実行できない: ${attendantId}`);
  }
  beginConfirmOperation(session, 3, ctx);
  applyInherit(session.data.run, ctx.masters, attendantId, target);
}

// 確定操作4：供犠の確定。
export function confirmSacrifice(session: GameSession, ctx: GameContext, attendantId: string): void {
  if (!canSacrifice(session.data.run, attendantId)) {
    throw new Error(`供犠を実行できない: ${attendantId}`);
  }
  beginConfirmOperation(session, 4, ctx);
  applySacrifice(session.data.run, attendantId);
}

// ［インターミッションの段］2. 確定操作に含めない。
export function enterTransition(session: GameSession, ctx: GameContext): void {
  if (!canEnterTransition(session.data.run, ctx.masters)) {
    throw new Error('アクト移行の段へ進めない');
  }
  applyEnterTransition(session.data.run);
}

// 確定操作5：従者補充の確定。
export function confirmRefill(session: GameSession, ctx: GameContext, attendantId: string): void {
  if (!canRefill(session.data.run, ctx.masters, attendantId)) {
    throw new Error(`補充を実行できない: ${attendantId}`);
  }
  beginConfirmOperation(session, 5, ctx);
  applyRefill(session.data.run, attendantId);
  // [M-META-COUNTERS] enshrine_anchor：記録済みの playthrough が現在の周回数と一致しない場合にのみ上書きする。
  const { meta } = session.data;
  const anchor = meta.enshrine_anchor[attendantId] ?? null;
  if (anchor === null || anchor.playthrough !== meta.playthrough_count) {
    meta.enshrine_anchor[attendantId] = {
      playthrough: meta.playthrough_count,
      rewind_count: readTotalRewindCount(session),
    };
  }
}

// インターミッション決済の確定。
export function settleIntermission(session: GameSession, ctx: GameContext): void {
  if (!canSettleIntermission(session.data.run, ctx.masters)) {
    throw new Error('インターミッション決済を確定できない');
  }
  commitOnOperation(session, 'SETTLEMENT', ctx);
  applySettleIntermission(session.data.run);
  autosave(session, ctx); // ［保存契機］インターミッション決済の確定時
}
