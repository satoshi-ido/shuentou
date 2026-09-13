// [I-PLAN-MASTERGEN]
// `pnpm gen:master` のエントリポイント。M0 の範囲は 1-01 の敵マスターおよび
// 主人公初期キット（[M-DATA-HERO-INIT]）に限る（[I-PLAN-MASTERGEN]［M0 の範囲］）。

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateEnemyLef, generateHeroInitActions, mergeActionRecords } from './lib.js';

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

function serializeActionMasters(record) {
  const body = sortedEntries(record)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')},`)
    .join('\n');
  return (
    "import type { ActionMasterRecord } from '../types.js';\n\n" +
    `export const ACTION_MASTERS = {\n${body}\n} as const satisfies Record<string, ActionMasterRecord>;\n`
  );
}

function serializeEnemyMasters(record) {
  const body = sortedEntries(record)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')},`)
    .join('\n');
  return (
    "import type { EnemyMasterRecord } from '../types.js';\n\n" +
    `export const ENEMY_MASTERS = {\n${body}\n} as const satisfies Record<string, EnemyMasterRecord>;\n`
  );
}

function serializeHeroInit(order) {
  return `export const HERO_INIT_ACTIONS = ${JSON.stringify(order, null, 2)} as const satisfies readonly string[];\n`;
}

function main() {
  const level = 3; // [M-DATA-SCENES] 1-01
  const maxHp = 10; // [M-DATA-SCENES] 1-01
  const lef = generateEnemyLef(level, maxHp);
  const heroInit = generateHeroInitActions();

  const actionMasters = mergeActionRecords([lef.actions, heroInit.records]);
  const enemyMasters = { [lef.record.enemy_id]: lef.record };

  writeGenerated('action-masters.ts', serializeActionMasters(actionMasters));
  writeGenerated('enemy-masters.ts', serializeEnemyMasters(enemyMasters));
  writeGenerated('hero-init.ts', serializeHeroInit(heroInit.order));
}

main();
