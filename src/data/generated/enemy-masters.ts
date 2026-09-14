// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { EnemyMasterRecord } from '../types.js';

export const ENEMY_MASTERS = {
  "ENEMY_DORN": {
    "enemy_id": "ENEMY_DORN",
    "display_name": "ドルン",
    "role_name": "辺境伯",
    "max_hp": 27,
    "acts": [
      "ACT_MIND_AR4",
      "ACT_MUSOU_AR4",
      "ACT_SLASH_AR4",
      "ACT_SLASH_AR8",
      "ACT_SLASH_AR12",
      "ACT_RUSH_AR4",
      "ACT_HEAVY_AR4",
      "ACT_GUARD_AR4",
      "ACT_GUARD_AR8",
      "ACT_ROOT_MARTIAL"
    ],
    "ai_profile_id": "PROFILE_ASSAULT",
    "book_id": "B-02",
    "fixed_cycle": null,
    "audit_exempt": false
  },
  "ENEMY_LEF": {
    "enemy_id": "ENEMY_LEF",
    "display_name": "レフ",
    "role_name": "祠守",
    "max_hp": 10,
    "acts": [
      "ACT_MIND_AR3",
      "ACT_MUSOU_AR3",
      "ACT_SLASH_AR3",
      "ACT_SLASH_AR6",
      "ACT_HEAVY_AR3",
      "ACT_GUARD_AR3",
      "ACT_GUARD_AR6",
      "ACT_ROOT_MARTIAL"
    ],
    "ai_profile_id": "PROFILE_FRENZY",
    "book_id": "B-01",
    "fixed_cycle": null,
    "audit_exempt": false
  },
} as const satisfies Record<string, EnemyMasterRecord>;
