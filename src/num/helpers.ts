// [I-NUM-HELPERS]
// 除算演算子（`/`）の直接使用は決定論層で禁止されるため（I-ENV-TOOLING）、
// floorDiv 自体も二進法の長除算（doubling）で実装し、`/` を用いない。

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer: ${value}`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  assertNonNegativeInteger(value, name);
  if (value === 0) {
    throw new RangeError(`${name} must be positive`);
  }
}

// floor(dividend / divisor)。被除数・除数はいずれも非負（除数は正）とする。
export function floorDiv(dividend: number, divisor: number): number {
  assertNonNegativeInteger(dividend, 'dividend');
  assertPositiveInteger(divisor, 'divisor');
  if (dividend < divisor) {
    return 0;
  }

  const doublings: Array<[number, number]> = [];
  let scaledDivisor = divisor;
  let scaledQuotient = 1;
  while (scaledDivisor <= dividend) {
    doublings.push([scaledDivisor, scaledQuotient]);
    scaledDivisor = scaledDivisor * 2;
    scaledQuotient = scaledQuotient * 2;
  }

  let remainder = dividend;
  let quotient = 0;
  for (let i = doublings.length - 1; i >= 0; i--) {
    const [candidateDivisor, candidateQuotient] = doublings[i];
    if (candidateDivisor <= remainder) {
      remainder = remainder - candidateDivisor;
      quotient = quotient + candidateQuotient;
    }
  }
  return quotient;
}

// round(dividend / divisor)。0.5 は切り上げる（floor((2a+b) / (2b))）。
export function roundDiv(dividend: number, divisor: number): number {
  assertNonNegativeInteger(dividend, 'dividend');
  assertPositiveInteger(divisor, 'divisor');
  return floorDiv(dividend * 2 + divisor, divisor * 2);
}

// floor(sqrt(n))。整数ニュートン法で求め、浮動小数演算による誤差を排除する。
export function isqrt(n: number): number {
  assertNonNegativeInteger(n, 'n');
  if (n < 2) {
    return n;
  }
  let x0 = n;
  let x1 = floorDiv(x0 + floorDiv(n, x0), 2);
  while (x1 < x0) {
    x0 = x1;
    x1 = floorDiv(x0 + floorDiv(n, x0), 2);
  }
  return x0;
}
