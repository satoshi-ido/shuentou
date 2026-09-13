// [M-FIELD-PLACEMENT] バトル開始時（ステップ0）の配置。
// [M-FIELD-GRID] 横4マス × 1列。idx: 0=自軍後列, 1=自軍前列, 2=敵軍前列, 3=敵軍後列。

import type { EnemyMasterRecord } from '../data/types.js';
import { createZeroParamMap } from './params.js';
import type { ActionInstance, BattleState, Side, Unit, UnitKind } from './types.js';

let nextUnitIdSeq = 0;

// [I-STATE-ID] U + 4桁ゼロ詰め連番。
export function resetUnitIdSeq(startAt = 0): void {
  nextUnitIdSeq = startAt;
}

function nextUnitId(): string {
  const id = `U${String(nextUnitIdSeq).padStart(4, '0')}`;
  nextUnitIdSeq += 1;
  return id;
}

function createUnit(
  side: Side,
  unitKind: UnitKind,
  posIdx: number,
  maxHp: number,
  acts: ActionInstance[],
): Unit {
  return {
    unit_id: nextUnitId(),
    side,
    unit_kind: unitKind,
    pos_idx: posIdx,
    hp: maxHp,
    max_hp: maxHp,
    vp: 0,
    pp: 0,
    ap: 0,
    state: 'THOUGHT',
    elapsed_thought: 0,
    elapsed_startup: 0,
    elapsed_recovery: 0,
    acts,
    slip: 0,
    buff: createZeroParamMap(),
    debuff: createZeroParamMap(),
    last_act: null,
    applied_recovery: 0,
  };
}

export interface CreateBattleOptions {
  readonly sceneLevel: number;
  readonly heroMaxHp: number;
  readonly heroActs: ActionInstance[];
  readonly enemyRecord: EnemyMasterRecord;
  readonly enemyActs: ActionInstance[];
}

// [M-STATE-BATTLESTATE] 初期生成（ステップ0）。クリーチャーは不在（1-01 は召喚を持たない）。
export function createBattleState(options: CreateBattleOptions): BattleState {
  const hero = createUnit('MINE', 'MASTER', 1, options.heroMaxHp, options.heroActs);
  const enemy = createUnit('FOE', 'MASTER', 2, options.enemyRecord.max_hp, options.enemyActs);
  const units: (Unit | null)[] = [null, hero, enemy, null];
  return {
    step: 0,
    scene_level: options.sceneLevel,
    units,
    unit_id_seq: nextUnitIdSeq,
    instant_used: {},
  };
}

export function unitAt(state: BattleState, posIdx: number): Unit | null {
  return state.units[posIdx] ?? null;
}

export function livingUnits(state: BattleState): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.state !== 'PENDING_DISCARD');
}
