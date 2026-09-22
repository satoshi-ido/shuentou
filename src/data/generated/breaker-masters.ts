// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { BreakerRecord } from '../types.js';

export const BREAKERS = [
  {
    "class_id": "ACT_SPEC_BREAK_VOLG",
    "order": 3
  },
  {
    "class_id": "ACT_SPEC_BREAK_ASHAL",
    "order": 6
  },
  {
    "class_id": "ACT_SPEC_BREAK_ZEFAL",
    "order": 12
  },
  {
    "class_id": "ACT_SPEC_BREAK_ZOL_VOD",
    "order": 20
  }
] as const satisfies readonly BreakerRecord[];
