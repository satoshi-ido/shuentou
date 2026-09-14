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
    "expected_length": 600
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
} as const satisfies Record<string, SceneMasterRecord>;
