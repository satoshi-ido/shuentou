/* ═════════════════════════════════════════════════════════
   終焉燈 ─ マスタ定義
   ─────────────────────────────────────────────────────────
   読み込みはクラシックスクリプトとする（<script src="masters.js">）。
   脚本マスタは [S-SCRIPT-RECORDS] の部分集合を収める。
   ═════════════════════════════════════════════════════════ */


/* ═══ 1-1. パラメータID体系  [M-DATA-PARAMIDS] ═══ */

/** [M-DATA-PARAMIDS]の全17パラメータID定義 */
const PARAM_MASTER = {
  step_thought:  { label: "必要思考",   decrease: true },
  step_startup:  { label: "発生",       decrease: true },
  step_recovery: { label: "硬直",       decrease: true },
  cost_hp:       { label: "HPコスト",   decrease: true },
  cost_vp:       { label: "VPコスト",   decrease: true },
  cost_pp:       { label: "PPコスト",   decrease: true },
  cost_ap:       { label: "APコスト",   decrease: true },
  decay_ap:      { label: "AP減衰率",   decrease: true },
  deploy_ap:     { label: "展開AP",     decrease: false },
  range:         { label: "射程",       decrease: false },
  atk:           { label: "攻撃力",     decrease: false },
  dmg_hp:        { label: "HPダメージ", decrease: false },
  dmg_vp:        { label: "VPダメージ", decrease: false },
  dmg_pp:        { label: "PPダメージ", decrease: false },
  dmg_ap:        { label: "APダメージ", decrease: false },
  gain_vp:       { label: "加算VP",     decrease: false },
  charge_pp:     { label: "PP充填効率", decrease: false }
};


/* ═══ 1-2. システム共通アクション  [M-BASE-AR-SYSTEM] ═══ */

/* ── システム共通アクション定義 [M-BASE-AR-SYSTEM] ── */
const SYSTEM_ACTIONS = {
  // 全マスター共通の初期所持アクション
  ROOT_MARTIAL: () => ({
    classId: "ACT_ROOT_MARTIAL",
    n: "終焉の太刀",
    k: "マスター根源武技",
    sys: ["martial"],
    cost: [],
    st: [550, 1, 0],
    uses: "∞",
    maxUses: "∞",
    inf: true,
    range: 2,
    atk: 999,
    dmg_hp: 999.00,
    de: 1.00,
    stun: true
  }),

  // 単体版隊列交代（クリーチャー先頭枠・主人公所持用）
  SWAP_SINGLE: (classId, name = "退き合わせ") => ({
    classId: classId,
    n: name,
    k: "隊列交代（単体）",
    sys: ["swap"],
    cost: [],
    st: [0, 0, 0],
    uses: "∞",
    maxUses: "∞",
    inf: true,
    de: 1.00
  })
};


/* ═══ 1-3. アクション定義ヘルパーとアクションマスタ  [M-BASE-AR]・[M-DATA-ACTIONMASTER] ═══ */

/* ── アクション定義共通ヘルパー ── */
function defineAction(base) {
  return {
    sys: ["martial"],
    cost: [],
    st: [0, 0, 0],
    de: 2.00,
    base: 10,
    ...base
  };
}

/* 系統別ファクトリ関数 */
const createMindBasic = ({ classId, hpCost, st, gainVp, chargePp }) => defineAction({
  classId,
  n: "静かな息",
  k: "心気（基本）",
  sys: ["mind"],
  cost: [["hp", hpCost]],
  st,
  gain_vp: gainVp,
  charge_pp: chargePp,
  purify: 0.50,
  eff: `VP +${gainVp} ／ PP 充填`
});

const createMusou = ({ classId, hpCost, st, chargePp }) => defineAction({
  classId,
  n: "無想",
  k: "心気（無想）",
  sys: ["mind"],
  cost: [["hp", hpCost]],
  st,
  gain_vp: 0,
  charge_pp: chargePp,
  purify: 0.50,
  eff: "浄化 0.50 ／ PP 充填（VP加算なし）",
  base: 3
});

const createMartialBasic = ({ classId, n, ppCost, st, atk, dmgHp, effDamage }) => defineAction({
  classId,
  n,
  k: "武技（基本）",
  cost: [["pp", ppCost]],
  st,
  range: 1,
  atk,
  dmg_hp: dmgHp,
  stun: true,
  strip_rate: 0.50,
  eff: `HPダメージ ${effDamage}`
});

const createMartialHeavy = ({ classId, n, ppCost, st, atk, dmgHp, effDamage }) => defineAction({
  classId,
  n,
  k: "武技（重撃）",
  cost: [["pp", ppCost]],
  st,
  range: 2,
  atk,
  dmg_hp: dmgHp,
  de: 0.00,
  stun: true,
  strip_rate: 0.50,
  eff: `HPダメージ ${effDamage} ／ 発生中は防御効率 0.00`,
  base: 3
});

const createStanceBasic = ({ classId, n, ppCost, st, deploy, decayAp = 0.00 }) => defineAction({
  classId,
  n,
  k: "体勢（基本）",
  sys: ["stance"],
  cost: [["pp", ppCost]],
  st,
  deploy,
  decay_ap: decayAp,
  purify: 0.50,
  eff: `展開AP ${deploy} → 防御力 ${deploy * 2}`
});

/* ── 敵マスター・継承プール共通アクション定義 ── */
const BATTLE_ACTIONS = {
  // Scene 3-04 剣聖ロウド
  GARDEN: () => createMartialBasic({
    classId: "ACT_GARDEN",
    n: "庭の型",
    ppCost: 11,
    st: [17, 6, 23],
    atk: 20,
    dmgHp: 2.22,
    effDamage: 38
  }),
  SWORD_ONE: () => defineAction({
    classId: "ACT_SWORD_ONE",
    n: "剣呑の一手",
    k: "武技（特殊）",
    cost: [["pp", 22]],
    st: [0, 0, 20],
    range: 1,
    atk: 29,
    dmg_hp: 3.12,
    stun: true,
    eff: "HPダメージ 53 ／ 即発（発生0・硬直20）",
    base: 1
  }),
  HEAVY_ONE: () => createMartialHeavy({
    classId: "ACT_HEAVY_ONE",
    n: "一の太刀",
    ppCost: 6,
    st: [0, 99, 0],
    atk: 29,
    dmgHp: 3.17,
    effDamage: 54
  }),
  STRIKE_FAST: () => defineAction({
    classId: "ACT_STRIKE_FAST",
    n: "抜き打ち",
    k: "武技（急襲）",
    cost: [["pp", 6], ["ap", 5]],
    st: [0, 8, 58],
    range: 2,
    atk: 7,
    dmg_hp: 1.57,
    stun: true,
    strip_rate: 0.50,
    eff: "HPダメージ 27 ／ 思考0で即応",
    base: 3
  }),
  STEP_STYLE: () => createMartialBasic({
    classId: "ACT_STEP_STYLE",
    n: "歩みの型",
    ppCost: 6,
    st: [25, 8, 33],
    atk: 14,
    dmgHp: 1.57,
    effDamage: 27
  }),
  SHEATH: () => createStanceBasic({
    classId: "ACT_SHEATH",
    n: "鞘の間合い",
    ppCost: 11,
    st: [0, 12, 35],
    deploy: 54
  }),
  HALF_BODY: () => createStanceBasic({
    classId: "ACT_HALF_BODY",
    n: "半身",
    ppCost: 6,
    st: [0, 16, 49],
    deploy: 38
  }),
  CALL: () => defineAction({
    classId: "ACT_CALL",
    n: "呼び",
    k: "召喚（基本）",
    sys: ["summon"],
    cost: [["vp", 5]],
    de: 1.00,
    gain: "従兵を入れ替える",
    eff: "クリーチャーを入れ替える（瞬動）",
    base: 3
  }),
  CALM_BREATH_AR17: () => createMindBasic({
    classId: "ACT_CALM_BREATH_AR17",
    hpCost: 32,
    st: [62, 4, 0],
    gainVp: 5,
    chargePp: 2.39
  }),
  NO_THOUGHT_AR17: () => createMusou({
    classId: "ACT_NO_THOUGHT_AR17",
    hpCost: 32,
    st: [0, 4, 62],
    chargePp: 2.39
  }),

  // Scene 1-01 祠守レフ
  CALM_BREATH_AR3: () => createMindBasic({
    classId: "ACT_CALM_BREATH_AR3",
    hpCost: 2,
    st: [147, 10, 0],
    gainVp: 2,
    chargePp: 1.00
  }),
  NO_THOUGHT_AR3: () => createMusou({
    classId: "ACT_NO_THOUGHT_AR3",
    hpCost: 2,
    st: [0, 10, 147],
    chargePp: 1.00
  }),
  CLAW_AR3: () => createMartialBasic({
    classId: "ACT_CLAW_AR3",
    n: "瘴気の爪",
    ppCost: 1,
    st: [59, 20, 79],
    atk: 6,
    dmgHp: 0.66,
    effDamage: 2
  }),
  CLAW_AR6: () => createMartialBasic({
    classId: "ACT_CLAW_AR6",
    n: "二連の爪",
    ppCost: 2,
    st: [42, 14, 56],
    atk: 8,
    dmgHp: 0.93,
    effDamage: 3
  }),
  HEAVY_CLAW: () => createMartialHeavy({
    classId: "ACT_HEAVY_CLAW",
    n: "振り下ろし",
    ppCost: 1,
    st: [0, 236, 0],
    atk: 12,
    dmgHp: 1.33,
    effDamage: 4
  }),
  STANCE_AR3: () => createStanceBasic({
    classId: "ACT_STANCE_AR3",
    n: "体勢",
    ppCost: 1,
    st: [0, 39, 118],
    deploy: 16
  }),
  STANCE_AR6: () => createStanceBasic({
    classId: "ACT_STANCE_AR6",
    n: "厚き体勢",
    ppCost: 2,
    st: [0, 28, 83],
    deploy: 23
  }),

  // Scene 5-07 第二百九十九のエルナ
  ASH_BLADE: () => defineAction({
    classId: "ACT_ASH_BLADE",
    n: "灰蝕の巨刃",
    k: "武技（特殊・灰蝕）",
    cost: [["pp", 30]],
    st: [0, 5, 30],
    range: 2,
    atk: 95,
    dmg_hp: 6.50,
    de: 0.00,
    stun: true,
    eff: "HPダメージ 410 ／ 灰蝕付与",
    base: 1
  }),

  // 終局・インターミッション
  REMNANT: () => defineAction({
    classId: "ACT_REMNANT",
    n: "復輪の残滓",
    k: "心気（残滓）",
    sys: ["mind"],
    cost: [["hp", 0]],
    de: 1.00,
    eff: "蘇生術〈復輪の秘蹟〉の断片",
    base: 0.15
  }),
  HEAVY_VANE: () => createMartialHeavy({
    classId: "ACT_HEAVY_VANE",
    n: "一の太刀・極",
    ppCost: 67,
    st: [0, 29, 0],
    atk: 99,
    dmgHp: 11.00,
    effDamage: 748
  }),
  DIVINE_STANCE: () => createStanceBasic({
    classId: "ACT_DIVINE_STANCE",
    n: "天の障壁",
    ppCost: 90,
    st: [0, 4, 12],
    deploy: 152
  })
};


/* ═══ 1-4. クリーチャーマスタ  [M-DATA-CREATUREMASTER] ═══ */

// ── クリーチャーマスタデータ定義（ネームド・特化型クリーチャー辞書） ──
// [M-RESOLVE-SUMMON] および [M-TMPL-CREATURE-PRINCIPLE]に基づく個別オーバーライド定義
const CREATURE_MASTER = {
  "CREATURE_ASHWING": {
    name: "灰翅",
    roleName: "クリーチャー",
    maxHp: 87,
    acts: [
      // index 0 は隊列交代（単体）で固定（[M-TMPL-CREATURE-PRINCIPLE]【クリーチャー構成に関する共通原則】）
      SYSTEM_ACTIONS.SWAP_SINGLE("ACT_SWAP_CREATURE", "退き合わせ"),
      { classId: "ACT_WING_STRIKE", n: "翅打ち", k: "武技（基本）", sys: ["martial"], cost: [["pp", 6]], st: [25, 8, 33], uses: 10, maxUses: 10, range: 1, atk: 14, dmg_hp: 1.57, de: 2.00, stun: true },
      { classId: "ACT_GATHER_ASH", n: "灰を集める", k: "心気（基本）", sys: ["mind"], cost: [["hp", 32]], st: [62, 4, 0], uses: 10, maxUses: 10, de: 2.00, gain_vp: 5, charge_pp: 2.39 },
      { classId: "ACT_LAYER_WING", n: "重ね翅", k: "武技（基本）", sys: ["martial"], cost: [["pp", 11]], st: [17, 6, 23], uses: 10, maxUses: 10, range: 1, atk: 20, dmg_hp: 2.22, de: 2.00, stun: true },
      // 武技（急襲）・武技（重撃）の基礎初期使用回数は 3（[M-BASE-USES]）
      { classId: "ACT_GRAZE", n: "掠め", k: "武技（急襲）", sys: ["martial"], cost: [["pp", 6], ["ap", 5]], st: [0, 8, 58], uses: 3, maxUses: 3, range: 2, atk: 7, dmg_hp: 1.57, de: 2.00, stun: true },
      { classId: "ACT_FALL", n: "墜ち", k: "武技（重撃）", sys: ["martial"], cost: [["pp", 6]], st: [0, 99, 0], uses: 3, maxUses: 3, range: 2, atk: 29, dmg_hp: 3.17, de: 0.00, stun: true },
      { classId: "ACT_THICK_ASH", n: "厚灰", k: "体勢（基本）", sys: ["stance"], cost: [["pp", 11]], st: [0, 12, 35], uses: 10, maxUses: 10, deploy: 54, de: 2.00 },
      // 特殊アクションの基礎初期使用回数は 1（[M-BASE-USES]）
      { classId: "ACT_ASH_VEIL", n: "灰の帳", k: "体勢（特殊）", sys: ["stance"], cost: [["pp", 22]], st: [0, 8, 25], uses: 1, maxUses: 1, deploy: 76, de: 2.00 }
    ]
  },
  "CREATURE_SWORD_SOLDIER": {
    name: "剣呑の従兵",
    roleName: "敵クリーチャー",
    // [M-TMPL-CREATURE-PRINCIPLE] の基準式どおりの値（1.86 × 17^1.5 ≒ 130）
    maxHp: 130,
    acts: [
      // index 0 は隊列交代（単体）で固定（[M-TMPL-CREATURE-PRINCIPLE]【クリーチャー構成に関する共通原則】）
      SYSTEM_ACTIONS.SWAP_SINGLE("SWAP_FOE", "入れ替わり"),
      { classId: "ACT_COMBO", n: "連打", k: "武技（基本）", sys: ["martial"], cost: [["pp", 11]], st: [17, 6, 23], uses: 10, maxUses: 10, range: 1, atk: 20, dmg_hp: 2.22, de: 2.00, stun: true },
      { classId: "ACT_ASH_COVER", n: "灰被り", k: "体勢（基本）", sys: ["stance"], cost: [["pp", 6]], st: [0, 16, 49], uses: 10, maxUses: 10, deploy: 38, de: 2.00 },
      // 武技（急襲）の基礎初期使用回数は 3（[M-BASE-USES]）
      { classId: "ACT_GRAZE_FOE", n: "掠め", k: "武技（急襲）", sys: ["martial"], cost: [["pp", 6], ["ap", 5]], st: [0, 8, 58], uses: 3, maxUses: 3, range: 2, atk: 7, dmg_hp: 1.57, de: 2.00, stun: true },
      { classId: "ACT_SOLDIER_THRUST", n: "従兵の突き", k: "武技（基本）", sys: ["martial"], cost: [["pp", 6]], st: [25, 8, 33], uses: 10, maxUses: 10, range: 1, atk: 14, dmg_hp: 1.57, de: 2.00, stun: true },
      { classId: "ACT_BREATH_FOE", n: "息継ぎ", k: "心気（基本）", sys: ["mind"], cost: [["hp", 32]], st: [62, 4, 0], uses: 10, maxUses: 10, de: 2.00, gain_vp: 5, charge_pp: 2.39 }
    ]
  },
  "CREATURE_WHITE_VANGUARD": {
    name: "白の尖兵",
    roleName: "クリーチャー",
    maxHp: 240,
    acts: [
      // index 0 は隊列交代（単体）で固定（[M-TMPL-CREATURE-PRINCIPLE]【クリーチャー構成に関する共通原則】）
      SYSTEM_ACTIONS.SWAP_SINGLE("ACT_SWAP_VANGUARD", "身を引く"),
      { classId: "ACT_CREATURE_SHIELD", n: "身代わり障壁", k: "体勢（基本）", sys: ["stance"], cost: [["pp", 12]], st: [0, 8, 24], uses: 5, maxUses: 5, deploy: 120, de: 2.00 }
    ]
  },
  "CREATURE_ASH_CORE": {
    name: "灰の残滓核",
    roleName: "敵クリーチャー",
    maxHp: 400,
    // 盤面オブジェクトとしての最小構成。攻撃・防御手段を一切持たず、
    // index 0 固定則（[M-TMPL-CREATURE-PRINCIPLE]）のみを満たす。
    // 隊列交代は敵マスターを後列へ退避させる手として敵軍AIの候補手に載る（[A-SEARCH-MOVEGEN]）。
    acts: [
      SYSTEM_ACTIONS.SWAP_SINGLE("ACT_SWAP_ASH_CORE", "崩れ寄る")
    ]
  }
};


/* ═══ 1-5. 復輪の秘蹟  [M-END-SACRAMENT-PARAMS] ═══ */

// [M-END-SACRAMENT-PARAMS]
const SACRAMENT_PARAMS = {
  classId: 'ACT_SACRAMENT',
  n: '復輪の秘蹟', k: '心気（蘇生秘蹟）', eff: '完全蘇生術〈復輪の秘蹟〉',
  base: 1, inheritable: false, is_root: false,
  manual_sys_flag: 'FLAG_MIND',
  cost: [['hp', 60]],
  st: [0, 0, 0],                 // 瞬動（思考0 / 発生0 / 硬直0）
  uses: 1, maxUses: 1, inf: false,
  range: 0, atk: 0,
  dmg_hp: 0.00, dmg_vp: 0.00, dmg_pp: 0.00, dmg_ap: 0.00,
  deploy: 0, gain_vp: 0, charge_pp: 0.00, purify: 0.00,
  de: 1.00, decay_ap: 0.00, stun: false
};


/* ═══ 1-6. 従者マスタと特性係数キー  [M-DATA-ATTENDANTS]・[M-DATA-COEFFKEYS] ═══ */

/* ── 従者マスタデータ定義（全15名）[M-DATA-ATTENDANTS] ── */
const ATTENDANT_MASTER = {
  1:  { id: "ATTENDANT_01", n: "リナ",       t: "灯し直しの手", joinAct: 1, coeffs: { usesRate: 4.50 } },
  2:  { id: "ATTENDANT_02", n: "ガルド",     t: "鉄鎖の頭",     joinAct: 2, coeffs: { usesRate: 3.00, hpAddRate: 1.50 } },
  3:  { id: "ATTENDANT_03", n: "ミレイユ",   t: "秤の目",       joinAct: 2, coeffs: { usesRate: 3.00, costRate: 0.67 } },
  4:  { id: "ATTENDANT_04", n: "カイ",       t: "風脚",         joinAct: 3, coeffs: { usesRate: 3.00, rcRate: 0.67 } },
  5:  { id: "ATTENDANT_05", n: "セルヴィス", t: "読み手",       joinAct: 3, coeffs: { usesRate: 3.00, thRate: 0.67 } },
  6:  { id: "ATTENDANT_06", n: "トト",       t: "駆けの子",     joinAct: 3, coeffs: { usesRate: 3.00, stRate: 0.67 } },
  7:  { id: "ATTENDANT_07", n: "バルデス",   t: "不動",         joinAct: 4, coeffs: { usesRate: 3.00, decayApRate: 0.67 } },
  8:  { id: "ATTENDANT_08", n: "ユナ",       t: "環守の巫女",   joinAct: 4, coeffs: { usesRate: 3.00, gainVpRate: 1.50 } },
  9:  { id: "ATTENDANT_09", n: "オルフェ",   t: "充ちの器",     joinAct: 4, coeffs: { usesRate: 3.00, chargePpRate: 1.50 } },
  10: { id: "ATTENDANT_10", n: "シグルド",   t: "遠矢",         joinAct: 4, coeffs: { usesRate: 3.00, rangeRate: 1.50 } },
  11: { id: "ATTENDANT_11", n: "ダリウス",   t: "剛の腕",       joinAct: 5, coeffs: { usesRate: 3.00, atkRate: 1.50 } },
  12: { id: "ATTENDANT_12", n: "メイア",     t: "盾の聖女",     joinAct: 5, coeffs: { usesRate: 3.00, deployRate: 1.50 } },
  13: { id: "ATTENDANT_13", n: "ザイル",     t: "呪炎",         joinAct: 5, coeffs: { usesRate: 3.00, dmgRate: 1.50 } },
  14: { id: "ATTENDANT_14", n: "クレア",     t: "白刃の審問官", joinAct: 5, coeffs: { usesRate: 3.00, purifyRate: 1.50, stripRate: 1.50 } },
  15: { id: "ATTENDANT_15", n: "マルディス", t: "賜りの王弟",   joinAct: 5, coeffs: { usesRate: 3.00, giveBuffRate: 1.50, giveDebuffRate: 1.50 } }
};

/* ── 従者特性係数キーの表示名。プレイヤーへはキー名を出さず、パラメータの表示名で示す ── */
const ATTENDANT_COEFF_LABEL = {   // 出典 [M-DATA-PARAMIDS]［表示名］
  usesRate: "初期使用回数", hpAddRate: "最大HP加算", costRate: "コスト",
  thRate: "必要思考", stRate: "発生", rcRate: "硬直", decayApRate: "AP減衰率",
  deployRate: "展開AP", rangeRate: "射程", atkRate: "攻撃力", dmgRate: "ダメージ",
  gainVpRate: "加算VP", chargePpRate: "PP充填効率", purifyRate: "浄化率",
  stripRate: "剥奪率", giveBuffRate: "与バフ量", giveDebuffRate: "与デバフ量"
};


/* ═══ 1-7. シーンマスタ  [M-DATA-SCENEMASTER]・[M-DATA-SCENES] ═══ */

/* display_name および enemy_id が指す表示名は呼称の遡及置換の対象である
   （[S-NAMING-SCHEMA] の SCENE_NAME / ENEMY_NAME）。レコードは旧称「天疵」で保持し、
   表示時に applyNaming を通す。4-08 のシーン名がその唯一の該当例。
   AI設定7項目（max_depth 以下）は正本が [A-DIFF-CONFIG] にあり、探索未実装のため持たない。
   cap は attendant_capacity。現在はアクト番号と一致するが独立項目として保持する。 */
const SCENE_MASTER = {
  SCENE_1_01: { act: 1, order:  1, cap: 1, level:  3, hp_bonus_base:  81, display_name: "拾い物",             enemy_id: "ENEMY_LEF",         unlock: [] },
  SCENE_1_02: { act: 1, order:  2, cap: 1, level:  4, hp_bonus_base:  97, display_name: "鉄鎖と秤",           enemy_id: "ENEMY_DORN",        unlock: ["RUSH"] },
  SCENE_2_01: { act: 2, order:  3, cap: 2, level:  4, hp_bonus_base:  97, display_name: "灰の街道",           enemy_id: "ENEMY_VOLG",        unlock: ["SUMMON"] },
  SCENE_2_02: { act: 2, order:  4, cap: 2, level:  6, hp_bonus_base: 122, display_name: "囁きの市",           enemy_id: "ENEMY_ISH",         unlock: ["STRIP_VP"] },
  SCENE_2_03: { act: 2, order:  5, cap: 2, level:  8, hp_bonus_base: 143, display_name: "腐る術式",           enemy_id: "ENEMY_KALVA",       unlock: ["STRIP_PP"] },
  SCENE_2_04: { act: 2, order:  6, cap: 2, level:  9, hp_bonus_base: 152, display_name: "シャルム陥落",       enemy_id: "ENEMY_ASHAL",       unlock: [] },
  SCENE_3_01: { act: 3, order:  7, cap: 3, level:  9, hp_bonus_base: 152, display_name: "王都の門",           enemy_id: "ENEMY_TARGA",       unlock: ["STRIP_AP"] },
  SCENE_3_02: { act: 3, order:  8, cap: 3, level: 12, hp_bonus_base: 177, display_name: "聖堂の階",           enemy_id: "ENEMY_TEODOL",      unlock: ["INTERFERE"] },
  SCENE_3_03: { act: 3, order:  9, cap: 3, level: 15, hp_bonus_base: 199, display_name: "帳簿の回廊",         enemy_id: "ENEMY_MAREN",       unlock: ["BUFF_COST_HP"] },
  SCENE_3_04: { act: 3, order: 10, cap: 3, level: 17, hp_bonus_base: 212, display_name: "剣呑の庭",           enemy_id: "ENEMY_ROUDO",       unlock: ["BUFF_COST_PP"] },
  SCENE_3_05: { act: 3, order: 11, cap: 3, level: 19, hp_bonus_base: 224, display_name: "王の間",             enemy_id: "ENEMY_ORDERIK",     unlock: ["BUFF_STEP_RECOVERY"] },
  SCENE_3_06: { act: 3, order: 12, cap: 3, level: 20, hp_bonus_base: 230, display_name: "カルデン陥落",       enemy_id: "ENEMY_ZEFAL",       unlock: [] },
  SCENE_4_01: { act: 4, order: 13, cap: 4, level: 20, hp_bonus_base: 230, display_name: "第一層・灰の入口",   enemy_id: "ENEMY_HAUSEN",      unlock: ["BUFF_STEP_THOUGHT"] },
  SCENE_4_02: { act: 4, order: 14, cap: 4, level: 24, hp_bonus_base: 253, display_name: "第二層・囁く岩",     enemy_id: "ENEMY_OREIN",       unlock: ["BUFF_STEP_STARTUP"] },
  SCENE_4_03: { act: 4, order: 15, cap: 4, level: 28, hp_bonus_base: 274, display_name: "第三層・逆さの森",   enemy_id: "ENEMY_SERG",        unlock: ["BUFF_DECAY_AP", "BUFF_DEPLOY_AP"] },
  SCENE_4_04: { act: 4, order: 16, cap: 4, level: 31, hp_bonus_base: 288, display_name: "第四層・沈む鐘",     enemy_id: "ENEMY_RIIN",        unlock: ["BUFF_GAIN_VP", "BUFF_CHARGE_PP"] },
  SCENE_4_05: { act: 4, order: 17, cap: 4, level: 34, hp_bonus_base: 302, display_name: "第五層・魂の川",     enemy_id: "ENEMY_GRAVE",       unlock: ["BUFF_RANGE", "BUFF_ATK"] },
  SCENE_4_06: { act: 4, order: 18, cap: 4, level: 36, hp_bonus_base: 311, display_name: "第六層・肉壁の回廊", enemy_id: "ENEMY_VOD_RIA",     unlock: ["DEBUFF_COST_HP"] },
  SCENE_4_07: { act: 4, order: 19, cap: 4, level: 38, hp_bonus_base: 320, display_name: "最下層・門前",       enemy_id: "ENEMY_ZOL_NA",      unlock: ["DEBUFF_COST_PP"] },
  SCENE_4_08: { act: 4, order: 20, cap: 4, level: 39, hp_bonus_base: 324, display_name: "天疵深核",           enemy_id: "ENEMY_ZOL_VOD",     unlock: [] },
  SCENE_5_01: { act: 5, order: 21, cap: 5, level: 39, hp_bonus_base: 324, display_name: "昇環一",             enemy_id: "ENEMY_ERNA_007",    unlock: ["DEBUFF_STEP_RECOVERY"] },
  SCENE_5_02: { act: 5, order: 22, cap: 5, level: 44, hp_bonus_base: 344, display_name: "昇環二",             enemy_id: "ENEMY_ERNA_019",    unlock: ["DEBUFF_STEP_THOUGHT"] },
  SCENE_5_03: { act: 5, order: 23, cap: 5, level: 49, hp_bonus_base: 364, display_name: "昇環三",             enemy_id: "ENEMY_ERNA_044",    unlock: ["DEBUFF_STEP_STARTUP"] },
  SCENE_5_04: { act: 5, order: 24, cap: 5, level: 53, hp_bonus_base: 378, display_name: "昇環四",             enemy_id: "ENEMY_ERNA_080",    unlock: ["DEBUFF_DECAY_AP", "DEBUFF_DEPLOY_AP"] },
  SCENE_5_05: { act: 5, order: 25, cap: 5, level: 57, hp_bonus_base: 392, display_name: "昇環五",             enemy_id: "ENEMY_ERNA_130",    unlock: ["DEBUFF_GAIN_VP", "DEBUFF_CHARGE_PP"] },
  SCENE_5_06: { act: 5, order: 26, cap: 5, level: 60, hp_bonus_base: 403, display_name: "昇環六",             enemy_id: "ENEMY_ERNA_200",    unlock: ["DEBUFF_RANGE", "DEBUFF_ATK"] },
  SCENE_5_07: { act: 5, order: 27, cap: 5, level: 63, hp_bonus_base: 413, display_name: "灰蝕の階",           enemy_id: "ENEMY_ERNA_299",    unlock: ["SLIP"] },
  SCENE_5_08: { act: 5, order: 28, cap: 5, level: 65, hp_bonus_base: 419, display_name: "倣いの門",           enemy_id: "ENEMY_ERNA_300",    unlock: ["COPY"] },
  SCENE_5_09: { act: 5, order: 29, cap: 5, level: 67, hp_bonus_base: 426, display_name: "天の座前庭",         enemy_id: "ENEMY_MIRROR_SEIN", unlock: ["SEAL"] },
  SCENE_5_10: { act: 5, order: 30, cap: 5, level: 68, hp_bonus_base: 429, display_name: "天の座アルヴェイル", enemy_id: "ENEMY_VEIN",        unlock: [] },
  SCENE_5_11: { act: 5, order: 31, cap: 5, level: 68, hp_bonus_base: null, display_name: "灯し直しの手",      enemy_id: "ENEMY_VESSEL_301",  unlock: [] }
};

/** アクト表題。シーン単位ではなくアクト単位の値なので分けて持つ（[S-ACT-TITLECARD]） */
const ACT_TITLE = { 1: "灰の村", 2: "崩れる都", 3: "裏切りの環", 4: "天疵", 5: "終わらない黄昏" };

/** order → scene_id の逆引き。order は [M-DATA-SCENEMASTER] の通し番号 */
const SCENE_BY_ORDER = Object.fromEntries(
  Object.entries(SCENE_MASTER).map(([id, s]) => [s.order, id])
);


/* ═══ 1-8. 敵マスタ  [M-DATA-ENEMYMASTER]・[M-DATA-ENEMYID] ═══ */

/* プロトタイプは display_name / role_name / max_hp のみを用いる。
   acts・ai_profile_id・book_id・fixed_cycle・audit_exempt は未実装。
   IDは固有名による（[M-DATA-ENEMYID]）。個体番号が同一性を担うエルナのみ末尾に番号を付す。 */
const ENEMY_MASTER = {
  ENEMY_LEF:         { display_name: "祠守レフ",                   role_name: null,                 max_hp:   10 },
  ENEMY_DORN:        { display_name: "辺境伯ドルン",               role_name: null,                 max_hp:   27 },
  ENEMY_VOLG:        { display_name: "腑分け師ヴォルグ",           role_name: null,                 max_hp:   21 },
  ENEMY_ISH:         { display_name: "囁きのイシュ",               role_name: null,                 max_hp:   39 },
  ENEMY_KALVA:       { display_name: "腐術師カルヴァ",             role_name: null,                 max_hp:   59 },
  ENEMY_ASHAL:       { display_name: "アシャル",                   role_name: "天疵の使徒",         max_hp:  163 },
  ENEMY_TARGA:       { display_name: "砕きのタルガ",               role_name: null,                 max_hp:   71 },
  ENEMY_TEODOL:      { display_name: "聖務官テオドル",             role_name: null,                 max_hp:  109 },
  ENEMY_MAREN:       { display_name: "典礼長マレン",               role_name: null,                 max_hp:  153 },
  ENEMY_ROUDO:       { display_name: "剣聖ロウド",                 role_name: null,                 max_hp:  184 },
  ENEMY_ORDERIK:     { display_name: "オルデリク",                 role_name: "エルデン王",         max_hp:  218 },
  ENEMY_ZEFAL:       { display_name: "枢機卿ゼファル",             role_name: null,                 max_hp:  539 },
  ENEMY_HAUSEN:      { display_name: "ハウゼン",                   role_name: "初代討伐長",         max_hp:  235 },
  ENEMY_OREIN:       { display_name: "オレイン",                   role_name: "囁きの伝令",         max_hp:  309 },
  ENEMY_SERG:        { display_name: "セルグ",                     role_name: "逆さの森の守人",     max_hp:  389 },
  ENEMY_RIIN:        { display_name: "リィン",                     role_name: "沈鐘の唱者",         max_hp:  454 },
  ENEMY_GRAVE:       { display_name: "グレイヴ",                   role_name: "渡し守",             max_hp:  521 },
  ENEMY_VOD_RIA:     { display_name: "ヴォド＝リア",               role_name: "喰らう環",           max_hp:  568 },
  ENEMY_ZOL_NA:      { display_name: "ゾル＝ナ",                   role_name: "門前の三十一番",     max_hp:  616 },
  ENEMY_ZOL_VOD:     { display_name: "ゾル＝ヴォド",               role_name: "天疵の主",           max_hp: 1468 },
  ENEMY_ERNA_007:    { display_name: "第七のエルナ〈物言わぬ〉",     role_name: null,               max_hp:  640 },
  ENEMY_ERNA_019:    { display_name: "第十九のエルナ〈数えるもの〉", role_name: null,               max_hp:  767 },
  ENEMY_ERNA_044:    { display_name: "第四十四のエルナ〈手だけの〉", role_name: null,               max_hp:  901 },
  ENEMY_ERNA_080:    { display_name: "第八十のエルナ〈脱げぬ〉",     role_name: null,               max_hp: 1014 },
  ENEMY_ERNA_130:    { display_name: "第百三十のエルナ〈息をする〉", role_name: null,               max_hp: 1131 },
  ENEMY_ERNA_200:    { display_name: "第二百のエルナ〈名を呼ぶ〉",   role_name: null,               max_hp: 1222 },
  ENEMY_ERNA_299:    { display_name: "第二百九十九のエルナ〈灰の〉", role_name: null,               max_hp: 1314 },
  ENEMY_ERNA_300:    { display_name: "第三百のエルナ〈倣うもの〉",   role_name: null,               max_hp: 1377 },
  ENEMY_MIRROR_SEIN: { display_name: "写し身のセイン",             role_name: null,                 max_hp: 1441 },
  ENEMY_VEIN:        { display_name: "ヴェイン",                   role_name: "黒衣の巡礼者",       max_hp: 6506 },
  ENEMY_VESSEL_301:  { display_name: "第三百一の依代",             role_name: null,                 max_hp:    1 }
};


/* ═══ 1-9. 文言マスタ  [M-DATA-STRINGMASTER]・[M-DATA-STRINGS] ═══ */

/* ── 暫定文言辞書（[M-DATA-STRINGMASTER]・[M-DATA-STRINGS]） ────────────────
   本来は文言マスタのレコード。プロトタイプではここへ集約する。
   1エントリは3レコードに対応し、マスタ移行時は次の規則で展開する。
     head → <string_id>_HEAD ／ text → <string_id> ／ btn → <string_id>_BTN
   context は [M-DATA-INTERP]［文脈束］の語彙。本文が実際に用いる束のみを列挙する。
   {Key} の補間記法および語彙は [M-DATA-INTERP]。                              */
const STRINGS = {
  /* 目的表示（[M-UI-OBJECTIVE]）。本文は古名で記述し、表示時に[S-NAMING-RULE]が置換する */
  STR_OBJECTIVE_VOID_LORD: { head: null, text: "目的：〈天疵の主〉を討つ", btn: null, context: [] },
  STR_OBJECTIVE_VEIN:      { head: null, text: "目的：〈天の座の主〉を討つ", btn: null, context: [] },

  /* 選択できない理由（[M-UI-HUD]［判定語彙］）。いずれも完結した文とする */
  STR_LOCK_NO_PARTNER:       { head: null, text: "相方が不在である。", btn: null, context: [] },
  STR_LOCK_PARTNER_STARTUP:  { head: null, text: "〈{UnitName}〉が発生中である。", btn: null, context: ["UNIT"] },
  STR_LOCK_PARTNER_RECOVERY: { head: null, text: "〈{UnitName}〉が硬直中である。", btn: null, context: ["UNIT"] },

  /* 巻き戻し保留の提示（[M-META-PENDING]） */
  STR_REWIND_PENDING: { head: null, text: "燈火が消えている。次の確定操作をもって、吹き消しが1回として数えられる。", btn: null, context: [] },

  /* 破棄されるスナップショット1件分の行（[M-DATA-STRINGS]［複数対象の提示］） */
  STR_CONFIRM_ROLLBACK_IM_ROW: { head: null, text: "　シーン{SceneNumber} 突破時点の記録", btn: null, context: [] },

  /* 確認ダイアログ（[M-DATA-STRINGS]）。以下3件は本プロトタイプでは未使用だが、
     M-DATA-STRINGS の必須レコードであるため定義のみ置く。 */
  STR_CONFIRM_UNDO: {
    head: "【アンドゥ】",
    text: "直前の指示を取り消します。よろしいですか。",
    btn: "取り消す", context: []
  },
  STR_CONFIRM_IM_COMMIT: {
    head: "【インターミッション決済】",
    text: "継承・編成を確定して次のシーンへ進みます。",
    btn: "確定する", context: []
  },
  STR_LOCK_NO_ATTENDANT: {
    head: "【操作不可】",
    text: "同行従者がいないため、継承・供犠は行えません。",
    btn: "了解", context: []
  },

  /* 戦闘結果（[M-PIPE-P5-DISCARD]） */
  STR_RESULT_WIN: {
    head: "【勝利：敵マスター撃破】",
    text: "敵マスター〈{EnemyName}〉を討伐しました。インターミッションへ進みます。",
    btn: "決定", context: ["ENEMY"]
  },
  STR_RESULT_LOSE: {
    head: "【因果途絶：敗北】",
    text: "セインが力尽きました。\n直前の手を取り消すか、戦闘開始時点まで因果を巻き戻してください。",
    btn: "決定", context: []
  },
  STR_RESULT_LOSE_SUICIDE: {
    head: "【因果途絶：自滅】",
    text: "スリップ決済によりセインが力尽きました。\n直前の手を取り消すか、戦闘開始時点まで因果を巻き戻してください。",
    btn: "決定", context: []
  },

  /* 巻き戻し（[M-REWIND-UNDO]・[M-REWIND-ROLLBACK]） */
  STR_UNDO_UNAVAILABLE: {
    head: "【アンドゥ不可】",
    text: "直前に取り消せる操作履歴がありません。",
    btn: "了解", context: []
  },
  STR_CONFIRM_ROLLBACK_BATTLE: {
    head: "【再走：戦闘初期状態】",
    text: "戦闘の初期状態まで巻き戻しますか。",
    btn: "巻き戻す", context: []
  },
  STR_CONFIRM_ROLLBACK_IM: {
    head: "【再走：編成・継承】",
    text: "選んだインターミッションの開始時点まで巻き戻しますか。復帰先より後の記録は破棄されます。",
    btn: "巻き戻す", context: []
  },
  STR_CONFIRM_QUIT_BATTLE: {
    head: "【中断】",
    text: "戦闘を中断してタイトルへ戻りますか。再開は直前のバトル開始時の記録からとなり、ここまでの手は失われます。再開の時点で燈が1つ数えられます。",
    btn: "タイトルへ戻る", context: []
  },
  STR_TITLE_RUN_CLOSED: {
    head: "【道行きの果て】",
    text: "この周回は既に終わっている。続けることはできない。過去のインターミッションへ戻ることのみが可能である。",
    btn: "了解", context: []
  },

  /* 継承（[M-INHERIT-POOL]・[M-INHERIT-MERGE]） */
  STR_INHERIT_HP_ADD: {
    head: "【最大HP加算】",
    text: "{AttendantName}を介して、セインの最大HPが +{HpAdd} 増加しました（{HeroHpMax}）。",
    btn: "了解", context: ["ATTENDANT"]
  },
  STR_INHERIT_VANISH: {
    head: "【継承消滅】",
    text: "実効初期使用回数が 0 となるため、この資質は定着せず霧散しました。継承枠は消費されます。",
    btn: "了解", context: []
  },
  STR_INHERIT_NEW_SLOT: {
    head: "【技獲得】",
    text: "新規アクション〈{ActionName}〉をスロットへ追加しました。",
    btn: "了解", context: ["ACTION"]
  },
  STR_INHERIT_MERGED: {
    head: "【資質統合】",
    text: "既存の〈{ActionName}〉に{AttendantName}の資質を編み込みました。改善：{ImprovedList}。",
    btn: "了解", context: ["ACTION", "ATTENDANT"]
  },
  STR_INHERIT_NO_IMPROVE: {
    head: "【資質統合：改善なし】",
    text: "〈{ActionName}〉に{AttendantName}の資質を編み込みましたが、このアクションが保持しないパラメータのため改善項目はありません。",
    btn: "了解", context: ["ACTION", "ATTENDANT"]
  },
  STR_SACRAMENT_AWAKEN: {
    head: "【秘蹟覚醒】",
    text: "リナの灯火により〈復輪の残滓〉が覚醒し、〈復輪の秘蹟〉を獲得しました。",
    btn: "了解", context: []
  },

  /* 供犠（[M-PROG-SACRIFICE]） */
  STR_CONFIRM_SACRIFICE: {
    head: "【供犠の執行】",
    text: "従者〈{AttendantName}〉の魂を完全に消滅させ、セインのHPを最大値まで全回復します（{HeroHp} → {HeroHpMax}）。同行従者は{PartyCountAfter}名になります。",
    btn: "魂を捧げる", context: ["ATTENDANT", "SACRIFICE"]
  },
  STR_SACRIFICE_DONE: {
    head: "【供犠完了】",
    text: "〈{AttendantName}〉の魂を捧げ、セインのHPが全回復しました。",
    btn: "了解", context: ["ATTENDANT"]
  },

  /* インターミッション決済（[M-INHERIT-POOL]） */
  STR_CONFIRM_FORFEIT: {
    head: "【継承枠の失効】",
    text: "次の継承枠が未行使のまま失効します。",
    btn: "行使せずに進む", context: []
  },
  STR_CONFIRM_FORFEIT_ROW: {
    head: null,
    text: "　〈{AttendantName}〉",
    btn: null, context: ["ATTENDANT"]
  },
  STR_IM_COMMIT_DONE: {
    head: "【決済完了】",
    text: "継承・編成を確定しました。",
    btn: "了解", context: []
  },

    /* 自動時間停止の事由（[M-UI-PAUSE-REASON]） */
  STR_PAUSE_STEP0_READY:     { head: null, text: "戦闘開始：実行可能な手が存在する", btn: null, context: [] },
  STR_PAUSE_ENEMY_START:     { head: null, text: "敵軍〈{ActionName}〉発生中（残 {RemainingSteps}）", btn: null, context: ["UNIT", "ACTION", "PAUSE"] },
  STR_PAUSE_ENEMY_IMMEDIATE: { head: null, text: "敵軍〈{ActionName}〉即時決済", btn: null, context: ["UNIT", "ACTION"] },
  STR_PAUSE_WATCH_MET:       { head: null, text: "監視条件充足：〈{ActionName}〉の【{WatchLabel}】が成立", btn: null, context: ["UNIT", "ACTION", "PAUSE"] },
  STR_PAUSE_MANUAL:          { head: null, text: "手動一時停止中", btn: null, context: [] },

  /* 監視条件ラベル（[M-UI-PAUSE-REASON]［監視条件ラベル］） */
  STR_WATCH_READY:     { head: null, text: "実行可能",  btn: null, context: [] },
  STR_WATCH_STUN:      { head: null, text: "スタン",    btn: null, context: [] },
  STR_WATCH_HIT_FRONT: { head: null, text: "前列命中",  btn: null, context: [] },
  STR_WATCH_HIT_BACK:  { head: null, text: "後列命中",  btn: null, context: [] },
  STR_WATCH_EVADE:     { head: null, text: "回避",      btn: null, context: [] },
  STR_WATCH_NA:        { head: null, text: "対象外",    btn: null, context: [] },
  STR_WATCH_IDLE:      { head: null, text: "待機",      btn: null, context: [] },

  /* タイトル・ニューゲーム（[M-META-SAVEDATA]［スロット構成］） */
  STR_CONFIRM_NEWGAME: {
    head: "【はじめから】",
    text: "現在のセーブデータを破棄して最初から開始します。スロットは単一であり、復旧はできません。",
    btn: "破棄して開始する", context: []
  },

  /* 従者補充（[M-PROG-REFILL]） */
  STR_CONFIRM_REFILL: {
    head: "【従者の補充】",
    text: "次の従者を新たに同行させます。選ばれなかった候補は恒久的に除外され、以後いかなる移行でも復帰しません。選び直すには、このインターミッションへのロールバックを要します。",
    btn: "補充を確定する", context: []
  },
  STR_CONFIRM_REFILL_ROW: {
    head: null, text: "　〈{AttendantName}〉", btn: null, context: ["ATTENDANT"]
  },
  STR_REFILL_SHORT: {
    head: "【補充数の不足】",
    text: "補充可能数は {SlotCount} 名です。あと {RemainCount} 名を選んでください。",
    btn: "了解", context: ["REFILL"]
  },
  STR_REFILL_DONE: {
    head: "【アクト移行】",
    text: "補充を確定しました。全回復ボーナスによりセインのHPが {HeroHpMax} まで回復し、遺芯に迎えた従者は {EnshrinedCount} 名になりました。",
    btn: "了解", context: []
  },

  /* 解説の初出自動提示（[M-DATA-HELPMASTER]） */
  STR_HELP_FIRST_SIGHT: {
    head: "【解説：{HelpTitle}】",
    text: "{HelpBody}",
    btn: "了解", context: ["HELP"]
  }
};


/* ═══ 1-10. 解説マスタ  [M-DATA-HELPMASTER]・[M-DATA-HELPS] ═══ */

const HELP_MASTER = {
  /* 機構キー・補正キーによる自動提示（unlock_key 非Null） */
  HELP_RUSH:        { title: "武技（急襲）", unlock: "RUSH", scene: "1-02", category: "ACTION", order: 1,
    body: "思考ステップを持たず、発生の短さと引き換えに長い硬直を負うアクションである。硬直中は防御効率が下がるため、外したときの損失が大きい。基礎の初期使用回数は 3 回である。" },   // 出典 [M-BASE-USES]
  HELP_SUMMON:      { title: "召喚", unlock: "SUMMON", scene: "2-01", category: "ACTION", order: 2,
    body: "自軍の先頭枠へクリーチャーを配置する。既存のクリーチャーが在るときは入れ替えとなり、退いた個体は破棄される。クリーチャーはバトルクリア決済で一括撤去される。" },   // 出典 [M-PROG-CLEAR]
  HELP_STRIP_VP:    { title: "剥奪：VP", unlock: "STRIP_VP", scene: "2-02", category: "RESOURCE", order: 1,
    body: "対象の現在VPを剥奪率に応じて削り取る。剥奪は減衰であり、ダメージではない。丸めと下限は減衰の規則に従う。" },   // 出典 [M-CALC-DECAY]
  HELP_STRIP_PP:    { title: "剥奪：PP", unlock: "STRIP_PP", scene: "2-03", category: "RESOURCE", order: 2,
    body: "対象の現在PPを削り取る。PPは武技の主要コストであるため、剥奪は相手の手数そのものを奪う。" },
  HELP_STRIP_AP:    { title: "剥奪：AP", unlock: "STRIP_AP", scene: "3-01", category: "RESOURCE", order: 3,
    body: "展開済みのAPを削り取る。実効防御力はAPから導出されるため、剥奪は体勢の破りとして働く。" },   // 出典 [M-CALC-DEFENSE]
  HELP_INTERFERE:   { title: "位置干渉", unlock: "INTERFERE", scene: "3-02", category: "ACTION", order: 3,
    body: "対象の立ち位置を強制的に動かす。距離が変わることで射程内外が入れ替わり、確定していた命中見込みが崩れる。" },
  HELP_BUFF:        { title: "バフ", unlock: "BUFF_COST_HP", scene: "3-03", category: "ACTION", order: 4,
    body: "パラメータ17種のいずれかを一時的に改善する。同一パラメータの重複はMax上書きであり、加算しない。増加型はバフが +、減少型はバフが − として表示される。" },   // 出典 [M-CALC-MAXOVERWRITE]
  HELP_DEBUFF:      { title: "デバフ", unlock: "DEBUFF_STEP_RECOVERY", scene: "5-01", category: "ACTION", order: 5,
    body: "パラメータを一時的に悪化させる。重複更新の規則はバフと同一である。硬直ステップ数へのデバフは、一手ごとの拘束時間を直接伸ばす。" },
  HELP_SLIP:        { title: "スリップ", unlock: "SLIP", scene: "5-07", category: "ACTION", order: 6,
    body: "ステップ境界ごとに継続してHPを削る。通常型スリップの削りは、その境界で全ユニット分を一斉に計算し、まとめて適用する。被スリップ量は補正チップとして小数第2位まで表示される。" },   // 出典 [M-PIPE-P4-SLIP]
  HELP_COPY:        { title: "コピー", unlock: "COPY", scene: "5-08", category: "ACTION", order: 7,
    body: "相手のアクションを自軍の一時スロットへ複写する。コピーフラグを持つアクションはバトルクリア決済で一括破棄される。同一定義の重複コピーは、武技の重複解決の基準に従う。" },   // 出典 [M-RESOLVE-MARTIAL]
  HELP_SEAL:        { title: "封印", unlock: "SEAL", scene: "5-09", category: "ACTION", order: 8,
    body: "アクションごとに封印蓄積値を積む。蓄積が 1.00 に達したアクションは指示確定できない。実行可能性ランクでは最下位（構造的に発動不可）へ落ちる。" },   // 出典 [M-UI-SORT]

  /* 辞典専用（unlock_key は Null） */
  HELP_RESOURCE_HP: { title: "HP", unlock: null, scene: null, category: "RESOURCE", order: 4,
    body: "生命値である。0 に到達したユニットは破棄される。心気の一部はHPをコストとして支払う。表示はクランプ後の値であり、負数を表示しない。" },   // 出典 [M-UI-HUD]
  HELP_RESOURCE_VP: { title: "VP", unlock: null, scene: null, category: "RESOURCE", order: 5,
    body: "心気で得る資源であり、召喚などの支払いに充てる。バトルクリア決済で 0 にリセットされる。" },
  HELP_RESOURCE_PP: { title: "PP", unlock: null, scene: null, category: "RESOURCE", order: 6,
    body: "武技の主要コストである。心気の充填率に応じて目標値まで満たされる。判定プレビューは充填後のPP目標値を提示する。" },
  HELP_RESOURCE_AP: { title: "AP", unlock: null, scene: null, category: "RESOURCE", order: 7,
    body: "体勢で展開する防御資源である。実効防御力の導出元であり、ステップごとの減衰によって目減りする。" },   // 出典 [M-CALC-DECAY]
  HELP_STEP_THOUGHT:{ title: "思考ステップ", unlock: null, scene: null, category: "STEP", order: 1,
    body: "アクションが指示確定可能になるまでの蓄積である。蓄積完了・コスト充足・封印蓄積 1.00 未満の三条件を満たしたとき、監視条件『実行可能』が立ち上がる。" },   // 出典 [M-UI-WATCH]
  HELP_STEP_STARTUP:{ title: "発生ステップ", unlock: null, scene: null, category: "STEP", order: 2,
    body: "指示確定から効果発動までの区間である。この区間でスタン付与を受けると中断が成立し、硬直は中断補正値へ差し替わる。" },   // 出典 [M-PIPE-P2-APPLY]
  HELP_STEP_RECOVERY:{ title: "硬直ステップ", unlock: null, scene: null, category: "STEP", order: 3,
    body: "発動後に拘束される区間である。硬直中は次のアクションを確定できない。満了はステップの境界で判定する。" },   // 出典 [M-PIPE-P3-RECOVERY]
  HELP_DEFENSE:     { title: "実効防御力と命中", unlock: null, scene: null, category: "STEP", order: 4,
    body: "命中の成否は「実効攻撃力 ≧ 対象の実効防御力」で決まり、乱数を用いない。実効防御力はステップの冒頭で凍結され、通常の武技はこの凍結値を参照する。同一ステップ内で相手のAPが動いても、その結果は覆らない。" },   // 出典 [M-PIPE-P1-FREEZE]
  HELP_FIELD:       { title: "隊列・距離・射程", unlock: null, scene: null, category: "ACTION", order: 9,
    body: "フィールドはマス占有によって構成され、距離はマス間の定義に従う。射程内に対象が存在しない場合、武技の判定プレビューは判定そのものを行わない。" },   // 出典 [M-FIELD-GRID]・[M-FIELD-DISTANCE]
  HELP_SYSTEM_FLAGS:{ title: "5大系統と複合アクション", unlock: null, scene: null, category: "ACTION", order: 10,
    body: "武技・体勢・心気・召喚・隊列交代の5系統である。系統フラグはコンポーネントパラメータから自動確定し、複数のフラグを同時に持つアクションを複合アクションと呼ぶ。" },   // 出典 [M-DATA-FLAGS]
  HELP_INHERIT:     { title: "継承・従者特性係数・資質統合", unlock: null, scene: null, category: "PROGRESS", order: 1,
    body: "バトルクリア時、同行従者1人につき1回、……使用回数は最大値を採る。従者特性係数は、その従者が定義を持つ項目にのみ乗算し、他の項目は等倍とする。適用後の実効値は継承の確定前にプレビューで提示し、改善項目が0件となる場合はその旨を示す。" },
  HELP_SACRIFICE:   { title: "供犠と従者補充", unlock: null, scene: null, category: "PROGRESS", order: 2,
    body: "供犠は同行従者1人を消滅させ、セインの現在HPを最大値まで回復する。空いた枠はアクト移行の補充まで埋まらない。補充候補は直前のアクトで命を落とした従者のみであり、選ばれなかった者は恒久的に除外される。" },   // 出典 [M-PROG-REFILL]
  HELP_WATCH:       { title: "監視トグルと自動時間停止", unlock: null, scene: null, category: "UI", order: 1,
    body: "監視条件5種のいずれかが未充足から充足へ遷移した瞬間に限り、自動で時間が停止する。立ち上がりエッジのみを見るため、充足し続けている状態では停止しない。" },   // 出典 [M-UI-WATCH]
  HELP_TIMELINE:    { title: "未来予測タイムライン", unlock: null, scene: null, category: "UI", order: 2,
    body: "思考中のユニットは待機すると仮定し、全生存ユニットのステート区間を展開して表示する。本体の進行処理・敵軍AIの静止探索と同一の純関数コアを共有する。" },   // 出典 [M-UI-TIMELINE]
  HELP_REWIND:      { title: "アンドゥ・ロールバックと燈火", unlock: null, scene: null, category: "UI", order: 3,
    body: "アンドゥは1操作単位、ロールバックは戦闘開始時または過去の任意のインターミッションへ巻き戻す。いずれも実行時点では燈火の数値を動かさず、確定イベントの成立をもって加算される。" }   // 出典 [M-META-COMMIT]
};

const HELP_CATEGORY_ORDER = ["RESOURCE", "STEP", "ACTION", "PROGRESS", "UI"];
const HELP_CATEGORY_LABEL = {
  RESOURCE: "RESOURCE ─ リソース",
  STEP: "STEP ─ ステップと判定",
  ACTION: "ACTION ─ アクション",
  PROGRESS: "PROGRESS ─ 進行",
  UI: "UI ─ 操作"
};


/* ═══ 1-11. 脚本マスタ  [S-SCRIPT-SCHEMA] ═══ */

const SCRIPT_MASTER = [
  /* ── SCENE_INTRO / 1-01 ───────────────────────────── */
  {
    script_id: "SCRIPT_ACT_TITLE_1", trigger: "SCENE_INTRO", anchor: "SCENE_1_01", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [{ speaker: null, text: `アクト${1}：${ACT_TITLE[1]}`, directives: ["ACT_TITLE_CARD", "FADE_IN", "WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_SCENE_1_01_INTRO", trigger: "SCENE_INTRO", anchor: "SCENE_1_01", order: 2,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "降り注ぐ灰の中、村の小さな祠の前でセインは膝をついている。腕の中には、胸を貫かれた幼馴染リナ。呼吸は、ついいましがた止まったばかりである。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "目を上げたセインの前に、漆黒の外套を纏った長身の男が立っている。男はセインを見ていない。見ているのは腕の中の少女だけである。その手の黒鉄のランタンは、既に胸の高さへ掲げ終えられている。", directives: ["WAIT_INPUT"] },
      { speaker: "ヴェイン", text: "「拾え。それは、私が五百年前に捨てた燃え殻だ」", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "男が立ち去る。祠の炉は消えている。セインは彼女の手を胸の上で組ませ、それから震える手で燈を拾い上げる。", directives: ["WAIT_INPUT"] }
    ]
  },
  {
    script_id: "SCRIPT_SCENE_1_01_MONO_REWOUND", trigger: "SCENE_INTRO", anchor: "SCENE_1_01", order: 3,
    branch_group: "SCENE_1_01_MONO", condition: "TotalRewindCount >= 1", replay_on_rollback: true,
    lines: [{ speaker: "セイン", text: "「……また、ここか。\n　二度は灯らぬ、と誰もが言う。\n　……{TotalRewindCount}回」", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_SCENE_1_01_MONO_INTACT", trigger: "SCENE_INTRO", anchor: "SCENE_1_01", order: 3,
    branch_group: "SCENE_1_01_MONO", condition: "TotalRewindCount == 0", replay_on_rollback: true,
    lines: [{ speaker: null, text: "セインは燈を握ったまま、消えた炉のほうへ一度だけ目をやる。この火が何であるかを、彼はまだ知らない。", directives: ["WAIT_INPUT"] }]
  },

  /* ── SCENE_INTRO / 1-02（既知感演出の分岐・[S-REVEAL-STAGES-FOREKNOWN]） ── */
  {
    script_id: "SCRIPT_SCENE_1_02_INTRO", trigger: "SCENE_INTRO", anchor: "SCENE_1_02", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "ドルン砦の炉端。鉄鎖傭兵団の一人が「二度は灯らぬ」を口にする。逃げ込んだ辺境の民は、先の村の被害を「環に還った」と語っている。セインはそこにいるが、会話に加わらない。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "荷馬車ではミレイユが荷を検め、荷台の子どもへ息を吹きかけている。彼女はセインへ複写帳簿を差し出しかけ、受け取る素振りが返らないので、そのまま外套の内側へ戻した。", directives: ["WAIT_INPUT"] }
    ]
  },
  {
    script_id: "SCRIPT_SCENE_1_02_NAMING_REWOUND", trigger: "SCENE_INTRO", anchor: "SCENE_1_02", order: 2,
    branch_group: "SCENE_1_02_NAMING", condition: "TotalRewindCount >= 1", replay_on_rollback: true,
    lines: [{ speaker: null, text: "ガルドがセインに名を尋ねる。セインは答え、続けてガルドの名を呼ぶ。ガルドはまだ名乗っていない。", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_SCENE_1_02_NAMING_INTACT", trigger: "SCENE_INTRO", anchor: "SCENE_1_02", order: 2,
    branch_group: "SCENE_1_02_NAMING", condition: "TotalRewindCount == 0", replay_on_rollback: true,
    lines: [{ speaker: null, text: "ガルドがセインに名を尋ねる。セインは答え、相手が名乗るのを待った。", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_SCENE_1_02_DECLARE", trigger: "SCENE_INTRO", anchor: "SCENE_1_02", order: 3,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: "大司教オルバン", text: "「天疵を塞ぐ。討伐隊はそのために編まれる」", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "直後、傭兵の一人が「疵の名で言う」と陰口を叩いた。", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── SCENE_INTRO / 2-01 ───────────────────────────── */
  {
    script_id: "SCRIPT_ACT_TITLE_2", trigger: "SCENE_INTRO", anchor: "SCENE_2_01", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [{ speaker: null, text: `アクト${2}：${ACT_TITLE[2]}`, directives: ["ACT_TITLE_CARD", "FADE_IN", "WAIT_INPUT"] }]
  },
  		
  /* ── SCENE_INTRO / 3-01 ───────────────────────────── */
  {
    script_id: "SCRIPT_ACT_TITLE_3", trigger: "SCENE_INTRO", anchor: "SCENE_3_01", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [{ speaker: null, text: `アクト${3}：${ACT_TITLE[3]}`, directives: ["ACT_TITLE_CARD", "FADE_IN", "WAIT_INPUT"] }]
  },
  		
  /* ── SCENE_CLEAR / 3-04 ───────────────────────────── */
  {
    script_id: "SCRIPT_SCENE_3_04_CLEAR", trigger: "SCENE_CLEAR", anchor: "SCENE_3_04", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "剣呑の庭が静まる。剣聖ロウドの型は、最後まで庭の外へ出ることがなかった。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "セインは燈を掲げる。芯の一本が、いま覚えたばかりの手つきで熱を持ち始める。", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── INTERMISSION_ENTER / 3-04（交差残響 CROSS_02_03・[S-CROSS-02-03]） ── */
  {
    script_id: "SCRIPT_CROSS_02_03", trigger: "INTERMISSION_ENTER", anchor: "SCENE_3_04", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "燈の中で、鉄鎖の遺芯と秤の遺芯が同じ日付の上に重なる。二人が並んで死んだ、半年前の帳簿の話である。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "辺境伯ドルンの援軍要請に対し、鉄鎖傭兵団への前渡し金を差し止めたのはカルナ商会であった。担保不足を理由に線を引いたのは、当時の兵站官ミレイユ本人である。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "ガルドが契約を蹴った「前金が用意できない」という理由は、目の前で門扉を死守した女が作ったものである。二人はそれぞれ、自分が相手の死の条件を作ったことを、最後まで知らない。", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── SACRIFICE_CONFIRM / 従者09（種別D残響・[S-RETAINER-09]） ── */
  {
    script_id: "SCRIPT_ECHO_09", trigger: "SACRIFICE_CONFIRM", anchor: "ATTENDANT_09", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "オルフェは、王都で封鎖結界の前に立つ半年以上前から、不治の病〈気涸れ〉を負っていた。あの日すでに、残された時間は半年であった。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "結界の前で全気脈を焼き切ったのは献身ではなく、尽きかける気脈を使い切ったにすぎない。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "——結界の前で押しとどめたところで、この男は次の冬を越えない。", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── ACT_TRANSITION / 3 → アクト4（種別B残響＋アクト表題） ── */
  {
    script_id: "SCRIPT_ECHO_05", trigger: "ACT_TRANSITION", anchor: "3", order: 1,
    branch_group: null, condition: "AttendantPresent[ATTENDANT_05] == True", replay_on_rollback: true,
    lines: [
      { speaker: null, text: "資質を借りられなかった老人には、喋る時間だけが残る。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "セルヴィスは死ぬ前にセインの異常に気づいていた。初めて古文書館へ入ったはずの青年が、灯りも持たずに最奥の第七棚へ直行したからである。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "終焉燈と依代術の記述が残された一葉を、彼は最後の力でセインの手が絶対に届かない方向へ運んでいる。世界の理の記録者が生涯最後に下した判断は、「この青年に読ませてはならない」であった。", directives: ["WAIT_INPUT"] }
    ]
  },
  {
    script_id: "SCRIPT_ACT_TITLE_4", trigger: "ACT_TRANSITION", anchor: "3", order: 2,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [{ speaker: null, text: `アクト${4}：${ACT_TITLE[4]}`, directives: ["ACT_TITLE_CARD", "FADE_IN", "WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_ACT_TITLE_5", trigger: "ACT_TRANSITION", anchor: "4", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [{ speaker: null, text: `アクト${5}：${ACT_TITLE[5]}`, directives: ["ACT_TITLE_CARD", "FADE_IN", "WAIT_INPUT"] }]
  },

  /* ── ENDING / a（通常エンディング〈英雄〉・[S-END-A-SCENE]） ── */
  {
    script_id: "SCRIPT_END_A", trigger: "ENDING", anchor: "a", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "刃は一度で足りる。器は音もなく砕け、灰へ還る。その瞬間、閉塞していた空が軋みを止めて晴れ渡っていく。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "虚穴は消滅し、世界には平穏が戻り、生き残った人々はセインを不滅の「英雄」と讃える。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "しかし、焼け落ちたカルデン大聖堂の瓦礫の上に急ごしらえされた祭壇——その歓声と祝福の渦の真ん中で、セインの瞳には光が宿っていない。", directives: ["SILENCE", "WAIT_INPUT"] },
      { speaker: null, text: "彼は人々の賞賛を背に受けながら、無言のまま黒鉄の終焉燈を高く掲げる。そして——自らの意志で、その燈火を強く吹き消す。", directives: ["WAIT_INPUT", "BLACKOUT_TO_1_01"] }
    ]
  },
  {
    script_id: "SCRIPT_NEWGAME_INTRO", trigger: "NEWGAME_INTRO", anchor: null, order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "赤黒い炎がくすぶるグレンフィル村。腕の中で息の止まったリナ。足元にランタンを投げ落として去っていく黒衣の巡礼者。", directives: ["FADE_IN", "WAIT_INPUT"] },
      { speaker: "セイン", text: "「……また、ここか。\n　二度は灯らぬ、と誰もが言う。\n　……{TotalRewindCount}回」", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── ENDING / b（終局エンディング〈環へ還る〉・[S-END-B]） ── */
  {
    script_id: "SCRIPT_END_B", trigger: "ENDING", anchor: "b", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "セインは刃を鞘へ戻し、燈を静かに地へ置く。器は変わらず息を吹き続けている。誰にも届かない所作を、飽きることなく。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "やがて彼は倒れる。天の座は生者の立つ場所ではない。逆流が収まるまでの猶予を、彼はここで全部使った。立ち続けることだけが、猶予を残さない選び方である。", directives: ["SILENCE", "WAIT_INPUT"] },
      { speaker: null, text: "地に置かれた燈は、誰にも吹き消されないまま燃え続けている。吹き消す者がいない。——ゆえに、この道行きは巻き戻らない。芯に残された者も、還らない。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "黄昏の階段の上に、器だけが残る。それは変わらず、何もない虚空へ息を吹きかけ続けている。", directives: ["WAIT_INPUT", "FADE_OUT"] }
    ]
  },

  /* ── ENDING / c-1（真エンディング〈灯し直し〉・[S-END-C1-INVOKE]） ── */
  {
    script_id: "SCRIPT_END_C1", trigger: "ENDING", anchor: "c-1", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "セインは刃を鞘へ戻す。少女の形をしたものを八度斬ってきた手が、二度目に止まる。一度目は、四層の鐘の前であった。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "彼は左手の燈を持ち上げる。燈火にはついに一度も触れぬまま、リナの遺芯だけをそっと指で摘まみ上げる。——そして、静かにその息で吹き消した。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "解き放たれた魂は、いつものように銀環へ向かおうとして——その途上で、待ち構えていた秘蹟の光に掬い上げられる。五百年間ただの一度も成立しなかった例外が、いま初めて成立する。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "一つが降り、一つが昇る。祭壇には二人いる。見上げている者は、どちらもいない。器の手が、虚空へ吹きかけていた息の途中で止まる。その掌の中に、初めて灯すべきものが在る。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "黒鉄のランタンが乾いた音を立てて砕け散り、光が収まった後。そこには、確かな温もりと重みを持って息をし、涙を流しながら微笑む「生者としてのリナ」が立っていた。", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── ENDING / c-2（真エンディング特殊分岐〈灯し切り〉・[S-END-C2-SCENE]） ── */
  {
    script_id: "SCRIPT_END_C2", trigger: "ENDING", anchor: "c-2", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "光がリナへ降りていく速度に合わせて、セインの側からは生命が引いていく。支払いに上限はなく、器に残っていた全量を充当する。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "黒鉄のランタンが砕け散り、膝をついたのは彼のほうだった。リナは自分の手を見る。指が動き、息が入り、体温が戻る。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "目の前に倒れている男を認識したとき、彼女の「消えかけの火を灯し直す力」は自身を蘇生させる熱として使い切られている。灯し直すための器である終焉燈は砕けており、彼女は彼を灯し直すことができない。", directives: ["WAIT_INPUT"] }
    ]
  },
  {
    script_id: "SCRIPT_END_C2_TAIL_REWOUND", trigger: "ENDING", anchor: "c-2", order: 2,
    branch_group: "END_C2_TAIL", condition: "TotalRewindCount >= 1", replay_on_rollback: true,
    lines: [{ speaker: null, text: "セインの表情は穏やかである。彼はこの結末を過去の周回で経験した上で、ここへ戻ってきている。", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_END_C2_TAIL_INTACT", trigger: "ENDING", anchor: "c-2", order: 2,
    branch_group: "END_C2_TAIL", condition: "TotalRewindCount == 0", replay_on_rollback: true,
    lines: [{ speaker: null, text: "セインの表情は穏やかである。彼はこの結末を経験しないまま、これを選んでいる。", directives: ["WAIT_INPUT"] }]
  },

  /* ── ENDING / d（空芯エンディング〈空を灯す〉・[S-END-D-SCENE]） ── */
  {
    script_id: "SCRIPT_END_D", trigger: "ENDING", anchor: "d", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "一番目の芯座は空であり、摘まみ上げる対象が存在しない。秘蹟は作動し、器へ通る道が開く。だが、銀環の奔流にも留まる側にも、リナの魂は存在しない。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "器の手は虚空への呼気の途中で止まり、掌を上に向けて受領を待つ。降りてくる魂のないまま実効回数が尽き、秘蹟は焼き切れる。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "ランタンが砕け散り、芯座に残っていた {EnshrinedCount} 人分の結び目のみが解けて銀環へ昇る。一番目の芯座からは何も昇らない。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "セインは供犠による補填により消費に耐え、立っている。彼は依代を破壊することなく階段を下りる。", directives: ["WAIT_INPUT"] }
    ]
  },

  /* ── EPILOGUE / c-1（見殺しの罪の開示・[S-EPILOGUE]） ── */
  {
    script_id: "SCRIPT_EPILOGUE_OPEN", trigger: "EPILOGUE", anchor: "c-1", order: 1,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "復興の始まったグレンフィル村の草原。", directives: ["FADE_IN", "WAIT_INPUT"] },
      { speaker: "リナ", text: "「ねえ、セイン……。\n　ここに来るまでに、あなたが出会った人たちは……あなたを助けてくれた仲間たちは、今どこにいるの？」", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "セインは何も答えない。穏やかな風が二人の間を吹き抜ける。", directives: ["CAMERA_CLOSEUP", "SILENCE", "WAIT_INPUT"] },
      { speaker: null, text: "セインの瞳の奥を、旅路で散っていった十四の顔が、出会った順にひとつずつ過ぎていく。音は何も鳴らない。", directives: ["PORTRAIT_ROLL", "WAIT_INPUT"] }
    ]
  },
  {
    script_id: "SCRIPT_EPILOGUE_COUNT", trigger: "EPILOGUE", anchor: "c-1", order: 2,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "彼らのうち、セインが燈に迎え入れたのは {EnshrinedCount} 人だ。増えた遺芯の数だけ、最も使い勝手のよい資質を選び抜いた結果である。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "残る {UnenshrinedCount} 人は、遺芯に宿されることすらなく、ただ静かに天へ還っていった。この燈が焚き上げたのは {SacrificeCount} 人である。その者たちは、天へも還っていない。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "燃やされた者にも、燃やされなかった者にも、生きて帰る道はあった。", directives: ["WAIT_INPUT"] }
    ]
  },
  {
    script_id: "SCRIPT_EPILOGUE_INTACT", trigger: "EPILOGUE", anchor: "c-1", order: 3,
    branch_group: "EPILOGUE_KNOWING", condition: "TotalRewindCount == 0", replay_on_rollback: true,
    lines: [{ speaker: null, text: "彼らがどんな想いで死んでいったのかを、この男は知らない。一度も戻らなかったからである。", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_EPILOGUE_REWOUND", trigger: "EPILOGUE", anchor: "c-1", order: 3,
    branch_group: "EPILOGUE_KNOWING", condition: "TotalRewindCount >= 1", replay_on_rollback: true,
    lines: [{ speaker: null, text: "彼ら一人ひとりに、語られなかった一件がある。この男はそれを知りながら、最後まで聞かないまま顔を見送る。", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_EPILOGUE_CROSS", trigger: "EPILOGUE", anchor: "c-1", order: 4,
    branch_group: null, condition: "CrossUnlockedAny == True", replay_on_rollback: true,
    lines: [{ speaker: null, text: "彼らのうちの幾人かは、互いの生死を決める側にいた。知らないまま、名も知らぬ相手の勘定を書き、名簿から外し、数え落としていた。燈はその構造を一本の芯へ縮めて手渡しただけである。", directives: ["WAIT_INPUT"] }]
  },
  {
    script_id: "SCRIPT_EPILOGUE_CLOSE", trigger: "EPILOGUE", anchor: "c-1", order: 5,
    branch_group: null, condition: null, replay_on_rollback: true,
    lines: [
      { speaker: null, text: "十四人が流れ終わる。数え落とされた者は、もう一人いる。セインはその存在を知らない。名も、顔も、そこに居合わせたことも。", directives: ["WAIT_INPUT"] },
      { speaker: null, text: "誰を燃やし、誰を捨て置き、そして誰のことを何一つ知らないまま燃料にしたのか。——その問いだけを残して、物語は幕を閉じる。", directives: ["WAIT_INPUT", "FADE_OUT"] }
    ]
  }
];


/* ═══ 1-12. 監視条件  [M-UI-WATCH] ═══ */

const WATCH_COND_KEYS = ["可", "止", "中前", "中後", "避"];
const WATCH_COND_LABELS = {
  "可": "実行可能", "止": "スタン", "中前": "命中・前列", "中後": "命中・後列", "避": "回避"
};

