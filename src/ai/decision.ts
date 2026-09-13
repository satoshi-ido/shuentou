// [M-PIPE-P8-DECISION] 敵軍AIの決定主体。探索器（[A-SEARCH-ALGORITHM]）を
// [M-PIPE-P8-ORDER] の DecisionProvider 契約に接続する。

import type { DecisionProvider } from '../engine/decision.js';
import type { StepDeps } from '../engine/pipeline/step.js';
import { decideAction } from './search.js';
import type { EffectiveProfile } from './profile.js';

export function createAiDecisionProvider(prof: EffectiveProfile, deps: StepDeps): DecisionProvider {
  return (state, unit) => decideAction(state, unit, prof, deps);
}
