// [I-NUM-HELPERS] の round_div/floor_div は被除数・被除数がいずれも非負である前提を持つ
// （[I-ENV-TOOLING]の除算演算子禁止規則も含め centi 層向けの定義）。評価器の 1/1024 固定小数
// （[A-EVAL-FORM]）は特徴量の加重和・差分など負値を日常的に扱うため、本モジュールは
// floorDiv/roundDiv のみを用いて符号付きの除算を組み立てる（除算演算子は用いない）。

import { floorDiv, roundDiv } from '../num/helpers.js';

export function signedRoundDiv(dividend: number, divisor: number): number {
  if (divisor < 0) {
    return -signedRoundDiv(dividend, -divisor);
  }
  if (dividend >= 0) {
    return roundDiv(dividend, divisor);
  }
  return -roundDiv(-dividend, divisor);
}

export function signedFloorDiv(dividend: number, divisor: number): number {
  if (divisor < 0) {
    return -signedFloorDiv(dividend, -divisor);
  }
  if (dividend >= 0) {
    return floorDiv(dividend, divisor);
  }
  // floor(-x / b) = -ceil(x / b) = -floor((x + b - 1) / b)  (x = -dividend > 0, b = divisor > 0)
  const x = -dividend;
  return -floorDiv(x + divisor - 1, divisor);
}

// round(numerator * scale / denominator)。denominator <= 0 は 0 を返す（飽和防止の番兵）。
export function ratioToScale(numerator: number, denominator: number, scale: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return signedRoundDiv(numerator * scale, denominator);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
