// [V-TEST-NONFUNC] D-09 命中機会窓の実測。
// 「敵の実効防御力 < 主人公の最大実効攻撃力」が成立するステップ区間を窓とし、
// ①窓の開始時刻列・②窓の発生周期 T の分布・③各窓時点でのPP残量・
// ④「敵マスターの最大展開AP ≦ 主人公の最大実効攻撃力」が成立するシーンの一覧を記録する。
// 本項は合否判定を行わない（[V-AUDIT-IMPL]「D-09 ④は保証条件ではない」）。

import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { currentDefense } from '../../src/engine/defense.js';
import { effectiveAtk, effectiveDeployAp } from '../../src/engine/effective.js';
import { hasFlag } from '../../src/engine/flags.js';
import type { BattleState, Unit } from '../../src/engine/types.js';

export interface WindowSeries {
  readonly scene_id: string;
  readonly starts: number[]; // ① 窓の開始時刻列
  readonly periods: number[]; // ② 窓の発生周期 T（開始時刻の階差）
  readonly pp_at_start: number[]; // ③ 各窓時点でのPP残量
  frontal: boolean; // ④ 最大展開AP ≦ 最大実効攻撃力
  max_deploy_ap: number;
  max_hero_atk: number;
  steps: number;
}

function masterOf(state: BattleState, side: Unit['side']): Unit | null {
  return state.units.find((unit): unit is Unit => unit !== null && unit.side === side && unit.unit_kind === 'MASTER') ?? null;
}

// 主人公の最大実効攻撃力。武技を内包するアクションの実効攻撃力の最大値をとる。
// マスター根源武技は除外する。[V-AUDIT-IMPL] が pool_max_atk から is_root を除くのと同じ理由であり、
// atk 999 を算入すると窓が常時開き、本項が難易度再調整の判断材料として要求する4系列が失われる。
function maxEffectiveAtk(hero: Unit): number {
  let best = 0;
  for (const action of hero.acts) {
    const record = ACTION_MASTERS[action.master_ref as keyof typeof ACTION_MASTERS];
    if (record !== undefined && record.is_root) {
      continue;
    }
    if (hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
      best = Math.max(best, effectiveAtk(hero, action));
    }
  }
  return best;
}

// 敵マスターの最大展開AP。体勢を内包するアクションの実効展開APの最大値をとる。
function maxEffectiveDeployAp(enemy: Unit): number {
  let best = 0;
  for (const action of enemy.acts) {
    if (hasFlag(action.sys_flags, 'FLAG_STANCE')) {
      best = Math.max(best, effectiveDeployAp(enemy, action));
    }
  }
  return best;
}

export function createWindowSeries(sceneId: string): WindowSeries {
  return {
    scene_id: sceneId,
    starts: [],
    periods: [],
    pp_at_start: [],
    frontal: false,
    max_deploy_ap: 0,
    max_hero_atk: 0,
    steps: 0,
  };
}

// 1ステップ分の観測。窓が閉から開へ移った境界だけを開始時刻として数える。
export function observeWindow(series: WindowSeries, state: BattleState, open: { value: boolean }): void {
  const hero = masterOf(state, 'MINE');
  const enemy = masterOf(state, 'FOE');
  series.steps = state.step;
  if (hero === null || enemy === null) {
    open.value = false;
    return;
  }

  const heroAtk = maxEffectiveAtk(hero);
  const deployAp = maxEffectiveDeployAp(enemy);
  series.max_hero_atk = Math.max(series.max_hero_atk, heroAtk);
  series.max_deploy_ap = Math.max(series.max_deploy_ap, deployAp);
  // ④ 壁を発生中・硬直中も含めて正面から割れるか。実測中の最大値どうしで判定する。
  series.frontal = series.max_deploy_ap <= series.max_hero_atk;

  const isOpen = currentDefense(enemy) < heroAtk;
  if (isOpen && !open.value) {
    const previous = series.starts[series.starts.length - 1];
    if (previous !== undefined) {
      series.periods.push(state.step - previous);
    }
    series.starts.push(state.step);
    series.pp_at_start.push(hero.pp);
  }
  open.value = isOpen;
}

// 1シーン分の観測子。playScene へ渡す。
export function windowObserver(series: WindowSeries): (state: BattleState) => void {
  const open = { value: false };
  return (state) => observeWindow(series, state, open);
}
