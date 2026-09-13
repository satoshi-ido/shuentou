// [M-CALC-LEVEL] [M-CALC-EFFECTIVE] [M-CALC-DEFENSE] の実数値検証。
// 実効HPダメージの3例は [V-NUM-PARAMS] 掲載値（祠守レフ L=3）と一致することを確認する。

import { describe, expect, it } from 'vitest';
import {
  defenseFromApAndEfficiency,
  effectiveBasicInt,
  levelHpDamage,
  levelPpDamage,
  sqrtLevelCenti,
} from '../../src/engine/calc.js';

describe('[M-CALC-LEVEL] 実効HPダメージ（[V-NUM-PARAMS] 祠守レフ L=3）', () => {
  it('武技（基本）AR3: dmg_hp 66 centi -> 2', () => {
    expect(levelHpDamage(66, 3)).toBe(2);
  });

  it('武技（基本）AR6: dmg_hp 93 centi -> 3', () => {
    expect(levelHpDamage(93, 3)).toBe(3);
  });

  it('武技（重撃）AR3: dmg_hp 133 centi -> 4', () => {
    expect(levelHpDamage(133, 3)).toBe(4);
  });
});

describe('[M-CALC-LEVEL] sqrt(L) の centi 表現', () => {
  it('isqrt(L*10000) が小数第2位まで切り捨てた値と一致する', () => {
    expect(sqrtLevelCenti(3)).toBe(173); // sqrt(3) = 1.732...
    expect(sqrtLevelCenti(4)).toBe(200); // sqrt(4) = 2.00
  });

  it('実効PPダメージが sqrt(L) 込みで確定する', () => {
    // 係数 100 centi（1.00）・L=4（sqrt=2.00）なら 1.00 * 2.00 = 2
    expect(levelPpDamage(100, 4)).toBe(2);
  });
});

describe('[M-CALC-EFFECTIVE][M-CALC-ROUNDING] 基本整数の実効値', () => {
  it('被バフ33centiで基礎値100の増加型パラメータは133となる', () => {
    expect(effectiveBasicInt(100, 33, 0, 'atk')).toBe(133);
  });

  it('基礎値0は常に0を維持する（基礎値0固定ルール）', () => {
    expect(effectiveBasicInt(0, 50, 0, 'atk')).toBe(0);
  });

  it('通常アクションの必要発生ステップは下限1を割らない', () => {
    // 被バフ100centi（減少型）で基礎値1が理論上0になっても floorAtOne で1を維持する。
    expect(effectiveBasicInt(1, 100, 0, 'step_startup', { floorAtOne: true })).toBe(1);
  });
});

describe('[M-CALC-DEFENSE]', () => {
  it('防御力 = round(現在AP * 防御効率)', () => {
    expect(defenseFromApAndEfficiency(16, 200)).toBe(32); // 実行中アクションの防御効率2.00
    expect(defenseFromApAndEfficiency(16, 100)).toBe(16); // 非アクション中は1.00扱い
  });
});
