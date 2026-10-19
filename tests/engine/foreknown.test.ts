// [M-STATE-RUNSTATE]【既知】【巻き戻し後の既知】[M-META-COUNTERS] furthest_order・furthest_cleared_order、
// [S-SCRIPT-CONDITION] の評価と [S-SCRIPT-SCHEMA] のレコード選択、[M-META-ECHO] 種別A・D の発火。

import { describe, expect, it } from 'vitest';
import { SCRIPT_MASTERS } from '../../src/data/generated/script-masters.js';
import type { ScriptMasterRecord } from '../../src/data/types.js';
import { confirmInherit, openSacrificeConfirm, settleIntermission } from '../../src/engine/game/intermission.js';
import { rollbackIntermission, undo } from '../../src/engine/game/rewind.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameSession } from '../../src/engine/game/session.js';
import { fireSceneClearEchoes } from '../../src/engine/meta/echo.js';
import { sceneOf } from '../../src/engine/run/masters.js';
import { conditionReader, evaluateCondition } from '../../src/engine/script/condition.js';
import { scriptById, scriptsAt } from '../../src/engine/script/select.js';
import { createContext, MASTERS, playBattle, playOneOperation } from './game-fixtures.js';

const scripts: Readonly<Record<string, ScriptMasterRecord>> = SCRIPT_MASTERS;

function setup() {
  const ctx = createContext({ saves: [] });
  return { ctx, session: newGameSession(ctx) };
}

function introIds(session: GameSession): string[] {
  const read = conditionReader(session, MASTERS);
  return scriptsAt(scripts, 'SCENE_INTRO', session.data.run.current_scene_id, read).map((record) => record.script_id);
}

// [M-STATE-RUNSTATE]【巻き戻し後の既知】の不変条件：加えたシーンの order は最遠の記録以下である。
function expectKnowledgeWithinFurthest(session: GameSession): void {
  const { meta, run } = session.data;
  for (const sceneId of run.foreknown_scenes) {
    expect(sceneOf(MASTERS, sceneId).order).toBeLessThanOrEqual(meta.furthest_order);
  }
  for (const sceneId of run.forecleared_scenes) {
    expect(sceneOf(MASTERS, sceneId).order).toBeLessThanOrEqual(meta.furthest_cleared_order);
  }
}

describe('[M-STATE-RUNSTATE] 既知シーンの記録', () => {
  it('ニューゲームで 1-01 のバトル開始前演出に入り、furthest_order を 1 にする', () => {
    const { session } = setup();
    expect(session.data.run.foreknown_scenes).toEqual([]);
    expect(session.data.meta.furthest_order).toBe(1);
    expect(session.data.meta.furthest_cleared_order).toBe(0);
  });

  it('巻き戻しのない道行きでは、次のシーンも初見のまま入る', () => {
    const { session, ctx } = setup();
    expect(playBattle(session, ctx)).toBe('WIN');
    expect(session.data.meta.furthest_cleared_order).toBe(1);
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(session, ctx);
    expect(session.data.run.current_scene_id).toBe('SCENE_1_02');
    expect(session.data.meta.furthest_order).toBe(2);
    expect(session.data.run.foreknown_scenes).toEqual([]);
    expect(session.data.run.forecleared_scenes).toEqual([]);
  });

  it('1-02 に着いた後で過去のインターミッションへ戻ると、1-02 を既知として入り直す', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx);
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(session, ctx);
    rollbackIntermission(session, ctx, 1);
    // 戻り先はインターミッションであり、R は次に遷移する 1-02 の進行順である。
    expect(session.data.run.foreknown_scenes).toEqual(['SCENE_1_01']);
    expect(session.data.run.forecleared_scenes).toEqual(['SCENE_1_01']);
    expectKnowledgeWithinFurthest(session);
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(session, ctx);
    expect(session.data.run.foreknown_scenes).toEqual(['SCENE_1_01', 'SCENE_1_02']);
    // 1-02 はまだクリアまで見届けていない。
    expect(session.data.run.forecleared_scenes).toEqual(['SCENE_1_01']);
  });

  it('バトル中のアンドゥは、戦っているシーンを既知に加える', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx, 0);
    playOneOperation(session, ctx);
    undo(session, ctx);
    expect(session.data.run.foreknown_scenes).toEqual(['SCENE_1_01']);
    expect(session.data.run.forecleared_scenes).toEqual([]);
    expectKnowledgeWithinFurthest(session);
  });
});

describe('[S-SCRIPT-SCHEMA] 発火点ごとのレコードの選択', () => {
  it('1周目の 1-01 は表題・前段・点火・開幕の順に再生する', () => {
    const { session } = setup();
    expect(introIds(session)).toEqual([
      'SCRIPT_ACT_TITLE_1',
      'SCRIPT_SCENE_1_01_PRE',
      'SCRIPT_SCENE_1_01_IGNITE',
      'SCRIPT_SCENE_1_01_INTRO',
    ]);
  });

  it('[S-REVEAL-STAGES-FOREKNOWN] 1-02 の名乗りは、初見なら初見版、既知なら既知版を選ぶ', () => {
    const straight = setup();
    playBattle(straight.session, straight.ctx);
    confirmInherit(straight.session, straight.ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(straight.session, straight.ctx);
    expect(introIds(straight.session)).toEqual([
      'SCRIPT_SCENE_1_02_DECLARE',
      'SCRIPT_SCENE_1_02_MEET_UNKNOWN',
      'SCRIPT_SCENE_1_02_INTRO',
    ]);

    const rewound = setup();
    playBattle(rewound.session, rewound.ctx);
    confirmInherit(rewound.session, rewound.ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(rewound.session, rewound.ctx);
    rollbackIntermission(rewound.session, rewound.ctx, 1);
    confirmInherit(rewound.session, rewound.ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(rewound.session, rewound.ctx);
    expect(introIds(rewound.session)).toEqual([
      'SCRIPT_SCENE_1_02_DECLARE',
      'SCRIPT_SCENE_1_02_MEET_KNOWN',
      'SCRIPT_SCENE_1_02_INTRO',
    ]);
  });

  it('[S-ECHO-SCHEMA]【版の切り替え】残響の script_id から、条件が成立する版を選ぶ', () => {
    const { session } = setup();
    const read = conditionReader(session, MASTERS);
    expect(scriptById(scripts, 'SCRIPT_ECHO_03_UNKNOWN', read)?.script_id).toBe('SCRIPT_ECHO_03_UNKNOWN');
    session.data.run.foreknown_scenes = ['SCENE_1_02'];
    expect(scriptById(scripts, 'SCRIPT_ECHO_03_UNKNOWN', conditionReader(session, MASTERS))?.script_id).toBe(
      'SCRIPT_ECHO_03_KNOWN',
    );
  });

  it('[S-SCRIPT-CONDITION] 文法に合わない式と未知の変数を受け付けない', () => {
    const { session } = setup();
    const read = conditionReader(session, MASTERS);
    expect(evaluateCondition('PlaythroughCount == 1 && TotalRewindCount == 0', read)).toBe(true);
    expect(() => evaluateCondition('PlaythroughCount == 1 || TotalRewindCount == 0', read)).toThrow('文法');
    expect(() => evaluateCondition('Unknown == 1', read)).toThrow('変数');
  });
});

describe('[M-META-ECHO] 残響の発火', () => {
  it('種別A：指定シーンのクリア後、従者が同行していれば1度だけ発火する', () => {
    const { session } = setup();
    const { meta, run } = session.data;
    expect(fireSceneClearEchoes(meta, run, MASTERS, 'SCENE_2_02')).toEqual([]);
    run.party.push({ attendant_id: 'ATTENDANT_02', inherit_state: 'UNUSED' });
    expect(fireSceneClearEchoes(meta, run, MASTERS, 'SCENE_2_01')).toEqual([]);
    expect(fireSceneClearEchoes(meta, run, MASTERS, 'SCENE_2_02')).toEqual(['ECHO_02']);
    expect(meta.echo_unlocked.ECHO_02).toBe(true);
    expect(fireSceneClearEchoes(meta, run, MASTERS, 'SCENE_2_02')).toEqual([]);
  });

  it('種別D：供犠の確定ダイアログの表示時に発火し、二度目は発火しない', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx);
    expect(openSacrificeConfirm(session, ctx, 'ATTENDANT_01')).toBe('ECHO_01');
    expect(session.data.meta.echo_unlocked.ECHO_01).toBe(true);
    expect(openSacrificeConfirm(session, ctx, 'ATTENDANT_01')).toBeNull();
  });

  it('残響の要素集合は残響マスタの18件と一致する', () => {
    const { session } = setup();
    expect(Object.keys(session.data.meta.echo_unlocked)).toHaveLength(18);
  });
});
