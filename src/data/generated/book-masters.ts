// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { BookMasterRecord } from '../types.js';

export const BOOK_MASTERS = {
  "B-01": {
    "book_id": "B-01",
    "steps": [
      {
        "kind": "FIXED",
        "class_id": "ACT_MIND_AR3",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      },
      {
        "kind": "FIXED",
        "class_id": "ACT_GUARD_AR6",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      }
    ]
  },
  "B-02": {
    "book_id": "B-02",
    "steps": [
      {
        "kind": "FIXED",
        "class_id": "ACT_MIND_AR4",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      },
      {
        "kind": "FIXED",
        "class_id": "ACT_GUARD_AR4",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      },
      {
        "kind": "FIXED",
        "class_id": "ACT_RUSH_AR4",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      }
    ]
  },
  "B-03": {
    "book_id": "B-03",
    "steps": [
      {
        "kind": "FIXED",
        "class_id": "ACT_MIND_AR9",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      },
      {
        "kind": "FIXED",
        "class_id": "ACT_SUMMON_AR9",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      }
    ]
  },
  "B-04": {
    "book_id": "B-04",
    "steps": [
      {
        "kind": "FIXED",
        "class_id": "ACT_SPEC_SELFBUFF_ZEFAL",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      },
      {
        "kind": "FIXED",
        "class_id": "ACT_SUMMON_AR40",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      }
    ]
  },
  "B-05": {
    "book_id": "B-05",
    "steps": [
      {
        "kind": "FIXED",
        "class_id": "ACT_SPEC_SELFBUFF_ZOL_VOD",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      },
      {
        "kind": "FIXED",
        "class_id": "ACT_GUARD_AR117",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      }
    ]
  },
  "B-06": {
    "book_id": "B-06",
    "steps": [
      {
        "kind": "DYNAMIC",
        "class_id": null,
        "resolver": "MIRROR_FIRST_SYSTEM",
        "resolved_by_system": {
          "NONE": null,
          "MIND": "ACT_MIND_AR67",
          "MARTIAL": "ACT_HEAVY_AR335",
          "STANCE": "ACT_GUARD_AR134",
          "SUMMON": "ACT_SUMMON_AR67"
        },
        "can_wait": true
      }
    ]
  },
  "B-07": {
    "book_id": "B-07",
    "steps": [
      {
        "kind": "FIXED",
        "class_id": "ACT_SPEC_MIND_VEIN",
        "resolver": null,
        "resolved_by_system": null,
        "can_wait": true
      }
    ]
  },
} as const satisfies Record<string, BookMasterRecord>;
