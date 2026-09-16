// [I-ENV-WORKER] 探索ワーカーとの転送形式。BattleState は [I-STATE-JSON] に適合するため、
// 構造化複製でそのまま転送できる。要求には単調増加の要求IDを付し、応答の照合に用いる。

import type { ResolvedDecision } from './decision.js';
import type { BattleState } from './types.js';

export interface AiDecisionRequest {
  readonly requestId: number;
  readonly sceneId: string; // 実効プロファイルの構築元（[A-PROFILE-RESOLVE]）
  readonly unitId: string;
  readonly state: BattleState;
}

export interface AiDecisionResponse {
  readonly requestId: number;
  readonly unitId: string;
  readonly decision: ResolvedDecision;
  // [D-01b] 1決定あたりの実測記録に用いる。実時間は含めない（[A-CORE-DETERMINISM]#2）。
  readonly nodesConsumed: number;
}
