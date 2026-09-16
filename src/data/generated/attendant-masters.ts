// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { AttendantMasterRecord } from '../types.js';

export const ATTENDANT_MASTERS = {
  "ATTENDANT_01": {
    "attendant_id": "ATTENDANT_01",
    "display_name": "リナ",
    "epithet": "灯し直しの手",
    "join_act": 1,
    "is_fixed": true,
    "coeffs": {
      "usesRate": 450
    }
  },
  "ATTENDANT_02": {
    "attendant_id": "ATTENDANT_02",
    "display_name": "ガルド",
    "epithet": "鉄鎖の頭",
    "join_act": 2,
    "is_fixed": false,
    "coeffs": {
      "hpAddRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_03": {
    "attendant_id": "ATTENDANT_03",
    "display_name": "ミレイユ",
    "epithet": "秤の目",
    "join_act": 2,
    "is_fixed": false,
    "coeffs": {
      "costRate": 67,
      "usesRate": 300
    }
  },
  "ATTENDANT_04": {
    "attendant_id": "ATTENDANT_04",
    "display_name": "カイ",
    "epithet": "風脚",
    "join_act": 3,
    "is_fixed": false,
    "coeffs": {
      "rcRate": 67,
      "usesRate": 300
    }
  },
  "ATTENDANT_05": {
    "attendant_id": "ATTENDANT_05",
    "display_name": "セルヴィス",
    "epithet": "読み手",
    "join_act": 3,
    "is_fixed": false,
    "coeffs": {
      "thRate": 67,
      "usesRate": 300
    }
  },
  "ATTENDANT_06": {
    "attendant_id": "ATTENDANT_06",
    "display_name": "トト",
    "epithet": "駆けの子",
    "join_act": 3,
    "is_fixed": false,
    "coeffs": {
      "stRate": 67,
      "usesRate": 300
    }
  },
  "ATTENDANT_07": {
    "attendant_id": "ATTENDANT_07",
    "display_name": "バルデス",
    "epithet": "不動",
    "join_act": 4,
    "is_fixed": false,
    "coeffs": {
      "decayApRate": 67,
      "usesRate": 300
    }
  },
  "ATTENDANT_08": {
    "attendant_id": "ATTENDANT_08",
    "display_name": "ユナ",
    "epithet": "環守の巫女",
    "join_act": 4,
    "is_fixed": false,
    "coeffs": {
      "gainVpRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_09": {
    "attendant_id": "ATTENDANT_09",
    "display_name": "オルフェ",
    "epithet": "充ちの器",
    "join_act": 4,
    "is_fixed": false,
    "coeffs": {
      "chargePpRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_10": {
    "attendant_id": "ATTENDANT_10",
    "display_name": "シグルド",
    "epithet": "遠矢",
    "join_act": 4,
    "is_fixed": false,
    "coeffs": {
      "rangeRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_11": {
    "attendant_id": "ATTENDANT_11",
    "display_name": "ダリウス",
    "epithet": "剛の腕",
    "join_act": 5,
    "is_fixed": false,
    "coeffs": {
      "atkRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_12": {
    "attendant_id": "ATTENDANT_12",
    "display_name": "メイア",
    "epithet": "盾の聖女",
    "join_act": 5,
    "is_fixed": false,
    "coeffs": {
      "deployRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_13": {
    "attendant_id": "ATTENDANT_13",
    "display_name": "ザイル",
    "epithet": "呪炎",
    "join_act": 5,
    "is_fixed": false,
    "coeffs": {
      "dmgRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_14": {
    "attendant_id": "ATTENDANT_14",
    "display_name": "クレア",
    "epithet": "白刃の審問官",
    "join_act": 5,
    "is_fixed": false,
    "coeffs": {
      "purifyRate": 150,
      "stripRate": 150,
      "usesRate": 300
    }
  },
  "ATTENDANT_15": {
    "attendant_id": "ATTENDANT_15",
    "display_name": "マルディス",
    "epithet": "賜りの王弟",
    "join_act": 5,
    "is_fixed": false,
    "coeffs": {
      "giveBuffRate": 150,
      "giveDebuffRate": 150,
      "usesRate": 300
    }
  },
} as const satisfies Record<string, AttendantMasterRecord>;
