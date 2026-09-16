// [I-PLAN-MASTERGEN]［人が書く入力］敵マスタ（[M-DATA-ENEMYMASTER]）。
// 範囲は [I-PLAN-MILESTONE] M5（1-01〜5-11 の31体）。
//
// 各レコードが与えるのは、テンプレート種別（[M-TMPL-ENEMY] 配下）・特殊枠の内容
// （[M-BASE-AR-SPECIAL]）・個別上書き（[M-BASE-PRINCIPLE]）・表示名であり、
// AR値および基礎値の算出は生成器（templates.js・lib.js）が担う。
//
// max_hp の正本は [M-DATA-SCENES]「敵マスター HP」列、ai_profile_id は [A-PROFILE-TABLE]「適用」列、
// book_id は [A-BOOK-TABLE]［定跡の割当］による。
// display_name / role_name は [S-ENEMY-1-01]〜[S-ENEMY-VESSEL] の見出しを
// 「固有名 / 分類名」へ分解したものである（[M-TMPL-VESSEL]［ユニット定義］「リナ / 第三百一の依代」に倣う）。
//
// ［特殊枠の選択］[M-TMPL-ENEMY-SPECIAL] の規則による。
//   * 当該シーンの unlock が解放する機構を体現する1本を置く。
//   * unlock が空、または解放要素が既存アクションの改変（BUFF_* / DEBUFF_*）にとどまる場合は
//     [A-PROFILE-TABLE] の action_bonus が加点する系統に合わせる。
//   * ［確定している割当］（壁割り・射程3・封印・最終ボス）が上記に優先する。
// ［与バフ・与デバフの担い手］[M-RESOLVE-ORDER] により、与バフ量は Step 3（FLAG_MIND）で自己へ、
//   与デバフ量は Step 4（FLAG_MARTIAL）で被弾側へ適用される。したがって DEBUFF_* を解放する
//   シーンの特殊枠は必ず射程を持つ（複合を含む）。

// [M-STATE-PARAMIDS]「標準付与量」列。減少型 0.33 / 増加型 0.50（centi）。
const DEC = 33;
const INC = 50;

export const ENEMIES = [
  {
    // [M-TMPL-ENEMY-1-01]
    enemy_id: 'ENEMY_LEF',
    display_name: 'レフ',
    role_name: '祠守',
    scene_id: 'SCENE_1_01',
    max_hp: 10,
    template: 'E1_01',
    ai_profile_id: 'PROFILE_FRENZY',
    book_id: 'B-01',
    specials: [],
  },
  {
    // [M-TMPL-ENEMY-1-02]
    enemy_id: 'ENEMY_DORN',
    display_name: 'ドルン',
    role_name: '辺境伯',
    scene_id: 'SCENE_1_02',
    max_hp: 27,
    template: 'E1_02',
    ai_profile_id: 'PROFILE_ASSAULT',
    book_id: 'B-02',
    specials: [],
  },
  {
    // [M-GUARD-BREAKER] 2-02〜2-04 の壁割り担当（要求基礎攻撃力 48 以上）。
    // [M-GUARD-REACH]［オーサリング制約］同一のアクションが range = 3 を併せ持つ。
    enemy_id: 'ENEMY_VOLG',
    display_name: 'ヴォルグ',
    role_name: '腑分け師',
    scene_id: 'SCENE_2_01',
    max_hp: 21,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_COMMANDER',
    book_id: null,
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BREAK_VOLG',
        display_name: '腑分けの刃',
        override: { atk: 48, range: 3 },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ISH',
    display_name: 'イシュ',
    role_name: '囁き',
    scene_id: 'SCENE_2_02',
    max_hp: 39,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_DRAIN_VP',
    book_id: null,
    specials: [
      {
        // unlock: STRIP_VP（[A-PROFILE-BONUS] STRIP_VP は dmg_vp > 0 で判定される）
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DRAIN_VP_ISH',
        display_name: '破滅の旋律',
        extras: ['dmg_vp'],
      },
    ],
  },
  {
    enemy_id: 'ENEMY_CALVA',
    display_name: 'カルヴァ',
    role_name: '腐術師',
    scene_id: 'SCENE_2_03',
    max_hp: 59,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_DRAIN_PP',
    book_id: null,
    specials: [
      {
        // unlock: STRIP_PP
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DRAIN_PP_CALVA',
        display_name: '腐る術式',
        extras: ['dmg_pp'],
      },
    ],
  },
  {
    // [M-GUARD-BREAKER] 3-01〜3-06 の壁割り担当（要求基礎攻撃力 72 以上）。
    enemy_id: 'ENEMY_ASHAL',
    display_name: 'アシャル',
    role_name: '虚穴の使徒',
    scene_id: 'SCENE_2_04',
    max_hp: 163,
    template: 'BOSS',
    ai_profile_id: 'PROFILE_SURGE',
    book_id: 'B-03',
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BREAK_ASHAL',
        display_name: '使徒の断罪',
        override: { atk: 72 },
      },
      {
        // 特殊枠の残り1枠は [A-PROFILE-TABLE] PROFILE_SURGE の action_bonus（SUMMON）に合わせる。
        component: 'SUMMON',
        base: 'SUMMON/BASIC',
        ar_mult: 300,
        class_id: 'ACT_SPEC_SWARM_ASHAL',
        display_name: '虚穴の招来',
      },
    ],
  },
  {
    enemy_id: 'ENEMY_TARGA',
    display_name: 'タルガ',
    role_name: '砕き',
    scene_id: 'SCENE_3_01',
    max_hp: 71,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_WALLBREAK',
    book_id: null,
    specials: [
      {
        // unlock: STRIP_AP
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_STRIP_AP_TARGA',
        display_name: '砕きの一撃',
        extras: ['dmg_ap'],
      },
    ],
  },
  {
    enemy_id: 'ENEMY_TEODOR',
    display_name: 'テオドル',
    role_name: '聖務官',
    scene_id: 'SCENE_3_02',
    max_hp: 109,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_USHER',
    book_id: null,
    specials: [
      {
        // unlock: INTERFERE（[M-RESOLVE-INTERFERE]。位置干渉の初出シーン）
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_INTERFERE_TEODOR',
        display_name: '階の突き落とし',
        override: { interfere_pos: 'PUSH' },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_MAREN',
    display_name: 'マレン',
    role_name: '典礼長',
    scene_id: 'SCENE_3_03',
    max_hp: 153,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_TALLY',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_COST_HP。PROFILE_TALLY の action_bonus は SELF_HARM（cost_hp > 0）＝心気系統。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_BUFF_COST_HP_MAREN',
        display_name: '帳尻の秤',
        override: { give_buff: { cost_hp: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ROUD',
    display_name: 'ロウド',
    role_name: '剣聖',
    scene_id: 'SCENE_3_04',
    max_hp: 184,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_EXECUTION',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_COST_PP。PROFILE_EXECUTION の action_bonus は HEAVY（def_efficiency == 0）。
        // 与バフ量を併せ持つ複合特殊アクション（[M-BASE-AR-COMPOSITE]）である。
        component: 'MARTIAL',
        base: 'MARTIAL/HEAVY',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BUFF_COST_PP_ROUD',
        display_name: '剣聖の見切り',
        // 与バフ量は [M-RESOLVE-ORDER] Step 3（FLAG_MIND）で解決されるため、本アクションは心気を内包する
        // 複合特殊アクションである（[M-BASE-AR-COMPOSITE]）。心気コンポーネントの基礎値を併せて取り込む。
        compose: { from: 'MIND/BASIC', keys: ['gain_vp', 'charge_pp'] },
        override: { give_buff: { cost_pp: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ODERIK',
    display_name: 'オルデリク',
    role_name: 'エルデン王',
    scene_id: 'SCENE_3_05',
    max_hp: 218,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_RELENTLESS',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_STEP_RECOVERY。PROFILE_RELENTLESS の action_bonus は PASS のみで系統を指さないため、
        // 与バフ量の担い手である心気系統（[M-BASE-AR-MIND]［与バフ量］）に置く。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_BUFF_STEP_RECOVERY_ODERIK',
        display_name: '王の号令',
        override: { give_buff: { step_recovery: DEC } },
      },
    ],
  },
  {
    // [M-GUARD-BREAKER] 4-01〜4-08 の壁割り担当（要求基礎攻撃力 110 以上）。
    enemy_id: 'ENEMY_ZEFAL',
    display_name: 'ゼファル',
    role_name: '枢機卿',
    scene_id: 'SCENE_3_06',
    max_hp: 539,
    template: 'BOSS',
    ai_profile_id: 'PROFILE_COMMANDER_BUFF',
    book_id: 'B-04',
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BREAK_ZEFAL',
        display_name: '枢機卿の断罪',
        override: { atk: 110 },
      },
      {
        // [A-BOOK-TABLE] B-04 ① のセレクタ {MIND, SPECIAL, 1.5} が指す自己バフの心気（特殊）。
        // [M-DATA-UNLOCKKEYS]「未出のキーを先取りしてはならない」により、与バフ量は
        // 3-03・3-04・3-05 が解放済みの cost_hp / cost_pp / step_recovery に限る。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_SELFBUFF_ZEFAL',
        display_name: '聖別の祈り',
        override: { give_buff: { cost_pp: DEC, step_recovery: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_HAUSEN',
    display_name: 'ハウゼン',
    role_name: '初代討伐長',
    scene_id: 'SCENE_4_01',
    max_hp: 235,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_INITIATIVE',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_STEP_THOUGHT。PROFILE_INITIATIVE の action_bonus は RUSH。
        component: 'MARTIAL',
        base: 'MARTIAL/RUSH',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BUFF_STEP_THOUGHT_HAUSEN',
        display_name: '先駆けの号',
        // 与バフ量は [M-RESOLVE-ORDER] Step 3（FLAG_MIND）で解決されるため、本アクションは心気を内包する
        // 複合特殊アクションである（[M-BASE-AR-COMPOSITE]）。心気コンポーネントの基礎値を併せて取り込む。
        compose: { from: 'MIND/BASIC', keys: ['gain_vp', 'charge_pp'] },
        override: { give_buff: { step_thought: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_OREIN',
    display_name: 'オレイン',
    role_name: '囁きの伝令',
    scene_id: 'SCENE_4_02',
    max_hp: 309,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_AMBUSH',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_STEP_STARTUP。PROFILE_AMBUSH の action_bonus は HEAVY。
        component: 'MARTIAL',
        base: 'MARTIAL/HEAVY',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BUFF_STEP_STARTUP_OREIN',
        display_name: '囁く岩の報せ',
        // 与バフ量は [M-RESOLVE-ORDER] Step 3（FLAG_MIND）で解決されるため、本アクションは心気を内包する
        // 複合特殊アクションである（[M-BASE-AR-COMPOSITE]）。心気コンポーネントの基礎値を併せて取り込む。
        compose: { from: 'MIND/BASIC', keys: ['gain_vp', 'charge_pp'] },
        override: { give_buff: { step_startup: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_SERG',
    display_name: 'セルグ',
    role_name: '逆さの森の守人',
    scene_id: 'SCENE_4_03',
    max_hp: 389,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_DEFENSE_STRONG',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_DECAY_AP, BUFF_DEPLOY_AP。PROFILE_DEFENSE_STRONG の action_bonus は STANCE。
        // [M-GUARD-ASYM] が 4-03 の実効壁を 104（= round(69 × 1.50)）と確定するため、
        // 本アクションの展開APは基本型体勢 AR56 と同値の 69 を上限とする個別定義を置く
        // （[M-BASE-AR-SPECIAL]）。壁の最大値は基本型体勢と並び 69 のままである。
        component: 'STANCE',
        base: 'STANCE/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BUFF_WALL_SERG',
        display_name: '逆さの守り',
        // 与バフ量は [M-RESOLVE-ORDER] Step 3（FLAG_MIND）で解決されるため、本アクションは心気を内包する
        // 複合特殊アクションである（[M-BASE-AR-COMPOSITE]）。心気コンポーネントの基礎値を併せて取り込む。
        compose: { from: 'MIND/BASIC', keys: ['gain_vp', 'charge_pp'] },
        override: { deploy_ap: 69, give_buff: { decay_ap: DEC, deploy_ap: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_RIIN',
    display_name: 'リィン',
    role_name: '沈鐘の唱者',
    scene_id: 'SCENE_4_04',
    max_hp: 454,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_EFFICIENCY',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_GAIN_VP, BUFF_CHARGE_PP。PROFILE_EFFICIENCY の action_bonus は MIND。
        // [M-GUARD-ASYM] が 4-04 の実効壁を 110（= round(73 × 1.50)）と定めるため、
        // 展開APバフ（4-03 で解放済み）を本アクションが併せ持つ。壁の基礎値は基本型体勢 AR62 の 73 である。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_BUFF_TIDE_RIIN',
        display_name: '沈鐘の唱和',
        override: { give_buff: { gain_vp: INC, charge_pp: INC, deploy_ap: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_GRAVE',
    display_name: 'グレイヴ',
    role_name: '渡し守',
    scene_id: 'SCENE_4_05',
    max_hp: 521,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_SNIPE',
    book_id: null,
    specials: [
      {
        // unlock: BUFF_RANGE, BUFF_ATK。PROFILE_SNIPE の action_bonus は空であり系統を指さないため、
        // 与バフ量の担い手である心気系統に置く。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_BUFF_AIM_GRAVE',
        display_name: '渡しの見定め',
        override: { give_buff: { range: INC, atk: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_VOD_RIA',
    display_name: 'ヴォド＝リア',
    role_name: '喰らう環',
    scene_id: 'SCENE_4_06',
    max_hp: 568,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        // unlock: DEBUFF_COST_HP。PROFILE_CURSE の action_bonus は DEBUFF。
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_COST_HP_VOD_RIA',
        display_name: '喰らう環',
        override: { give_debuff: { cost_hp: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ZOL_NA',
    display_name: 'ゾル＝ナ',
    role_name: '門前の三十一番',
    scene_id: 'SCENE_4_07',
    max_hp: 616,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        // unlock: DEBUFF_COST_PP
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_COST_PP_ZOL_NA',
        display_name: '門前の枷',
        override: { give_debuff: { cost_pp: DEC } },
      },
    ],
  },
  {
    // [M-GUARD-BREAKER] 5-01〜5-10 の壁割り担当（要求基礎攻撃力 152 以上）。
    enemy_id: 'ENEMY_ZOL_VOD',
    display_name: 'ゾル＝ヴォド',
    role_name: '虚穴の主',
    scene_id: 'SCENE_4_08',
    max_hp: 1468,
    template: 'BOSS',
    ai_profile_id: 'PROFILE_BULWARK',
    book_id: 'B-05',
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_BREAK_ZOL_VOD',
        display_name: '深核の顎',
        override: { atk: 152 },
      },
      {
        // [A-BOOK-TABLE] B-05 ① のセレクタ {MIND, SPECIAL, 1.5}。PP充填を確保してから
        // ②（体勢 AR117 / コストPP39）を展開する運用を定跡が担う。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_SELFBUFF_ZOL_VOD',
        display_name: '深核の呼吸',
        override: { give_buff: { charge_pp: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_007',
    display_name: '第七のエルナ',
    role_name: '物言わぬ',
    scene_id: 'SCENE_5_01',
    max_hp: 640,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_STEP_RECOVERY_ERNA_007',
        display_name: '物言わぬ滞り',
        override: { give_debuff: { step_recovery: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_019',
    display_name: '第十九のエルナ',
    role_name: '数えるもの',
    scene_id: 'SCENE_5_02',
    max_hp: 767,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_STEP_THOUGHT_ERNA_019',
        display_name: '数える停滞',
        override: { give_debuff: { step_thought: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_044',
    display_name: '第四十四のエルナ',
    role_name: '手だけの',
    scene_id: 'SCENE_5_03',
    max_hp: 901,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_STEP_STARTUP_ERNA_044',
        display_name: '手だけの遅れ',
        override: { give_debuff: { step_startup: DEC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_080',
    display_name: '第八十のエルナ',
    role_name: '脱げぬ',
    scene_id: 'SCENE_5_04',
    max_hp: 1014,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_DEFENSE',
    book_id: null,
    specials: [
      {
        // unlock: DEBUFF_DECAY_AP, DEBUFF_DEPLOY_AP。PROFILE_DEFENSE の action_bonus は STANCE。
        // 与デバフ量は [M-RESOLVE-ORDER] Step 4（FLAG_MARTIAL）でのみ適用されるため、
        // 体勢と武技を内包する複合特殊アクションとする（[M-BASE-AR-COMPOSITE]）。
        component: 'STANCE',
        base: 'STANCE/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_WALL_ERNA_080',
        display_name: '脱げぬ鎧',
        compose: { from: 'MARTIAL/BASIC', keys: ['range', 'atk', 'dmg_hp', 'stun', 'strip_rate'] },
        override: { give_debuff: { decay_ap: DEC, deploy_ap: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_130',
    display_name: '第百三十のエルナ',
    role_name: '息をする',
    scene_id: 'SCENE_5_05',
    max_hp: 1131,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_TIDE_ERNA_130',
        display_name: '息をする枯れ',
        override: { give_debuff: { gain_vp: INC, charge_pp: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_200',
    display_name: '第二百のエルナ',
    role_name: '名を呼ぶ',
    scene_id: 'SCENE_5_06',
    max_hp: 1222,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_CURSE',
    book_id: null,
    specials: [
      {
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_DEBUFF_AIM_ERNA_200',
        display_name: '名を呼ぶ鈍り',
        override: { give_debuff: { range: INC, atk: INC } },
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_299',
    display_name: '第二百九十九のエルナ',
    role_name: '灰の',
    scene_id: 'SCENE_5_07',
    max_hp: 1314,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_ASHBLIGHT',
    book_id: null,
    specials: [
      {
        // unlock: SLIP
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_SLIP_ERNA_299',
        display_name: '灰蝕',
        extras: ['give_slip'],
      },
    ],
  },
  {
    enemy_id: 'ENEMY_ERNA_300',
    display_name: '第三百のエルナ',
    role_name: '倣うもの',
    scene_id: 'SCENE_5_08',
    max_hp: 1377,
    template: 'NORMAL',
    ai_profile_id: 'PROFILE_MIMIC',
    book_id: null,
    specials: [
      {
        // unlock: COPY
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_COPY_ERNA_300',
        display_name: '倣い',
        extras: ['initial_copy_val'],
      },
    ],
  },
  {
    // [M-TMPL-ENEMY-MIRROR] 主人公初期キットの構成を倍率で写した専用構成。
    enemy_id: 'ENEMY_MIRROR_SEIN',
    display_name: 'セイン',
    role_name: '写し身',
    scene_id: 'SCENE_5_09',
    max_hp: 1441,
    template: 'MIRROR',
    ai_profile_id: 'PROFILE_MIRROR',
    book_id: 'B-06',
    specials: [
      {
        // [M-TMPL-ENEMY-MIRROR]［封印手段の到達性条件］与封印量 12.00・基礎攻撃力 152 以上。
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_SEAL_MIRROR',
        display_name: '写し身の封',
        override: { give_seal: 1200, atk: 152 },
      },
    ],
  },
  {
    // [M-TMPL-ENEMY-FINAL] 全系統の最高峰AR技を搭載する。
    enemy_id: 'ENEMY_VEIN',
    display_name: 'ヴェイン',
    role_name: '黒衣の巡礼者',
    scene_id: 'SCENE_5_10',
    max_hp: 6506,
    template: 'FINAL',
    ai_profile_id: 'PROFILE_TERMINUS',
    book_id: 'B-07',
    specials: [
      {
        // [A-BOOK-TABLE] B-07 ① のセレクタ {MIND, SPECIAL, 1.5}。
        component: 'MIND',
        base: 'MIND/BASIC',
        ar_mult: 150,
        class_id: 'ACT_SPEC_MIND_VEIN',
        display_name: '復輪の呼気',
        override: { give_buff: { charge_pp: INC, atk: INC } },
      },
      {
        // [M-TMPL-ENEMY-FINAL]「基礎攻撃力は、5-10 においてプレイヤーが到達しうる実効防壁の上限以上」。
        // 上限の算出は tests/audit の [M-TMPL-ENEMY-FINAL] 検査が実データから再計算して照合する。
        component: 'MARTIAL',
        base: 'MARTIAL/BASIC',
        ar_mult: 400,
        class_id: 'ACT_SPEC_TERMINUS_VEIN',
        display_name: '終焉の刃',
        override: { atk: 355 },
      },
      {
        // [M-DATA-CLASSID]［予約クラスID］ACT_REMNANT。基礎初期使用回数 0.15。
        // [M-STATE-FLAGS-EXCEPTION]「FLAG_MIND を付与。効果を持たない空振りアクションである」。
        // 本行は AR 倍率を持たない固有枠であり、[A-BOOK-SCHEMA] のセレクタ照合の対象としない
        // （B-07 ① の {MIND, SPECIAL, 1.5} が ACT_SPEC_MIND_VEIN へ一意に解決されるため）。
        component: 'REMNANT',
        base: 'MIND/BASIC',
        ar_mult: 100,
        class_id: 'ACT_REMNANT',
        display_name: '復輪の残滓',
        base_uses: 15,
        manual_sys_flag: 'FLAG_MIND',
        blank: true,
      },
    ],
  },
  {
    // [M-TMPL-VESSEL] 主人公へダメージを与えない終端オブジェクト。
    // AI無効・固定行動周期であり、静的監査・非機能テストから除外する。
    enemy_id: 'ENEMY_VESSEL',
    display_name: 'リナ',
    role_name: '第三百一の依代',
    scene_id: 'SCENE_5_11',
    max_hp: 1,
    template: 'VESSEL',
    ai_profile_id: null,
    book_id: null,
    audit_exempt: true,
    specials: [],
  },
];
