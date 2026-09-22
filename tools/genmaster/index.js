#!/usr/bin/env node
// [I-PLAN-MASTERGEN]
// `pnpm gen:master` のエントリポイント。範囲は [I-PLAN-MILESTONE] M5（全30シーン＋終局5-11）。

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTENDANTS } from './authoring/attendants.js';
import { BOOKS } from './authoring/books.js';
import { ENEMIES } from './authoring/enemies.js';
import { AI_PROFILES } from './authoring/profiles.js';
import { ASSETS } from './authoring/assets.js';
import { HELPS } from './authoring/helps.js';
import { STRINGS } from './authoring/strings.js';
import { SCENES } from './authoring/scenes.js';
import { SCRIPTS } from './authoring/scripts.js';
import {
  buildAttendantRecords,
  buildAiProfileRecords,
  buildAssetRecords,
  buildBookRecord,
  buildHelpRecords,
  buildScriptRecords,
  buildStringRecords,
  buildSceneRecords,
  formatArSuffix,
  generateHeroInitActions,
  mergeActionRecords,
} from './lib.js';
import { expandCreature, expandEnemyTemplate } from './templates.js';

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

// [M-DATA-CREATUREID] 接頭辞 CREATURE_。召喚アクションの ar_summon 帯ごとに造形〈眷属〉を作り分け、
// 同一レコードを複数の召喚アクションから参照する。
function creatureIdOf(arSummonTenths) {
  return `CREATURE_THRALL_${formatArSuffix(arSummonTenths)}`;
}

function main() {
  const actionGroups = [];
  const enemyMasters = {};
  const creatureMasters = {};
  const templatesByEnemy = {};
  // 召喚アクションが参照する ar_summon 帯。決定論のため昇順の一意集合として扱う（[I-STATE-JSON]）。
  const summonBands = [];

  const summonIdOf = (arTenths) => {
    if (!summonBands.includes(arTenths)) {
      summonBands.push(arTenths);
    }
    return creatureIdOf(arTenths);
  };

  for (const entry of ENEMIES) {
    const scene = sceneById(entry.scene_id);
    const { rows, records, acts } = expandEnemyTemplate(entry, scene.level, summonIdOf);
    actionGroups.push(records);
    templatesByEnemy[entry.enemy_id] = rows;
    enemyMasters[entry.enemy_id] = {
      enemy_id: entry.enemy_id,
      display_name: entry.display_name,
      role_name: entry.role_name,
      max_hp: entry.max_hp,
      acts,
      ai_profile_id: entry.ai_profile_id,
      book_id: entry.book_id,
      // [M-DATA-ENEMYMASTER] fixed_cycle は ai_profile_id が Null のときのみ非 Null。
      fixed_cycle: entry.ai_profile_id === null ? acts : null,
      audit_exempt: entry.audit_exempt ?? false,
    };
  }

  for (const arTenths of [...summonBands].sort((left, right) => left - right)) {
    const creature = expandCreature(creatureIdOf(arTenths), '眷属', arTenths);
    creatureMasters[creature.record.creature_id] = creature.record;
    actionGroups.push(creature.records);
  }

  const heroInit = generateHeroInitActions();
  actionGroups.push(heroInit.records);

  writeGenerated('action-masters.ts', serializeRecordMap('ACTION_MASTERS', 'ActionMasterRecord', mergeActionRecords(actionGroups)));
  writeGenerated('enemy-masters.ts', serializeRecordMap('ENEMY_MASTERS', 'EnemyMasterRecord', enemyMasters));
  writeGenerated('creature-masters.ts', serializeRecordMap('CREATURE_MASTERS', 'CreatureMasterRecord', creatureMasters));
  writeGenerated('scene-masters.ts', serializeRecordMap('SCENE_MASTERS', 'SceneMasterRecord', buildSceneRecords(SCENES)));
  writeGenerated(
    'attendant-masters.ts',
    serializeRecordMap('ATTENDANT_MASTERS', 'AttendantMasterRecord', buildAttendantRecords(ATTENDANTS)),
  );
  writeGenerated('hero-init.ts', serializeHeroInit(heroInit.order));

  // [M-INHERIT-POOL]［壁割り手段の常設］担当表は authoring の breaker 枠から導く。
  const breakers = [];
  for (const entry of ENEMIES) {
    for (const special of entry.specials ?? []) {
      if (special.breaker !== undefined) {
        breakers.push({ class_id: special.class_id, order: sceneById(entry.scene_id).order });
      }
    }
  }
  breakers.sort((left, right) => left.order - right.order);
  writeGenerated(
    'breaker-masters.ts',
    `import type { BreakerRecord } from '../types.js';\n\n` +
      `export const BREAKERS = ${JSON.stringify(breakers, null, 2)} as const satisfies readonly BreakerRecord[];\n`,
  );

  // [A-BOOK-SCHEMA] セレクタを参照元の敵マスターの構成テンプレートに照合して class_id へ展開する。
  const bookMasters = {};
  for (const book of BOOKS) {
    const template = templatesByEnemy[book.enemy_id];
    if (template === undefined) {
      throw new Error(`定跡 ${book.book_id} の参照元テンプレートが未定義: ${book.enemy_id}`);
    }
    bookMasters[book.book_id] = buildBookRecord(book, template);
  }
  writeGenerated('book-masters.ts', serializeRecordMap('BOOK_MASTERS', 'BookMasterRecord', bookMasters));

  // [M-DATA-STRINGMASTER]・[M-DATA-HELPMASTER]・[M-DATA-ASSETMASTER]。本文は [I-PLAN-TEXT] のプレースホルダ。
  writeGenerated('string-masters.ts', serializeRecordMap('STRING_MASTERS', 'StringMasterRecord', buildStringRecords(STRINGS)));
  writeGenerated('help-masters.ts', serializeRecordMap('HELP_MASTERS', 'HelpMasterRecord', buildHelpRecords(HELPS)));
  writeGenerated('asset-masters.ts', serializeRecordMap('ASSET_MASTERS', 'AssetMasterRecord', buildAssetRecords(ASSETS)));

  // [S-SCRIPT-SCHEMA]・[S-SCRIPT-RECORDS]。本文は [I-PLAN-TEXT] のプレースホルダ。
  writeGenerated(
    'script-masters.ts',
    serializeRecordMap('SCRIPT_MASTERS', 'ScriptMasterRecord', buildScriptRecords(SCRIPTS, SCENES)),
  );

  // [A-PROFILE-SCHEMA] AIプロファイルマスタ。
  writeGenerated(
    'ai-profile-masters.ts',
    serializeRecordMap('AI_PROFILE_MASTERS', 'AiProfileRecord', buildAiProfileRecords(AI_PROFILES)),
  );
}

main();
