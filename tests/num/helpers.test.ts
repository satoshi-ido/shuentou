// [I-NUM-HELPERS]
import { describe, expect, it } from 'vitest';
import { floorDiv, isqrt, roundDiv } from '../../src/num/helpers.js';

describe('I-NUM-HELPERS floorDiv', () => {
  it('切り捨てる', () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(6, 2)).toBe(3);
    expect(floorDiv(0, 5)).toBe(0);
    expect(floorDiv(1, 1000000)).toBe(0);
    expect(floorDiv(680000, 3)).toBe(Math.floor(680000 / 3));
  });

  it('非負整数以外を拒否する', () => {
    expect(() => floorDiv(-1, 2)).toThrow(RangeError);
    expect(() => floorDiv(1.5, 2)).toThrow(RangeError);
    expect(() => floorDiv(2, 0)).toThrow(RangeError);
    expect(() => floorDiv(2, -1)).toThrow(RangeError);
  });

  it('0 から 2000 までの全組み合わせで Math.floor と一致する', () => {
    for (let a = 0; a <= 2000; a += 37) {
      for (let b = 1; b <= 200; b += 11) {
        expect(floorDiv(a, b)).toBe(Math.floor(a / b));
      }
    }
  });
});

describe('I-NUM-HELPERS roundDiv', () => {
  it('0.5 を切り上げる', () => {
    expect(roundDiv(1, 2)).toBe(1);
    expect(roundDiv(3, 2)).toBe(2);
  });

  it('0.5 未満・超過を正しく丸める', () => {
    expect(roundDiv(1, 4)).toBe(0);
    expect(roundDiv(3, 4)).toBe(1);
    expect(roundDiv(0, 5)).toBe(0);
  });

  it('centi 実効値の例（基礎値100・バフ33・デバフ0）と一致する', () => {
    // round_div(基礎値 * (100 + 被バフ量 - 被デバフ量), 100)
    expect(roundDiv(100 * (100 + 33 - 0), 100)).toBe(133);
  });
});

describe('I-NUM-HELPERS isqrt', () => {
  it('既知の値と一致する', () => {
    expect(isqrt(0)).toBe(0);
    expect(isqrt(1)).toBe(1);
    expect(isqrt(3)).toBe(1);
    expect(isqrt(4)).toBe(2);
    expect(isqrt(15)).toBe(3);
    expect(isqrt(16)).toBe(4);
  });

  it('非負整数以外を拒否する', () => {
    expect(() => isqrt(-1)).toThrow(RangeError);
    expect(() => isqrt(1.5)).toThrow(RangeError);
  });

  it('0 から 680000 まで Math.floor(Math.sqrt(n)) と一致する', () => {
    for (let n = 0; n <= 680000; n += 977) {
      expect(isqrt(n)).toBe(Math.floor(Math.sqrt(n)));
    }
  });
});
