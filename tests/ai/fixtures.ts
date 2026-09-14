// V-TEST-POSITIONS 系のAIテスト用の最小フィクスチャ。実データ（マスタ生成物）に依存せず、
// 各テストが検証したい特徴量・境界値だけを直接指定できるようにする。

import { createBattleState } from '../../src/engine/battle.js';
import { instantiateAction, type InstanceIdCounter } from '../../src/engine/instantiate.js';
import type { ActionMasterRecord, ActionParams } from '../../src/data/types.js';
import { createZeroParamMap } from '../../src/engine/params.js';
import type { StepDeps } from '../../src/engine/pipeline/step.js';
import type { ActionInstance, BattleState, Side, Unit, UnitKind } from '../../src/engine/types.js';
import { referenceProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { decideAction } from '../../src/ai/search.js';

const DEFAULT_PARAMS: ActionParams = {
  def_efficiency: 100,
  target_scope: 'SELF',
  cost_hp: 0,
  cost_vp: 0,
  cost_pp: 0,
  cost_ap: 0,
  step_thought: 0,
  step_startup: 1,
  step_recovery: 0,
  decay_ap: 0,
  is_swap: false,
  summon_id: null,
  deploy_ap: 0,
  gain_vp: 0,
  charge_pp: 0,
  purify_rate: 0,
  give_buff: {},
  range: 0,
  atk: 0,
  dmg_hp: 0,
  dmg_vp: 0,
  dmg_pp: 0,
  dmg_ap: 0,
  stun: false,
  give_seal: 0,
  give_slip: 0,
  give_debuff: {},
  strip_rate: 0,
  initial_copy_val: 0,
  interfere_pos: 'NONE',
};

export function makeAction(classId: string, params: Partial<ActionParams>, baseUses = 1000): ActionMasterRecord {
  return {
    class_id: classId,
    display_name: classId,
    base_uses: baseUses,
    inheritable: true,
    is_root: false,
    manual_sys_flag: null,
    params: { ...DEFAULT_PARAMS, ...params },
  };
}

export function martialAction(classId: string, params: Partial<ActionParams>): ActionMasterRecord {
  return makeAction(classId, { range: 1, atk: 0, dmg_hp: 100, ...params });
}

// マスタ配列からインスタンス配列を生成する。counter を省略すると 0 から採番する。
export function instantiateAll(
  records: readonly ActionMasterRecord[],
  counter: InstanceIdCounter = { instance_id_seq: 0 },
): ActionInstance[] {
  return records.map((record) => instantiateAction(record, counter));
}

export interface DuelOptions {
  readonly heroMaxHp: number;
  readonly heroActs: readonly ActionMasterRecord[];
  readonly enemyMaxHp: number;
  readonly enemyActs: readonly ActionMasterRecord[];
  readonly sceneLevel?: number;
}

// [M-FIELD-PLACEMENT] 1v1（クリーチャー不在）の最小バトルステートを生成する。
export function createDuel(options: DuelOptions): BattleState {
  const counter: InstanceIdCounter = { instance_id_seq: 0 };
  const heroActs = instantiateAll(options.heroActs, counter);
  const enemyActs = instantiateAll(options.enemyActs, counter);
  return createBattleState({
    sceneLevel: options.sceneLevel ?? 3,
    heroMaxHp: options.heroMaxHp,
    heroActs,
    enemyRecord: {
      enemy_id: 'ENEMY_TEST',
      display_name: 'テスト用敵',
      role_name: null,
      max_hp: options.enemyMaxHp,
      acts: options.enemyActs.map((a) => a.class_id),
      ai_profile_id: null,
      book_id: null,
      fixed_cycle: null,
      audit_exempt: true,
    },
    enemyActs,
    instanceIdSeq: counter.instance_id_seq,
  });
}

export const NO_SUMMON_DEPS: StepDeps = {
  createCreature: () => {
    throw new Error('この局面では召喚は発生しない');
  },
};

export function findUnit(state: BattleState, side: Side, kind: UnitKind = 'MASTER'): Unit {
  const unit = state.units.find((u): u is Unit => u !== null && u.side === side && u.unit_kind === kind);
  if (unit === undefined) {
    throw new Error(`ユニットが見つからない: ${side} ${kind}`);
  }
  return unit;
}

export function actionOf(unit: Unit, classId: string): ActionInstance {
  const action = unit.acts.find((a) => a.master_ref === classId);
  if (action === undefined) {
    throw new Error(`アクションが見つからない: ${unit.unit_id} ${classId}`);
  }
  return action;
}

function rememberAction(unit: Unit, action: ActionInstance): void {
  unit.last_act = {
    instance_id: action.instance_id,
    class_id: action.master_ref,
    sys_flags: action.sys_flags,
    params: action.base_params,
    uses_left_before: action.uses_left,
    is_copy: action.is_copy,
  };
}

// 発生中（経過 elapsed）のユニットとして局面を組む。コスト消費・回数減算は局面の前提として省く。
export function setStartup(unit: Unit, classId: string, elapsed: number): void {
  rememberAction(unit, actionOf(unit, classId));
  unit.state = 'STARTUP';
  unit.elapsed_startup = elapsed;
}

// 硬直中（適用硬直 applied・経過 elapsed）のユニットとして局面を組む。
export function setRecovery(unit: Unit, classId: string, applied: number, elapsed: number): void {
  rememberAction(unit, actionOf(unit, classId));
  unit.state = 'RECOVERY';
  unit.applied_recovery = applied;
  unit.elapsed_recovery = elapsed;
}

export interface UnitOptions {
  readonly side: Side;
  readonly kind: UnitKind;
  readonly pos: number;
  readonly maxHp: number;
  readonly acts: readonly ActionMasterRecord[];
  readonly counter: InstanceIdCounter;
}

// [M-FIELD-GRID] 任意のマスにユニットを置く（クリーチャーの配置、後列マスターの局面に用いる）。
export function placeUnit(state: BattleState, options: UnitOptions): Unit {
  const unit: Unit = {
    unit_id: `U${String(state.unit_id_seq).padStart(4, '0')}`,
    side: options.side,
    unit_kind: options.kind,
    pos_idx: options.pos,
    hp: options.maxHp,
    max_hp: options.maxHp,
    vp: 0,
    pp: 0,
    ap: 0,
    state: 'THOUGHT',
    elapsed_thought: 0,
    elapsed_startup: 0,
    elapsed_recovery: 0,
    acts: instantiateAll(options.acts, options.counter),
    slip: 0,
    buff: createZeroParamMap(),
    debuff: createZeroParamMap(),
    last_act: null,
    applied_recovery: 0,
  };
  state.unit_id_seq += 1;
  state.units[options.pos] = unit;
  return unit;
}

// ユニットを空きマスへ移す（マスターを後列へ置く局面に用いる）。
export function moveUnit(state: BattleState, unit: Unit, pos: number): void {
  state.units[unit.pos_idx] = null;
  unit.pos_idx = pos;
  state.units[pos] = unit;
}

// V-TEST-POSITIONS の期待手の判定に用いる。PASS は 'PASS'、それ以外は選ばれた class_id。
export function chosenClassId(
  state: BattleState,
  unit: Unit,
  prof: EffectiveProfile = referenceProfile(),
  deps: StepDeps = NO_SUMMON_DEPS,
): string {
  const decision = decideAction(state, unit, prof, deps);
  if (decision.kind === 'PASS') {
    return 'PASS';
  }
  const action = unit.acts.find((a) => a.instance_id === decision.instanceId);
  if (action === undefined) {
    throw new Error(`決定されたインスタンスが見つからない: ${decision.instanceId}`);
  }
  return action.master_ref;
}

// [M-RESOLVE-SUMMON] 召喚を伴う局面用のクリーチャー生成。creatureId ごとの最大HP・所持アクションを与える。
export function creatureFactory(
  state: BattleState,
  specs: Readonly<Record<string, { readonly maxHp: number; readonly acts: readonly ActionMasterRecord[] }>>,
): StepDeps {
  const counter: InstanceIdCounter = { instance_id_seq: 9000 };
  return {
    createCreature: (creatureId, posIdx, side) => {
      const spec = specs[creatureId];
      if (spec === undefined) {
        throw new Error(`未知のクリーチャー: ${creatureId}`);
      }
      const probe: BattleState = { ...state, units: [null, null, null, null] };
      return placeUnit(probe, { side, kind: 'CREATURE', pos: posIdx, maxHp: spec.maxHp, acts: spec.acts, counter });
    },
  };
}
