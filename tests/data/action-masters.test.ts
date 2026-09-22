// [M-BASE-USES]［基礎使用回数基準］と [I-NUM-FIXEDPOINT]「基礎使用回数」の内部表現を実データで検査する。
// base_uses は centi の素値であり、実効初期使用回数は実回数である（[M-DATA-INSTANTIATE] 手順3）。
// 実回数のまま書かれたレコードは round(base_uses ÷ 100) が 0 となって恒久的に実行不可となり、
// [M-PIPE-P7-LANDING]#1 で破棄されるため、例外も監査違反も出ないまま静かに機能を失う。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import type { ActionMasterRecord } from '../../src/data/types.js';
import { usesInitialFromBaseUses } from '../../src/engine/instantiate.js';
import { INFINITE_USES } from '../../src/engine/params.js';

const actions: Readonly<Record<string, ActionMasterRecord>> = ACTION_MASTERS;

// [M-BASE-USES] の5区分を centi で表した値。無限は [I-STATE-JSON] のセンチネル。
const USES_BASIC = 1000; // 10回
const USES_HEAVY = 300; // 3回
const USES_SPECIAL = 100; // 1回
const USES_REMNANT = 15; // 0.15回（残滓）
const ALLOWED: readonly number[] = [INFINITE_USES, USES_REMNANT, USES_SPECIAL, USES_HEAVY, USES_BASIC];

// [M-STATE-FLAGS-EXCEPTION] 効果を持たない空振りアクション。所持者側の実効初期使用回数は 0 であり、
// 0.15回 は継承経路で従者01リナの usesRate ×4.50 を乗じたときにのみ 1 回となる（[M-BASE-USES]）。
const BLANK_CLASS_IDS: readonly string[] = ['ACT_REMNANT'];

describe('[M-BASE-USES] 基礎使用回数', () => {
  it('base_uses は centi であり、5区分のいずれかに一致する', () => {
    const offenders = Object.values(actions)
      .filter((record) => !ALLOWED.includes(record.base_uses))
      .map((record) => `${record.class_id}=${record.base_uses}`);
    expect(offenders).toEqual([]);
  });

  it('空振り枠を除き、実効初期使用回数は1以上である', () => {
    const offenders = Object.values(actions)
      .filter((record) => !BLANK_CLASS_IDS.includes(record.class_id))
      .filter((record) => {
        const usesInitial = usesInitialFromBaseUses(record.base_uses);
        return usesInitial !== INFINITE_USES && usesInitial < 1;
      })
      .map((record) => `${record.class_id}=${record.base_uses}`);
    expect(offenders).toEqual([]);
  });

  it('0.15回（残滓）は所持者側で実効初期使用回数0となる', () => {
    expect(actions.ACT_REMNANT?.base_uses).toBe(USES_REMNANT);
    expect(usesInitialFromBaseUses(USES_REMNANT)).toBe(0);
  });

  it('無限（-1）は換算せずセンチネルのまま保持する', () => {
    expect(usesInitialFromBaseUses(INFINITE_USES)).toBe(INFINITE_USES);
  });
});
