// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { AiProfileRecord } from '../types.js';

export const AI_PROFILE_MASTERS = {
  "PROFILE_ASSAULT": {
    "profile_id": "PROFILE_ASSAULT",
    "display_name": "強襲",
    "weight_mult": {
      "position": 150,
      "tempo": 150
    },
    "action_bonus": {
      "PASS": -600,
      "RUSH": 600
    },
    "dynamic_weight": null
  },
  "PROFILE_FRENZY": {
    "profile_id": "PROFILE_FRENZY",
    "display_name": "狂乱",
    "weight_mult": {
      "impatience": 150,
      "pp": 50
    },
    "action_bonus": {
      "PASS": -800
    },
    "dynamic_weight": null
  },
} as const satisfies Record<string, AiProfileRecord>;
