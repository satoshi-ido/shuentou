// [M-PIPE-P5-DISCARD] 敗北の判定と、[M-REWIND-ROLLBACK] による再挑戦。
// 敗北はタイトルへ送還せず、ロールバックによる復旧のみを受け付ける。

import { describe, expect, it } from 'vitest';
import { removeCreatures, runP5Discard } from '../../src/engine/pipeline/p5-discard.js';
import { rollbackBattle, rollbackIntermission, rollbackOrders } from '../../src/engine/game/rewind.js';
import { resumeTime, startBattle, type BattleResult } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { MASTERS, type Recorder } from './game-fixtures.js';
import { executableActions, type Decision } from '../../src/engine/decision.js';
import { createCreatureFactory } from '../../src/engine/creature.js';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { CREATURE_MASTERS } from '../../src/data/generated/creature-masters.js';
import { createDuel, findUnit, makeAction, martialAction } from '../ai/fixtures.js';

// 1-01 の敵マスターは基本型の所持回数では主人公の最大HPを削り切れないため、敗北の局面は
// マスター根源武技（[M-BASE-AR-SYSTEM]・思考550・dmg_hp 999.00）で作る。主人公側は心気を
// 常に実行できるため指示可能であり続け、時間停止が成立する。
const rootFoe = (state: Parameters<typeof executableActions>[0], unit: Parameters<typeof executableActions>[1]): Decision => {
  const root = executableActions(state, unit).find((action) => action.master_ref === 'ACT_ROOT_MARTIAL');
  return root === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: root.instance_id };
};

function setup(): { session: GameSession; ctx: GameContext; recorder: Recorder } {
  const recorder: Recorder = { saves: [] };
  const ctx: GameContext = {
    masters: MASTERS,
    foeDecision: rootFoe,
    stepDeps: { createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }) },
    persist: (serialized) => {
      recorder.saves.push(serialized);
    },
  };
  return { session: newGameSession(ctx), ctx, recorder };
}

// 自軍は一切指示せず時間だけを進める（[V-TEST-REFAI]「無操作型」）。
function playUntilLoss(session: GameSession, ctx: GameContext, maxOperations = 4000): BattleResult {
  let result = startBattle(session, ctx);
  for (let i = 0; i < maxOperations && result === 'PAUSED'; i += 1) {
    result = resumeTime(session, ctx);
  }
  return result;
}

function battleOf(session: GameSession): BattleState {
  const state = session.data.run.battle_state;
  if (state === null) {
    throw new Error('バトル中ではない');
  }
  return state;
}

const MIND = makeAction('FOE_MIND', { gain_vp: 3, charge_pp: 100, step_thought: 20, step_startup: 5, step_recovery: 5 });
const HIT = martialAction('FOE_HIT', { atk: 10, dmg_hp: 300, step_startup: 5, step_recovery: 5 });

describe('[M-PIPE-P5-DISCARD] 勝敗判定', () => {
  it('自軍マスター不在は敗北とする', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [MIND, HIT] });
    findUnit(state, 'MINE').state = 'PENDING_DISCARD';
    expect(runP5Discard(state)).toBe('LOSS');
  });

  it('相打ち（両軍マスター同時不在）も敗北とする', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [MIND, HIT] });
    findUnit(state, 'MINE').state = 'PENDING_DISCARD';
    findUnit(state, 'FOE').state = 'PENDING_DISCARD';
    expect(runP5Discard(state)).toBe('LOSS');
  });

  it('勝敗決定時は残存クリーチャーを物理撤去する', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [MIND, HIT] });
    const enemy = findUnit(state, 'FOE');
    state.units[3] = { ...enemy, unit_id: 'U9999', unit_kind: 'CREATURE', pos_idx: 3 } as Unit;
    findUnit(state, 'MINE').state = 'PENDING_DISCARD';
    expect(runP5Discard(state)).toBe('LOSS');
    expect(state.units[3]).toBeNull();
  });

  it('removeCreatures はマスターを撤去しない', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [MIND, HIT] });
    removeCreatures(state);
    expect(state.units[1]).not.toBeNull();
    expect(state.units[2]).not.toBeNull();
  });
});

describe('[M-REWIND-ROLLBACK] 敗北からのバトル開始時ロールバック', () => {
  it('敗北は phase を BATTLE のまま残し、盤面を破棄しない', () => {
    const { session, ctx } = setup();
    expect(playUntilLoss(session, ctx)).toBe('LOSS');
    expect(session.data.run.phase).toBe('BATTLE');
    expect(session.data.run.battle_state).not.toBeNull();
    // 自軍マスターは不在であり、以後の指示は受け付けない。
    expect(battleOf(session).units.some((unit) => unit?.side === 'MINE' && unit.unit_kind === 'MASTER')).toBe(false);
  });

  it('敗北状態から rollbackBattle でステップ0へ復元する', () => {
    const { session, ctx } = setup();
    // ステップ0へ復元したうえで最初の時間停止まで進めるため、開幕の局面と一致することを確かめる。
    let result = startBattle(session, ctx);
    const opening = JSON.stringify(session.data.run);
    const openingStep = battleOf(session).step;
    for (let i = 0; i < 4000 && result === 'PAUSED'; i += 1) {
      result = resumeTime(session, ctx);
    }
    expect(result).toBe('LOSS');
    expect(battleOf(session).step).toBeGreaterThan(openingStep);

    expect(rollbackBattle(session, ctx)).toBe('PAUSED');
    expect(JSON.stringify(session.data.run)).toBe(opening);
    const state = battleOf(session);
    expect(state.step).toBe(openingStep);
    const hero = state.units.find((unit): unit is Unit => unit?.side === 'MINE' && unit.unit_kind === 'MASTER');
    expect(hero?.hp).toBe(session.data.run.hero_max_hp);
    expect(session.data.run.phase).toBe('BATTLE');
  });

  it('[M-META-PENDING] 保留ステートを ROLLBACK_BATTLE として立てる', () => {
    const { session, ctx } = setup();
    playUntilLoss(session, ctx);
    expect(session.data.pending.rewind_pending).toBe(false);
    rollbackBattle(session, ctx);
    expect(session.data.pending.rewind_pending).toBe(true);
    expect(session.data.pending.rewind_pending_type).toBe('ROLLBACK_BATTLE');
    // ［実行時点では加算しない］確定は [M-META-COMMIT] の確定イベントによる。
    expect(session.data.meta.total_rewind_count).toBe(0);
  });

  it('[M-STATE-HISTORY]［破棄契機］3. 履歴スタックを空にする', () => {
    const { session, ctx } = setup();
    playUntilLoss(session, ctx);
    rollbackBattle(session, ctx);
    expect(session.data.run.history_stack).toEqual([]);
    // [I-ENV-WORKER] 局面が変わるため進行中の要求の応答は破棄する。
    expect(session.pending_step ?? null).toBeNull();
  });

  it('タイトルへ送還せず、セーブデータを破棄しない', () => {
    const { session, ctx, recorder } = setup();
    const before = recorder.saves.length;
    playUntilLoss(session, ctx);
    rollbackBattle(session, ctx);
    expect(recorder.saves.length).toBeGreaterThanOrEqual(before);
    expect(session.data.save_version).toBe(4);
    expect(session.data.run.current_scene_id).toBe('SCENE_1_01');
  });

  it('復旧後は同じバトルを最初から進行できる', () => {
    const { session, ctx } = setup();
    playUntilLoss(session, ctx);
    rollbackBattle(session, ctx);
    expect(resumeTime(session, ctx)).toBe('PAUSED');
    expect(battleOf(session).step).toBeGreaterThan(0);
  });
});

describe('[M-REWIND-ROLLBACK] 敗北から過去インターミッションへの復帰', () => {
  it('復帰先の候補はスナップショットの order で与えられる', () => {
    const { session, ctx } = setup();
    playUntilLoss(session, ctx);
    // 1-01 の敗北時点ではまだクリア実績がないため、復帰先の候補は存在しない。
    expect(rollbackOrders(session)).toEqual([]);
    expect(() => rollbackIntermission(session, 1)).toThrow('復帰先のインターミッションがない');
  });
});
