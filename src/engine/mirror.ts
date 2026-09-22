// [M-META-MIRRORSTATS] 鏡像統計。系統別実行回数と初手系統の判定を1箇所に置く。
// 本モジュールの判定は [A-MIRROR-5-09]（5-09 の実効プロファイル）・[A-BOOK-SEMANTICS]（定跡 B-06）
// および [V-TEST-BUILD-METRICS] の `sys_ratio` が共用する（同項「別実装を作らない」）。

import { hasFlag } from './flags.js';
import type { MirrorStats, MirrorSystem } from './run/state.js';
import type { ActionInstance } from './types.js';

// [M-STATE-RUNSTATE] MirrorStats の counts は 武技 / 体勢 / 心気 / 召喚 の順の4要素。
export const MIRROR_COUNT_ORDER = ['MARTIAL', 'STANCE', 'MIND', 'SUMMON'] as const;

// [M-META-MIRRORSTATS]「複合アクションの場合は召喚 → 心気 → 武技 → 体勢の解決順で
// 最初に該当する系統を採る」。
const FIRST_SYSTEM_ORDER = ['SUMMON', 'MIND', 'MARTIAL', 'STANCE'] as const;

const FLAG_OF: Readonly<Record<Exclude<MirrorSystem, 'NONE'>, 'FLAG_SUMMON' | 'FLAG_MIND' | 'FLAG_MARTIAL' | 'FLAG_STANCE'>> = {
  SUMMON: 'FLAG_SUMMON',
  MIND: 'FLAG_MIND',
  MARTIAL: 'FLAG_MARTIAL',
  STANCE: 'FLAG_STANCE',
};

// 隊列交代は計上しない（[V-TEST-BUILD-METRICS]。first_system が隊列交代単体で値を更新しないのと同じ扱い）。
export function firstSystemOf(action: ActionInstance): MirrorSystem {
  for (const system of FIRST_SYSTEM_ORDER) {
    if (hasFlag(action.sys_flags, FLAG_OF[system])) {
      return system;
    }
  }
  return 'NONE';
}

export function createMirrorStats(): MirrorStats {
  return { counts: MIRROR_COUNT_ORDER.map(() => 0), first_system: 'NONE' };
}

// 1回の実行確定（[M-PIPE-P8-DECISION]）を計上する。内包する系統をそれぞれ1回として数え、
// 初手系統は未確定（NONE）のときに限り記録する。
export function countExecution(stats: MirrorStats, action: ActionInstance): void {
  for (let index = 0; index < MIRROR_COUNT_ORDER.length; index += 1) {
    if (hasFlag(action.sys_flags, FLAG_OF[MIRROR_COUNT_ORDER[index]])) {
      stats.counts[index] += 1;
    }
  }
  if (stats.first_system === 'NONE') {
    stats.first_system = firstSystemOf(action);
  }
}
