// [M-RESOLVE-ORDER]【統合解決パイプライン】（5段階実行順序）。
// Step 2（隊列交代）は即時型アクション（処理8）でのみ実行する。
// Step 4 末尾の位置干渉は、実行モードにより適用タイミングが異なる：
//   INSTANT: このモジュール内で Step 4 の末尾として即座に適用する（[M-PIPE-INSTANT]#2）。
//   NORMAL : 適用せず InterferenceRequest を返す。同一ステップで発動した全アクションの
//            Step 1〜5 解決後に陣営ごと一括で適用する（[M-PIPE-P2-APPLY]#3-4）。呼び出し側が担う。

import { applyInterference } from './interfere.js';
import type { InstanceIdCounter } from '../instantiate.js';
import type { InterferenceRequest, MartialContext } from './martial.js';
import { resolveMartial } from './martial.js';
import { resolveMind } from './mind.js';
import { resolveStance } from './stance.js';
import { applyStunInterruption } from './stun.js';
import type { CreatureFactory } from './summon.js';
import { resolveSummon } from './summon.js';
import { resolveSwap } from './swap.js';
import type { ActionInstance, Side, Unit } from '../types.js';

export type ResolveMode = 'NORMAL' | 'INSTANT';

export interface ResolveDeps {
  readonly createCreature: CreatureFactory;
  readonly level: number;
  readonly defenseOf: (unit: Unit) => number;
  readonly idCounter: InstanceIdCounter;
  readonly appliedInterferenceSides: Side[]; // 呼び出し側（ステップ単位）で共有・可変
}

export interface ResolveOutcome {
  readonly hitUnitIds: readonly string[];
  readonly missUnitIds: readonly string[];
  readonly stunHitUnitIds: readonly string[];
  readonly interferenceRequest: InterferenceRequest | null; // NORMAL モードで未適用のまま返る場合のみ非Null
}

export function resolveAction(
  units: (Unit | null)[],
  actor: Unit,
  action: ActionInstance,
  mode: ResolveMode,
  deps: ResolveDeps,
): ResolveOutcome {
  resolveSummon(units, actor, action, deps.createCreature); // Step 1

  if (mode === 'INSTANT') {
    resolveSwap(units, actor, action); // Step 2（即時型のみ）
  }

  resolveMind(units, actor, action); // Step 3

  const martialCtx: MartialContext = { units, level: deps.level, defenseOf: deps.defenseOf, idCounter: deps.idCounter };
  const martialOutcome = resolveMartial(martialCtx, actor, action); // Step 4（位置干渉は発火判定のみ）

  let remainingRequest = martialOutcome.interferenceRequest;
  let remainingStunHitUnitIds = martialOutcome.stunHitUnitIds;
  if (mode === 'INSTANT') {
    // 即時型アクションは全コンポーネントをアトミックに解決するため、スタン中断・位置干渉ともに
    // ここで即座に適用する（[M-PIPE-INSTANT]#2）。通常アクションはバッチ処理のため呼び出し側へ返す。
    for (const unitId of remainingStunHitUnitIds) {
      const target = units.find((u) => u !== null && u.unit_id === unitId) ?? null;
      if (target !== null) {
        applyStunInterruption(target);
      }
    }
    remainingStunHitUnitIds = [];
    if (remainingRequest !== null) {
      const applied = applyInterference(units, remainingRequest, deps.appliedInterferenceSides);
      if (applied) {
        deps.appliedInterferenceSides.push(remainingRequest.side);
      }
      remainingRequest = null;
    }
  }

  resolveStance(units, actor, action); // Step 5

  return {
    hitUnitIds: martialOutcome.hitUnitIds,
    missUnitIds: martialOutcome.missUnitIds,
    stunHitUnitIds: remainingStunHitUnitIds,
    interferenceRequest: remainingRequest,
  };
}
