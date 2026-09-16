// [M-FIELD-PLACEMENT] [I-STATE-ID] バトル開始時（ステップ0）の配置。
// [M-FIELD-GRID] 横4マス × 1列。idx: 0=自軍後列, 1=自軍前列, 2=敵軍前列, 3=敵軍後列。

import type { EnemyMasterRecord } from '../data/types.js';
import { createZeroParamMap } from './params.js';
import type { ActionInstance, BattleState, Side, Unit, UnitKind } from './types.js';

// [I-STATE-ID] U + 4桁ゼロ詰め連番。採番位置は [M-STATE-BATTLESTATE] の unit_id_seq が保持する。
export function allocateUnitId(state: Pick<BattleState, 'unit_id_seq'>): string {
  const id = `U${String(state.unit_id_seq).padStart(4, '0')}`;
  state.unit_id_seq += 1;
  return id;
}

export function createUnit(
  unitId: string,
  side: Side,
  unitKind: UnitKind,
  posIdx: number,
  maxHp: number,
  hp: number,
  acts: ActionInstance[],
): Unit {
  return {
    unit_id: unitId,
    side,
    unit_kind: unitKind,
    pos_idx: posIdx,
    hp,
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
  readonly heroHp?: number;
  readonly heroActs: ActionInstance[];
  readonly enemyRecord: EnemyMasterRecord;
  readonly enemyActs: ActionInstance[];
  // 主人公・敵マスターの実体化を終えた時点の採番位置（[M-STATE-RUNSTATE]［主人公ステートの正本］）。
  readonly instanceIdSeq: number;
}

// [M-STATE-BATTLESTATE] 初期生成（ステップ0）。クリーチャーは不在。
export function createBattleState(options: CreateBattleOptions): BattleState {
  const state: BattleState = {
    step: 0,
    scene_level: options.sceneLevel,
    units: [null, null, null, null],
    unit_id_seq: 0,
    instance_id_seq: options.instanceIdSeq,
    instant_used: {},
    watching: {},
    watch_prev_met: {},
    pause_reason: null,
    book_index: 0,
    book_aborted: false,
    book_wait_elapsed: null,
    ai_reuse: {},
  };
  const heroHp = options.heroHp ?? options.heroMaxHp;
  state.units[1] = createUnit(allocateUnitId(state), 'MINE', 'MASTER', 1, options.heroMaxHp, heroHp, options.heroActs);
  const enemyMaxHp = options.enemyRecord.max_hp;
  state.units[2] = createUnit(allocateUnitId(state), 'FOE', 'MASTER', 2, enemyMaxHp, enemyMaxHp, options.enemyActs);
  return state;
}

export function unitAt(state: BattleState, posIdx: number): Unit | null {
  return state.units[posIdx] ?? null;
}

export function livingUnits(state: BattleState): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.state !== 'PENDING_DISCARD');
}
