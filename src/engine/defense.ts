// [M-CALC-DEFENSE] 防御力の計算。
// 「実行中アクション」は [M-STATE-LASTACTION-LIFECYCLE]#1 により、発生中遷移と同時に
// last_act へ即時記録されるため、STARTUP/RECOVERY 中は last_act.params を実行中アクションの
// 静的パラメータとして参照できる。防御効率（def_efficiency）は17種の補正対象に含まれないため
// 基礎値をそのまま用いる。

import { defenseFromApAndEfficiency } from './calc.js';
import type { Unit } from './types.js';

const NO_ACTION_EFFICIENCY_CENTI = 100; // 1.00

export function currentDefense(unit: Unit): number {
  if (unit.state === 'STARTUP' || unit.state === 'RECOVERY') {
    const efficiency = unit.last_act?.params.def_efficiency ?? NO_ACTION_EFFICIENCY_CENTI;
    return defenseFromApAndEfficiency(unit.ap, efficiency);
  }
  return defenseFromApAndEfficiency(unit.ap, NO_ACTION_EFFICIENCY_CENTI);
}

// [M-PIPE-P1-FREEZE] 各生存ユニットの当該ステップ開始時点の実効防御力スナップショット。
export type DefenseSnapshot = Readonly<Record<string, number>>;

export function freezeDefense(units: readonly Unit[]): DefenseSnapshot {
  const snapshot: Record<string, number> = {};
  for (const unit of units) {
    if (unit.state === 'PENDING_DISCARD') {
      continue;
    }
    snapshot[unit.unit_id] = currentDefense(unit);
  }
  return snapshot;
}

// [M-RESOLVE-MARTIAL]#2 凍結スナップショットに存在しないユニット（同ステップ内で新たに実体化した
// クリーチャー等）は防御力0として参照する。
export function frozenDefenseOf(snapshot: DefenseSnapshot, unitId: string): number {
  return snapshot[unitId] ?? 0;
}
