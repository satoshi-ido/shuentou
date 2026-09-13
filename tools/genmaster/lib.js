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

// [M-BASE-AR-MARTIAL]（基本・重撃）。VP/PP/APダメージ・封印・スリップ・デバフ・コピーは
// 該当特性を持つ技のみの追加パラメータであり、1-01（[M-TMPL-ENEMY-1-01]）はいずれも
// 解放されないため規定値のまま据え置く。
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
    base_uses: -1,
    inheritable: false,
    is_root: true,
    manual_sys_flag: null,
    params,
  };
}

function buildRecord(classIdValue, displayName, baseUsesCenti, inheritable, params) {
  return {
    class_id: classIdValue,
    display_name: displayName,
    base_uses: baseUsesCenti,
    inheritable,
    is_root: false,
    manual_sys_flag: null,
    params,
  };
}

// [M-BASE-USES] 基本型の基礎使用回数。
const USES_BASIC = 1000; // 10.00 回
const USES_HEAVY = 300; // 3.00 回

// [M-TMPL-ENEMY-PRINCIPLE]・[M-TMPL-ENEMY-1-01]
// 1-01 の敵マスター「祠守レフ」が生成する所持アクション一式。
export function generateEnemyLefActions(level) {
  const arBase = level * 10; // AR ≒ L * 1.0
  const arDouble = level * 20; // AR ≒ L * 2.0（[M-TMPL-ENEMY-1-01] 追加枠）

  const records = [
    buildRecord(classId('MIND', arBase), '心気（基本）', USES_BASIC, true, mind('basic', arBase)),
    buildRecord(classId('MUSOU', arBase), '心気（無想）', USES_HEAVY, true, mind('musou', arBase)),
    buildRecord(classId('SLASH', arBase), '武技（基本）', USES_BASIC, true, martial('basic', arBase)),
    buildRecord(classId('SLASH', arDouble), '武技（基本）', USES_BASIC, true, martial('basic', arDouble)),
    buildRecord(classId('HEAVY', arBase), '武技（重撃）', USES_HEAVY, true, martial('heavy', arBase)),
    buildRecord(classId('GUARD', arBase), '体勢（基本）', USES_BASIC, true, stance(arBase)),
    buildRecord(classId('GUARD', arDouble), '体勢（基本）', USES_BASIC, true, stance(arDouble)),
    rootMartialRecord(),
  ];
  return records;
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

// [M-DATA-ENEMYMASTER] 1-01 敵マスター「祠守レフ」。
export function generateEnemyLef(level, maxHp) {
  const actions = generateEnemyLefActions(level);
  return {
    record: {
      enemy_id: 'ENEMY_LEF',
      display_name: 'レフ',
      role_name: '祠守',
      max_hp: maxHp,
      // [A-BOOK-TABLE] B-01・[A-PROFILE-TABLE] PROFILE_FRENZY
      acts: actions.map((action) => action.class_id),
      ai_profile_id: 'PROFILE_FRENZY',
      book_id: 'B-01',
      fixed_cycle: null,
      audit_exempt: false,
    },
    actions,
  };
}
