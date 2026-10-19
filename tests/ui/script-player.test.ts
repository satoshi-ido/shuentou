// [M-UI-SCRIPT] 脚本の提示の進行（文字送り・入力待ち・頁の積み直し・飛ばす）と、
// [S-SCRIPT-TRIGGER]【バトル中の契機】の成立判定・再生済みの管理。

import { describe, expect, it } from 'vitest';
import { SCRIPT_MASTERS } from '../../src/data/generated/script-masters.js';
import type { ScriptLineRecord, ScriptMasterRecord } from '../../src/data/types.js';
import { BattleCueTracker, cueSatisfied } from '../../src/ui/script-cues.js';
import { ScriptPlayer } from '../../src/ui/script-player.js';
import { createDuel, findUnit } from '../ai/fixtures.js';

const scripts: Readonly<Record<string, ScriptMasterRecord>> = SCRIPT_MASTERS;

const line = (text: string, speaker: string | null = null, directives: ScriptLineRecord['directives'] = ['WAIT_INPUT']): ScriptLineRecord => ({
  speaker,
  text,
  directives,
});

function record(scriptId: string, lines: ScriptLineRecord[]): ScriptMasterRecord {
  return {
    script_id: scriptId,
    trigger: 'SCENE_INTRO',
    anchor: 'SCENE_1_01',
    order: 1,
    branch_group: null,
    condition: null,
    replay_on_rollback: true,
    lines,
  };
}

describe('[M-UI-SCRIPT]【文字送り】', () => {
  it('テキスト送り速度に従って1文字ずつ現れ、途中のクリックで行の全体を示す', () => {
    const player = new ScriptPlayer([{ records: [record('A', [line('灰が降る。')])], lantern: false }]);
    player.tick('NORMAL');
    expect(player.view().lines[0]?.text).toBe('灰');
    player.click();
    expect(player.view().lines[0]).toEqual({ speaker: null, text: '灰が降る。', complete: true });
    expect(player.view().waiting).toBe(true);
    player.click();
    expect(player.done).toBe(true);
  });

  it('INSTANT は行の全体を一度に示し、WAIT_INPUT を持たない行は現れ終えたら次へ進む', () => {
    const player = new ScriptPlayer([
      { records: [record('A', [line('一行目', null, []), line('二行目')])], lantern: false },
    ]);
    player.tick('INSTANT');
    expect(player.view().lines.map((shown) => shown.text)).toEqual(['一行目', '']);
    player.tick('INSTANT');
    expect(player.view().lines.map((shown) => shown.text)).toEqual(['一行目', '二行目']);
    expect(player.view().waiting).toBe(true);
  });

  it('SLOW は3フレームに1文字、FAST は1フレームに3文字', () => {
    const slow = new ScriptPlayer([{ records: [record('A', [line('あいうえお')])], lantern: false }]);
    slow.tick('SLOW');
    slow.tick('SLOW');
    expect(slow.view().lines[0]?.text).toBe('');
    slow.tick('SLOW');
    expect(slow.view().lines[0]?.text).toBe('あ');
    const fast = new ScriptPlayer([{ records: [record('A', [line('あいうえお')])], lantern: false }]);
    fast.tick('FAST');
    expect(fast.view().lines[0]?.text).toBe('あいう');
  });
});

describe('[M-UI-SCRIPT]【画面の構成】', () => {
  it('行は積み、レコードが替わると積み直す', () => {
    const player = new ScriptPlayer([
      { records: [record('A', [line('一'), line('二')]), record('B', [line('三')])], lantern: false },
    ]);
    player.tick('INSTANT');
    player.click();
    player.tick('INSTANT');
    expect(player.view().lines.map((shown) => shown.text)).toEqual(['一', '二']);
    player.click();
    player.tick('INSTANT');
    expect(player.view().lines.map((shown) => shown.text)).toEqual(['三']);
  });

  it('アクト表題カードの行は表題として示す', () => {
    const player = new ScriptPlayer([{ records: [scripts.SCRIPT_ACT_TITLE_1 as ScriptMasterRecord], lantern: false }]);
    expect(player.view().titleCard).toBe('アクト1：灰の村');
    expect(player.view().fadeIn).toBe(true);
  });

  it('燈の中の声は組ごとに示し分ける', () => {
    const player = new ScriptPlayer([
      { records: [record('A', [line('地の文')])], lantern: false },
      { records: [record('B', [line('……あったかい。', 'リナ')])], lantern: true },
    ]);
    expect(player.view().lantern).toBe(false);
    player.tick('INSTANT');
    player.click();
    expect(player.view().lantern).toBe(true);
  });
});

describe('[M-UI-SCRIPT]【飛ばす】', () => {
  it('残りを示さずに終え、飛ばした行の音と進行に関わる演出指示だけを返す', () => {
    const player = new ScriptPlayer([
      {
        records: [record('A', [line('一'), line('二', null, ['FADE_OUT', 'SILENCE', 'WAIT_INPUT']), line('三')])],
        lantern: false,
      },
    ]);
    expect(player.skip()).toEqual(['SILENCE']);
    expect(player.done).toBe(true);
  });
});

describe('[S-SCRIPT-TRIGGER]【バトル中の契機】', () => {
  it('ENEMY_FIRST_ACT は敵マスターの直前アクション記憶、ENEMY_HP_HALF は最大HPの半分以下で成立する', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [], enemyMaxHp: 40, enemyActs: [] });
    const enemy = findUnit(state, 'FOE', 'MASTER');
    expect(cueSatisfied(state, 'ENEMY_FIRST_ACT')).toBe(enemy.last_act !== null);
    enemy.hp = Math.floor(enemy.max_hp / 2) + 1;
    expect(cueSatisfied(state, 'ENEMY_HP_HALF')).toBe(false);
    enemy.hp = Math.floor(enemy.max_hp / 2);
    expect(cueSatisfied(state, 'ENEMY_HP_HALF')).toBe(true);
  });

  it('1回のバトルに1度だけ再生し、巻き戻した先より後に再生したものは再び再生する', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [], enemyMaxHp: 40, enemyActs: [] });
    const enemy = findUnit(state, 'FOE', 'MASTER');
    enemy.hp = 0;
    state.step = 40;
    const tracker = new BattleCueTracker();
    expect(tracker.take(state, 'SCENE_1_02', scripts)).toEqual(['SCENE_1_02:ENEMY_HP_HALF']);
    expect(tracker.take(state, 'SCENE_1_02', scripts)).toEqual([]);
    tracker.rewindTo(40);
    expect(tracker.take(state, 'SCENE_1_02', scripts)).toEqual([]);
    tracker.rewindTo(39);
    expect(tracker.take(state, 'SCENE_1_02', scripts)).toEqual(['SCENE_1_02:ENEMY_HP_HALF']);
    tracker.reset();
    expect(tracker.take(state, 'SCENE_1_02', scripts)).toEqual(['SCENE_1_02:ENEMY_HP_HALF']);
  });
});
