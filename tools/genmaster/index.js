// [I-PLAN-MASTERGEN]
// `pnpm gen:master` のエントリポイント。範囲は [I-PLAN-MASTERGEN]［M0 の範囲］および
// [I-PLAN-MILESTONE]［M3 のマスタ範囲］に従う。

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTENDANTS } from './authoring/attendants.js';
import { BOOKS } from './authoring/books.js';
import { AI_PROFILES } from './authoring/profiles.js';
import { SCENES } from './authoring/scenes.js';
import {
  buildAttendantRecords,
  buildAiProfileRecords,
  buildBookRecord,
  buildSceneRecords,
  enemyDornTemplate,
  enemyLefTemplate,
  generateEnemyDorn,
  generateEnemyLef,
  generateHeroInitActions,
  mergeActionRecords,
} from './lib.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'src', 'data', 'generated');

const HEADER = '// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。\n// 生成後のファイルを人が編集しない。\n';

function writeGenerated(fileName, content) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, fileName), `${HEADER}${content}`, 'utf8');
}

function sortedEntries(record) {
  return Object.keys(record)
    .sort()
    .map((key) => [key, record[key]]);
}

function serializeRecordMap(constName, typeName, record) {
  const body = sortedEntries(record)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')},`)
    .join('\n');
  return (
    `import type { ${typeName} } from '../types.js';\n\n` +
    `export const ${constName} = {\n${body}\n} as const satisfies Record<string, ${typeName}>;\n`
  );
}

function serializeHeroInit(order) {
  // [M-DATA-HERO-INIT]［ユニット定義］表示名・役割名・最大HP。
  const unit = { display_name: 'セイン', role_name: 'マスター', max_hp: 60 };
  return (
    `export const HERO_INIT_ACTIONS = ${JSON.stringify(order, null, 2)} as const satisfies readonly string[];

` +
    `export const HERO_INIT_UNIT = ${JSON.stringify(unit, null, 2)} as const;
`
  );
}

function sceneById(sceneId) {
  const scene = SCENES.find((entry) => entry.scene_id === sceneId);
  if (scene === undefined) {
    throw new Error(`未知のシーンID: ${sceneId}`);
  }
  return scene;
}

function main() {
  // 敵マスター HP は [M-DATA-SCENES] の「敵マスター HP」列による。
  const lef = generateEnemyLef(sceneById('SCENE_1_01').level, 10);
  const dorn = generateEnemyDorn(sceneById('SCENE_1_02').level, 27);
  const heroInit = generateHeroInitActions();

  const actionMasters = mergeActionRecords([lef.actions, dorn.actions, heroInit.records]);
  const enemyMasters = { [lef.record.enemy_id]: lef.record, [dorn.record.enemy_id]: dorn.record };

  writeGenerated('action-masters.ts', serializeRecordMap('ACTION_MASTERS', 'ActionMasterRecord', actionMasters));
  writeGenerated('enemy-masters.ts', serializeRecordMap('ENEMY_MASTERS', 'EnemyMasterRecord', enemyMasters));
  writeGenerated('scene-masters.ts', serializeRecordMap('SCENE_MASTERS', 'SceneMasterRecord', buildSceneRecords(SCENES)));
  writeGenerated(
    'attendant-masters.ts',
    serializeRecordMap('ATTENDANT_MASTERS', 'AttendantMasterRecord', buildAttendantRecords(ATTENDANTS)),
  );
  writeGenerated('hero-init.ts', serializeHeroInit(heroInit.order));

  // [A-BOOK-SCHEMA] 定跡マスタ。範囲は B-01（1-01 祠守レフ）・B-02（1-02 辺境伯ドルン）に限る。
  const templates = {
    ENEMY_LEF: enemyLefTemplate(sceneById('SCENE_1_01').level),
    ENEMY_DORN: enemyDornTemplate(sceneById('SCENE_1_02').level),
  };
  const bookMasters = {};
  for (const book of BOOKS) {
    const template = templates[book.enemy_id];
    if (template === undefined) {
      throw new Error(`定跡 ${book.book_id} の参照元テンプレートが未定義: ${book.enemy_id}`);
    }
    bookMasters[book.book_id] = buildBookRecord(book, template);
  }
  writeGenerated('book-masters.ts', serializeRecordMap('BOOK_MASTERS', 'BookMasterRecord', bookMasters));

  // [A-PROFILE-SCHEMA] AIプロファイルマスタ。範囲は 1-01・1-02 の敵マスターが参照する2件に限る。
  writeGenerated(
    'ai-profile-masters.ts',
    serializeRecordMap('AI_PROFILE_MASTERS', 'AiProfileRecord', buildAiProfileRecords(AI_PROFILES)),
  );
}

main();
