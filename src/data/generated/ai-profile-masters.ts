// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { AiProfileRecord } from '../types.js';

export const AI_PROFILE_MASTERS = {
  "PROFILE_AMBUSH": {
    "profile_id": "PROFILE_AMBUSH",
    "display_name": "伏勢",
    "weight_mult": {
      "position": 160,
      "tempo": 150
    },
    "action_bonus": {
      "HEAVY": 500
    },
    "dynamic_weight": null
  },
  "PROFILE_ASHBLIGHT": {
    "profile_id": "PROFILE_ASHBLIGHT",
    "display_name": "灰蝕",
    "weight_mult": {
      "impatience": 150,
      "slip": 250
    },
    "action_bonus": {
      "SLIP": 1000
    },
    "dynamic_weight": null
  },
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
  "PROFILE_BULWARK": {
    "profile_id": "PROFILE_BULWARK",
    "display_name": "鉄壁",
    "weight_mult": {
      "position": 160,
      "survival": 140
    },
    "action_bonus": {},
    "dynamic_weight": null
  },
  "PROFILE_COMMANDER": {
    "profile_id": "PROFILE_COMMANDER",
    "display_name": "将帥",
    "weight_mult": {
      "board": 200
    },
    "action_bonus": {
      "SUMMON": 800
    },
    "dynamic_weight": null
  },
  "PROFILE_COMMANDER_BUFF": {
    "profile_id": "PROFILE_COMMANDER_BUFF",
    "display_name": "将帥＋強化",
    "weight_mult": {
      "board": 200
    },
    "action_bonus": {
      "MIND": 300,
      "SUMMON": 600
    },
    "dynamic_weight": null
  },
  "PROFILE_CURSE": {
    "profile_id": "PROFILE_CURSE",
    "display_name": "呪縛",
    "weight_mult": {
      "debuff": 200
    },
    "action_bonus": {
      "DEBUFF": 800
    },
    "dynamic_weight": null
  },
  "PROFILE_DEFENSE": {
    "profile_id": "PROFILE_DEFENSE",
    "display_name": "防衛",
    "weight_mult": {
      "impatience": 40,
      "position": 200
    },
    "action_bonus": {
      "STANCE": 600
    },
    "dynamic_weight": null
  },
  "PROFILE_DEFENSE_STRONG": {
    "profile_id": "PROFILE_DEFENSE_STRONG",
    "display_name": "防衛（強）",
    "weight_mult": {
      "position": 220
    },
    "action_bonus": {
      "STANCE": 1000
    },
    "dynamic_weight": null
  },
  "PROFILE_DRAIN_PP": {
    "profile_id": "PROFILE_DRAIN_PP",
    "display_name": "枯渇（PP）",
    "weight_mult": {
      "tempo": 130
    },
    "action_bonus": {
      "STRIP_PP": 900
    },
    "dynamic_weight": null
  },
  "PROFILE_DRAIN_VP": {
    "profile_id": "PROFILE_DRAIN_VP",
    "display_name": "枯渇（VP）",
    "weight_mult": {},
    "action_bonus": {
      "STRIP_VP": 900
    },
    "dynamic_weight": null
  },
  "PROFILE_EFFICIENCY": {
    "profile_id": "PROFILE_EFFICIENCY",
    "display_name": "効率",
    "weight_mult": {
      "impatience": 60,
      "pp": 180
    },
    "action_bonus": {
      "MIND": 400
    },
    "dynamic_weight": null
  },
  "PROFILE_EXECUTION": {
    "profile_id": "PROFILE_EXECUTION",
    "display_name": "執行",
    "weight_mult": {
      "pp": 150,
      "tempo": 200
    },
    "action_bonus": {
      "HEAVY": 600
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
  "PROFILE_INITIATIVE": {
    "profile_id": "PROFILE_INITIATIVE",
    "display_name": "先手",
    "weight_mult": {
      "survival": 120,
      "tempo": 180
    },
    "action_bonus": {
      "RUSH": 500
    },
    "dynamic_weight": null
  },
  "PROFILE_MIMIC": {
    "profile_id": "PROFILE_MIMIC",
    "display_name": "模倣",
    "weight_mult": {
      "copy": 250,
      "tempo": 120
    },
    "action_bonus": {
      "COPY": 1000
    },
    "dynamic_weight": null
  },
  "PROFILE_MIRROR": {
    "profile_id": "PROFILE_MIRROR",
    "display_name": "鏡像",
    "weight_mult": {
      "seal": 250
    },
    "action_bonus": {
      "SEAL": 1000
    },
    "dynamic_weight": "MIRROR_STATS"
  },
  "PROFILE_RELENTLESS": {
    "profile_id": "PROFILE_RELENTLESS",
    "display_name": "不断",
    "weight_mult": {
      "impatience": 120,
      "tempo": 200
    },
    "action_bonus": {
      "PASS": -700
    },
    "dynamic_weight": null
  },
  "PROFILE_SNIPE": {
    "profile_id": "PROFILE_SNIPE",
    "display_name": "狙撃",
    "weight_mult": {
      "position": 250
    },
    "action_bonus": {},
    "dynamic_weight": null
  },
  "PROFILE_SURGE": {
    "profile_id": "PROFILE_SURGE",
    "display_name": "波状",
    "weight_mult": {
      "board": 180,
      "impatience": 150
    },
    "action_bonus": {
      "SUMMON": 500
    },
    "dynamic_weight": null
  },
  "PROFILE_TALLY": {
    "profile_id": "PROFILE_TALLY",
    "display_name": "計上",
    "weight_mult": {
      "pp": 150
    },
    "action_bonus": {
      "SELF_HARM": 700
    },
    "dynamic_weight": null
  },
  "PROFILE_TERMINUS": {
    "profile_id": "PROFILE_TERMINUS",
    "display_name": "終焉",
    "weight_mult": {},
    "action_bonus": {},
    "dynamic_weight": null
  },
  "PROFILE_USHER": {
    "profile_id": "PROFILE_USHER",
    "display_name": "差配",
    "weight_mult": {
      "position": 220,
      "tempo": 120
    },
    "action_bonus": {
      "INTERFERE": 900
    },
    "dynamic_weight": null
  },
  "PROFILE_WALLBREAK": {
    "profile_id": "PROFILE_WALLBREAK",
    "display_name": "破壁",
    "weight_mult": {},
    "action_bonus": {
      "STRIP_AP": 1200
    },
    "dynamic_weight": null
  },
} as const satisfies Record<string, AiProfileRecord>;
