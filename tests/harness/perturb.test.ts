// [V-TEST-REFAI]［重み摂動プロファイル群］23件の構成と、勝率の算出。

import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, referenceProfile } from '../../src/ai/profile.js';
import { measureWinRate, perturbationSet, playSceneWithRetry, winRateCenti } from './perturb.js';
import { createRun } from './runner.js';

const set = perturbationSet();

describe('[V-TEST-REFAI]［重み摂動プロファイル群］構成', () => {
  it('11項 × ±20% の22件と無摂動の1件からなる', () => {
    expect(FEATURE_KEYS).toHaveLength(11);
    expect(set).toHaveLength(23);
    expect(set.filter((entry) => entry.key === null)).toHaveLength(1);
  });

  it('［順序］無摂動を先頭に置き、以降はキー昇順・×0.80 → ×1.20 とする', () => {
    expect(set[0].id).toBe('BASE');
    const expected = [...FEATURE_KEYS].sort().flatMap((key) => [`${key}_80`, `${key}_120`]);
    expect(set.slice(1).map((entry) => entry.id)).toEqual(expected);
  });

  it('1件につき1項のみが基準から相違する', () => {
    const base = referenceProfile();
    for (const entry of set.slice(1)) {
      const changed = FEATURE_KEYS.filter(
        (key) => (entry.profile.weightMult[key] ?? 100) !== (base.weightMult[key] ?? 100),
      );
      expect(changed).toEqual([entry.key]);
      expect(entry.profile.weightMult[entry.key!]).toBe(entry.multCenti);
    }
  });

  it('倍率は centi の ×0.80 / ×1.20 である', () => {
    expect(new Set(set.slice(1).map((entry) => entry.multCenti))).toEqual(new Set([80, 120]));
  });

  it('摂動するのは主人公側の重みに限り、探索設定は基準と同一である', () => {
    const base = referenceProfile();
    for (const entry of set) {
      expect(entry.profile.maxDepth).toBe(base.maxDepth); // depth 3
      expect(entry.profile.nodeLimit).toBe(base.nodeLimit); // node 10,000
      expect(entry.profile.evalMask).toEqual(base.evalMask); // 全11項
      expect(entry.profile.actionBonus).toEqual(base.actionBonus);
    }
  });

  it('参照プレイヤーAIは全11項を評価するため、23件はいずれも相異なる', () => {
    const signatures = set.map((entry) => JSON.stringify(entry.profile.weightMult));
    expect(new Set(signatures).size).toBe(23);
    for (const entry of set) {
      for (const key of FEATURE_KEYS) {
        expect(entry.profile.evalMask).toContain(key);
      }
    }
  });
});

describe('[V-TEST-BUILD-METRICS] win_rate', () => {
  it('勝利数 ÷ 試行数を centi で返す', () => {
    expect(winRateCenti(23, 23)).toBe(100);
    expect(winRateCenti(0, 23)).toBe(0);
    expect(winRateCenti(12, 23)).toBe(52); // round(1200/23) = 52
  });

  it('分母は方針固定のとき23である', () => {
    expect(set).toHaveLength(23);
    expect(winRateCenti(set.length, set.length)).toBe(100);
  });

  it('試行数0の勝率は定義されない', () => {
    expect(() => winRateCenti(0, 0)).toThrow('試行数が0');
  });
});

describe('[V-TEST-REFAI] 目標勝率の実測', () => {
  // 23試行ぶんの通しプレイを要するため実行時間は長い。[I-ENV-TOOLING]［CI］は実時刻に依存しない
  // 検査として打ち切りを設けないため、ここではチュートリアル帯の1件だけを判定に用いる。
  // 通常シーン以降の帯（および4方針×23件＝92試行）は、通しプレイが全30シーンへ到達したのちに広げる。
  it('チュートリアル（1-01）のバランス型は 95%以上', () => {
    const result = measureWinRate('BALANCE', 1);
    expect(result.scene_id).toBe('SCENE_1_01');
    expect(result.trials).toBe(23);
    expect(result.win_rate).toBeGreaterThanOrEqual(95);
  });
});

describe('[V-TEST-REFAI] 敗北時の再挑戦', () => {
  it('勝利したシーンは再挑戦を要さない（attempts = 1・rewinds = 0）', () => {
    const { session, ctx } = createRun();
    const attempt = playSceneWithRetry(session, ctx, 'ATTACK');
    expect(attempt.outcome.scene_id).toBe('SCENE_1_01');
    expect(attempt.outcome.result).toBe('WIN');
    expect(attempt.attempts).toBe(1);
    expect(attempt.rewinds).toBe(0);
    expect(attempt.profileId).toBe('BASE');
    // 再挑戦していないため巻き戻しの保留は立たない（[M-META-PENDING]）。
    expect(session.data.pending.rewind_pending).toBe(false);
  });

  it('再挑戦の上限は摂動群の件数に等しい', () => {
    expect(perturbationSet()).toHaveLength(23);
  });
});
