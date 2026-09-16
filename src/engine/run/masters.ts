// [I-STATE-JSON]［マスタレコードの実体を含めない］ステートが保持するレコードキーを解決する参照関数群。

import type {
  ActionMasterRecord,
  BookMasterRecord,
  BreakerRecord,
  AttendantMasterRecord,
  CreatureMasterRecord,
  EnemyMasterRecord,
  SceneMasterRecord,
} from '../../data/types.js';

export interface GameMasters {
  readonly actions: Readonly<Record<string, ActionMasterRecord>>;
  readonly enemies: Readonly<Record<string, EnemyMasterRecord>>;
  readonly scenes: Readonly<Record<string, SceneMasterRecord>>;
  readonly books: Readonly<Record<string, BookMasterRecord>>;
  // [M-INHERIT-POOL]［壁割り手段の常設］担当シーンの進行順で昇順。
  readonly breakers: readonly BreakerRecord[];
  readonly creatures: Readonly<Record<string, CreatureMasterRecord>>;
  readonly attendants: Readonly<Record<string, AttendantMasterRecord>>;
  readonly heroInitActions: readonly string[];
  // 辞書型ステートの要素集合。[M-STATE-RUNSTATE] cross_unlocked は交差残響マスタの cross_id、
  // [M-META-COUNTERS] echo_unlocked は残響マスタの echo_id、help_seen は解説マスタの help_id の全件。
  readonly crossIds: readonly string[];
  readonly echoIds: readonly string[];
  readonly helpIds: readonly string[];
}

function lookup<T>(table: Readonly<Record<string, T>>, key: string, label: string): T {
  const record = table[key];
  if (record === undefined) {
    throw new Error(`未知の${label}: ${key}`);
  }
  return record;
}

export function sceneOf(masters: GameMasters, sceneId: string): SceneMasterRecord {
  return lookup(masters.scenes, sceneId, 'シーンID');
}

export function sceneByOrder(masters: GameMasters, order: number): SceneMasterRecord {
  const scene = Object.values(masters.scenes).find((record) => record.order === order);
  if (scene === undefined) {
    throw new Error(`未知の進行順: ${order}`);
  }
  return scene;
}

export function enemyOf(masters: GameMasters, enemyId: string): EnemyMasterRecord {
  return lookup(masters.enemies, enemyId, '敵マスターID');
}

export function actionOf(masters: GameMasters, classId: string): ActionMasterRecord {
  return lookup(masters.actions, classId, 'アクションクラスID');
}

export function bookOf(masters: GameMasters, bookId: string): BookMasterRecord {
  return lookup(masters.books, bookId, '定跡ID');
}

export function attendantOf(masters: GameMasters, attendantId: string): AttendantMasterRecord {
  return lookup(masters.attendants, attendantId, '従者ID');
}
