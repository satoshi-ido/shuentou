// [V-TEST-NONFUNC]［測定の打ち切り］葉の評価回数による打ち切りと「測定不能」の記録。
import { describe, expect, it } from 'vitest';
import { evalCallCount, resetEvalCallCount } from '../../src/ai/evaluate.js';
import { createRun, playScene, EVAL_CALL_LIMIT } from './runner.js';

describe('[V-TEST-NONFUNC]［測定の打ち切り］', () => {
  it('上限は決定論的な量（E(state) の呼び出し回数）で定める', () => {
    expect(EVAL_CALL_LIMIT).toBe(1_000_000);
  });

  it('上限を超えた試行は測定不能となり、勝敗を確定させない', () => {
    const { session, ctx } = createRun();
    const outcome = playScene(session, ctx, 'BALANCE', undefined, undefined, undefined, 50);
    expect(outcome.measured).toBe(false);
    expect(outcome.within).toBe(false);
    expect(outcome.result === 'WIN' || outcome.result === 'LOSS').toBe(false);
  });

  it('上限内で決着した試行は測定済みとして記録される', () => {
    const { session, ctx } = createRun();
    const outcome = playScene(session, ctx, 'BALANCE');
    expect(outcome.measured).toBe(true);
    expect(outcome.result).toBe('WIN');
  });

  it('葉の評価回数はシーンごとに数え直され、同一の入力に対して同一の値を返す', () => {
    const first = (() => {
      const { session, ctx } = createRun();
      playScene(session, ctx, 'BALANCE');
      return evalCallCount();
    })();
    const second = (() => {
      const { session, ctx } = createRun();
      playScene(session, ctx, 'BALANCE');
      return evalCallCount();
    })();
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
    resetEvalCallCount();
    expect(evalCallCount()).toBe(0);
  });
});
