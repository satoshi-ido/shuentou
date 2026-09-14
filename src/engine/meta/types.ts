// [M-META-SAVEDATA] [M-META-COUNTERS] [M-META-PENDING] セーブデータ1件の構成。

import type { RunState } from '../run/state.js';

export interface EnshrineAnchor {
  readonly playthrough: number;
  readonly rewind_count: number;
}

// [M-META-COUNTERS]
export interface MetaCounters {
  total_rewind_count: number;
  echo_unlocked: Record<string, boolean>;
  playthrough_count: number;
  obsolete_name_revealed: boolean;
  help_seen: Record<string, boolean>;
  enshrine_anchor: Record<string, EnshrineAnchor | null>;
}

export type RewindPendingType = 'NONE' | 'UNDO' | 'ROLLBACK_BATTLE' | 'ROLLBACK_INTERMISSION';

// [M-META-PENDING]
export interface RewindPending {
  rewind_pending: boolean;
  rewind_pending_type: RewindPendingType;
}

// [M-META-SAVEDATA]［構成］
export interface SaveData {
  save_version: number;
  meta: MetaCounters;
  pending: RewindPending;
  run: RunState;
}
