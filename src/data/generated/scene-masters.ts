// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { SceneMasterRecord } from '../types.js';

export const SCENE_MASTERS = {
  "SCENE_1_01": {
    "scene_id": "SCENE_1_01",
    "display_name": "拾い物",
    "act": 1,
    "order": 1,
    "attendant_capacity": 1,
    "unlock": [],
    "level": 3,
    "enemy_id": "ENEMY_LEF",
    "hp_bonus_base": 81,
    "max_depth": 3,
    "node_limit": 3000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board"
    ],
    "inertia_steps": 30,
    "expected_length": 800
  },
  "SCENE_1_02": {
    "scene_id": "SCENE_1_02",
    "display_name": "鉄鎖と秤",
    "act": 1,
    "order": 2,
    "attendant_capacity": 1,
    "unlock": [
      "RUSH"
    ],
    "level": 4,
    "enemy_id": "ENEMY_DORN",
    "hp_bonus_base": 97,
    "max_depth": 3,
    "node_limit": 3000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position"
    ],
    "inertia_steps": 30,
    "expected_length": 600
  },
  "SCENE_2_01": {
    "scene_id": "SCENE_2_01",
    "display_name": "灰の街道",
    "act": 2,
    "order": 3,
    "attendant_capacity": 2,
    "unlock": [
      "SUMMON"
    ],
    "level": 4,
    "enemy_id": "ENEMY_VOLG",
    "hp_bonus_base": 97,
    "max_depth": 3,
    "node_limit": 5000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp"
    ],
    "inertia_steps": 15,
    "expected_length": 600
  },
  "SCENE_2_02": {
    "scene_id": "SCENE_2_02",
    "display_name": "囁きの市",
    "act": 2,
    "order": 4,
    "attendant_capacity": 2,
    "unlock": [
      "STRIP_VP"
    ],
    "level": 6,
    "enemy_id": "ENEMY_ISH",
    "hp_bonus_base": 122,
    "max_depth": 3,
    "node_limit": 5000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp"
    ],
    "inertia_steps": 15,
    "expected_length": 600
  },
  "SCENE_2_03": {
    "scene_id": "SCENE_2_03",
    "display_name": "腐る術式",
    "act": 2,
    "order": 5,
    "attendant_capacity": 2,
    "unlock": [
      "STRIP_PP"
    ],
    "level": 8,
    "enemy_id": "ENEMY_CALVA",
    "hp_bonus_base": 143,
    "max_depth": 3,
    "node_limit": 5000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp"
    ],
    "inertia_steps": 15,
    "expected_length": 600
  },
  "SCENE_2_04": {
    "scene_id": "SCENE_2_04",
    "display_name": "シャルム陥落",
    "act": 2,
    "order": 6,
    "attendant_capacity": 2,
    "unlock": [],
    "level": 9,
    "enemy_id": "ENEMY_ASHAL",
    "hp_bonus_base": 152,
    "max_depth": 3,
    "node_limit": 8000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 800
  },
  "SCENE_3_01": {
    "scene_id": "SCENE_3_01",
    "display_name": "王都の門",
    "act": 3,
    "order": 7,
    "attendant_capacity": 3,
    "unlock": [
      "STRIP_AP"
    ],
    "level": 9,
    "enemy_id": "ENEMY_TARGA",
    "hp_bonus_base": 152,
    "max_depth": 3,
    "node_limit": 8000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_3_02": {
    "scene_id": "SCENE_3_02",
    "display_name": "聖堂の階",
    "act": 3,
    "order": 8,
    "attendant_capacity": 3,
    "unlock": [
      "INTERFERE"
    ],
    "level": 12,
    "enemy_id": "ENEMY_TEODOR",
    "hp_bonus_base": 177,
    "max_depth": 3,
    "node_limit": 8000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_3_03": {
    "scene_id": "SCENE_3_03",
    "display_name": "帳簿の回廊",
    "act": 3,
    "order": 9,
    "attendant_capacity": 3,
    "unlock": [
      "BUFF_COST_HP"
    ],
    "level": 15,
    "enemy_id": "ENEMY_MAREN",
    "hp_bonus_base": 199,
    "max_depth": 3,
    "node_limit": 8000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_3_04": {
    "scene_id": "SCENE_3_04",
    "display_name": "剣呑の庭",
    "act": 3,
    "order": 10,
    "attendant_capacity": 3,
    "unlock": [
      "BUFF_COST_PP"
    ],
    "level": 17,
    "enemy_id": "ENEMY_ROUD",
    "hp_bonus_base": 212,
    "max_depth": 3,
    "node_limit": 8000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_3_05": {
    "scene_id": "SCENE_3_05",
    "display_name": "王の間",
    "act": 3,
    "order": 11,
    "attendant_capacity": 3,
    "unlock": [
      "BUFF_STEP_RECOVERY"
    ],
    "level": 19,
    "enemy_id": "ENEMY_ODERIK",
    "hp_bonus_base": 224,
    "max_depth": 3,
    "node_limit": 8000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_3_06": {
    "scene_id": "SCENE_3_06",
    "display_name": "カルデン陥落",
    "act": 3,
    "order": 12,
    "attendant_capacity": 3,
    "unlock": [],
    "level": 20,
    "enemy_id": "ENEMY_ZEFAL",
    "hp_bonus_base": 230,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 800
  },
  "SCENE_4_01": {
    "scene_id": "SCENE_4_01",
    "display_name": "第一層・灰の入口",
    "act": 4,
    "order": 13,
    "attendant_capacity": 4,
    "unlock": [
      "BUFF_STEP_THOUGHT"
    ],
    "level": 20,
    "enemy_id": "ENEMY_HAUSEN",
    "hp_bonus_base": 230,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_02": {
    "scene_id": "SCENE_4_02",
    "display_name": "第二層・囁く岩",
    "act": 4,
    "order": 14,
    "attendant_capacity": 4,
    "unlock": [
      "BUFF_STEP_STARTUP"
    ],
    "level": 24,
    "enemy_id": "ENEMY_OREIN",
    "hp_bonus_base": 253,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_03": {
    "scene_id": "SCENE_4_03",
    "display_name": "第三層・逆さの森",
    "act": 4,
    "order": 15,
    "attendant_capacity": 4,
    "unlock": [
      "BUFF_DECAY_AP",
      "BUFF_DEPLOY_AP"
    ],
    "level": 28,
    "enemy_id": "ENEMY_SERG",
    "hp_bonus_base": 274,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_04": {
    "scene_id": "SCENE_4_04",
    "display_name": "第四層・沈む鐘",
    "act": 4,
    "order": 16,
    "attendant_capacity": 4,
    "unlock": [
      "BUFF_GAIN_VP",
      "BUFF_CHARGE_PP"
    ],
    "level": 31,
    "enemy_id": "ENEMY_RIIN",
    "hp_bonus_base": 288,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_05": {
    "scene_id": "SCENE_4_05",
    "display_name": "第五層・魂の川",
    "act": 4,
    "order": 17,
    "attendant_capacity": 4,
    "unlock": [
      "BUFF_RANGE",
      "BUFF_ATK"
    ],
    "level": 34,
    "enemy_id": "ENEMY_GRAVE",
    "hp_bonus_base": 302,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_06": {
    "scene_id": "SCENE_4_06",
    "display_name": "第六層・肉壁の回廊",
    "act": 4,
    "order": 18,
    "attendant_capacity": 4,
    "unlock": [
      "DEBUFF_COST_HP"
    ],
    "level": 36,
    "enemy_id": "ENEMY_VOD_RIA",
    "hp_bonus_base": 311,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_07": {
    "scene_id": "SCENE_4_07",
    "display_name": "最下層・門前",
    "act": 4,
    "order": 19,
    "attendant_capacity": 4,
    "unlock": [
      "DEBUFF_COST_PP"
    ],
    "level": 38,
    "enemy_id": "ENEMY_ZOL_NA",
    "hp_bonus_base": 320,
    "max_depth": 4,
    "node_limit": 20000,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_4_08": {
    "scene_id": "SCENE_4_08",
    "display_name": "虚穴深核",
    "act": 4,
    "order": 20,
    "attendant_capacity": 4,
    "unlock": [],
    "level": 39,
    "enemy_id": "ENEMY_ZOL_VOD",
    "hp_bonus_base": 324,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 800
  },
  "SCENE_5_01": {
    "scene_id": "SCENE_5_01",
    "display_name": "昇環一",
    "act": 5,
    "order": 21,
    "attendant_capacity": 5,
    "unlock": [
      "DEBUFF_STEP_RECOVERY"
    ],
    "level": 39,
    "enemy_id": "ENEMY_ERNA_007",
    "hp_bonus_base": 324,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_02": {
    "scene_id": "SCENE_5_02",
    "display_name": "昇環二",
    "act": 5,
    "order": 22,
    "attendant_capacity": 5,
    "unlock": [
      "DEBUFF_STEP_THOUGHT"
    ],
    "level": 44,
    "enemy_id": "ENEMY_ERNA_019",
    "hp_bonus_base": 344,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_03": {
    "scene_id": "SCENE_5_03",
    "display_name": "昇環三",
    "act": 5,
    "order": 23,
    "attendant_capacity": 5,
    "unlock": [
      "DEBUFF_STEP_STARTUP"
    ],
    "level": 49,
    "enemy_id": "ENEMY_ERNA_044",
    "hp_bonus_base": 364,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_04": {
    "scene_id": "SCENE_5_04",
    "display_name": "昇環四",
    "act": 5,
    "order": 24,
    "attendant_capacity": 5,
    "unlock": [
      "DEBUFF_DECAY_AP",
      "DEBUFF_DEPLOY_AP"
    ],
    "level": 53,
    "enemy_id": "ENEMY_ERNA_080",
    "hp_bonus_base": 378,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_05": {
    "scene_id": "SCENE_5_05",
    "display_name": "昇環五",
    "act": 5,
    "order": 25,
    "attendant_capacity": 5,
    "unlock": [
      "DEBUFF_GAIN_VP",
      "DEBUFF_CHARGE_PP"
    ],
    "level": 57,
    "enemy_id": "ENEMY_ERNA_130",
    "hp_bonus_base": 392,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_06": {
    "scene_id": "SCENE_5_06",
    "display_name": "昇環六",
    "act": 5,
    "order": 26,
    "attendant_capacity": 5,
    "unlock": [
      "DEBUFF_RANGE",
      "DEBUFF_ATK"
    ],
    "level": 60,
    "enemy_id": "ENEMY_ERNA_200",
    "hp_bonus_base": 403,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_07": {
    "scene_id": "SCENE_5_07",
    "display_name": "灰蝕の階",
    "act": 5,
    "order": 27,
    "attendant_capacity": 5,
    "unlock": [
      "SLIP"
    ],
    "level": 63,
    "enemy_id": "ENEMY_ERNA_299",
    "hp_bonus_base": 413,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff",
      "slip"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_08": {
    "scene_id": "SCENE_5_08",
    "display_name": "倣いの門",
    "act": 5,
    "order": 28,
    "attendant_capacity": 5,
    "unlock": [
      "COPY"
    ],
    "level": 65,
    "enemy_id": "ENEMY_ERNA_300",
    "hp_bonus_base": 419,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff",
      "slip",
      "copy"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_09": {
    "scene_id": "SCENE_5_09",
    "display_name": "天の座前庭",
    "act": 5,
    "order": 29,
    "attendant_capacity": 5,
    "unlock": [
      "SEAL"
    ],
    "level": 67,
    "enemy_id": "ENEMY_MIRROR_SEIN",
    "hp_bonus_base": 426,
    "max_depth": 5,
    "node_limit": 50000,
    "joint_action": true,
    "deferred_decision": false,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff",
      "slip",
      "copy",
      "seal"
    ],
    "inertia_steps": 0,
    "expected_length": 600
  },
  "SCENE_5_10": {
    "scene_id": "SCENE_5_10",
    "display_name": "天の座アルヴェイル",
    "act": 5,
    "order": 30,
    "attendant_capacity": 5,
    "unlock": [],
    "level": 68,
    "enemy_id": "ENEMY_VEIN",
    "hp_bonus_base": 429,
    "max_depth": 7,
    "node_limit": 200000,
    "joint_action": true,
    "deferred_decision": true,
    "eval_mask": [
      "survival",
      "tempo",
      "board",
      "position",
      "pp",
      "vp",
      "impatience",
      "debuff",
      "slip",
      "copy",
      "seal"
    ],
    "inertia_steps": 0,
    "expected_length": 1200
  },
  "SCENE_5_11": {
    "scene_id": "SCENE_5_11",
    "display_name": "灯し直しの手",
    "act": 5,
    "order": 31,
    "attendant_capacity": 5,
    "unlock": [],
    "level": 68,
    "enemy_id": "ENEMY_VESSEL",
    "hp_bonus_base": null,
    "max_depth": null,
    "node_limit": null,
    "joint_action": false,
    "deferred_decision": false,
    "eval_mask": null,
    "inertia_steps": null,
    "expected_length": null
  },
} as const satisfies Record<string, SceneMasterRecord>;
