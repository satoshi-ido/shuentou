// [V-TEST-REFAI]［シーン単位の勝率測定］［目標勝率］

import { describe, expect, it } from 'vitest';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { createRun } from './runner.js';
import {
  allSources,
  arrivalKey,
  bandOf,
  playSceneTrial,
  sourcePolicy,
  summarizeTrials,
  TARGET_WIN_RATE,
  type SceneTrial,
} from './scene-trials.js';

describe('［目標勝率］の区分', () => {
  it('1-01 はチュートリアル、1-02・2-04・3-06・4-08 はボス、5-10 は最終ボス、他は通常シーン（5-09 を含む）', () => {
    const scenes = Object.keys(SCENE_MASTERS).filter((id) => id !== 'SCENE_5_11');
    const byBand: Record<string, string[]> = {};
    for (const scene of scenes) {
      (byBand[bandOf(scene)] ??= []).push(scene.slice(6));
    }
    expect(byBand.TUTORIAL).toEqual(['1_01']);
    expect(byBand.BOSS?.sort()).toEqual(['1_02', '2_04', '3_06', '4_08']);
    expect(byBand.FINAL).toEqual(['5_10']);
    expect(byBand.NORMAL).toHaveLength(24);
    expect(byBand.NORMAL).toContain('5_09');
  });

  it('5-11 は対象外', () => {
    expect(() => bandOf('SCENE_5_11')).toThrow('対象外');
  });

  it('通常シーンは3方針とも 90、ボスは 40・50・35、最終ボスは 25・30・20', () => {
    expect(TARGET_WIN_RATE.NORMAL).toEqual({ BALANCE: 90, ATTACK: 90, DEFENSE: 90 });
    expect(TARGET_WIN_RATE.BOSS).toEqual({ BALANCE: 40, ATTACK: 50, DEFENSE: 35 });
    expect(TARGET_WIN_RATE.FINAL).toEqual({ BALANCE: 25, ATTACK: 30, DEFENSE: 20 });
  });
});

describe('［到達局面の集合］', () => {
  it('出所は参照プレイヤーAI 3方針 × 21件とビルドプロファイル7件 × 21件', () => {
    const sources = allSources();
    expect(sources).toHaveLength(210);
    expect(sources.filter((source) => source.kind === 'ref')).toHaveLength(63);
    expect(sourcePolicy({ kind: 'build', profile: 'BP-02', pid: 'BASE' })).toBe('DEFENSE');
  });

  it('局面のキーは HistoryStack・スナップショットを無視し、周回ステートの違いを区別する', () => {
    const data = createRun().session.data;
    const base = arrivalKey(JSON.stringify(data));
    expect(arrivalKey(JSON.stringify({ ...data, run: { ...data.run, history_stack: [{}], im_snapshots: [{}] } }))).toBe(base);
    expect(arrivalKey(JSON.stringify({ ...data, run: { ...data.run, hero_hp: data.run.hero_hp - 1 } }))).not.toBe(base);
  });
});

describe('［シーン単位の勝率測定］の集計', () => {
  const trial = (partial: Partial<SceneTrial>): SceneTrial => ({
    scene: 'SCENE_3_01',
    state: 'k',
    policy: 'BALANCE',
    hpPct: 100,
    hpIn: [100, 100],
    result: 'WIN',
    steps: 100,
    within: true,
    measured: true,
    margin: 80,
    ...partial,
  });

  it('勝率は測定不能を除いて数え、消耗は到達時HP100%の水準の勝利のみから求める', () => {
    const [row] = summarizeTrials([
      trial({ hpPct: 100, margin: 80 }),
      trial({ hpPct: 100, margin: 70 }),
      trial({ hpPct: 75, margin: 40 }),
      trial({ hpPct: 50, result: 'LOSS', margin: -30 }),
      trial({ hpPct: 50, measured: false, result: 'PAUSED', margin: null }),
    ]);
    expect(row.band).toBe('NORMAL');
    expect(row.trials).toBe(4);
    expect(row.wins).toBe(3);
    expect(row.winRate).toBe(75);
    expect(row.consumptionMean).toBe(25); // (20 + 30) / 2
    expect(row.winRateByHp).toEqual({ '100': 100, '75': 100, '50': 0 });
    expect(row.unmeasured).toBe(1);
  });

  it('余裕の平均は敗北（負の余裕）を含めて求める', () => {
    const [row] = summarizeTrials([
      trial({ result: 'LOSS', margin: -40 }),
      trial({ result: 'LOSS', margin: -21 }),
      trial({ margin: 10 }),
    ]);
    expect(row.marginMean).toBe(-17); // -51 / 3
    expect(row.winRate).toBe(33);
  });
});

describe('シーン単体の試行', () => {
  it('到達時HPを最大HPの百分率へ置き換えて1回戦う（1-01）', () => {
    const serialized = JSON.stringify(createRun().session.data);
    const result = playSceneTrial(serialized, 'BALANCE', 50);
    expect(result.scene).toBe('SCENE_1_01');
    expect(result.hpIn).toEqual([30, 60]);
    expect(result.measured).toBe(true);
    expect(result.result).toBe('WIN');
    expect(result.margin).toBeGreaterThan(0);
  });
});
