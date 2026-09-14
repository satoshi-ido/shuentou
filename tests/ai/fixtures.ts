// V-TEST-POSITIONS 系のAIテスト用の最小フィクスチャ。実データ（マスタ生成物）に依存せず、
// 各テストが検証したい特徴量・境界値だけを直接指定できるようにする。

import { createBattleState } from '../../src/engine/battle.js';
import { instantiateAction, type InstanceIdCounter } from '../../src/engine/instantiate.js';
import type { ActionMasterRecord, ActionParams } from '../../src/data/types.js';
import type { ActionInstance, BattleState } from '../../src/engine/types.js';

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
  });
}
