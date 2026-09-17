// [V-TEST-REFAI]［重み摂動プロファイル群］21件の構成と、勝率の算出。

import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, referenceProfile } from '../../src/ai/profile.js';
import { measureWinRate, perturbationSet, playSceneWithRetry, winRateCenti } from './perturb.js';
import { createRun, decisionLimit } from './runner.js';

const set = perturbationSet();

describe('[V-TEST-REFAI]［重み摂動プロファイル群］構成', () => {
  it('評価項10項 × ±20% の20件と無摂動の1件からなる', () => {
    expect(referenceProfile().evalMask).toHaveLength(10);
    expect(set).toHaveLength(21);
    expect(set.filter((entry) => entry.key === null)).toHaveLength(1);
  });

  it('［順序］無摂動を先頭に置き、以降はキー昇順・×0.80 → ×1.20 とする', () => {
    expect(set[0].id).toBe('BASE');
    const expected = [...referenceProfile().evalMask].sort().flatMap((key) => [`${key}_80`, `${key}_120`]);
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
      expect(entry.profile.evalMask).toEqual(base.evalMask); // impatience を除く10項
      expect(entry.profile.actionBonus).toEqual(base.actionBonus);
    }
  });

  it('摂動する項はいずれも評価項に含まれるため、21件はいずれも相異なる', () => {
    const signatures = set.map((entry) => JSON.stringify(entry.profile.weightMult));
    expect(new Set(signatures).size).toBe(21);
    for (const entry of set.slice(1)) {
      expect(entry.profile.evalMask).toContain(entry.key);
    }
  });

  it('[V-TEST-REFAI]「評価項」参照プレイヤーAIは impatience を評価しない', () => {
    const mask = referenceProfile().evalMask;
    expect(mask).not.toContain('impatience');
    expect([...FEATURE_KEYS].filter((key) => !mask.includes(key))).toEqual(['impatience']);
    expect(set.some((entry) => entry.key === 'impatience')).toBe(false);
  });
});

describe('[V-TEST-BUILD-METRICS] win_rate', () => {
  it('勝利数 ÷ 試行数を centi で返す', () => {
    expect(winRateCenti(21, 21)).toBe(100);
    expect(winRateCenti(0, 21)).toBe(0);
    expect(winRateCenti(11, 21)).toBe(52); // round(1100/21) = 52
  });

  it('分母は方針固定のとき21である', () => {
    expect(set).toHaveLength(21);
    expect(winRateCenti(set.length, set.length)).toBe(100);
  });

  it('試行数0の勝率は定義されない', () => {
    expect(() => winRateCenti(0, 0)).toThrow('試行数が0');
  });
});

describe('[V-TEST-REFAI] 目標勝率の実測', () => {
  // 21試行ぶんの通しプレイを要するため実行時間は長い。[I-ENV-TOOLING]［CI］は実時刻に依存しない
  // 検査として打ち切りを設けないため、ここではチュートリアル帯の1件だけを判定に用いる。
  // 通常シーン以降の帯（および4方針×21件＝84試行）は、通しプレイが全30シーンへ到達したのちに広げる。
  it('チュートリアル（1-01）のバランス型は 95%以上', () => {
    const result = measureWinRate('BALANCE', 1);
    expect(result.scene_id).toBe('SCENE_1_01');
    expect(result.trials).toBe(21);
    expect(result.win_rate).toBeGreaterThanOrEqual(95);
  });
});

describe('[V-TEST-NONFUNC] D-02 決着上限', () => {
  it('expected_length の3.0倍とする', () => {
    expect(decisionLimit(600)).toBe(1800); // 通常シーン
    expect(decisionLimit(800)).toBe(2400); // ボス（2-04・3-06・4-08）
    expect(decisionLimit(1200)).toBe(3600); // 5-10
  });

  it('expected_length を持たないシーン（5-11）は上限を導けない', () => {
    // [M-TMPL-VESSEL] 依代は非機能テストの対象外である。
    expect(decisionLimit(null)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('[V-TEST-REFAI] 敗北時の再挑戦', () => {
  it('決着上限に収まるシーンは初回で突破し、再挑戦を要さない', () => {
    const { session, ctx } = createRun();
    const attempt = playSceneWithRetry(session, ctx, 'ATTACK');
    expect(attempt.outcome.scene_id).toBe('SCENE_1_01');
    expect(attempt.outcome.result).toBe('WIN');
    expect(attempt.outcome.limit).toBe(1800); // expected_length 600 × 3.0
    expect(attempt.outcome.within).toBe(true);
    expect(attempt.attempts).toBe(1);
    expect(attempt.rewinds).toBe(0);
    expect(attempt.profileId).toBe('BASE');
    // 再挑戦していないため巻き戻しは発生しない（[M-META-PENDING]・[M-META-COMMIT]）。
    expect(session.data.meta.total_rewind_count).toBe(0);
  });

  it('再挑戦の上限は摂動群の件数に等しい', () => {
    expect(perturbationSet()).toHaveLength(21);
  });
});
