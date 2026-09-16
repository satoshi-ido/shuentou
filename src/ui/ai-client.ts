// [I-ENV-WORKER] 探索ワーカーへの要求と応答の管理（メインスレッド側）。
// 決定が未応答の間は AWAIT を返し、応答が届いた時点で同じ地点から進行を再開する。
// 要求には単調増加の要求IDを付し、アンドゥ・ロールバックで局面が変わった場合は古い応答を破棄する。

import type { AiDecisionRequest, AiDecisionResponse } from '../engine/ai-request.js';
import type { Decision, DecisionProvider } from '../engine/decision.js';
import { boardHash } from '../engine/reuse.js';
import type { BattleState, Unit } from '../engine/types.js';

// Worker のうち本クライアントが用いる部分。テストでは同期の代替を差し込む。
export interface AiWorkerPort {
  postMessage(message: AiDecisionRequest): void;
  onmessage: ((event: { data: AiDecisionResponse }) => void) | null;
  terminate?(): void;
}

interface PendingEntry {
  readonly requestId: number;
  readonly hash: number;
  decision: AiDecisionResponse['decision'] | null;
}

export class AiDecisionClient {
  private nextRequestId = 1;
  private entries: Record<string, PendingEntry> = {};

  constructor(
    private readonly port: AiWorkerPort,
    private readonly sceneId: string,
    private readonly onResponse: () => void,
  ) {
    port.onmessage = (event) => this.receive(event.data);
  }

  // 応答の照合：要求IDが現在の要求と一致しないものは破棄する（局面が変わった場合を含む）。
  private receive(response: AiDecisionResponse): void {
    const entry = this.entries[response.unitId];
    if (entry === undefined || entry.requestId !== response.requestId) {
      return;
    }
    entry.decision = response.decision;
    this.onResponse();
  }

  // [M-PIPE-P8-ORDER] の決定主体。未応答なら AWAIT を返し、要求がなければ送る。
  readonly decisionFor: DecisionProvider = (state: BattleState, unit: Unit): Decision => {
    const hash = boardHash(state);
    const entry = this.entries[unit.unit_id];
    if (entry !== undefined && entry.hash === hash) {
      if (entry.decision === null) {
        return { kind: 'AWAIT' }; // 要求済み・未応答
      }
      const decision = entry.decision;
      delete this.entries[unit.unit_id];
      return decision;
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    this.entries[unit.unit_id] = { requestId, hash, decision: null };
    this.port.postMessage({ requestId, sceneId: this.sceneId, unitId: unit.unit_id, state });
    return { kind: 'AWAIT' };
  };

  // 進行中の要求を無効化する（アンドゥ・ロールバック時）。探索は中断せず、応答を破棄する。
  invalidate(): void {
    this.entries = {};
  }

  dispose(): void {
    this.port.onmessage = null;
    this.port.terminate?.();
  }
}
