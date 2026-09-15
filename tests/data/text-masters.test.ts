// [I-PLAN-TEXT]［必須レコードの存在検査］[M-DATA-STRINGS]・[M-DATA-PAUSE-REASON]・[M-UI-OBJECTIVE]・
// [M-DATA-HELPS] が確定する要求集合と、[M-DATA-ASSETMASTER] の条件付必須を検査する。
// プレースホルダはレコードの存在を満たすが本文の完成を意味しないため、残存件数を別に数える。

import { describe, expect, it } from 'vitest';
import { ASSET_MASTERS } from '../../src/data/generated/asset-masters.js';
import { HELP_MASTERS } from '../../src/data/generated/help-masters.js';
import { STRING_MASTERS } from '../../src/data/generated/string-masters.js';
import type { AssetMasterRecord, ContextBundle, HelpMasterRecord, StringMasterRecord } from '../../src/data/types.js';
import { isPlaceholderText } from '../../src/ui/text.js';

const strings: Readonly<Record<string, StringMasterRecord>> = STRING_MASTERS;
const helps: Readonly<Record<string, HelpMasterRecord>> = HELP_MASTERS;
const assets: Readonly<Record<string, AssetMasterRecord>> = ASSET_MASTERS;

// [M-DATA-STRINGS] の要求表（string_id と context）。
const REQUIRED_STRINGS: readonly (readonly [string, readonly ContextBundle[]])[] = [
  ['STR_CONFIRM_FORFEIT', []],
  ['STR_CONFIRM_FORFEIT_ROW', ['ATTENDANT']],
  ['STR_INHERIT_NO_IMPROVE', ['ACTION']],
  ['STR_CONFIRM_SACRIFICE', ['ATTENDANT', 'SACRIFICE']],
  ['STR_LOCK_NO_ATTENDANT', []],
  ['STR_CONFIRM_IM_COMMIT', []],
  ['STR_CONFIRM_UNDO', []],
  ['STR_CONFIRM_ROLLBACK_BATTLE', []],
  ['STR_CONFIRM_ROLLBACK_IM', []],
  ['STR_REWIND_PENDING', []],
  ['STR_RESULT_WIN', ['ENEMY']],
  ['STR_RESULT_LOSE', ['ENEMY']],
  ['STR_OBJECTIVE_VOID_LORD', []],
  ['STR_OBJECTIVE_VEIN', []],
  ['STR_RESULT_LOSE_SUICIDE', []],
  ['STR_UNDO_UNAVAILABLE', []],
  ['STR_INHERIT_HP_ADD', ['ATTENDANT']],
  ['STR_INHERIT_VANISH', []],
  ['STR_INHERIT_NEW_SLOT', ['ACTION']],
  ['STR_INHERIT_MERGED', ['ACTION', 'ATTENDANT']],
  ['STR_SACRAMENT_AWAKEN', []],
  ['STR_SACRIFICE_DONE', ['ATTENDANT']],
  ['STR_IM_COMMIT_DONE', []],
  ['STR_CONFIRM_QUIT_BATTLE', []],
  ['STR_CONFIRM_ROLLBACK_IM_ROW', []],
  ['STR_TITLE_RUN_CLOSED', []],
  ['STR_CONFIRM_NEWGAME', []],
  ['STR_CONFIRM_REFILL', []],
  ['STR_CONFIRM_REFILL_ROW', ['ATTENDANT']],
  ['STR_REFILL_SHORT', ['REFILL']],
  ['STR_REFILL_DONE', []],
  ['STR_HELP_FIRST_SIGHT', ['HELP']],
  // [M-UI-HUD]［判定語彙］選択できない理由の説明。
  ['STR_LOCK_NO_PARTNER', []],
  ['STR_LOCK_PARTNER_STARTUP', ['UNIT']],
  ['STR_LOCK_PARTNER_RECOVERY', ['UNIT']],
  // [M-DATA-PAUSE-REASON] 事由文言。
  ['STR_PAUSE_STEP0_READY', []],
  ['STR_PAUSE_ENEMY_START', ['UNIT', 'ACTION', 'PAUSE']],
  ['STR_PAUSE_ENEMY_IMMEDIATE', ['UNIT', 'ACTION']],
  ['STR_PAUSE_WATCH_MET', ['UNIT', 'ACTION', 'PAUSE']],
  ['STR_PAUSE_MANUAL', []],
  // [M-DATA-PAUSE-REASON]［監視条件ラベル］
  ['STR_WATCH_READY', []],
  ['STR_WATCH_STUN', []],
  ['STR_WATCH_HIT_FRONT', []],
  ['STR_WATCH_HIT_BACK', []],
  ['STR_WATCH_EVADE', []],
  ['STR_WATCH_NA', []],
  ['STR_WATCH_IDLE', []],
];

// [M-DATA-HELPS] の要求表（help_id と unlock_key・category）。
const REQUIRED_HELPS: readonly (readonly [string, string | null, HelpMasterRecord['category']])[] = [
  ['HELP_RUSH', 'RUSH', 'ACTION'],
  ['HELP_SUMMON', 'SUMMON', 'ACTION'],
  ['HELP_STRIP_VP', 'STRIP_VP', 'RESOURCE'],
  ['HELP_STRIP_PP', 'STRIP_PP', 'RESOURCE'],
  ['HELP_STRIP_AP', 'STRIP_AP', 'RESOURCE'],
  ['HELP_INTERFERE', 'INTERFERE', 'ACTION'],
  ['HELP_BUFF', 'BUFF_COST_HP', 'ACTION'],
  ['HELP_SLIP', 'SLIP', 'ACTION'],
  ['HELP_COPY', 'COPY', 'ACTION'],
  ['HELP_SEAL', 'SEAL', 'ACTION'],
  ['HELP_DEBUFF', 'DEBUFF_STEP_RECOVERY', 'ACTION'],
  ['HELP_RESOURCE_HP', null, 'RESOURCE'],
  ['HELP_RESOURCE_VP', null, 'RESOURCE'],
  ['HELP_RESOURCE_PP', null, 'RESOURCE'],
  ['HELP_RESOURCE_AP', null, 'RESOURCE'],
  ['HELP_STEP_THOUGHT', null, 'STEP'],
  ['HELP_STEP_STARTUP', null, 'STEP'],
  ['HELP_STEP_RECOVERY', null, 'STEP'],
  ['HELP_DEFENSE', null, 'STEP'],
  ['HELP_FIELD', null, 'ACTION'],
  ['HELP_SYSTEM_FLAGS', null, 'ACTION'],
  ['HELP_INHERIT', null, 'PROGRESS'],
  ['HELP_SACRIFICE', null, 'PROGRESS'],
  ['HELP_WATCH', null, 'UI'],
  ['HELP_TIMELINE', null, 'UI'],
  ['HELP_REWIND', null, 'UI'],
];

describe('[M-DATA-STRINGS] システム文言の必須レコード', () => {
  it.each(REQUIRED_STRINGS)('%s が存在し、要求文脈束が一致する', (stringId, context) => {
    const record = strings[stringId];
    expect(record, stringId).toBeDefined();
    expect([...record.context].sort()).toEqual([...context].sort());
  });

  it('［見出しとボタン名］確認ダイアログは _HEAD / _BTN を別レコードで持つ', () => {
    for (const stringId of Object.keys(strings)) {
      if (!stringId.startsWith('STR_CONFIRM_') || stringId.endsWith('_HEAD') || stringId.endsWith('_BTN') || stringId.endsWith('_ROW')) {
        continue;
      }
      expect(strings[`${stringId}_HEAD`], `${stringId}_HEAD`).toBeDefined();
      expect(strings[`${stringId}_BTN`], `${stringId}_BTN`).toBeDefined();
    }
  });

  it('string_id は STR_ を接頭とし、大文字ASCII・数字・アンダースコアのみからなる', () => {
    for (const stringId of Object.keys(strings)) {
      expect(stringId).toMatch(/^STR_[A-Z0-9_]+$/);
    }
  });
});

describe('[M-DATA-HELPS] 必須解説レコード', () => {
  it.each(REQUIRED_HELPS)('%s が存在し、初出キーと分類が一致する', (helpId, unlockKey, category) => {
    const record = helps[helpId];
    expect(record, helpId).toBeDefined();
    expect(record.unlock_key).toBe(unlockKey);
    expect(record.category).toBe(category);
  });

  it('表示順は同一分類内で1から連続する', () => {
    const byCategory: Record<string, number[]> = {};
    for (const record of Object.values(helps)) {
      byCategory[record.category] = [...(byCategory[record.category] ?? []), record.order];
    }
    for (const orders of Object.values(byCategory)) {
      expect([...orders].sort((a, b) => a - b)).toEqual(orders.map((_value, index) => index + 1));
    }
  });
});

describe('[M-DATA-ASSETMASTER] 表示アセットマスタ', () => {
  it('owner_id は HERO・GLOBAL のとき Null、それ以外は非Null', () => {
    for (const record of Object.values(assets)) {
      const ownerless = record.owner_kind === 'HERO' || record.owner_kind === 'GLOBAL';
      expect(record.owner_id === null, record.asset_id).toBe(ownerless);
    }
  });

  it('cue は slot が BGM・SE のとき非Null、それ以外は Null', () => {
    for (const record of Object.values(assets)) {
      const audio = record.slot === 'BGM' || record.slot === 'SE';
      expect(record.cue !== null, record.asset_id).toBe(audio);
    }
  });

  it('[M-DATA-AUDIO-CUE] の各発火契機に対応するアセットを持つ', () => {
    const cues = Object.values(assets).map((record) => record.cue);
    for (const cue of ['BATTLE', 'INTERMISSION', 'ACTION_TRIGGER', 'HIT', 'MISS', 'UNIT_DESTROY', 'WATCH_PAUSE', 'UI_CONFIRM', 'UI_CANCEL']) {
      expect(cues, cue).toContain(cue);
    }
  });

  it('系統アイコンは5種（心気・武技・体勢・召喚・隊列交代）を備える', () => {
    const icons = Object.values(assets).filter((record) => record.slot === 'ICON');
    expect(icons).toHaveLength(5);
  });
});

describe('[I-PLAN-TEXT] プレースホルダの残存件数', () => {
  it('本文が未執筆のレコードを数える（存在検査とは別に、執筆の進行を測る）', () => {
    const pendingStrings = Object.values(strings).filter((record) => isPlaceholderText(record.string_id, record.text));
    const pendingHelps = Object.values(helps).filter((record) => isPlaceholderText(record.help_id, record.body));
    // 現時点では全件が未執筆である（[I-PLAN-TEXT]［執筆時点］文言マスタ・解説マスタは M4）。
    expect(pendingStrings).toHaveLength(Object.keys(strings).length);
    expect(pendingHelps).toHaveLength(Object.keys(helps).length);
  });
});
