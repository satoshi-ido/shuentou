// シーン開始処理の組み立て（[M-FIELD-PLACEMENT] [M-DATA-INSTANTIATE]）。
// M1 時点では 1-01（[V-NUM-PARAMS]）専用のヘルパのみを提供する。RunState（[M-STATE-RUNSTATE]）
// は未実装のため、主人公の初期HP・所持アクションは呼び出し側が [M-DATA-HERO-INIT] 相当のデータを
// 直接渡す。

import { resetUnitIdSeq, createBattleState } from './battle.js';
import { resetInstanceIdSeq, instantiateActionList } from './instantiate.js';
import type { BattleState } from './types.js';
import type { ActionMasterRecord, EnemyMasterRecord } from '../data/types.js';

export interface CreateSceneOptions {
  readonly sceneLevel: number;
  readonly heroMaxHp: number;
  readonly heroActionOrder: readonly string[];
  readonly enemyRecord: EnemyMasterRecord;
  readonly actionMasters: Readonly<Record<string, ActionMasterRecord>>;
}

// 採番カウンタをシーン開始時点にリセットする（[I-STATE-ID]）。同一操作列の再走で同一IDを再現するため、
// テストや将来の RunState 実装からも本関数経由でシーンを開始することを前提とする。
export function createScene(options: CreateSceneOptions): BattleState {
  resetUnitIdSeq(0);
  resetInstanceIdSeq(0);
  const heroActs = instantiateActionList(options.heroActionOrder, options.actionMasters);
  const enemyActs = instantiateActionList(options.enemyRecord.acts, options.actionMasters);
  return createBattleState({
    sceneLevel: options.sceneLevel,
    heroMaxHp: options.heroMaxHp,
    heroActs,
    enemyRecord: options.enemyRecord,
    enemyActs,
  });
}
