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

// 監視トグルとその充足状態（BattleState.watching / watch_prev_met：[M-UI-WATCH]）も同じく参照のまま渡す。
// 書き込みは時間停止判定とプレイヤーの操作（src/engine/game/）に限られ、探索が進める《処理1》〜《処理7》
// と手の適用は触れない。

import type { ActionInstance, BattleState, Unit } from '../engine/types.js';

// 参照のまま渡すキー。ActionInstance.base_params / merge_params / sys_flags、
// LastActionSnapshot.params / sys_flags、BattleState.watching / watch_prev_met が該当する。
// 複製のたびに全キーで判定するため、配列の走査ではなく比較で判定する。
function isSharedKey(key: string): boolean {
  return (
    key === 'base_params' ||
    key === 'merge_params' ||
    key === 'sys_flags' ||
    key === 'params' ||
    key === 'watching' ||
    key === 'watch_prev_met'
  );
}

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
      copy[key] = isSharedKey(key) ? source[key] : cloneState(source[key]);
    }
    return copy as unknown as T;
  }
  return value;
}

// 探索の枝ごとの複製（BattleState 専用）。cloneState と同じ値を返すが、構造を既知として
// 変更されうる部分だけを複製する。バトル中の書き込みの形は次のとおりであり、これに従って共有範囲を定める。
// - 要素ごと書き換える：units、各ユニットの acts・buff・debuff、各アクションの可変値、mirror_tally.counts
// - 値を丸ごと差し替える（記録の辞書だけを複製し、値は共有）：instant_used・ai_reuse の各値
// - バトル中に書き込まない（共有）：last_act（実行確定のたびに新しいスナップショットへ差し替える）、
//   pause_reason、mirror_snapshot、および cloneState と同じ共有キー
// 共有しない入れ子のオブジェクトが残っていないことは tests/ai/clone.test.ts の独立性検査が担保する。
export function cloneBattleState(state: BattleState): BattleState {
  const units = new Array<Unit | null>(state.units.length);
  for (let index = 0; index < state.units.length; index += 1) {
    const unit = state.units[index];
    units[index] = unit === null ? null : cloneUnit(unit);
  }
  return {
    ...state,
    units,
    instant_used: { ...state.instant_used },
    ai_reuse: { ...state.ai_reuse },
    mirror_tally: { ...state.mirror_tally, counts: [...state.mirror_tally.counts] },
  };
}

export function cloneUnit(unit: Unit): Unit {
  const acts = new Array<ActionInstance>(unit.acts.length);
  for (let index = 0; index < unit.acts.length; index += 1) {
    acts[index] = { ...unit.acts[index] };
  }
  return { ...unit, acts, buff: { ...unit.buff }, debuff: { ...unit.debuff } };
}
