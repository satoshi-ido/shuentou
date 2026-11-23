// [M-UI-HUD]【立ち絵の動き】「決着の一打」勝利の決着で止めた盤面に、決着のステップの発動の動きを終わりまで再生する。

import { describe, expect, it } from 'vitest';
import type { BattleCue } from '../../src/engine/cue.js';
import { FigureMotion } from '../../src/ui/dom/figure-motion.js';
import { FOLLOW_MIN_MS, STANCE_FLASH_MS, SWING_FRAME_MS } from '../../src/ui/view/figure-motion.js';

const trigger = (unitId: string): BattleCue => ({
  kind: 'ACTION_TRIGGER',
  unitId,
  posIdx: 1,
  classId: 'ACT_TEST',
  sysFlags: ['FLAG_MARTIAL'],
});

function motion(clock: { t: number }): FigureMotion {
  return new FigureMotion(
    {} as HTMLElement,
    () => false,
    () => undefined,
    () => clock.t,
    () => 3,
    () => null,
    () => 'art/standing/hero.png',
  );
}

describe('決着の一打', () => {
  it('発動の動き（構えの先の表示・中割り・振り抜きの最短の表示）が終わるまでの残りの時間を返す', () => {
    const clock = { t: 1000 };
    const figures = motion(clock);
    figures.cue(trigger('U_HERO'));
    clock.t = 1100;
    expect(figures.playFrozen()).toBe(STANCE_FLASH_MS + 3 * SWING_FRAME_MS + FOLLOW_MIN_MS - 100);
  });

  it('動きを終えた後、発動の無いとき、および発動の後に被弾したときは待たない', () => {
    const clock = { t: 0 };
    const figures = motion(clock);
    expect(figures.playFrozen()).toBe(0);
    figures.cue(trigger('U_HERO'));
    clock.t = 10_000;
    expect(figures.playFrozen()).toBe(0);
    figures.cue(trigger('U_HERO'));
    figures.cue({ kind: 'HIT', unitId: 'U_HERO', posIdx: 1, classId: 'ACT_TEST', sysFlags: [] });
    expect(figures.playFrozen()).toBe(0);
  });

  it('アンドゥ・ロールバック・バトルを離れるとき（clear）は動きを捨てる', () => {
    const clock = { t: 0 };
    const figures = motion(clock);
    figures.cue(trigger('U_HERO'));
    figures.clear();
    expect(figures.playFrozen()).toBe(0);
  });
});
