// [M-DATA-AUDIO-CUE] 発火契機に対応する演出の選択。系統別の発動演出と、武技の命中・回避。

import { describe, expect, it } from 'vitest';
import type { BattleCue } from '../../src/engine/cue.js';
import { effectOf } from '../../src/ui/dom/effects.js';

function cue(kind: BattleCue['kind'], flags: BattleCue['sysFlags'], posIdx = 2): BattleCue {
  return { kind, unitId: 'U0000', posIdx, classId: 'ACT_TEST', sysFlags: flags };
}

describe('[M-DATA-AUDIO-CUE] 演出の選択', () => {
  it('発動は系統に応じた演出を選ぶ', () => {
    expect(effectOf(cue('ACTION_TRIGGER', ['FLAG_MARTIAL']))?.className).toContain('fx-martial');
    expect(effectOf(cue('ACTION_TRIGGER', ['FLAG_MIND']))?.className).toContain('fx-mind');
    expect(effectOf(cue('ACTION_TRIGGER', ['FLAG_STANCE']))?.className).toContain('fx-stance');
    expect(effectOf(cue('ACTION_TRIGGER', []))).toBeNull(); // 系統を持たないアクション
  });

  it('武技は命中と回避で別の演出を選び、対象のマスに置く', () => {
    const hit = effectOf(cue('HIT', ['FLAG_MARTIAL'], 3));
    const miss = effectOf(cue('MISS', ['FLAG_MARTIAL'], 1));
    expect(hit).toMatchObject({ className: 'fx fx-hit', posIdx: 3 });
    expect(miss).toMatchObject({ className: 'fx fx-miss', posIdx: 1 });
  });
});
