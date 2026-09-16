// [I-ENV-WORKER] ワーカー連携（要求ID・応答の照合・要求の無効化）と、応答待ちからの進行再開。

import { describe, expect, it } from 'vitest';
import type { AiDecisionRequest, AiDecisionResponse } from '../../src/engine/ai-request.js';
import { instruct, resumeBattle, startBattle } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameContext } from '../../src/engine/game/session.js';
import { undo } from '../../src/engine/game/rewind.js';
import { AiDecisionClient, type AiWorkerPort } from '../../src/ui/ai-client.js';
import { handleRequest } from '../../src/worker/ai-worker.js';
import { createContext } from '../engine/game-fixtures.js';
import { findUnit } from '../ai/fixtures.js';

// 応答を手動で流す代替ポート。postMessage された要求を保持し、deliver で1件ずつ応答する。
class FakePort implements AiWorkerPort {
  onmessage: ((event: { data: AiDecisionResponse }) => void) | null = null;
  readonly requests: AiDecisionRequest[] = [];

  postMessage(message: AiDecisionRequest): void {
    this.requests.push(message);
  }

  deliverAll(): number {
    const pending = this.requests.splice(0, this.requests.length);
    for (const request of pending) {
      this.onmessage?.({ data: handleRequest(request) });
    }
    return pending.length;
  }

  deliver(response: AiDecisionResponse): void {
    this.onmessage?.({ data: response });
  }
}

function setup() {
  const port = new FakePort();
  let resumed = 0;
  const base = createContext({ saves: [] });
  const client = new AiDecisionClient(port, 'SCENE_1_01', () => {
    resumed += 1;
  });
  const ctx: GameContext = { ...base, foeDecision: client.decisionFor };
  return { port, client, ctx, session: newGameSession(ctx), responses: () => resumed };
}

describe('[I-ENV-WORKER] 探索ワーカーとの往復', () => {
  it('未応答の間は AWAIT_FOE で中断し、応答後に同じ地点から再開する', () => {
    const { port, ctx, session, responses } = setup();
    expect(startBattle(session, ctx)).toBe('AWAIT_FOE');
    expect(port.requests).toHaveLength(1);
    expect(port.requests[0]).toMatchObject({ requestId: 1, sceneId: 'SCENE_1_01' });

    let result = 'AWAIT_FOE';
    for (let i = 0; i < 400 && result === 'AWAIT_FOE'; i += 1) {
      port.deliverAll();
      result = resumeBattle(session, ctx);
    }
    expect(result).toBe('PAUSED');
    expect(responses()).toBeGreaterThan(0);
    const state = session.data.run.battle_state!;
    expect(state.step).toBe(147); // [A-BOOK-TABLE] B-01① 心気（基本）AR3 の発生遷移で時間停止する
    expect(findUnit(state, 'FOE').last_act?.class_id).toBe('ACT_MIND_AR3');
  });

  it('要求IDが一致しない応答は破棄する', () => {
    const { port, ctx, session } = setup();
    startBattle(session, ctx);
    const unitId = port.requests[0].unitId;
    port.deliver({ requestId: 999, unitId, decision: { kind: 'PASS' }, nodesConsumed: 0 });
    expect(resumeBattle(session, ctx)).toBe('AWAIT_FOE');
    expect(session.data.run.battle_state?.step).toBe(0); // 破棄されたため進んでいない
    expect(port.deliverAll()).toBe(1);
    resumeBattle(session, ctx);
    expect(session.data.run.battle_state?.step).toBeGreaterThan(0);
  });

  it('アンドゥで局面が変わると進行中の要求の応答を破棄し、要求し直す', () => {
    const { port, client, ctx, session } = setup();
    let result = startBattle(session, ctx);
    for (let i = 0; i < 400 && result === 'AWAIT_FOE'; i += 1) {
      port.deliverAll();
      result = resumeBattle(session, ctx);
    }
    expect(result).toBe('PAUSED');
    const state = session.data.run.battle_state!;
    const hero = findUnit(state, 'MINE');
    const mind = hero.acts.find((a) => a.master_ref === 'ACT_MIND_AR3')!;
    // 指示確定 → アンドゥで停止時点へ戻す。
    instruct(session, ctx, hero.unit_id, mind.instance_id);
    undo(session);
    client.invalidate();
    expect(session.pending_step ?? null).toBeNull();
    expect(resumeBattle(session, ctx)).not.toBe('WIN');
  });
});
