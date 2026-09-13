// [M-PIPE-P2-APPLY]#4 スタンによる中断処理。通常アクション（一斉バッチ）・即時型アクション
// （即時適用）の双方から共用する。

import { effectiveStepRecovery, effectiveStepStartup } from '../effective.js';
import type { ActionInstance, Unit } from '../types.js';

function findAction(unit: Unit, instanceId: string): ActionInstance | undefined {
  return unit.acts.find((a) => a.instance_id === instanceId);
}

export function applyStunInterruption(target: Unit): void {
  if (target.state === 'THOUGHT') {
    target.elapsed_thought = 0;
    return;
  }
  if (target.state !== 'STARTUP' || target.last_act === null) {
    return; // RECOVERY 中は無効。PENDING_DISCARD は対象外。
  }
  const action = findAction(target, target.last_act.instance_id);
  if (action === undefined) {
    return;
  }
  const requiredRecovery = effectiveStepRecovery(target, action);
  const requiredStartup = effectiveStepStartup(target, action);
  target.applied_recovery = Math.max(0, requiredRecovery + (requiredStartup - target.elapsed_startup));
  target.state = 'RECOVERY';
  target.elapsed_recovery = 0;
}
