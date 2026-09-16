// [M-UI-HUD]［判定プレビュー］選択中または実行中のアクションについて、現在のステートに基づく帰結の見込み。
// 中断が予測される場合は、その旨と中断が成立するステップ数を優先して提示する。

import { levelHpDamage } from '../../engine/calc.js';
import { currentDefense } from '../../engine/defense.js';
import {
  effectiveAtk,
  effectiveChargePpCenti,
  effectiveDeployAp,
  effectiveDmgHpCenti,
  effectiveGainVp,
  effectiveRange,
} from '../../engine/effective.js';
import { hasFlag } from '../../engine/flags.js';
import { partnerSlotOf } from '../../engine/resolve/partner.js';
import type { StepDeps } from '../../engine/pipeline/step.js';
import type { ActionInstance, BattleState, Unit } from '../../engine/types.js';
import { stunInterruptSteps } from '../../engine/watch.js';
import { roundDiv } from '../../num/helpers.js';

export interface MartialTargetPreview {
  readonly unitId: string;
  readonly posIdx: number;
  readonly hit: boolean;
  readonly damage: number | null; // 成立時のHPダメージ見込み
  // 計算式の提示に用いる（[M-UI-HUD]［判定プレビュー］`実効攻撃力 ≧ 実効防御力` の成否）。
  readonly defense: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
}

export type ActionPreview =
  | { readonly kind: 'INTERRUPT'; readonly steps: number } // 中断が予測される場合は最優先で提示する
  | { readonly kind: 'MARTIAL'; readonly atk: number; readonly targets: readonly MartialTargetPreview[] }
  | { readonly kind: 'MARTIAL_NO_TARGET' }
  | { readonly kind: 'STANCE'; readonly deployAp: number; readonly efficiencyCenti: number; readonly defenseAfter: number }
  | {
      readonly kind: 'MIND';
      readonly gainVp: number;
      readonly vpBefore: number;
      readonly targetPp: number;
      readonly ppBefore: number;
      readonly chargeCenti: number; // 実効PP充填効率（[M-RESOLVE-MIND]#3）
      readonly raises: boolean;
    }
  | { readonly kind: 'SWAP'; readonly posIdxAfter: number }
  | { readonly kind: 'SUMMON'; readonly creatureId: string }
  | { readonly kind: 'NONE' };

function martialPreview(state: BattleState, unit: Unit, action: ActionInstance): ActionPreview {
  const range = effectiveRange(unit, action);
  const atk = effectiveAtk(unit, action);
  const opposing = unit.side === 'MINE' ? [2, 3] : [1, 0];
  const targets: MartialTargetPreview[] = [];
  for (const idx of opposing) {
    const target = state.units[idx];
    if (target === null || target === undefined || Math.abs(unit.pos_idx - target.pos_idx) > range) {
      continue;
    }
    const defense = currentDefense(target);
    const hit = atk >= defense;
    const damage = hit ? levelHpDamage(effectiveDmgHpCenti(unit, action), state.scene_level) : null;
    targets.push({
      unitId: target.unit_id,
      posIdx: target.pos_idx,
      hit,
      damage,
      defense,
      hpBefore: Math.max(target.hp, 0),
      hpAfter: Math.max(target.hp - (damage ?? 0), 0),
    });
  }
  return targets.length === 0 ? { kind: 'MARTIAL_NO_TARGET' } : { kind: 'MARTIAL', atk, targets };
}

// [M-CALC-DEFENSE] 発動後は実行中アクションの防御効率で防御力が決まる。
function defenseAfterStance(unit: Unit, action: ActionInstance): number {
  return roundDiv(effectiveDeployAp(unit, action) * action.base_params.def_efficiency, 100);
}

export function previewOf(state: BattleState, unit: Unit, action: ActionInstance, deps: StepDeps): ActionPreview {
  // 中断の予測は監視条件『スタン』と同じ展開（[M-UI-WATCH]）で求める。
  const interrupt = stunInterruptSteps(state, unit, action, deps);
  if (interrupt !== null) {
    return { kind: 'INTERRUPT', steps: interrupt };
  }
  const flags = action.sys_flags;
  if (hasFlag(flags, 'FLAG_MARTIAL')) {
    return martialPreview(state, unit, action);
  }
  if (hasFlag(flags, 'FLAG_STANCE')) {
    return {
      kind: 'STANCE',
      deployAp: effectiveDeployAp(unit, action),
      efficiencyCenti: action.base_params.def_efficiency,
      defenseAfter: defenseAfterStance(unit, action),
    };
  }
  if (hasFlag(flags, 'FLAG_MIND')) {
    const gainVp = effectiveGainVp(unit, action);
    const targetPp = roundDiv((unit.vp + gainVp) * effectiveChargePpCenti(unit, action), 100);
    return {
      kind: 'MIND',
      gainVp,
      vpBefore: unit.vp,
      targetPp,
      ppBefore: unit.pp,
      chargeCenti: effectiveChargePpCenti(unit, action),
      raises: targetPp > unit.pp,
    };
  }
  if (hasFlag(flags, 'FLAG_SWAP')) {
    return { kind: 'SWAP', posIdxAfter: partnerSlotOf(unit.pos_idx) };
  }
  if (hasFlag(flags, 'FLAG_SUMMON') && action.base_params.summon_id !== null) {
    return { kind: 'SUMMON', creatureId: action.base_params.summon_id };
  }
  return { kind: 'NONE' };
}
