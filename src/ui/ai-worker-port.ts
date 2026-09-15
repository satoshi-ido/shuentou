// [I-ENV-WORKER] 実際のワーカースレッドを生成する。バンドルは Vite が追加設定なしで扱う（[I-ENV-STACK]）。
// AiDecisionClient には本関数の戻り値を渡す。テストでは同期の代替ポートを渡す。

import type { AiWorkerPort } from './ai-client.js';

export function createAiWorkerPort(): AiWorkerPort {
  return new Worker(new URL('../worker/ai-worker.ts', import.meta.url), { type: 'module' }) as unknown as AiWorkerPort;
}
