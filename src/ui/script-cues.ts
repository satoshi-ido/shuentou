// [S-SCRIPT-TRIGGER]【バトル中の契機】BATTLE_CUE の成立判定と再生済みの管理。
// 再生済みかどうかは BattleState に含めず、表示側で1回のバトル（ステップ0の生成から決着まで）に1度に限る。
// アンドゥ・ロールバックで同じ契機を再び通過した場合は再生するため、再生したステップを控え、
// 巻き戻した先のステップより後に再生したものを未再生へ戻す。

import type { ScriptMasterRecord } from '../data/types.js';
import type { BattleState, Unit } from '../engine/types.js';

export type BattleCueKind = 'ENEMY_FIRST_ACT' | 'ENEMY_HP_HALF';

function enemyMaster(state: BattleState): Unit | undefined {
  return state.units.find((unit): unit is Unit => unit !== null && unit.side === 'FOE' && unit.unit_kind === 'MASTER');
}

// ENEMY_FIRST_ACT：敵マスターが通常アクションの発生中へ遷移した、または即時型アクションを決済した。
// いずれも直前アクション記憶（[M-STATE-LASTACTION]）が記録される契機である。
// ENEMY_HP_HALF：敵マスターの現在HPが最大HPの半分以下となった。
export function cueSatisfied(state: BattleState, kind: BattleCueKind): boolean {
  const enemy = enemyMaster(state);
  if (enemy === undefined) {
    // 撃破されて盤面から除かれた後は、いずれの契機も成立済みとみなす。
    return true;
  }
  return kind === 'ENEMY_FIRST_ACT' ? enemy.last_act !== null : enemy.hp * 2 <= enemy.max_hp;
}

function cueKindOf(anchor: string): BattleCueKind {
  const kind = anchor.split(':')[1];
  if (kind !== 'ENEMY_FIRST_ACT' && kind !== 'ENEMY_HP_HALF') {
    throw new Error(`未知のバトル中の契機: ${anchor}`);
  }
  return kind;
}

export class BattleCueTracker {
  private played: { readonly anchor: string; readonly step: number }[] = [];

  // ステップ0の生成（バトル開始・バトル開始時ロールバック・ロード）で呼ぶ。
  reset(): void {
    this.played = [];
  }

  // アンドゥで巻き戻した後に呼ぶ。巻き戻した先より後に再生した契機を未再生へ戻す。
  rewindTo(step: number): void {
    this.played = this.played.filter((entry) => entry.step <= step);
  }

  // 当該シーンの契機のうち、未再生で成立しているものの anchor を返し、再生済みとして控える。
  take(state: BattleState, sceneId: string, scripts: Readonly<Record<string, ScriptMasterRecord>>): string[] {
    const anchors = [
      ...new Set(
        Object.values(scripts)
          .filter((record) => record.trigger === 'BATTLE_CUE' && record.anchor?.startsWith(`${sceneId}:`) === true)
          .map((record) => record.anchor ?? ''),
      ),
    ].sort();
    const due = anchors.filter(
      (anchor) => !this.played.some((entry) => entry.anchor === anchor) && cueSatisfied(state, cueKindOf(anchor)),
    );
    for (const anchor of due) {
      this.played.push({ anchor, step: state.step });
    }
    return due;
  }
}
