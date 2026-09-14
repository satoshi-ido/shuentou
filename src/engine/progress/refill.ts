// [M-PROG-REFILL] [M-STATE-RUNSTATE]［補充候補プールの導出］ インターミッションの段・アクト移行・従者補充。

import { sceneByOrder, sceneOf, type GameMasters } from '../run/masters.js';
import type { RunState } from '../run/state.js';
import { insertSorted } from './sacrifice.js';

// 直前にクリアしたシーンがアクト最終シーンであるか（次シーンのアクトが進む）。
export function isActTransition(run: RunState, masters: GameMasters): boolean {
  const next = sceneOf(masters, run.current_scene_id);
  return sceneByOrder(masters, next.order - 1).act < next.act;
}

// 補充候補プール（従者ID昇順）。
export function refillPool(run: RunState, masters: GameMasters): string[] {
  const act = sceneOf(masters, run.current_scene_id).act;
  return Object.values(masters.attendants)
    .filter(
      (record) =>
        record.join_act === act &&
        !record.is_fixed &&
        !run.recruited.includes(record.attendant_id) &&
        !run.sacrificed.includes(record.attendant_id),
    )
    .map((record) => record.attendant_id)
    .sort();
}

export function refillCapacity(run: RunState, masters: GameMasters): number {
  return sceneOf(masters, run.current_scene_id).attendant_capacity - run.party.length;
}

function forfeitUnused(run: RunState): void {
  for (const slot of run.party) {
    if (slot.inherit_state === 'UNUSED') {
      slot.inherit_state = 'FORFEITED';
    }
  }
}

export function canEnterTransition(run: RunState, masters: GameMasters): boolean {
  return run.phase === 'INTERMISSION' && run.intermission_stage === 'INHERIT' && isActTransition(run, masters);
}

// ［インターミッションの段］2. 失効 → 種別B判定 → 全回復。
// 種別B（[M-META-ECHO]）の対象は従者05であり、[I-PLAN-MILESTONE]［M3 のマスタ範囲］に含まれないため判定しない。
export function applyEnterTransition(run: RunState): void {
  forfeitUnused(run);
  run.hero_hp = run.hero_max_hp;
  run.intermission_stage = 'TRANSITION';
}

export function canRefill(run: RunState, masters: GameMasters, attendantId: string): boolean {
  return (
    run.phase === 'INTERMISSION' &&
    run.intermission_stage === 'TRANSITION' &&
    refillCapacity(run, masters) > 0 &&
    refillPool(run, masters).includes(attendantId)
  );
}

// 事前条件は canRefill。enshrine_anchor の更新はメタステートを扱う呼び出し側が行う。
export function applyRefill(run: RunState, attendantId: string): void {
  run.party.push({ attendant_id: attendantId, inherit_state: 'UNUSED' });
  run.recruited = insertSorted(run.recruited, attendantId);
  run.enshrined_count += 1; // [M-PROG-SACRIFICE] EnshrinedCount
}

export function canSettleIntermission(run: RunState, masters: GameMasters): boolean {
  if (run.phase !== 'INTERMISSION') {
    return false;
  }
  return run.intermission_stage === (isActTransition(run, masters) ? 'TRANSITION' : 'INHERIT');
}

// インターミッション決済の確定。INHERIT 段での確定は未行使の継承枠を失効させる。
export function applySettleIntermission(run: RunState): void {
  if (run.intermission_stage === 'INHERIT') {
    forfeitUnused(run);
  }
  run.phase = 'PRE_BATTLE';
  run.intermission_stage = null;
}
