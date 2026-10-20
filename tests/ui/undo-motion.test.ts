// [M-REWIND-UNDO]【提示】アンドゥの巻き戻しの提示に用いる値。

import { describe, expect, it } from 'vitest';
import type { Timeline, TimelineSegment } from '../../src/engine/timeline.js';
import { countedValue, rewoundSteps, vanishedSegments } from '../../src/ui/dom/undo-motion.js';

const segment = (kind: TimelineSegment['kind'], start: number, length: number, instanceId: string | null = null): TimelineSegment => ({
  kind,
  start,
  length,
  instanceId,
  elapsedAtStart: 0,
  required: null,
});

const timeline = (start: number, segments: readonly TimelineSegment[]): Timeline => ({
  start,
  span: 30,
  lanes: [{ unitId: 'HERO', side: 'MINE', posIdx: 1, segments }],
});

describe('[M-REWIND-UNDO] アンドゥの提示', () => {
  it('【タイムラインの巻き戻し】戻ったステップ数は表示枠の幅で打ち切り、進んだ場合は滑らせない', () => {
    expect(rewoundSteps(timeline(40, []), timeline(28, []), 30)).toBe(12);
    expect(rewoundSteps(timeline(120, []), timeline(28, []), 30)).toBe(30);
    expect(rewoundSteps(timeline(28, []), timeline(28, []), 30)).toBe(0);
    expect(rewoundSteps(timeline(20, []), timeline(28, []), 30)).toBe(0);
  });

  it('【取り消された区間】適用前にあり復元後に無い区間だけを残像とする', () => {
    const thought = segment('THOUGHT', 10, 30);
    const startup = segment('STARTUP', 10, 8, 'I1');
    const recovery = segment('RECOVERY', 18, 6, 'I1');
    const before = timeline(10, [startup, recovery]);
    const after = timeline(10, [thought]);
    expect(vanishedSegments(before, after, 'HERO')).toEqual([startup, recovery]);
    expect(vanishedSegments(after, after, 'HERO')).toEqual([]);
    expect(vanishedSegments(before, after, 'NOBODY')).toEqual([]);
  });

  it('【値の巻き戻し】適用前の値から復元後の値へ数え戻し、範囲の外は端の値とする', () => {
    expect(countedValue(10, 30, 0)).toBe(10);
    expect(countedValue(10, 30, 0.5)).toBe(20);
    expect(countedValue(10, 30, 1)).toBe(30);
    expect(countedValue(10, 30, 2)).toBe(30);
    expect(countedValue(30, 10, -1)).toBe(30);
  });
});
