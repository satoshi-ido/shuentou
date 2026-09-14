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
} as const satisfies Record<string, AttendantMasterRecord>;
