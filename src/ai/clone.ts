// [I-STATE-JSON] BattleState はJSONで表現できる値（真偽値・整数・文字列・配列・素のオブジェクト・
// `null`）のみで構成されるため、探索器の仮想状態（枝ごとのクローン）は当該型に限った再帰複製で
// 済む。JSON往復および structuredClone は同じ結果を返すが、いずれも本関数の5倍以上を要し、
// 葉の評価と手の適用のたびに複製する探索では実行時間の主要因となる（[A-SEARCH-ALGORITHM]）。
// JSON往復との結果一致は tests/ai/clone.test.ts が検査する（[I-STATE-SNAPSHOT] の2方式の一致と
// 同じ趣旨である）。
//
// さらに、アクションの静的パラメータと系統フラグ（[M-STATE-ACTION]）はバトル中に変更されない。
// 更新は資質統合（[M-INHERIT-MERGE]）だけであり、インターミッションで新しいオブジェクトへ
// 差し替える形で行われる。1アクションあたりの静的パラメータは30項目規模でユニットあたり十数件
// あるため、これが複製の大半を占める。探索用の複製では当該部分を参照のまま渡し、可変値のみを
// 複製する。探索の枝は破棄されるため共有しても影響が残らず、履歴・セーブの複製は
// src/engine/run/snapshot.ts の別実装が担う。バトル中に書き込みがないことは
// tests/ai/clone.test.ts の凍結検査が担保する。

// 参照のまま渡すキー。ActionInstance.base_params / merge_params / sys_flags と
// LastActionSnapshot.params / sys_flags が該当する。
const SHARED_KEYS = ['base_params', 'merge_params', 'sys_flags', 'params'];

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
      copy[key] = SHARED_KEYS.includes(key) ? source[key] : cloneState(source[key]);
    }
    return copy as unknown as T;
  }
  return value;
}
