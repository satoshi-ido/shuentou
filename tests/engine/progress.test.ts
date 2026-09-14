// [M-STATE-RUNSTATE] [M-PROG-CLEAR] [M-INHERIT-POOL] [M-INHERIT-MERGE] [M-PROG-SACRIFICE] [M-PROG-REFILL]

import { describe, expect, it } from 'vitest';
import {
  confirmInherit,
  confirmRefill,
  confirmSacrifice,
  enterTransition,
  settleIntermission,
} from '../../src/engine/game/intermission.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameSession } from '../../src/engine/game/session.js';
import { inheritPool } from '../../src/engine/progress/inherit.js';
import { refillCapacity, refillPool } from '../../src/engine/progress/refill.js';
import type { ActionInstance } from '../../src/engine/types.js';
import { createContext, playBattle } from './game-fixtures.js';

function setup() {
  const recorder = { saves: [] as string[] };
  const ctx = createContext(recorder);
  const session = newGameSession(ctx);
  return { recorder, ctx, session };
}

function actOf(session: GameSession, classId: string): ActionInstance {
  const found = session.data.run.hero_acts.find((action) => action.master_ref === classId);
  if (found === undefined) {
    throw new Error(`所持していない: ${classId}`);
  }
  return found;
}

function clearFirstScene() {
  const env = setup();
  expect(playBattle(env.session, env.ctx)).toBe('WIN');
  return env;
}

function clearActOne() {
  const env = clearFirstScene();
  settleIntermission(env.session, env.ctx);
  expect(playBattle(env.session, env.ctx)).toBe('WIN');
  return env;
}

describe('[M-STATE-RUNSTATE] ニューゲーム', () => {
  it('主人公初期データと固定編成の従者01で開始する', () => {
    const { session } = setup();
    const { run } = session.data;
    expect(run.phase).toBe('PRE_BATTLE');
    expect(run.current_scene_id).toBe('SCENE_1_01');
    expect([run.hero_hp, run.hero_max_hp]).toEqual([60, 60]);
    expect(run.hero_acts.map((action) => action.instance_id)).toEqual(['IID0000', 'IID0001', 'IID0002', 'IID0003', 'IID0004']);
    expect(run.instance_id_seq).toBe(5);
    expect(run.party).toEqual([{ attendant_id: 'ATTENDANT_01', inherit_state: 'UNUSED' }]);
    expect(run.recruited).toEqual(['ATTENDANT_01']);
    expect(session.data.save_version).toBe(2);
  });
});

describe('[M-PROG-CLEAR] バトルクリア共通決済', () => {
  it('主人公3項目を書き戻し、インターミッションへ遷移してスナップショットを記録する', () => {
    const { session, recorder } = clearFirstScene();
    const { run } = session.data;
    expect(run.phase).toBe('INTERMISSION');
    expect(run.intermission_stage).toBe('INHERIT');
    expect(run.current_scene_id).toBe('SCENE_1_02');
    expect(run.battle_state).toBeNull();
    expect(run.history_stack).toEqual([]);
    expect(run.im_snapshots.map((snapshot) => snapshot.order)).toEqual([1]);
    expect(run.im_snapshots[0]?.state.phase).toBe('INTERMISSION');
    expect(run.hero_acts.every((action) => !action.is_copy && action.seal_accum === 0)).toBe(true);
    // 敵マスターの所持アクション8件の実体化により採番位置が進む（[I-STATE-ID]）。
    expect(run.instance_id_seq).toBe(13);
    // バトル開始時・クリア完了時の2回保存する。
    expect(recorder.saves.map((text) => JSON.parse(text).run.phase)).toEqual(['BATTLE', 'INTERMISSION']);
  });
});

describe('[M-INHERIT-POOL] [M-INHERIT-MERGE] 継承', () => {
  it('継承プールは無限使用アクションを除き、最大HP加算を含む', () => {
    const { session, ctx } = clearFirstScene();
    const pool = inheritPool(session.data.run, ctx.masters);
    expect(pool).toContainEqual({ kind: 'MAX_HP' });
    expect(pool).not.toContainEqual({ kind: 'ACTION', class_id: 'ACT_ROOT_MARTIAL' });
  });

  it('同一対象は既存スロットへ統合し、インスタンスIDを維持して回数は最大値を採る', () => {
    const { session, ctx } = clearFirstScene();
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'ACTION', class_id: 'ACT_SLASH_AR3' });
    const slash = actOf(session, 'ACT_SLASH_AR3');
    expect(slash.instance_id).toBe('IID0001');
    expect([slash.uses_initial, slash.uses_left]).toEqual([45, 45]); // round(10.00 × 4.50)
    expect(session.data.run.hero_acts).toHaveLength(5);
    expect(session.data.run.party[0]?.inherit_state).toBe('SPENT');
  });

  it('該当スロットがなければ末尾へ新規追加し、次の採番位置を用いる', () => {
    const { session, ctx } = clearFirstScene();
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'ACTION', class_id: 'ACT_MUSOU_AR3' });
    const musou = session.data.run.hero_acts[5];
    expect(musou?.master_ref).toBe('ACT_MUSOU_AR3');
    expect(musou?.instance_id).toBe('IID0013');
    expect(musou?.uses_left).toBe(14); // round(3.00 × 4.50)
    expect(session.data.run.instance_id_seq).toBe(14);
  });

  it('従者特性係数を基礎値へ乗算し、統合は減少型に最小値を採る', () => {
    const { session, ctx } = clearFirstScene();
    session.data.run.party = [{ attendant_id: 'ATTENDANT_03', inherit_state: 'UNUSED' }];
    const before = actOf(session, 'ACT_SLASH_AR6');
    expect(before.base_params.cost_pp).toBe(2);
    confirmInherit(session, ctx, 'ATTENDANT_03', { kind: 'ACTION', class_id: 'ACT_SLASH_AR6' });
    const after = actOf(session, 'ACT_SLASH_AR6');
    expect(after.base_params.cost_pp).toBe(1); // min(2, round(2 × 0.67))
    expect(after.merge_params.cost_pp).toBe(2); // 統合キーは再算出しない
    expect(after.uses_left).toBe(30); // max(10, round(10.00 × 3.00))
  });

  it('最大HP加算は hpAddRate を乗じて最大HP基礎値へ累積し、現在HPは据え置く', () => {
    const { session, ctx } = clearFirstScene();
    session.data.run.party = [{ attendant_id: 'ATTENDANT_02', inherit_state: 'UNUSED' }];
    confirmInherit(session, ctx, 'ATTENDANT_02', { kind: 'MAX_HP' });
    expect(session.data.run.hero_max_hp).toBe(60 + 122); // round(81 × 1.50)
    expect(session.data.run.hero_hp).toBe(60);
  });

  it('行使済みの継承枠では再度継承できない', () => {
    const { session, ctx } = clearFirstScene();
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    expect(() => confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' })).toThrow();
  });
});

describe('[M-PROG-SACRIFICE] 供犠', () => {
  it('従者を消滅させて現在HPを最大HPまで回復し、1インターミッション1回に限る', () => {
    const { session, ctx } = clearActOne();
    session.data.run.party.push({ attendant_id: 'ATTENDANT_02', inherit_state: 'UNUSED' });
    session.data.run.hero_hp = 1;
    confirmSacrifice(session, ctx, 'ATTENDANT_01');
    expect(session.data.run.party.map((slot) => slot.attendant_id)).toEqual(['ATTENDANT_02']);
    expect(session.data.run.sacrificed).toEqual(['ATTENDANT_01']);
    expect(session.data.run.hero_hp).toBe(session.data.run.hero_max_hp);
    expect(() => confirmSacrifice(session, ctx, 'ATTENDANT_02')).toThrow();
  });
});

describe('[M-PROG-REFILL] インターミッションの段・アクト移行・従者補充', () => {
  it('アクト最終シーン以外のクリア後は INHERIT 段で決済を確定し、未行使の継承枠を失効させる', () => {
    const { session, ctx } = clearFirstScene();
    expect(() => enterTransition(session, ctx)).toThrow();
    settleIntermission(session, ctx);
    expect(session.data.run.phase).toBe('PRE_BATTLE');
    expect(session.data.run.party[0]?.inherit_state).toBe('FORFEITED');
  });

  it('アクト最終シーンのクリア後は TRANSITION 段を経なければ決済を確定できない', () => {
    const { session, ctx } = clearActOne();
    expect(() => settleIntermission(session, ctx)).toThrow();
    session.data.run.hero_hp = 1;
    enterTransition(session, ctx);
    expect(session.data.run.intermission_stage).toBe('TRANSITION');
    expect(session.data.run.party[0]?.inherit_state).toBe('FORFEITED');
    expect(session.data.run.hero_hp).toBe(session.data.run.hero_max_hp);
    expect(() => confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' })).toThrow();
  });

  it('補充候補プールと補充可能数を導出し、1名ずつ確定する', () => {
    const { session, ctx } = clearActOne();
    enterTransition(session, ctx);
    const { run } = session.data;
    expect(refillPool(run, ctx.masters)).toEqual(['ATTENDANT_02', 'ATTENDANT_03']);
    expect(refillCapacity(run, ctx.masters)).toBe(1); // 定員2 − 従者01
    confirmRefill(session, ctx, 'ATTENDANT_03');
    expect(run.party.at(-1)).toEqual({ attendant_id: 'ATTENDANT_03', inherit_state: 'UNUSED' });
    expect(run.recruited).toEqual(['ATTENDANT_01', 'ATTENDANT_03']);
    expect(run.enshrined_count).toBe(1);
    expect(refillPool(run, ctx.masters)).toEqual(['ATTENDANT_02']);
    expect(() => confirmRefill(session, ctx, 'ATTENDANT_02')).toThrow(); // 定員到達
    expect(session.data.meta.enshrine_anchor.ATTENDANT_03).toEqual({ playthrough: 1, rewind_count: 0 });
  });

  it('補充は任意であり、満たないまま決済を確定できる', () => {
    const { session, ctx } = clearActOne();
    enterTransition(session, ctx);
    settleIntermission(session, ctx);
    expect(session.data.run.phase).toBe('PRE_BATTLE');
    expect(session.data.run.current_scene_id).toBe('SCENE_2_01');
  });
});
