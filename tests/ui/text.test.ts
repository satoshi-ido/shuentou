// [M-DATA-INTERP] 文字列補間と、[M-DATA-PAUSE-REASON] 事由文言の解決。

import { describe, expect, it } from 'vitest';
import { HELP_MASTERS } from '../../src/data/generated/help-masters.js';
import { STRING_MASTERS } from '../../src/data/generated/string-masters.js';
import type { StringMasterRecord } from '../../src/data/types.js';
import { createStringTable, resolveHelp, resolveText } from '../../src/ui/text.js';
import { PAUSE_REASON_STRING_ID, pauseReasonText, WATCH_LABEL_STRING_ID } from '../../src/ui/view/pause-text.js';
import { createDuel, findUnit, makeAction, martialAction, setStartup } from '../ai/fixtures.js';

const record = (text: string, context: StringMasterRecord['context'] = []): StringMasterRecord => ({
  string_id: 'STR_TEST',
  text,
  context,
});

describe('[M-DATA-INTERP] 文字列補間', () => {
  it('共通キーと文脈キーを差し込む', () => {
    const resolved = resolveText(record('{HeroName} は {AttendantName} を供犠した（残り {PartyCountAfter} 名）', ['ATTENDANT', 'SACRIFICE']), {
      common: { HeroName: 'セイン' },
      bundles: { ATTENDANT: { AttendantName: 'アルマ' }, SACRIFICE: { PartyCountAfter: 0 } },
    });
    expect(resolved).toBe('セイン は アルマ を供犠した（残り 0 名）');
  });

  it('リテラルの波括弧は二重化で表す', () => {
    expect(resolveText(record('{{HeroName}}'), { common: {} })).toBe('{HeroName}');
  });

  it('未定義キーは空文字で埋めず、オーサリングエラーとして棄却する', () => {
    expect(() => resolveText(record('{UnknownKey}'), { common: {} })).toThrow('解決できない補間キー');
  });

  it('context が列挙する束を供給しない呼び出しは棄却する', () => {
    expect(() => resolveText(record('{ActionName}', ['ACTION']), { common: {} })).toThrow('文脈束が供給されていない');
  });

  it('宣言していない束のキーは解決できない', () => {
    expect(() =>
      resolveText(record('{ActionName}', ['UNIT']), { common: {}, bundles: { UNIT: { UnitName: 'セイン' } } }),
    ).toThrow('解決できない補間キー');
  });

  it('解説マスタの title / body は共通キーのみで解決する', () => {
    const resolved = resolveHelp(HELP_MASTERS.HELP_WATCH, {});
    expect(resolved.title).toBe('[HELP_WATCH_TITLE]');
    expect(resolved.body).toBe('[HELP_WATCH]');
  });

  it('未知の文言IDは棄却する', () => {
    expect(() => createStringTable(STRING_MASTERS).resolve('STR_MISSING')).toThrow('未知の文言ID');
  });
});

describe('[M-DATA-PAUSE-REASON] 事由文言の解決', () => {
  const MIND = makeAction('MIND', { gain_vp: 2, charge_pp: 100, step_startup: 10 });
  const STUN = martialAction('FOE_STUN', { atk: 5, dmg_hp: 100, stun: true, step_startup: 20 });
  const strings = createStringTable(STRING_MASTERS);

  function duel() {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 40, enemyActs: [STUN] });
    return { state, hero: findUnit(state, 'MINE'), enemy: findUnit(state, 'FOE') };
  }

  const sources = {
    strings,
    common: { HeroName: 'セイン' },
    unitName: () => 'レフ',
    unitRoleName: () => '祠守',
    actionName: (classId: string) => classId,
  };

  it('ENEMY_START は UNIT / ACTION / PAUSE の束を供給して解決する', () => {
    const { state, enemy } = duel();
    setStartup(enemy, 'FOE_STUN', 0);
    const text = pauseReasonText(
      state,
      { code: 'ENEMY_START', unit_id: enemy.unit_id, instance_id: enemy.acts[0].instance_id, watch_kind: null, remaining_steps: 20 },
      sources,
    );
    // 本文は未執筆のプレースホルダであり、束のキーが宣言順（ACTION → PAUSE → UNIT）に差し込まれる（[I-PLAN-TEXT]）。
    expect(text).toBe('[STR_PAUSE_ENEMY_START] FOE_STUN  20 レフ');
  });

  it('WATCH_MET は監視条件ラベルを文言マスタから引く', () => {
    const { state, hero } = duel();
    const text = pauseReasonText(
      state,
      { code: 'WATCH_MET', unit_id: hero.unit_id, instance_id: hero.acts[0].instance_id, watch_kind: 'READY', remaining_steps: 0 },
      sources,
    );
    expect(text).toContain(strings.resolve(WATCH_LABEL_STRING_ID.READY));
  });

  it('STEP0_READY・MANUAL_PAUSE は束を供給しない', () => {
    const { state } = duel();
    for (const code of ['STEP0_READY', 'MANUAL_PAUSE'] as const) {
      const text = pauseReasonText(state, { code, unit_id: null, instance_id: null, watch_kind: null, remaining_steps: null }, sources);
      expect(text).toBe(`[${PAUSE_REASON_STRING_ID[code]}]`);
    }
  });
});
