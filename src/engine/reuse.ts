// [A-SEARCH-REUSE] 再探索の抑制。盤面ハッシュの一致および惰性（inertia_steps）の判定を行い、
// 抑制が成立する決定点では探索を行わずパスを返す。記録は BattleState の ai_reuse に保持する。

import { executableActions } from './decision.js';
import type { BattleState, ReuseRecord, Unit } from './types.js';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
// 盤面ハッシュに含めない項目：進行（step）・監視系・停止事由・抑制記録そのもの。
const EXCLUDED_KEYS: readonly string[] = ['step', 'watching', 'watch_prev_met', 'pause_reason', 'ai_reuse'];

// キーを辞書順に並べた JSON 文字列。[I-STATE-JSON] により値は真偽値・整数・文字列・配列・素のオブジェクト・null に限る。
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

// [A-SEARCH-REUSE]［盤面ハッシュ］UTF-8 バイト列への FNV-1a（32bit）。
export function boardHash(state: BattleState): number {
  const source: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!EXCLUDED_KEYS.includes(key)) {
      source[key] = value;
    }
  }
  const bytes = new TextEncoder().encode(canonicalJson(source));
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, FNV_PRIME);
  }
  return hash >>> 0;
}

function executableIds(state: BattleState, unit: Unit): string[] {
  return executableActions(state, unit)
    .map((action) => action.instance_id)
    .sort();
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

// [A-SEARCH-REUSE]［記録と適用］抑制が成立する（探索せずパスを返す）かどうか。
export function isSearchSuppressed(state: BattleState, unit: Unit): boolean {
  const record = state.ai_reuse[unit.unit_id];
  if (record === undefined) {
    return false;
  }
  if (record.hash === boardHash(state)) {
    return true;
  }
  return state.step <= record.until && sameIds(record.executable, executableIds(state, unit));
}

// 探索の結果がパスなら記録を更新し、行動の確定または抑制不成立なら記録を削除する。
export function updateReuse(state: BattleState, unit: Unit, keep: boolean, inertiaSteps: number): void {
  if (!keep) {
    delete state.ai_reuse[unit.unit_id];
    return;
  }
  const record: ReuseRecord = {
    hash: boardHash(state),
    until: state.step + inertiaSteps,
    executable: executableIds(state, unit),
  };
  state.ai_reuse[unit.unit_id] = record;
}
