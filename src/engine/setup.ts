// シーン開始処理の組み立て（[M-FIELD-PLACEMENT] [M-DATA-INSTANTIATE]）。
// RunState を介さずに単独のバトルを生成する検証用の入口。進行を伴う開始は run/battle-start.ts による。

import { createBattleState } from './battle.js';
import { instantiateActionList, type InstanceIdCounter } from './instantiate.js';
import type { BattleState } from './types.js';
import type { ActionMasterRecord, EnemyMasterRecord } from '../data/types.js';

export interface CreateSceneOptions {
  readonly sceneLevel: number;
  readonly heroMaxHp: number;
  readonly heroActionOrder: readonly string[];
  readonly enemyRecord: EnemyMasterRecord;
  readonly actionMasters: Readonly<Record<string, ActionMasterRecord>>;
}

// 採番はニューゲーム時と同じく 0 から、主人公→敵の経路順に行う（[I-STATE-ID]）。
export function createScene(options: CreateSceneOptions): BattleState {
  const counter: InstanceIdCounter = { instance_id_seq: 0 };
  const heroActs = instantiateActionList(options.heroActionOrder, options.actionMasters, counter);
  const enemyActs = instantiateActionList(options.enemyRecord.acts, options.actionMasters, counter);
  return createBattleState({
    sceneLevel: options.sceneLevel,
    heroMaxHp: options.heroMaxHp,
    heroActs,
    enemyRecord: options.enemyRecord,
    enemyActs,
  });
}
