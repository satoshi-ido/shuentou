// [I-PLAN-TEXT]［必須レコードの存在検査］[S-SCRIPT-RECORDS] が確定する要求集合を検査する。
// 要求集合は [I-PLAN-DOCINDEX]【脚本IDの収集】で合本から導く。
// プレースホルダはレコードの存在を満たすが本文の完成を意味しないため、残存件数を別に数える。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { SCRIPT_MASTERS } from '../../src/data/generated/script-masters.js';
import type { ScriptMasterRecord } from '../../src/data/types.js';
import { isPlaceholderText } from '../../src/ui/text.js';
import { buildIndex, collectScriptIds } from '../../tools/docindex/lib.js';

const scripts: Readonly<Record<string, ScriptMasterRecord>> = SCRIPT_MASTERS;

const docText = readFileSync(path.resolve('docs', '終焉燈.md'), 'utf8');
const required = collectScriptIds(docText, buildIndex(docText)) as Readonly<Record<string, readonly string[]>>;

// [I-PLAN-SUBMISSION]【審査範囲】アクト1・2 に現れるレコードの素材となる項。
const REVIEW_RANGE_SOURCES = [
  'S-SCENE-1-01',
  'S-SCENE-1-02',
  'S-SCENE-2-01',
  'S-SCENE-2-02',
  'S-SCENE-2-03',
  'S-SCENE-2-04',
  'S-RETAINER-01',
  'S-RETAINER-02',
  'S-WAKE-01',
  'S-WAKE-02',
  'S-WAKE-03',
];
// 系列（[S-SCRIPT-RECORDS]）から展開されるもののうち、審査範囲に現れるもの。
const REVIEW_RANGE_SERIES = [
  'SCRIPT_SCENE_1_01_INTRO',
  'SCRIPT_SCENE_1_02_INTRO',
  'SCRIPT_SCENE_2_01_INTRO',
  'SCRIPT_SCENE_2_02_INTRO',
  'SCRIPT_SCENE_2_03_INTRO',
  'SCRIPT_SCENE_2_04_INTRO',
  'SCRIPT_ECHO_01',
  'SCRIPT_ECHO_02',
  'SCRIPT_WAKE_01',
  'SCRIPT_WAKE_02_UNHEARD',
  'SCRIPT_WAKE_02_HEARD',
  'SCRIPT_WAKE_03_UNHEARD',
  'SCRIPT_WAKE_03_HEARD',
  'SCRIPT_ACT_TITLE_1',
  'SCRIPT_ACT_TITLE_2',
];

// 審査範囲の項が名を挙げるが、審査範囲（1周目のアクト1・2）では再生されないもの。
// [S-SCENE-1-01] は2周目以降の開幕として SCRIPT_NEWGAME_INTRO に言及する（[S-END-A-NEWGAME]）。
const REVIEW_RANGE_EXCLUDED = ['SCRIPT_NEWGAME_INTRO'];

function reviewRangeIds(): string[] {
  const fromSources = Object.keys(required).filter(
    (scriptId) =>
      !REVIEW_RANGE_EXCLUDED.includes(scriptId) &&
      required[scriptId]?.some((source) => REVIEW_RANGE_SOURCES.includes(source)),
  );
  return [...new Set([...fromSources, ...REVIEW_RANGE_SERIES])].sort();
}

function requireRecord(scriptId: string): ScriptMasterRecord {
  const record = scripts[scriptId];
  if (record === undefined) {
    throw new Error(`脚本IDが見つからない: ${scriptId}`);
  }
  return record;
}

function isWritten(record: ScriptMasterRecord): boolean {
  return !record.lines.every((line) => isPlaceholderText(record.script_id, line.text));
}

describe('[I-PLAN-DOCINDEX] 脚本IDの収集', () => {
  it('系列を展開し、各IDに名が現れた項を添える', () => {
    expect(required.SCRIPT_SCENE_1_01_INTRO).toContain('S-SCRIPT-RECORDS');
    expect(required.SCRIPT_SCENE_5_11_INTRO).toContain('S-SCRIPT-RECORDS');
    expect(required.SCRIPT_WAKE_15_HEARD).toContain('S-SCRIPT-RECORDS');
    expect(required.SCRIPT_SCENE_1_02_MEET_KNOWN).toContain('S-SCENE-1-02');
    // 末尾が _ の並びは系列の表記への言及として除く。
    expect(Object.keys(required).some((scriptId) => scriptId.endsWith('_'))).toBe(false);
  });
});

describe('[I-PLAN-SUBMISSION] 審査範囲の脚本', () => {
  const ids = reviewRangeIds();

  it('審査範囲に現れる要求レコードをすべて持ち、本文を執筆済みである', () => {
    expect(ids.length).toBeGreaterThan(0);
    for (const scriptId of ids) {
      const record = requireRecord(scriptId);
      expect(isWritten(record), scriptId).toBe(true);
    }
  });

  it('[S-SCENE-1-01] 1周目の開幕は表題・前段・点火・開幕の順に並ぶ', () => {
    expect(requireRecord('SCRIPT_ACT_TITLE_1').order).toBe(1);
    expect(requireRecord('SCRIPT_SCENE_1_01_PRE').order).toBe(2);
    expect(requireRecord('SCRIPT_SCENE_1_01_IGNITE').order).toBe(3);
    expect(requireRecord('SCRIPT_SCENE_1_01_INTRO').order).toBe(4);
    expect(requireRecord('SCRIPT_SCENE_1_01_PRE').condition).toBe('PlaythroughCount == 1');
    expect(requireRecord('SCRIPT_SCENE_1_01_CLEAR').trigger).toBe('SCENE_CLEAR');
  });

  it('[S-SCENE-1-02] 名乗りの版は ForeknownAt で切り替わる', () => {
    const known = requireRecord('SCRIPT_SCENE_1_02_MEET_KNOWN');
    const unknown = requireRecord('SCRIPT_SCENE_1_02_MEET_UNKNOWN');
    expect(known.branch_group).toBe(unknown.branch_group);
    expect(known.condition).toBe('ForeknownAt[SCENE_1_02] == True');
    expect(unknown.condition).toBe('ForeknownAt[SCENE_1_02] == False');
    expect(requireRecord('SCRIPT_SCENE_1_02_DECLARE').order).toBe(1);
    expect(known.order).toBe(2);
    expect(requireRecord('SCRIPT_SCENE_1_02_INTRO').order).toBe(3);
    expect(requireRecord('SCRIPT_SCENE_1_02_CUE').anchor).toBe('SCENE_1_02:ENEMY_HP_HALF');
  });

  it('[S-SCENE-2-04] 開幕と撃破後の版は ForeclearedAt で切り替わる', () => {
    expect(requireRecord('SCRIPT_SCENE_2_04_OPEN_KNOWN').condition).toBe('ForeclearedAt[SCENE_2_04] == True');
    expect(requireRecord('SCRIPT_SCENE_2_04_OPEN_UNKNOWN').condition).toBe('ForeclearedAt[SCENE_2_04] == False');
    expect(requireRecord('SCRIPT_SCENE_2_04_INTRO').order).toBe(2);
    const tail = requireRecord('SCRIPT_SCENE_2_04_CLEAR_UNKNOWN');
    expect(tail.order).toBeGreaterThan(requireRecord('SCRIPT_SCENE_2_04_CLEAR').order);
    expect(tail.condition).toBe('ForeclearedAt[SCENE_2_04] == False');
    expect(tail.branch_group).toBeNull();
  });

  it('[S-SCRIPT-TRIGGER] 残響と〈目覚め〉の発火点', () => {
    expect(requireRecord('SCRIPT_ECHO_01').trigger).toBe('SACRIFICE_CONFIRM');
    expect(requireRecord('SCRIPT_ECHO_02').trigger).toBe('SCENE_CLEAR');
    expect(requireRecord('SCRIPT_ECHO_02').anchor).toBeNull();
    expect(requireRecord('SCRIPT_WAKE_01').anchor).toBe('ATTENDANT_01');
    expect(requireRecord('SCRIPT_WAKE_02_HEARD').condition).toBe('EchoUnlocked[ECHO_02] == True');
    expect(requireRecord('SCRIPT_WAKE_03_UNHEARD').condition).toBe('EchoUnlocked[ECHO_03] == False');
    // [S-WAKE-DESIGN]【発火と再生】各行に WAIT_INPUT を付す。
    for (const scriptId of ['SCRIPT_WAKE_01', 'SCRIPT_WAKE_02_UNHEARD', 'SCRIPT_WAKE_03_HEARD']) {
      for (const line of requireRecord(scriptId).lines) {
        expect(line.directives).toContain('WAIT_INPUT');
      }
    }
  });

  it('[S-SCRIPT-SCHEMA]【行】本文に角括弧の参照・レコードIDを含めない', () => {
    for (const scriptId of ids) {
      for (const line of requireRecord(scriptId).lines) {
        expect(line.text).not.toMatch(/\[[A-Z]/);
        expect(line.text).not.toMatch(/(SCRIPT|ATTENDANT|SCENE|ECHO)_[A-Z0-9_]+/);
      }
    }
  });

  it('[S-NAMING-RULE] 3-06 より前の脚本は「虚穴」と書かない', () => {
    for (const scriptId of ids) {
      for (const line of requireRecord(scriptId).lines) {
        expect(line.text).not.toContain('虚穴');
      }
    }
  });
});

describe('[S-SCRIPT-RECORDS] 要求集合との対応', () => {
  it('全31シーンが開幕脚本を持つ（[S-SCENE-1-01]〜[S-SCENE-5-11]）', () => {
    const scenes = Object.values(SCENE_MASTERS);
    expect(scenes).toHaveLength(31);
    for (const scene of scenes) {
      const record = requireRecord(`SCRIPT_${scene.scene_id}_INTRO`);
      expect(record.trigger).toBe('SCENE_INTRO');
      expect(record.anchor).toBe(scene.scene_id);
    }
  });

  it('[S-ACT-TITLECARD] の表題カード5件が所定の発火点へ割り当てられる', () => {
    expect(requireRecord('SCRIPT_ACT_TITLE_1').trigger).toBe('SCENE_INTRO');
    expect(requireRecord('SCRIPT_ACT_TITLE_1').anchor).toBe('SCENE_1_01');
    for (const act of [2, 3, 4, 5]) {
      const record = requireRecord(`SCRIPT_ACT_TITLE_${act}`);
      expect(record.trigger).toBe('ACT_TRANSITION');
      expect(record.anchor).toBe(String(act - 1)); // 移行元アクト番号
    }
    // アクト4の表題は 3-06 クリア後にしか表示されないため新称で書く。
    expect(requireRecord('SCRIPT_ACT_TITLE_4').lines[0]?.text).toBe('アクト4：虚穴');
  });

  it('[M-META-ECHO] 種別A の残響は SCENE_CLEAR に相乗りし、anchor は Null である', () => {
    for (const number of ['02', '04', '06', '07', '10', '11', '12', '13', '14', '15']) {
      const record = requireRecord(`SCRIPT_ECHO_${number}`);
      expect(record.trigger).toBe('SCENE_CLEAR');
      expect(record.anchor).toBeNull();
    }
  });

  // 審査範囲の外のレコードは、合本の現行の組への合わせ込みが未了である（[I-PLAN-MILESTONE]【M9 に脚本の再生を含める理由】）。
  // 合わせ込みが進むか、合本が脚本IDを増減させたときに、この件数を改める。
  it('要求集合に対する不足と余剰の件数', () => {
    const authored = Object.keys(scripts);
    const missing = Object.keys(required).filter((scriptId) => !authored.includes(scriptId));
    const extra = authored.filter((scriptId) => required[scriptId] === undefined);
    expect(missing).toHaveLength(90);
    expect(extra.sort()).toEqual([
      'SCRIPT_CROSS_03_05',
      'SCRIPT_CROSS_07_15',
      'SCRIPT_END_A',
      'SCRIPT_END_C2_TAIL_INTACT',
      'SCRIPT_END_C2_TAIL_REWOUND',
      'SCRIPT_EPILOGUE_CROSS',
      'SCRIPT_EPILOGUE_REWOUND',
    ]);
  });
});

describe('[S-SCRIPT-SCHEMA] レコードの整合', () => {
  it('lines は空配列を認めない', () => {
    for (const record of Object.values(scripts)) {
      expect(record.lines.length).toBeGreaterThan(0);
    }
  });

  it('[S-SCRIPT-ID] 形式は SCRIPT_ を接頭とし大文字・数字・アンダースコアのみを用いる', () => {
    for (const scriptId of Object.keys(scripts)) {
      expect(scriptId).toMatch(/^SCRIPT_[A-Z0-9_]+$/);
    }
  });

  it('[S-SCRIPT-CONDITION] 参照する変数と比較子を文法の範囲に収める', () => {
    const variable =
      '(TotalRewindCount|PlaythroughCount|EnshrinedCount|ObsoleteNameRevealed|Marks08|SacrificeCount|SacrificedRetainerCount|CrossUnlockedAny|PartyCount|FurthestOrder|HeroHpMax|SacramentHeld|Close510Heard|ActNumber|SceneOrder|ForeknownDeathScenes|(EchoUnlocked|AttendantPresent|AttendantSacrificed|ForeknownAt|ForeclearedAt)\\[[A-Z0-9_]+\\])';
    const term = new RegExp(`^${variable} (==|!=|>=|<=|>|<) (-?\\d+|True|False)$`);
    for (const record of Object.values(scripts)) {
      if (record.condition === null) {
        continue;
      }
      for (const part of record.condition.split('&&')) {
        expect(part.trim()).toMatch(term);
      }
    }
  });

  it('branch_group を共有するレコードは条件を持ち、同一の (trigger, anchor, order) に並ぶ', () => {
    const groups: Record<string, ScriptMasterRecord[]> = {};
    for (const record of Object.values(scripts)) {
      if (record.branch_group === null) {
        continue;
      }
      (groups[record.branch_group] ??= []).push(record);
    }
    expect(Object.keys(groups).length).toBeGreaterThan(0);
    for (const members of Object.values(groups)) {
      expect(members.length).toBeGreaterThan(1);
      for (const member of members) {
        expect(member.condition).not.toBeNull();
        expect(member.trigger).toBe(members[0].trigger);
        expect(member.anchor).toBe(members[0].anchor);
        expect(member.order).toBe(members[0].order);
      }
    }
  });
});

describe('[I-PLAN-TEXT] プレースホルダの残存件数', () => {
  it('未執筆のレコードは書式に従い、残存件数を出力する', () => {
    const pending = Object.values(scripts).filter((record) => !isWritten(record));
    for (const record of pending) {
      expect(record.lines).toHaveLength(1);
      expect(record.lines[0]?.speaker).toBeNull();
      expect(record.lines[0]?.directives).toEqual(['WAIT_INPUT']);
    }
    console.log(`脚本マスタ：執筆済み ${Object.keys(scripts).length - pending.length}件／未執筆 ${pending.length}件`);
  });
});
