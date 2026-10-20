#!/usr/bin/env node
// [I-PLAN-MASTERGEN]
// `pnpm gen:master` のエントリポイント。範囲は [I-PLAN-MILESTONE] M5（全30シーン＋終局5-11）。

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_DESCRIPTIONS, KIND_DESCRIPTIONS } from './authoring/action-descriptions.js';
import { ATTENDANTS } from './authoring/attendants.js';
import { CREATURE_FORMS } from './authoring/creatures.js';
import { BOOKS } from './authoring/books.js';
import { ECHOES } from './authoring/echoes.js';
import { ENEMIES } from './authoring/enemies.js';
import { AI_PROFILES } from './authoring/profiles.js';
import { ASSETS } from './authoring/assets.js';
import { HELPS } from './authoring/helps.js';
import { STRINGS } from './authoring/strings.js';
import { SCENES } from './authoring/scenes.js';
import { SCRIPTS } from './authoring/scripts.js';
import {
  applyActionDescriptions,
  buildAttendantRecords,
  buildAiProfileRecords,
  buildAssetRecords,
  buildBookRecord,
  buildEchoRecords,
  buildHelpRecords,
  buildScriptRecords,
  buildStringRecords,
  buildSceneRecords,
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

// [M-DATA-CREATUREID]【レコード一覧】敵マスターの召喚の帯（ARの昇順）に、シーンの造形の creature_id を割り当てる。
// 帯の数と造形の数が一致しない入力を棄却する。
function creatureFormsOf(entry, level) {
  const bands = [];
  expandEnemyTemplate(entry, level, (arTenths) => {
    if (!bands.includes(arTenths)) {
      bands.push(arTenths);
    }
    return 'CREATURE_PENDING';
  });
  if (bands.length === 0) {
    return [];
  }
  const forms = CREATURE_FORMS[entry.scene_id];
  bands.sort((left, right) => left - right);
  if (forms === undefined || forms.ids.length !== bands.length) {
    throw new Error(`クリーチャーの造形の数が召喚の帯の数と一致しない: ${entry.scene_id}（帯 ${bands.length}）`);
  }
  return bands.map((arTenths, index) => ({ arTenths, creatureId: forms.ids[index], displayName: forms.names[index] }));
}

function main() {
  const actionGroups = [];
  const enemyMasters = {};
  const creatureMasters = {};
  const templatesByEnemy = {};
  // 召喚が呼ぶクリーチャー（シーンの造形と ar_summon）。シーンの順に並ぶ。
  const creatures = [];

  for (const entry of ENEMIES) {
    const scene = sceneById(entry.scene_id);
    const forms = creatureFormsOf(entry, scene.level);
    creatures.push(...forms);
    const summonIdOf = (arTenths) => {
      const form = forms.find((candidate) => candidate.arTenths === arTenths);
      if (form === undefined) {
        throw new Error(`召喚の帯に造形が無い: ${entry.scene_id} AR ${arTenths}`);
      }
      return form.creatureId;
    };
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

  for (const form of creatures) {
    const creature = expandCreature(form.creatureId, form.displayName, form.arTenths);
    creatureMasters[creature.record.creature_id] = creature.record;
    actionGroups.push(creature.records);
  }

  const heroInit = generateHeroInitActions();
  actionGroups.push(heroInit.records);

  writeGenerated(
    'action-masters.ts',
    serializeRecordMap(
      'ACTION_MASTERS',
      'ActionMasterRecord',
      applyActionDescriptions(mergeActionRecords(actionGroups), KIND_DESCRIPTIONS, ACTION_DESCRIPTIONS),
    ),
  );
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
  const scriptRecords = buildScriptRecords(SCRIPTS, SCENES);
  writeGenerated('script-masters.ts', serializeRecordMap('SCRIPT_MASTERS', 'ScriptMasterRecord', scriptRecords));

  // [S-ECHO-SCHEMA] 残響マスタ。
  writeGenerated('echo-masters.ts', serializeRecordMap('ECHO_MASTERS', 'EchoMasterRecord', buildEchoRecords(ECHOES, scriptRecords)));

  // [A-PROFILE-SCHEMA] AIプロファイルマスタ。
  writeGenerated(
    'ai-profile-masters.ts',
    serializeRecordMap('AI_PROFILE_MASTERS', 'AiProfileRecord', buildAiProfileRecords(AI_PROFILES)),
  );
}

main();
