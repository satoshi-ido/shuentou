// [M-UI-HUD]【立ち絵の動き】「倒れの画」消滅猶予状態へ移ったマスターの倒れの画を、撤去の後もそのマスに保つ。

import { describe, expect, it } from 'vitest';
import { type DownedFigure, FigureMotion } from '../../src/ui/dom/figure-motion.js';

const HERO_DOWN: DownedFigure = { url: 'art/standing/hero-down.png', side: 'MINE' };

function motion(downs: Readonly<Record<string, DownedFigure>>): FigureMotion {
  return new FigureMotion(
    {} as HTMLElement,
    () => false,
    () => undefined,
    () => 0,
    () => 0,
    (unitId) => downs[unitId] ?? null,
  );
}

describe('倒れの画', () => {
  it('倒れの画を持つユニットは、消滅猶予状態へ移ったマスに倒れの画を保つ', () => {
    const figures = motion({ U_HERO: HERO_DOWN });
    figures.cue({ kind: 'UNIT_DESTROY', unitId: 'U_HERO', posIdx: 1 });
    expect(figures.downedAt(1)).toEqual(HERO_DOWN);
    expect(figures.downedAt(0)).toBeNull();
    expect(figures.hasDowned('MINE')).toBe(true);
    expect(figures.hasDowned('FOE')).toBe(false);
  });

  it('倒れの画を持たないユニット（仮身など）は保たない', () => {
    const figures = motion({});
    figures.cue({ kind: 'UNIT_DESTROY', unitId: 'U_CREATURE', posIdx: 0 });
    expect(figures.downedAt(0)).toBeNull();
    expect(figures.hasDowned('MINE')).toBe(false);
  });

  it('同時撃破では両方を倒れの画とし、アンドゥ・ロールバック（clear）で捨てる', () => {
    const foeDown: DownedFigure = { url: 'art/standing/lef-down.png', side: 'FOE' };
    const figures = motion({ U_HERO: HERO_DOWN, U_FOE: foeDown });
    figures.cue({ kind: 'UNIT_DESTROY', unitId: 'U_HERO', posIdx: 1 });
    figures.cue({ kind: 'UNIT_DESTROY', unitId: 'U_FOE', posIdx: 2 });
    expect(figures.downedAt(1)).toEqual(HERO_DOWN);
    expect(figures.downedAt(2)).toEqual(foeDown);
    figures.clear();
    expect(figures.downedAt(1)).toBeNull();
    expect(figures.downedAt(2)).toBeNull();
  });
});
