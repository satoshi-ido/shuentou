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
} as const satisfies Record<string, BookMasterRecord>;
