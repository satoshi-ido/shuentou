// [I-PLAN-MASTERGEN] 構成テンプレート（[M-TMPL-ENEMY] 配下・[M-TMPL-CREATURE-PRINCIPLE]）の展開器。
// 各テンプレートの構成リストを1行ずつ、[M-DATA-ENEMYMASTER]［テンプレートとレコードの関係］の
// 手続き（L の代入 → 基準式 → 個別上書き）でアクションマスタのレコードへ変換する。
// 決定論層につき浮動小数演算・除算演算子を用いない（[I-ENV-TOOLING]［禁止事項の検査規則］）。

import { floorDiv } from '../../src/num/helpers.ts';
import {
  blankParams,
  buildRecord,
  classId,
  componentParams,
  creatureMaxHp,
  dmgApBase,
  formatArSuffix,
  martialExtra,
  rootMartialRecord,
  swapSingleRecord,
  USES_BASIC,
  USES_HEAVY,
  USES_SPECIAL,
} from './lib.js';

// [M-TMPL-ENEMY-PRINCIPLE]［敵マスターの基本型所持構成］各テンプレートに共通する基底。
// マスター根源武技は配列末尾に置くため本表に含めない。
const BASE_KIT = [
  ['MIND', 'BASIC', 100],
  ['MIND', 'MUSOU', 100],
  ['MARTIAL', 'BASIC', 100],
  ['MARTIAL', 'HEAVY', 100],
  ['STANCE', 'BASIC', 100],
];

// 各テンプレートの追加枠。特殊枠は人が書く入力（authoring/enemies.js）が与える。
const EXTRA_SLOTS = {
  // [M-TMPL-ENEMY-1-01]
  E1_01: [
    ['MARTIAL', 'BASIC', 200],
    ['STANCE', 'BASIC', 200],
  ],
  // [M-TMPL-ENEMY-1-02]
  E1_02: [
    ['MARTIAL', 'BASIC', 200],
    ['MARTIAL', 'BASIC', 300],
    ['MARTIAL', 'RUSH', 100],
    ['STANCE', 'BASIC', 200],
  ],
  // [M-TMPL-ENEMY-NORMAL]
  NORMAL: [
    ['MARTIAL', 'BASIC', 200],
    ['MARTIAL', 'RUSH', 100],
    ['STANCE', 'BASIC', 200],
    ['SUMMON', 'BASIC', 100],
  ],
  // [M-TMPL-ENEMY-BOSS]
  BOSS: [
    ['MARTIAL', 'BASIC', 200],
    ['MARTIAL', 'BASIC', 300],
    ['MARTIAL', 'RUSH', 100],
    ['MARTIAL', 'RUSH', 300],
    ['MARTIAL', 'HEAVY', 300],
    ['STANCE', 'BASIC', 200],
    ['STANCE', 'BASIC', 300],
    ['SUMMON', 'BASIC', 100],
    ['SUMMON', 'BASIC', 200],
  ],
  // [M-TMPL-ENEMY-MIRROR] 主人公初期キットの構成を倍率で写す。
  MIRROR: [
    ['MARTIAL', 'BASIC', 200],
    ['MARTIAL', 'HEAVY', 500],
    ['STANCE', 'BASIC', 200],
    ['SUMMON', 'BASIC', 100],
  ],
  // [M-TMPL-ENEMY-FINAL]
  FINAL: [
    ['MARTIAL', 'BASIC', 200],
    ['MARTIAL', 'BASIC', 300],
    ['MARTIAL', 'BASIC', 400],
    ['MARTIAL', 'RUSH', 100],
    ['MARTIAL', 'RUSH', 300],
    ['MARTIAL', 'HEAVY', 300],
    ['STANCE', 'BASIC', 200],
    ['STANCE', 'BASIC', 300],
    ['STANCE', 'BASIC', 400],
    ['SUMMON', 'BASIC', 100],
    ['SUMMON', 'BASIC', 200],
    ['SUMMON', 'BASIC', 300],
  ],
};

// [M-DATA-CLASSID]［生成クラスIDの命名］変種名は構成テンプレートの行が指す変種である。
const VARIANT_NAME = {
  'MIND/BASIC': 'MIND',
  'MIND/MUSOU': 'MUSOU',
  'MARTIAL/BASIC': 'SLASH',
  'MARTIAL/RUSH': 'RUSH',
  'MARTIAL/HEAVY': 'HEAVY',
  'STANCE/BASIC': 'GUARD',
  'SUMMON/BASIC': 'SUMMON',
};

const DISPLAY_NAME = {
  'MIND/BASIC': '心気（基本）',
  'MIND/MUSOU': '心気（無想）',
  'MARTIAL/BASIC': '武技（基本）',
  'MARTIAL/RUSH': '武技（急襲）',
  'MARTIAL/HEAVY': '武技（重撃）',
  'STANCE/BASIC': '体勢（基本）',
  'SUMMON/BASIC': '召喚（基本）',
};

// [M-BASE-USES] 基礎使用回数。10回＝単一効果の基本型、3回＝重撃・急襲・無想・召喚（基本）。
const BASE_USES = {
  'MIND/BASIC': USES_BASIC,
  'MIND/MUSOU': USES_HEAVY,
  'MARTIAL/BASIC': USES_BASIC,
  'MARTIAL/RUSH': USES_HEAVY,
  'MARTIAL/HEAVY': USES_HEAVY,
  'STANCE/BASIC': USES_BASIC,
  'SUMMON/BASIC': USES_HEAVY,
};

// 所持アクション配列の並び。追加枠は同変種の基本型の直後に置く（[M-TMPL-ENEMY-1-02] の構成順）。
const VARIANT_ORDER = [
  'MIND/BASIC',
  'MIND/MUSOU',
  'MARTIAL/BASIC',
  'MARTIAL/RUSH',
  'MARTIAL/HEAVY',
  'STANCE/BASIC',
  'SUMMON/BASIC',
];

function variantKey(component, variant) {
  return `${component}/${variant}`;
}

// AR ≒ L * n。arMultCenti は n の centi 表記であり、AR は 1/10 単位の整数で返す。
export function arTenthsOf(level, arMultCenti) {
  const product = level * arMultCenti;
  if (product % 10 !== 0) {
    throw new Error(`AR が 1/10 単位に収まらない: L=${level} × ${arMultCenti}`);
  }
  return floorDiv(product, 10);
}

// AR ≒ ar_summon * n（[M-TMPL-CREATURE-PRINCIPLE]）。基準が 1/10 単位の AR である点が arTenthsOf と異なる。
function scaleArTenths(arTenths, arMultCenti) {
  const product = arTenths * arMultCenti;
  if (product % 100 !== 0) {
    throw new Error(`AR が 1/10 単位に収まらない: AR=${arTenths} × ${arMultCenti}`);
  }
  return floorDiv(product, 100);
}

// [M-BASE-PRINCIPLE] 個別上書き。基礎値が既存レコードと相違する場合に限り所持者キーを付す
// （[M-DATA-CLASSID]［上書きによる分岐］）。相違しない上書きはクラスIDを分岐させない。
function applyOverride(params, override) {
  if (override === undefined) {
    return { params, changed: false };
  }
  const next = { ...params };
  let changed = false;
  for (const key of Object.keys(override)) {
    if (!(key in next)) {
      throw new Error(`未知の上書きキー: ${key}`);
    }
    const value = override[key];
    if (JSON.stringify(next[key]) !== JSON.stringify(value)) {
      changed = true;
    }
    next[key] = value;
  }
  return { params: next, changed };
}

// 基本型の1行を展開する。summonIdOf は SUMMON 行の summon_id を解決する。
function expandBasicRow(row, level, ownerKey, summonIdOf) {
  const [component, variant, arMultCenti, options = {}] = row;
  const key = variantKey(component, variant);
  const arTenths = arTenthsOf(level, arMultCenti);
  const summonId = component === 'SUMMON' ? summonIdOf(arTenths) : null;
  const base = componentParams(key, arTenths, summonId);
  const { params, changed } = applyOverride(base, options.override);
  const baseName = classId(VARIANT_NAME[key], arTenths);
  const classIdValue = changed ? `${baseName}_${ownerKey}` : baseName;
  const baseUses = options.base_uses ?? BASE_USES[key];
  return {
    component,
    variant,
    arMultCenti,
    arTenths,
    classId: classIdValue,
    record: buildRecord(classIdValue, options.display_name ?? DISPLAY_NAME[key], baseUses, true, params),
  };
}

// 特殊型の1行を展開する。[M-BASE-AR-SPECIAL] により基準式の拘束を受けず、
// 下地（base）の算出結果へ、追加パラメータ（extras）・内包コンポーネント（compose）・
// 個別定義（override）を順に重ねた値をそのままレコードとする。
function expandSpecialRow(row, level, summonIdOf) {
  const arTenths = arTenthsOf(level, row.ar_mult);
  const summonId = row.base === 'SUMMON/BASIC' ? summonIdOf(arTenths) : null;
  let base = row.blank === true ? blankParams() : componentParams(row.base, arTenths, summonId);
  for (const key of row.extras ?? []) {
    base = { ...base, [key]: martialExtra(row.base, arTenths, key) };
  }
  if (row.compose !== undefined) {
    // [M-BASE-AR-COMPOSITE] 内包する各コンポーネントのパラメータ基礎値を個別に取り込む。
    const other = componentParams(row.compose.from, arTenths, null);
    for (const key of row.compose.keys) {
      base = { ...base, [key]: other[key] };
    }
  }
  const { params } = applyOverride(base, row.override);
  return {
    component: row.component,
    variant: 'SPECIAL',
    arMultCenti: row.ar_mult,
    arTenths,
    classId: row.class_id,
    record: buildRecord(
      row.class_id,
      row.display_name,
      row.base_uses ?? USES_SPECIAL,
      row.inheritable ?? true,
      params,
      row.manual_sys_flag ?? null,
    ),
  };
}

function sortBasicRows(rows) {
  return [...rows].sort((left, right) => {
    const leftKey = VARIANT_ORDER.indexOf(variantKey(left.component, left.variant));
    const rightKey = VARIANT_ORDER.indexOf(variantKey(right.component, right.variant));
    if (leftKey !== rightKey) {
      return leftKey - rightKey;
    }
    return left.arTenths - right.arTenths;
  });
}

// [M-TMPL-VESSEL]［所持アクション］2件を交互に固定周期で実行する終端オブジェクト。
// 基準式の拘束を受けず、本項の掲載値をそのままレコードとする。
function expandVessel() {
  const refuseParams = blankParams();
  refuseParams.step_startup = 1;
  refuseParams.step_recovery = 1;
  refuseParams.range = 1; // FLAG_MARTIAL の自動付与条件（[M-STATE-FLAGS]）
  const refuse = buildRecord('ACT_VESSEL_REFUSE', '拒む', -1, false, refuseParams);

  const breathParams = blankParams();
  breathParams.step_startup = 1;
  breathParams.step_recovery = 1;
  const breath = buildRecord('ACT_VESSEL_BREATH', '息を吹く', -1, false, breathParams, 'FLAG_MIND');

  const acts = [refuse.class_id, breath.class_id];
  return { rows: [], records: [refuse, breath], acts };
}

// 敵マスターの構成テンプレートを展開する。
// 戻り値の rows は [A-BOOK-SCHEMA]［テンプレートとレコードの関係］のセレクタ照合に用いる。
export function expandEnemyTemplate(entry, level, summonIdOf) {
  if (entry.template === 'VESSEL') {
    return expandVessel();
  }
  const slots = EXTRA_SLOTS[entry.template];
  if (slots === undefined) {
    throw new Error(`未知のテンプレート種別: ${entry.template}`);
  }
  const ownerKey = entry.enemy_id.replace(/^ENEMY_/, '');
  const basic = sortBasicRows(
    [...BASE_KIT, ...slots, ...(entry.overrides ?? [])].map((row) => expandBasicRow(row, level, ownerKey, summonIdOf)),
  );
  const specials = (entry.specials ?? []).map((row) => expandSpecialRow(row, level, summonIdOf));
  const rows = [...basic, ...specials];
  const records = [...rows.map((row) => row.record), rootMartialRecord()];
  const acts = [...rows.map((row) => row.classId), 'ACT_ROOT_MARTIAL'];
  return { rows, records, acts };
}

// [M-TMPL-CREATURE-PRINCIPLE] 所持アクション配列構成。配列インデックス0は隊列交代（単体）で固定する。
const CREATURE_SLOTS = [
  ['MIND', 'BASIC', 100],
  ['MIND', 'MUSOU', 100],
  ['MARTIAL', 'BASIC', 100],
  ['MARTIAL', 'BASIC', 200],
  ['MARTIAL', 'RUSH', 100],
  ['MARTIAL', 'HEAVY', 100],
  ['STANCE', 'BASIC', 100],
  ['STANCE', 'BASIC', 200],
];

// ar_summon（1/10 単位）を基準に、クリーチャー1体分のレコードとアクション一式を展開する。
// 特殊枠は造形〈眷属〉の共通枠として武技（特殊）`AR ≒ ar_summon * 4.0` を置き、
// 追加パラメータにAPダメージを持たせる（[M-BASE-AR-MARTIAL]［追加パラメータ］）。
export function expandCreature(creatureId, displayName, arSummonTenths) {
  const rows = CREATURE_SLOTS.map((row) => {
    const [component, variant, arMultCenti] = row;
    const key = variantKey(component, variant);
    const arTenths = scaleArTenths(arSummonTenths, arMultCenti);
    const params = componentParams(key, arTenths, null);
    const classIdValue = classId(VARIANT_NAME[key], arTenths);
    return {
      classId: classIdValue,
      record: buildRecord(classIdValue, DISPLAY_NAME[key], BASE_USES[key], true, params),
    };
  });

  const specialArTenths = scaleArTenths(arSummonTenths, 400);
  const specialParams = componentParams('MARTIAL/BASIC', specialArTenths, null);
  const clawParams = { ...specialParams, dmg_ap: dmgApBase(specialArTenths) };
  // [M-DATA-CLASSID]［特殊型］内容を表す語で命名し、ランク帯の作り分けをAR値で区別する。
  const clawId = `ACT_SPEC_CLAW_${formatArSuffix(specialArTenths)}`;
  const claw = {
    classId: clawId,
    record: buildRecord(clawId, '爪牙（特殊）', USES_SPECIAL, true, clawParams),
  };

  const swap = swapSingleRecord();
  const acts = ['ACT_SWAP_SINGLE', ...rows.map((row) => row.classId), claw.classId];
  const records = [swap, ...rows.map((row) => row.record), claw.record];
  return {
    record: {
      creature_id: creatureId,
      display_name: displayName,
      max_hp: creatureMaxHp(arSummonTenths),
      acts,
    },
    records,
  };
}
