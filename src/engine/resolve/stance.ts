// [M-RESOLVE-STANCE] 体勢コンポーネント解決アルゴリズム（[M-RESOLVE-ORDER] Step 5）。
// #4（防御力スナップショットへの遡及なし）は凍結スナップショットを再計算しないことで自然に満たされる。
// #5（硬直満了時の減衰）は [M-PIPE-P7-LANDING] / [M-PIPE-INSTANT] 側で扱う。

import { effectiveDeployAp } from '../effective.js';
import { hasFlag } from '../flags.js';
import type { ActionInstance, Unit } from '../types.js';
import { partnerOf } from './partner.js';

export function resolveStance(units: (Unit | null)[], actor: Unit, action: ActionInstance): void {
  if (!hasFlag(action.sys_flags, 'FLAG_STANCE')) {
    return;
  }
  const deployAp = effectiveDeployAp(actor, action);
  actor.ap = deployAp;

  if (action.base_params.target_scope !== 'PARTY') {
    return;
  }
  const partner = partnerOf(units, actor);
  if (partner === null || partner.state === 'PENDING_DISCARD') {
    return;
  }
  partner.ap = deployAp;
}
