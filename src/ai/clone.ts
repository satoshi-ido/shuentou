// [I-STATE-JSON] BattleState はJSONで表現できる値のみで構成されるため、探索器の仮想状態
// （枝ごとのクローン）はJSON往復で複製する。[I-STATE-SNAPSHOT] がJSON往復と構造化複製の
// 結果一致を開発ビルドで検査対象とする2方式のうちの一方であり、@types/node への依存
// （structuredClone の型定義）を増やさずに済む。

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
