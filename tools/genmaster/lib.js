// [I-PLAN-MASTERGEN]
// 基準式（[M-BASE-USES]・[M-BASE-AR]）の適用を生成器として実装する。
// 決定論層につき浮動小数演算・除算演算子・Math.sqrt を用いず、
// [I-NUM-HELPERS] のヘルパのみで固定小数点演算を行う。

import { floorDiv, isqrt, roundDiv } from '../../src/num/helpers.ts';

const SQRT_MICRO_SCALE = 100000000000; // 1e11: sqrt(AR) を 1e6 単位（マイクロ）で得るための倍率
const MICRO = 1000000; // 1e6

// floor(sqrt(AR) * 1e6)。AR は 1/10 単位の整数（arTenths = AR * 10）で表す。
export function sqrtArMicro(arTenths) {
  return isqrt(arTenths * SQRT_MICRO_SCALE);
}

// round(coeff * sqrt(AR))。coeff は 1/100 単位の整数（例: 3.46 -> 346）で渡す。
// outputCenti が true のとき結果を centi（[I-NUM-FIXEDPOINT]）で返す。
function coeffTimesSqrt(coeff100, arTenths, outputCenti) {
  const denominator = outputCenti ? MICRO : MICRO * 100;
  return roundDiv(coeff100 * sqrtArMicro(arTenths), denominator);
}

// round(coeff / sqrt(AR))。coeff は素の整数で渡す。
function coeffOverSqrt(coeffPlain, arTenths, outputCenti) {
  const numerator = coeffPlain * (outputCenti ? MICRO * 100 : MICRO);
  return roundDiv(numerator, sqrtArMicro(arTenths));
}

// round(coeff * AR)。coeff は 1/100 単位の整数で渡す。
function coeffTimesAr(coeff100, arTenths, outputCenti) {
  const denominator = outputCenti ? 10 : 1000;
  return roundDiv(coeff100 * arTenths, denominator);
}

// round(coeff * AR^1.5)。coeff は 1/100 単位の整数で渡す。
function coeffTimesArPow1_5(coeff100, arTenths, outputCenti) {
  const denominator = outputCenti ? 10000000 : 1000000000;
  return roundDiv(coeff100 * arTenths * sqrtArMicro(arTenths), denominator);
}

// [M-DATA-CLASSID] クラスIDの AR 部分。小数第1位が0のときは省く。
export function formatArSuffix(arTenths) {
  const whole = floorDiv(arTenths, 10);
  const frac = arTenths - whole * 10;
  return frac === 0 ? `AR${whole}` : `AR${whole}_${frac}`;
}

export function classId(variant, arTenths) {
  return `ACT_${variant}_${formatArSuffix(arTenths)}`;
}

// [M-STATE-ACTION]［静的パラメータ］の規定値。
function defaultParams() {
  return {
    def_efficiency: 100,
    target_scope: 'SELF',
    cost_hp: 0,
    cost_vp: 0,
    cost_pp: 0,
    cost_ap: 0,
    step_thought: 0,
    step_startup: 0,
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
}

// [M-BASE-AR-MARTIAL]（基本・急襲・重撃）。VP/PP/APダメージ・封印・スリップ・デバフ・コピーは
// 該当特性を持つ技のみの追加パラメータであり、アクト1（[M-TMPL-ENEMY-1-01]・[M-TMPL-ENEMY-1-02]）は
// いずれも解放されないため規定値のまま据え置く。
function martial(kind, arTenths) {
  const base = defaultParams();
  base.cost_pp = coeffTimesAr(33, arTenths, false);
  base.def_efficiency = kind === 'heavy' ? 0 : 200;
  base.decay_ap = 50;
  base.strip_rate = 50;
  base.stun = true;
  if (kind === 'basic') {
    base.step_thought = coeffOverSqrt(102, arTenths, false);
    base.step_startup = coeffOverSqrt(34, arTenths, false);
    base.step_recovery = coeffOverSqrt(136, arTenths, false);
    base.range = 1;
    base.atk = coeffTimesSqrt(346, arTenths, false);
    base.dmg_hp = coeffTimesSqrt(38, arTenths, true);
  } else if (kind === 'rush') {
    base.cost_ap = coeffTimesSqrt(115, arTenths, false);
    base.step_thought = 0;
    base.step_startup = coeffOverSqrt(34, arTenths, false);
    base.step_recovery = coeffOverSqrt(238, arTenths, false);
    base.range = 2;
    base.atk = coeffTimesSqrt(173, arTenths, false);
    base.dmg_hp = coeffTimesSqrt(38, arTenths, true);
  } else {
    // heavy（重撃）
    base.step_thought = 0;
    base.step_startup = coeffOverSqrt(408, arTenths, false);
    base.step_recovery = 0;
    base.range = 2;
    base.atk = coeffTimesSqrt(693, arTenths, false);
    base.dmg_hp = coeffTimesSqrt(77, arTenths, true);
  }
  return base;
}

// [M-BASE-AR-STANCE]（基本）。与バフ量は該当特性を持つ技のみのため据え置く。
function stance(arTenths) {
  const base = defaultParams();
  base.cost_pp = coeffTimesAr(33, arTenths, false);
  base.step_thought = 0;
  base.step_startup = coeffOverSqrt(68, arTenths, false);
  base.step_recovery = coeffOverSqrt(204, arTenths, false);
  base.def_efficiency = 200;
  base.decay_ap = 0;
  base.purify_rate = 50;
  base.deploy_ap = coeffTimesSqrt(924, arTenths, false);
  return base;
}

// [M-STATE-ACTION]［静的パラメータ］の規定値そのもの。効果を持たない空振りアクションの下地に用いる
// （[M-STATE-FLAGS-EXCEPTION] ACT_REMNANT・[M-TMPL-VESSEL]〈息を吹く〉）。
export function blankParams() {
  return defaultParams();
}

// [M-BASE-AR-SUMMON]（単体・瞬動基準）。ar_summon は既定で召喚アクション自身のARを引き継ぐ。
function summon(arTenths, summonId) {
  const base = defaultParams();
  base.cost_vp = coeffTimesSqrt(115, arTenths, false);
  base.step_thought = 0;
  base.step_startup = 0;
  base.step_recovery = 0;
  base.def_efficiency = 100;
  base.decay_ap = 0;
  base.purify_rate = 0;
  base.summon_id = summonId;
  return base;
}

// [M-BASE-AR-MIND]（基本・無想）。与バフ量は該当特性を持つ技のみのため据え置く。
function mind(kind, arTenths) {
  const base = defaultParams();
  base.cost_hp = coeffTimesArPow1_5(45, arTenths, false);
  base.def_efficiency = 200;
  base.decay_ap = 50;
  base.purify_rate = 50;
  base.charge_pp = coeffTimesSqrt(58, arTenths, true);
  if (kind === 'basic') {
    base.step_thought = coeffOverSqrt(255, arTenths, false);
    base.step_startup = coeffOverSqrt(17, arTenths, false);
    base.step_recovery = 0;
    base.gain_vp = coeffTimesSqrt(115, arTenths, false);
  } else {
    // musou（無想）
    base.step_thought = 0;
    base.step_startup = coeffOverSqrt(17, arTenths, false);
    base.step_recovery = coeffOverSqrt(255, arTenths, false);
    base.gain_vp = 0;
  }
  return base;
}

// [M-BASE-AR-SYSTEM] マスター根源武技。AR基準式の拘束を受けない固定値。
export function rootMartialRecord() {
  const params = defaultParams();
  params.step_thought = 550;
  params.step_startup = 1;
  params.step_recovery = 0;
  params.range = 2;
  params.atk = 999;
  params.dmg_hp = 99900;
  params.def_efficiency = 100;
  params.stun = true;
  return {
    class_id: 'ACT_ROOT_MARTIAL',
    display_name: '終焉の太刀',
    // [I-PLAN-TEXT]［プレースホルダの書式］効果説明は未執筆。補間キーを持たない。
    description: placeholderText('ACT_ROOT_MARTIAL', []),
    base_uses: -1,
    inheritable: false,
    is_root: true,
    manual_sys_flag: null,
    params,
  };
}

// [M-BASE-PRINCIPLE] 個別上書きのうち、レコード単位で効くもの。
// [M-DATA-CLASSID]［予約クラスID］は [M-DATA-HERO-INIT] の基本型4件が「敵側の同AR値の行と
// 同一レコードを共有する」と定めるため、主人公側の base_uses 上書きは共有レコードへ適用する
// （ACT_HEAVY_AR15 は 武技（重撃）の基準 3回ではなく 10回。[M-DATA-HERO-INIT]［初期所持アクション］）。
const RECORD_OVERRIDES = {
  ACT_HEAVY_AR15: { base_uses: 1000 },
};

export function buildRecord(classIdValue, displayName, baseUsesCenti, inheritable, params, manualSysFlag = null) {
  const recordOverride = RECORD_OVERRIDES[classIdValue] ?? {};
  return {
    class_id: classIdValue,
    display_name: displayName,
    // [I-PLAN-TEXT]［プレースホルダの書式］効果説明は未執筆。補間キーを持たない。
    description: placeholderText(classIdValue, []),
    base_uses: recordOverride.base_uses ?? baseUsesCenti,
    inheritable,
    is_root: false,
    manual_sys_flag: manualSysFlag,
    params,
  };
}

// [M-BASE-USES] 基礎使用回数。
export const USES_BASIC = 1000; // 10.00 回
export const USES_HEAVY = 300; // 3.00 回
export const USES_SPECIAL = 100; // 1.00 回（特殊アクション）

// 構成テンプレートの1行（`<コンポーネント>/<変種>`）に対応する基準式を引く。
// [M-BASE-AR] 配下の各基準式はここ1箇所からのみ呼び出す。
export function componentParams(variantKey, arTenths, summonId) {
  switch (variantKey) {
    case 'MIND/BASIC':
      return mind('basic', arTenths);
    case 'MIND/MUSOU':
      return mind('musou', arTenths);
    case 'MARTIAL/BASIC':
      return martial('basic', arTenths);
    case 'MARTIAL/RUSH':
      return martial('rush', arTenths);
    case 'MARTIAL/HEAVY':
      return martial('heavy', arTenths);
    case 'STANCE/BASIC':
      return stance(arTenths);
    case 'SUMMON/BASIC':
      return summon(arTenths, summonId);
    default:
      throw new Error(`未知の構成テンプレート行: ${variantKey}`);
  }
}

// [M-BASE-AR-MARTIAL]［追加パラメータ］APダメージ係数（全種共通）：dmg_ap ≒ 9.24 * sqrt(AR)。
export function dmgApBase(arTenths) {
  return coeffTimesSqrt(924, arTenths, true);
}

// [M-BASE-AR-MARTIAL]［追加パラメータ（該当特性を持つ技のみ）］
// 基本・急襲と重撃で係数が異なる項は variantKey から引き分ける。いずれも centi で返す。
export function martialExtra(variantKey, arTenths, key) {
  const heavy = variantKey === 'MARTIAL/HEAVY';
  switch (key) {
    case 'dmg_vp':
      return coeffTimesSqrt(heavy ? 231 : 115, arTenths, true);
    case 'dmg_pp':
      return coeffTimesSqrt(heavy ? 133 : 67, arTenths, true);
    case 'dmg_ap':
      return dmgApBase(arTenths);
    case 'give_slip':
      return coeffTimesSqrt(heavy ? 38 : 19, arTenths, true);
    case 'initial_copy_val':
    case 'give_seal':
      // 初期コピー値／与封印量：基本・急襲 3.00、重撃 12.00（AR に依存しない）。
      return heavy ? 1200 : 300;
    default:
      throw new Error(`未知の追加パラメータ: ${key}`);
  }
}

// [M-TMPL-CREATURE-PRINCIPLE]［標準基準式］最大HP ≒ 1.86 * (ar_summon ^ 1.5)。
export function creatureMaxHp(arSummonTenths) {
  return coeffTimesArPow1_5(186, arSummonTenths, false);
}

// [M-BASE-AR-SYSTEM] 隊列交代（単体）。全ユニットが共有するシステム共通アクション。
export function swapSingleRecord() {
  const params = defaultParams();
  params.is_swap = true;
  params.target_scope = 'SELF';
  params.def_efficiency = 100;
  params.decay_ap = 0;
  params.purify_rate = 0;
  return {
    class_id: 'ACT_SWAP_SINGLE',
    display_name: '隊列交代',
    description: placeholderText('ACT_SWAP_SINGLE', []),
    base_uses: -1,
    inheritable: false,
    is_root: false,
    manual_sys_flag: null,
    params,
  };
}



// [M-STATE-FLAGS] 系統フラグの自動確定。監査・定跡の解決辞書の双方が同じ判定を用いる。
function hasSystemFlag(params, flag) {
  switch (flag) {
    case 'MIND':
      return params.gain_vp > 0 || params.charge_pp > 0 || Object.keys(params.give_buff).length > 0;
    case 'MARTIAL':
      return params.range > 0;
    case 'STANCE':
      return params.deploy_ap > 0;
    case 'SUMMON':
      return params.summon_id !== null;
    default:
      throw new Error(`未知の系統: ${flag}`);
  }
}

// [A-BOOK-SCHEMA]［テンプレートとレコードの関係］MIRROR_FIRST_SYSTEM の解決辞書。
// 当該系統フラグを持つ所持アクションのうち、構成テンプレート上の ar_mult が最大の行に対応するクラスID。
// 最大値が並ぶ場合は所持アクション配列インデックス昇順の最初のもの（[A-CORE-DETERMINISM]#4）。
function buildMirrorDictionary(template) {
  const dictionary = { NONE: null };
  for (const flag of ['MIND', 'MARTIAL', 'STANCE', 'SUMMON']) {
    let best = null;
    for (const row of template) {
      if (!hasSystemFlag(row.record.params, flag)) {
        continue;
      }
      if (best === null || row.arMultCenti > best.arMultCenti) {
        best = row;
      }
    }
    dictionary[flag] = best === null ? null : best.classId;
  }
  return dictionary;
}

// [A-BOOK-SCHEMA] 人が書く定跡（セレクタ）を、参照元の敵マスターの構成テンプレートに照合して class_id へ展開する。
// 照合結果が一意でない場合はオーサリングエラーとして棄却する。
export function buildBookRecord(book, template) {
  const steps = book.steps.map((step, index) => {
    if (step.kind === 'DYNAMIC') {
      if (step.resolver !== 'MIRROR_FIRST_SYSTEM') {
        throw new Error(`${book.book_id} #${index + 1}: 未知のリゾルバ: ${step.resolver}`);
      }
      return {
        kind: 'DYNAMIC',
        class_id: null,
        resolver: step.resolver,
        resolved_by_system: buildMirrorDictionary(template),
        can_wait: step.can_wait,
      };
    }
    if (step.kind !== 'FIXED') {
      throw new Error(`${book.book_id} #${index + 1}: 未知の定跡手の種別: ${step.kind}`);
    }
    const { component, variant, ar_mult: arMult } = step.selector;
    const arMultCenti = decimalStringToCenti(arMult);
    const matches = template.filter(
      (row) => row.component === component && row.variant === variant && row.arMultCenti === arMultCenti,
    );
    if (matches.length !== 1) {
      throw new Error(`${book.book_id} #${index + 1}: セレクタの照合が一意でない（${matches.length}件）`);
    }
    return { kind: 'FIXED', class_id: matches[0].classId, resolver: null, resolved_by_system: null, can_wait: step.can_wait };
  });
  if (steps.length === 0) {
    throw new Error(`${book.book_id}: steps は空配列を認めない`);
  }
  return { book_id: book.book_id, steps };
}





// [M-DATA-SCENEMASTER] 人が書く入力（authoring/scenes.js）をレコードへ写す。値の算出を伴わない。
export function buildSceneRecords(scenes) {
  const result = {};
  for (const scene of scenes) {
    result[scene.scene_id] = { ...scene, unlock: [...scene.unlock], eval_mask: scene.eval_mask === null ? null : [...scene.eval_mask] };
  }
  return result;
}

// 小数表記の文字列（'4.50'）を centi 整数へ変換する。浮動小数を経由しない（[I-NUM-FIXEDPOINT]）。
export function decimalStringToCenti(text) {
  const match = /^([0-9]+)\.([0-9]{2})$/.exec(text);
  if (match === null) {
    throw new Error(`小数第2位までの表記ではない: ${text}`);
  }
  return Number(match[1]) * 100 + Number(match[2]);
}

// [M-DATA-ATTENDANTMASTER] 係数は centi で出力する。
export function buildAttendantRecords(attendants) {
  const result = {};
  for (const attendant of attendants) {
    const coeffs = {};
    for (const key of Object.keys(attendant.coeffs).sort()) {
      coeffs[key] = decimalStringToCenti(attendant.coeffs[key]);
    }
    result[attendant.attendant_id] = { ...attendant, coeffs };
  }
  return result;
}

// [M-DATA-HERO-INIT] 主人公初期所持アクション（AR はシーンレベルに依存しない固定値）。
export function generateHeroInitActions() {
  const mindAr3 = classId('MIND', 30);
  const slashAr3 = classId('SLASH', 30);
  const slashAr6 = classId('SLASH', 60);
  const heavyAr15 = classId('HEAVY', 150);

  const records = [
    buildRecord(mindAr3, '心気（基本）', USES_BASIC, true, mind('basic', 30)),
    buildRecord(slashAr3, '武技（基本）', USES_BASIC, true, martial('basic', 30)),
    buildRecord(slashAr6, '武技（基本）', USES_BASIC, true, martial('basic', 60)),
    // base_uses は [M-DATA-HERO-INIT] の個別上書き（[M-BASE-PRINCIPLE]）により 10 回とする。
    buildRecord(heavyAr15, '武技（重撃）', USES_BASIC, true, martial('heavy', 150)),
    rootMartialRecord(),
  ];

  return {
    records,
    order: [mindAr3, slashAr3, slashAr6, heavyAr15, 'ACT_ROOT_MARTIAL'],
  };
}

// [M-DATA-CLASSID]［同一クラスIDを持つ複数インスタンスの併存］
// 同一 class_id は基礎値の全項目一致を条件に1レコードへ統合する。判定はこの1箇所に置く。
export function mergeActionRecords(recordGroups) {
  const merged = {};
  for (const records of recordGroups) {
    for (const record of records) {
      const existing = merged[record.class_id];
      if (existing === undefined) {
        merged[record.class_id] = record;
        continue;
      }
      if (JSON.stringify(existing) !== JSON.stringify(record)) {
        throw new Error(`class_id 重複かつ基礎値不一致: ${record.class_id}`);
      }
    }
  }
  return merged;
}


// [A-PROFILE-SCHEMA] 人が書く入力をレコードへ写す。weight_mult は centi へ変換する。
export function buildAiProfileRecords(profiles) {
  const result = {};
  for (const profile of profiles) {
    const weightMult = {};
    for (const key of Object.keys(profile.weight_mult).sort()) {
      weightMult[key] = decimalStringToCenti(profile.weight_mult[key]);
    }
    const actionBonus = {};
    for (const key of Object.keys(profile.action_bonus).sort()) {
      actionBonus[key] = profile.action_bonus[key];
    }
    result[profile.profile_id] = {
      profile_id: profile.profile_id,
      display_name: profile.display_name,
      weight_mult: weightMult,
      action_bonus: actionBonus,
      dynamic_weight: profile.dynamic_weight,
    };
  }
  return result;
}

// [M-DATA-INTERP]［文脈束］各束が供給する代表的な補間キー。プレースホルダ本文の組み立てに用いる。
const BUNDLE_KEYS = {
  ACTION: ['ActionName'],
  UNIT: ['UnitName'],
  ATTENDANT: ['AttendantName'],
  ENEMY: ['EnemyName'],
  PAUSE: ['WatchLabel', 'RemainingSteps'],
  SACRIFICE: ['PartyCountAfter'],
  REFILL: ['SlotCount', 'RemainCount'],
  HELP: ['HelpTitle', 'HelpBody'],
};

// [I-PLAN-TEXT]［プレースホルダの書式］レコードIDを角括弧で囲み、用いる補間キーを列挙する。
export function placeholderText(recordId, keys) {
  const interpolations = keys.map((key) => `{${key}}`);
  return [`[${recordId}]`, ...interpolations].join(' ');
}

// [M-DATA-STRINGMASTER]［見出しとボタン名］基底の string_id に _HEAD / _BTN を後置する。
export function buildStringRecords(strings) {
  const result = {};
  const add = (stringId, context, keys) => {
    if (result[stringId] !== undefined) {
      throw new Error(`文言IDの重複: ${stringId}`);
    }
    result[stringId] = { string_id: stringId, text: placeholderText(stringId, keys), context: [...context] };
  };
  for (const entry of strings) {
    const context = [...entry.context].sort();
    const keys = [...context.flatMap((bundle) => BUNDLE_KEYS[bundle] ?? []), ...(entry.keys ?? [])];
    add(entry.string_id, context, keys);
    if (entry.confirm === true) {
      // 確認ダイアログは見出しと決定ボタン名を別レコードで持つ。いずれも共通キーのみで書く。
      add(`${entry.string_id}_HEAD`, [], []);
      add(`${entry.string_id}_BTN`, [], []);
    }
  }
  return result;
}

// [M-DATA-HELPMASTER] order は同一 category 内での定義順に 1 から振る。
export function buildHelpRecords(helps) {
  const result = {};
  const orders = {};
  for (const entry of helps) {
    if (result[entry.help_id] !== undefined) {
      throw new Error(`解説IDの重複: ${entry.help_id}`);
    }
    orders[entry.category] = (orders[entry.category] ?? 0) + 1;
    result[entry.help_id] = {
      help_id: entry.help_id,
      title: placeholderText(`${entry.help_id}_TITLE`, []),
      body: placeholderText(entry.help_id, []),
      unlock_key: entry.unlock_key,
      category: entry.category,
      order: orders[entry.category],
    };
  }
  return result;
}

// [M-DATA-ASSETMASTER] 条件付必須（owner_id・cue）をオーサリング時に検査する。
export function buildAssetRecords(assets) {
  const result = {};
  for (const entry of assets) {
    if (result[entry.asset_id] !== undefined) {
      throw new Error(`アセットIDの重複: ${entry.asset_id}`);
    }
    const ownerless = entry.owner_kind === 'HERO' || entry.owner_kind === 'GLOBAL';
    if (ownerless !== (entry.owner_id === null)) {
      throw new Error(`owner_id の条件付必須に反する: ${entry.asset_id}`);
    }
    const audio = entry.slot === 'BGM' || entry.slot === 'SE';
    if (audio !== (entry.cue !== null)) {
      throw new Error(`cue の条件付必須に反する: ${entry.asset_id}`);
    }
    result[entry.asset_id] = { ...entry };
  }
  return result;
}
