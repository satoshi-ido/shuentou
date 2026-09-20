// [I-STATE-JSON] BattleState はJSONで表現できる値（真偽値・整数・文字列・配列・素のオブジェクト・
// `null`）のみで構成されるため、探索器の仮想状態（枝ごとのクローン）は当該型に限った再帰複製で
// 済む。JSON往復および structuredClone は同じ結果を返すが、いずれも本関数の5倍以上を要し、
// 葉の評価と手の適用のたびに複製する探索では実行時間の主要因となる（[A-SEARCH-ALGORITHM]）。
// JSON往復との結果一致は tests/ai/clone.test.ts が検査する（[I-STATE-SNAPSHOT] の2方式の一致と
// 同じ趣旨である）。

export function cloneState<T>(value: T): T {
  if (Array.isArray(value)) {
    const source = value as readonly unknown[];
    const copy = new Array<unknown>(source.length);
    for (let index = 0; index < source.length; index += 1) {
      copy[index] = cloneState(source[index]);
    }
    return copy as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      copy[key] = cloneState(source[key]);
    }
    return copy as unknown as T;
  }
  return value;
}
