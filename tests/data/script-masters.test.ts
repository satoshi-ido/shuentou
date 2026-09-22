// [I-PLAN-TEXT]［必須レコードの存在検査］[S-SCRIPT-RECORDS] が確定する要求集合を検査する。
// プレースホルダはレコードの存在を満たすが本文の完成を意味しないため、残存件数を別に数える。

import { describe, expect, it } from 'vitest';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { SCRIPT_MASTERS } from '../../src/data/generated/script-masters.js';
import type { ScriptMasterRecord } from '../../src/data/types.js';
import { isPlaceholderText } from '../../src/ui/text.js';

const scripts: Readonly<Record<string, ScriptMasterRecord>> = SCRIPT_MASTERS;

function idsOf(trigger: string): string[] {
  return Object.values(scripts)
    .filter((record) => record.trigger === trigger)
    .map((record) => record.script_id)
    .sort();
}

function requireRecord(scriptId: string): ScriptMasterRecord {
  const record = scripts[scriptId];
  if (record === undefined) {
    throw new Error(`脚本IDが見つからない: ${scriptId}`);
  }
  return record;
}

describe('[S-SCRIPT-RECORDS] SCENE_INTRO', () => {
  it('全31シーンが開幕脚本を持つ（[S-SCENE-1-01]〜[S-SCENE-5-11]）', () => {
    const scenes = Object.values(SCENE_MASTERS);
    expect(scenes).toHaveLength(31);
    for (const scene of scenes) {
      const record = requireRecord(`SCRIPT_${scene.scene_id}_INTRO`);
      expect(record.trigger).toBe('SCENE_INTRO');
      expect(record.anchor).toBe(scene.scene_id);
    }
  });

  it('[S-SCENE-1-02]［開幕］の3件を持つ', () => {
    for (const suffix of ['NAMING_INTACT', 'NAMING_REWOUND', 'DECLARE']) {
      expect(requireRecord(`SCRIPT_SCENE_1_02_${suffix}`).anchor).toBe('SCENE_1_02');
    }
    // 二択は branch_group を共有し、条件が排他である（[S-SCRIPT-SCHEMA]［分岐］）。
    const intact = requireRecord('SCRIPT_SCENE_1_02_NAMING_INTACT');
    const rewound = requireRecord('SCRIPT_SCENE_1_02_NAMING_REWOUND');
    expect(intact.branch_group).toBe(rewound.branch_group);
    expect(intact.condition).toBe('TotalRewindCount == 0');
    expect(rewound.condition).toBe('TotalRewindCount > 0');
  });

  it('[S-END-A]（周回時の開幕差し替え）の2件を持つ', () => {
    expect(requireRecord('SCRIPT_SCENE_1_01_MONO_INTACT').branch_group).toBe('SCENE_1_01_MONO');
    expect(requireRecord('SCRIPT_SCENE_1_01_MONO_REWOUND').branch_group).toBe('SCENE_1_01_MONO');
  });

  it('[M-META-ECHO] 種別A の残響11件が相乗りし、anchor は Null である', () => {
    // 対象従者は 02・03・04・06・07・10・11・12・13・14・15（[M-META-ECHO]）。
    const expected = ['02', '03', '04', '06', '07', '10', '11', '12', '13', '14', '15'];
    for (const number of expected) {
      const record = requireRecord(`SCRIPT_ECHO_${number}`);
      expect(record.trigger).toBe('SCENE_INTRO');
      expect(record.anchor).toBeNull();
    }
    expect(expected).toHaveLength(11);
  });
});

describe('[S-SCRIPT-RECORDS] INTERMISSION_ENTER', () => {
  it('[S-CROSS-02-03]〜[S-CROSS-12-13] の交差残響8件を持つ', () => {
    const pairs = ['02_03', '03_05', '03_15', '04_06', '07_15', '10_11', '11_12', '12_13'];
    for (const pair of pairs) {
      const record = requireRecord(`SCRIPT_CROSS_${pair}`);
      expect(record.trigger).toBe('INTERMISSION_ENTER');
      expect(record.anchor).toBeNull();
      // [S-SCRIPT-TRIGGER]「交差残響のレコードは replay_on_rollback を既定の True とする」。
      expect(record.replay_on_rollback).toBe(true);
    }
    expect(pairs).toHaveLength(8);
  });

  it('[S-RETAINER-08] 種別C の3件を持ち、ECHO_08_0500 は script_id を持たない', () => {
    for (const threshold of ['0010', '0050', '0200']) {
      expect(requireRecord(`SCRIPT_ECHO_08_${threshold}`).trigger).toBe('INTERMISSION_ENTER');
    }
    expect(scripts.SCRIPT_ECHO_08_0500).toBeUndefined();
  });
});

describe('[S-SCRIPT-RECORDS] SACRIFICE_CONFIRM・ACT_TRANSITION', () => {
  it('種別D の2件（[S-RETAINER-01]・[S-RETAINER-09]）を持つ', () => {
    expect(idsOf('SACRIFICE_CONFIRM')).toEqual(['SCRIPT_ECHO_01', 'SCRIPT_ECHO_09']);
  });

  it('[S-ACT-TITLECARD] の表題カード5件が所定の発火点へ割り当てられる', () => {
    expect(requireRecord('SCRIPT_ACT_TITLE_1').trigger).toBe('SCENE_INTRO');
    expect(requireRecord('SCRIPT_ACT_TITLE_1').anchor).toBe('SCENE_1_01');
    // SCRIPT_ACT_TITLE_1 の order は 1-01 の開幕脚本より前に置く。
    expect(requireRecord('SCRIPT_ACT_TITLE_1').order).toBeLessThan(requireRecord('SCRIPT_SCENE_1_01_INTRO').order);
    for (const act of [2, 3, 4, 5]) {
      const record = requireRecord(`SCRIPT_ACT_TITLE_${act}`);
      expect(record.trigger).toBe('ACT_TRANSITION');
      expect(record.anchor).toBe(String(act - 1)); // 移行元アクト番号
    }
  });

  it('[S-ACT-TITLECARD]「レコードは旧称の形で保持する」：アクト4は 天疵 で記述する', () => {
    expect(requireRecord('SCRIPT_ACT_TITLE_4').lines[0]?.text).toBe('アクト4：天疵');
    expect(requireRecord('SCRIPT_ACT_TITLE_1').lines[0]?.text).toBe('アクト1：灰の村');
    for (const act of [1, 2, 3, 4, 5]) {
      expect(requireRecord(`SCRIPT_ACT_TITLE_${act}`).lines[0]?.directives).toContain('ACT_TITLE_CARD');
    }
  });

  it('[S-RETAINER-05] 種別B の1件がアクト移行へ相乗りする', () => {
    expect(requireRecord('SCRIPT_ECHO_05').trigger).toBe('ACT_TRANSITION');
    expect(requireRecord('SCRIPT_ECHO_05').anchor).toBeNull();
  });
});

describe('[S-SCRIPT-RECORDS] ENDING・EPILOGUE・NEWGAME_INTRO', () => {
  it('[M-END-BRANCH] の5分岐と [S-END-C2] の分岐2件を持つ', () => {
    const branches: readonly (readonly [string, string])[] = [
      ['SCRIPT_END_A', 'a'],
      ['SCRIPT_END_B', 'b'],
      ['SCRIPT_END_C1', 'c-1'],
      ['SCRIPT_END_C2', 'c-2'],
      ['SCRIPT_END_D', 'd'],
    ];
    for (const [scriptId, anchor] of branches) {
      expect(requireRecord(scriptId).anchor).toBe(anchor);
    }
    expect(requireRecord('SCRIPT_END_C2_TAIL_INTACT').branch_group).toBe('END_C2_TAIL');
    expect(requireRecord('SCRIPT_END_C2_TAIL_REWOUND').anchor).toBe('c-2');
  });

  it('[S-EPILOGUE] の6件を持ち、交差残響の行は CrossUnlockedAny で条件づく', () => {
    expect(idsOf('EPILOGUE')).toEqual([
      'SCRIPT_EPILOGUE_CLOSE',
      'SCRIPT_EPILOGUE_COUNT',
      'SCRIPT_EPILOGUE_CROSS',
      'SCRIPT_EPILOGUE_INTACT',
      'SCRIPT_EPILOGUE_OPEN',
      'SCRIPT_EPILOGUE_REWOUND',
    ]);
    expect(requireRecord('SCRIPT_EPILOGUE_CROSS').condition).toBe('CrossUnlockedAny == True');
    // 締めの直前へ挿入する（[S-EPILOGUE]【交差残響の反映】）。
    expect(requireRecord('SCRIPT_EPILOGUE_CROSS').order).toBeLessThan(requireRecord('SCRIPT_EPILOGUE_CLOSE').order);
  });

  it('[M-META-NEWGAMEPLUS] の周回開幕1件を持つ', () => {
    expect(idsOf('NEWGAME_INTRO')).toEqual(['SCRIPT_NEWGAME_INTRO']);
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
    const term = /^(TotalRewindCount|PlaythroughCount|EnshrinedCount|ObsoleteNameRevealed|SacrificeCount|CrossUnlockedAny|EchoUnlocked\[[A-Z0-9_]+\]|AttendantPresent\[[A-Z0-9_]+\]|AttendantSacrificed\[[A-Z0-9_]+\]|RewindCountSinceEnshrined\[[A-Z0-9_]+\]) (==|!=|>=|<=|>|<) (-?\d+|True|False)$/;
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
  it('本文が未執筆のレコードを数える（アクト表題カードのみ本文が確定している）', () => {
    const pending = Object.values(scripts).filter((record) =>
      record.lines.every((line) => isPlaceholderText(record.script_id, line.text)),
    );
    const written = Object.keys(scripts).length - pending.length;
    // [S-ACT-TITLECARD] が提示文字列を確定させている5件のみが執筆済みである。
    expect(written).toBe(5);
    // プレースホルダは [I-PLAN-TEXT] の書式に従い1行・話者Null・WAIT_INPUT のみとする。
    for (const record of pending) {
      expect(record.lines).toHaveLength(1);
      expect(record.lines[0]?.speaker).toBeNull();
      expect(record.lines[0]?.directives).toEqual(['WAIT_INPUT']);
    }
  });
});
