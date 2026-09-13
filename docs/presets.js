/* 終焉燈 ─ 検証用プリセット
   UIプロトタイプ.html から分離。masters.js・instantiate.js の後に読み込む。
   シーン依存値（レベル・アクト・シーン番号・敵マスター名）は configFromScene が
   SCENE_MASTER / ENEMY_MASTER から引く（[M-DATA-SCENES]・[M-DATA-ENEMYMASTER]）。
   プリセットが直接持つのは局面固有値（NOW・SPAN_DEFAULT・SAVE_PHASE）のみ。 */

/** シーン依存値を [M-DATA-SCENES] から引き、局面固有値だけを受け取る */
function configFromScene(sceneId, own) {
  const s = SCENE_MASTER[sceneId];
  if (!s) throw new Error("未登録の scene_id: " + sceneId);
  const e = ENEMY_MASTER[s.enemy_id];
  return {
    SCENE_ID:      sceneId,
    SCENE_LEVEL:   s.level,
    CURRENT_ACT:   s.act,
    CURRENT_SCENE: sceneId.slice(-2),
    CURRENT_BOSS:  applyNaming(e.display_name),
    ...own
  };
}

/* ── 検証用プリセット ────────────────────────────────────────────
   whyCode は停止事由コード（[M-UI-PAUSE-REASON]）。
   whyPayload のキーは [M-DATA-INTERP] の語彙をそのまま用いる。
   null のとき updatePauseReason は停止事由バーを描画しない。 */
const PRESETS = {
  scene_3_04: {
    config: configFromScene("SCENE_3_04", { NOW: 42, SPAN_DEFAULT: 22, SAVE_PHASE: "BATTLE" }),
    totalRewind: 137,
    whyCode: "ENEMY_START",
    whyPayload: { ActionName: "庭の型", RemainingSteps: 4 },
    units: [
      buildCreatureUnit("mine", 0, "CREATURE_ASHWING", {
        pp: 12,
        lastAct: { n: "翅打ち" },
        acting: { name: "翅打ち", phase: "硬直", cur: 12, max: 33, de: 2.00, atk: null }
      }),
      createUnit("mine", 1, "セイン", "マスター", {
        hp: 214,
        maxHp: 496,
        vp: 34,
        pp: 128,
        ap: 8,
        thought: 24,
        lastAct: { n: "鉄鎖の一閃" },
        acts: [
          defineAction({ classId: "ACT_FAST_SLASH", n: "風脚の太刀", k: "武技（俊敏・カイ継承）", cost: [["pp", 11]], st: [17, 6, 15], uses: 10, maxUses: 30, range: 1, atk: 20, dmg_hp: 2.22, stun: true, strip_rate: 0.50 }),
          defineAction({ classId: "ACT_IRON_FLASH", n: "鉄鎖の一閃", k: "武技（基本）", cost: [["pp", 11]], st: [17, 6, 23], uses: 30, maxUses: 30, range: 1, atk: 20, dmg_hp: 2.22, stun: true, strip_rate: 0.50 }),
          defineAction({ classId: "ACT_WIND_THRUST", n: "風脚の突き", k: "武技（急襲）", cost: [["pp", 6], ["ap", 5]], st: [0, 8, 39], uses: 9, maxUses: 9, range: 2, atk: 7, dmg_hp: 1.57, stun: true, strip_rate: 0.50, base: 3 }),
          { ...createStanceBasic({ classId: "ACT_IRON_SHIELD", n: "鉄鎖の盾", ppCost: 11, st: [0, 12, 35], deploy: 54 }), uses: 30, maxUses: 30 },
          defineAction({ classId: "ACT_CALL_ASHWING", n: "灰翅を呼ぶ", k: "召喚（基本）", sys: ["summon"], cost: [["vp", 5]], de: 1.00, uses: 3, maxUses: 9, gain: "クリーチャーを入れ替える", base: 3 }),
          defineAction({ classId: "ACT_BREATH_ASH", n: "灰を吸う息", k: "心気（基本）", sys: ["mind"], cost: [["hp", 32]], st: [62, 4, 0], uses: 45, maxUses: 45, gain_vp: 5, charge_pp: 2.39, purify: 0.50 }),
          SYSTEM_ACTIONS.SWAP_SINGLE("ACT_SWAP_SEIN", "退き"),
          SYSTEM_ACTIONS.ROOT_MARTIAL()
        ]
      }),
      createUnit("foe", 2, applyNaming(ENEMY_MASTER.ENEMY_ROUDO.display_name), "敵マスター", {
        hp: ENEMY_MASTER.ENEMY_ROUDO.max_hp,
        vp: 21,
        pp: 66,
        ap: 8,
        buffMap: { cost_pp: 0.33 },
        lastAct: { n: "庭の型" },
        acting: { name: "庭の型", phase: "発生", cur: 2, max: 10, de: 2.00, atk: 20, fire: 50, stun: true },
        chips: [["up", "硬直 −33%"]],
        acts: [
          { ...BATTLE_ACTIONS.GARDEN(), uses: 9, maxUses: 10, running: true, fire: 50, now: true, mem: true },
          { ...BATTLE_ACTIONS.SWORD_ONE(), uses: 1, maxUses: 1 },
          { ...BATTLE_ACTIONS.HEAVY_ONE(), uses: 2, maxUses: 3 },
          { ...BATTLE_ACTIONS.STRIKE_FAST(), uses: 1, maxUses: 3 },
          { ...BATTLE_ACTIONS.STEP_STYLE(), uses: 7, maxUses: 10 },
          { ...BATTLE_ACTIONS.SHEATH(), uses: 8, maxUses: 10 },
          { ...BATTLE_ACTIONS.HALF_BODY(), uses: 10, maxUses: 10 },
          { ...BATTLE_ACTIONS.CALL(), uses: 2, maxUses: 3 },
          { ...BATTLE_ACTIONS.CALM_BREATH_AR17(), uses: 8, maxUses: 10 },
          { ...BATTLE_ACTIONS.NO_THOUGHT_AR17(), uses: 3, maxUses: 3 },
          SYSTEM_ACTIONS.ROOT_MARTIAL()
        ]
      }),
      buildCreatureUnit("foe", 3, "CREATURE_SWORD_SOLDIER", {
        hp: 130,
        vp: 12,
        pp: 24,
        thought: 9,
        lastAct: { n: "連打" }
      })
    ],
    attendants: [
      createAttendant(1),
      createAttendant(2),
      createAttendant(4)
    ],
    pool: [
      BATTLE_ACTIONS.GARDEN(),
      BATTLE_ACTIONS.STEP_STYLE(),
      BATTLE_ACTIONS.STRIKE_FAST(),
      BATTLE_ACTIONS.HEAVY_ONE(),
      BATTLE_ACTIONS.SWORD_ONE(),
      BATTLE_ACTIONS.SHEATH(),
      BATTLE_ACTIONS.HALF_BODY(),
      BATTLE_ACTIONS.CALL(),
      BATTLE_ACTIONS.CALM_BREATH_AR17(),
      BATTLE_ACTIONS.NO_THOUGHT_AR17(),
      createHpBoost(SCENE_MASTER.SCENE_3_04.hp_bonus_base)
    ]
  },

  scene_1_01: {
    config: configFromScene("SCENE_1_01", { NOW: 157, SPAN_DEFAULT: 24, SAVE_PHASE: "BATTLE" }),
    totalRewind: 0,
    whyCode: "WATCH_MET",
    whyPayload: { ActionName: "武技（基本）", WatchLabel: str("STR_WATCH_READY").text },
    units: [
      createUnit("mine", 0),
      createUnit("mine", 1, "セイン", "マスター", {
        hp: 58,
        maxHp: 60,
        vp: 2,
        pp: 2,
        lastAct: { n: "心気（基本）" },
        acts: [
          BATTLE_ACTIONS.CALM_BREATH_AR3(),
          BATTLE_ACTIONS.CLAW_AR3(),
          BATTLE_ACTIONS.CLAW_AR6(),
          BATTLE_ACTIONS.HEAVY_CLAW(),
          SYSTEM_ACTIONS.ROOT_MARTIAL()
        ]
      }),
      createUnit("foe", 2, applyNaming(ENEMY_MASTER.ENEMY_LEF.display_name), "敵マスター", {
        hp: 8,
        maxHp: 10,
        vp: 2,
        pp: 2,
        lastAct: { n: "静かな息" },
        acts: [
          { ...BATTLE_ACTIONS.CALM_BREATH_AR3(), uses: 9, maxUses: 10 },
          { ...BATTLE_ACTIONS.NO_THOUGHT_AR3(), uses: 3, maxUses: 3 },
          { ...BATTLE_ACTIONS.CLAW_AR3(), uses: 10, maxUses: 10 },
          { ...BATTLE_ACTIONS.CLAW_AR6(), uses: 10, maxUses: 10 },
          { ...BATTLE_ACTIONS.HEAVY_CLAW(), uses: 3, maxUses: 3 },
          { ...BATTLE_ACTIONS.STANCE_AR3(), uses: 10, maxUses: 10 },
          { ...BATTLE_ACTIONS.STANCE_AR6(), uses: 10, maxUses: 10 },
          SYSTEM_ACTIONS.ROOT_MARTIAL()
        ]
      }),
      createUnit("foe", 3)
    ],
    attendants: [
      createAttendant(1)
    ],
    pool: [
      BATTLE_ACTIONS.CLAW_AR3(),
      BATTLE_ACTIONS.CLAW_AR6(),
      BATTLE_ACTIONS.HEAVY_CLAW(),
      BATTLE_ACTIONS.STANCE_AR3(),
      BATTLE_ACTIONS.STANCE_AR6(),
      BATTLE_ACTIONS.CALM_BREATH_AR3(),
      BATTLE_ACTIONS.NO_THOUGHT_AR3(),
      createHpBoost(SCENE_MASTER.SCENE_1_01.hp_bonus_base)
    ]
  },

  scene_5_07: {
    config: configFromScene("SCENE_5_07", { NOW: 110, SPAN_DEFAULT: 28, SAVE_PHASE: "BATTLE" }),
    totalRewind: 421,
    whyCode: "ENEMY_START",
    whyPayload: { ActionName: "灰蝕の巨刃", RemainingSteps: 2 },
    units: [
      buildCreatureUnit("mine", 0, "CREATURE_WHITE_VANGUARD", {
        vp: 10,
        pp: 40,
        ap: 15,
        lastAct: { n: "身代わり障壁" },
        acting: { name: "身代わり障壁", phase: "発生", cur: 1, max: 8, de: 2.00, atk: null }
      }),
      createUnit("mine", 1, "セイン", "マスター", {
        hp: 380,
        maxHp: 850,
        vp: 45,
        pp: 60,
        thought: 18,
        debuffMap: { step_startup: 0.33, cost_pp: 0.33, deploy_ap: 0.50 },
        slip: 0.38,
        lastAct: { n: "風脚の跳躍" },
        chips: [["slip", "灰蝕 0.38/回"], ["down", "発生 +33%"], ["down", "PPコスト +33%"], ["down", "展開AP −50%"]],
        acts: [
          defineAction({ classId: "ACT_COPY_SWORD", n: "写し太刀（複製）", k: "武技（コピー技）", cost: [["pp", 15]], st: [0, 4, 22], uses: 2, maxUses: 2, range: 1, atk: 45, dmg_hp: 4.20, stun: true, copy: true, copyVal: 1.50, strip_rate: 0.50, base: 2 }),
          defineAction({ classId: "ACT_SEALED_SLASH", n: "封じられた閃光", k: "武技（封印中）", cost: [["pp", 20]], st: [0, 3, 18], uses: 24, maxUses: 30, range: 2, atk: 55, dmg_hp: 5.10, stun: true, sealVal: 1.00, strip_rate: 0.50 }),
          defineAction({ classId: "ACT_INSTANT_EVADE", n: "風脚の跳躍", k: "体勢（瞬動）", sys: ["stance"], cost: [["pp", 10]], uses: 2, maxUses: 3, deploy: 80, base: 3 }),
          defineAction({ classId: "ACT_PURIFY_MIND", n: "白刃の浄化息", k: "心気（浄化・即発）", sys: ["mind"], cost: [["hp", 50]], st: [0, 0, 15], uses: 2, maxUses: 3, gain_vp: 10, charge_pp: 3.00, purify: 0.50, base: 3 }),
          SYSTEM_ACTIONS.ROOT_MARTIAL()
        ]
      }),
      createUnit("foe", 2, applyNaming(ENEMY_MASTER.ENEMY_ERNA_299.display_name), "敵マスター", {
        hp: ENEMY_MASTER.ENEMY_ERNA_299.max_hp,
        vp: 80,
        pp: 140,
        ap: 60,
        buffMap: { atk: 0.50 },
        lastAct: { n: "灰蝕の巨刃" },
        acting: { name: "灰蝕の巨刃", phase: "発生", cur: 3, max: 5, de: 2.00, atk: 95, fire: 112, stun: true },
        chips: [["up", "攻撃力 +50%"]],
        acts: [
          { ...BATTLE_ACTIONS.ASH_BLADE(), uses: 1, maxUses: 1, running: true, fire: 112, now: true }
        ]
      }),
      buildCreatureUnit("foe", 3, "CREATURE_ASH_CORE", {
        vp: 20,
        pp: 50,
        thought: 5
      })
    ],
    attendants: [
      createAttendant(1),
      createAttendant(11),
      createAttendant(12),
      createAttendant(13),
      createAttendant(14)
    ],
    pool: [
      BATTLE_ACTIONS.ASH_BLADE(),
      createHpBoost(SCENE_MASTER.SCENE_5_07.hp_bonus_base)
    ]
  },

  intermission_final: {
    config: configFromScene("SCENE_5_10", { NOW: 0, SPAN_DEFAULT: 22, SAVE_PHASE: "INTERMISSION" }),
    totalRewind: 512,
    // 自動時間停止は phase == BATTLE の機構である（[M-PIPE-PAUSE-TRIGGER]）。
    whyCode: null,
    whyPayload: {},
    units: [
      createUnit("mine", 0),
      createUnit("mine", 1, "セイン", "マスター", {
        hp: 450,
        maxHp: 1200,
        acts: [
          { ...BATTLE_ACTIONS.HEAVY_VANE(), cost: [["pp", 45]], uses: 5, maxUses: 9 },
          SYSTEM_ACTIONS.ROOT_MARTIAL()
        ]
      }),
      createUnit("foe", 2, applyNaming(ENEMY_MASTER.ENEMY_VEIN.display_name) + "（灰）", "敵マスター", { maxHp: ENEMY_MASTER.ENEMY_VEIN.max_hp, isEmpty: true }),
      createUnit("foe", 3)
    ],
    attendants: [
      createAttendant(1),
      createAttendant(3),
      createAttendant(6),
      createAttendant(10),
      createAttendant(11)
    ],
    pool: [
      BATTLE_ACTIONS.REMNANT(),
      BATTLE_ACTIONS.HEAVY_VANE(),
      BATTLE_ACTIONS.DIVINE_STANCE(),
      createHpBoost(SCENE_MASTER.SCENE_5_10.hp_bonus_base)
    ]
  }
};

const DEFAULT_PRESET_KEY = "scene_3_04";
