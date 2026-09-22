// [V-TEST-NONFUNC] D-09 命中機会窓の実測。合否判定は行わず、4系列が取得できることを検査する。
//
// 走査範囲：[V-TEST-NONFUNC] D-09 は全30シーンを求める。全シーンの掃引は通しプレイに長時間を要するため
// 実測として行い、結果を [V-TEST-NONFUNC]［D-09 の実測］に記録した。本テストは取得手段の成立を
// アクト1で検査する。

import { describe, expect, it } from 'vitest';
import { playRun } from './runner.js';
import { createWindowSeries, windowObserver, type WindowSeries } from './windows.js';

const series: WindowSeries[] = [];
const run = playRun('ATTACK', 2, (sceneId) => {
  const record = createWindowSeries(sceneId);
  series.push(record);
  return windowObserver(record);
});

describe('D-09 命中機会窓', () => {
  it('走査した各シーンについて4系列が取得できる', () => {
    expect(series.length).toBe(run.scenes.length);
    for (const record of series) {
      expect(record.starts.length).toBeGreaterThan(0); // ① 窓の開始時刻列
      expect(record.periods).toHaveLength(record.starts.length - 1); // ② 発生周期 T（開始時刻の階差）
      expect(record.pp_at_start).toHaveLength(record.starts.length); // ③ 各窓時点でのPP残量
      expect(typeof record.frontal).toBe('boolean'); // ④ 正面から割れるか
    }
  });

  it('① 開始時刻は昇順で、② 周期はその階差に一致する', () => {
    for (const record of series) {
      for (let i = 1; i < record.starts.length; i += 1) {
        expect(record.starts[i]).toBeGreaterThan(record.starts[i - 1]);
        expect(record.periods[i - 1]).toBe(record.starts[i] - record.starts[i - 1]);
      }
    }
  });

  it('④ [M-GUARD-BREAKER]「1-01〜2-01 は主人公初期キットの武技（重撃）AR15 が壁割りを受け持つ」', () => {
    // 当該区間は 最大展開AP（23・26）≦ 最大実効攻撃力（27）であり、正面から割れる。
    for (const record of series) {
      expect(record.max_hero_atk).toBe(27);
      expect(record.frontal).toBe(true);
      expect(record.max_deploy_ap).toBeLessThanOrEqual(record.max_hero_atk);
    }
  });

  it('③ PP残量は窓ごとに記録され、負にならない', () => {
    for (const record of series) {
      for (const pp of record.pp_at_start) {
        expect(pp).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
