// [I-STATE-SNAPSHOT] 構造化複製。実行環境（[I-ENV-TOOLING] Node 24・ブラウザ・ワーカー）が提供する大域関数であり、
// tsconfig の lib（ES2023）には含まれないため宣言のみを置く。
declare function structuredClone<T>(value: T): T;
