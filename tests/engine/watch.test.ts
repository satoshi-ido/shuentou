// [M-UI-WATCH] [M-PIPE-PAUSE-TRIGGER] [M-DATA-PAUSE-REASON] [M-STATE-BATTLESTATE]

import { describe, expect, it } from 'vitest';
import { executableActions } from '../../src/engine/decision.js';
import { instruct, resumeTime, setWatch, startBattle } from '../../src/engine/game/battle.js';
import { undo } from '../../src/engine/game/rewind.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameContext } from '../../src/engine/game/session.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { allWatchFlags, detectWatchEdges, evaluateActionWatch, syncWatchKeys } from '../../src/engine/watch.js';
import {
  actionOf,
  createDuel,
  findUnit,
  makeAction,
  martialAction,
  NO_SUMMON_DEPS,
  placeUnit,
  setStartup,
} from '../ai/fixtures.js';
import { createContext } from './game-fixtures.js';

const passiveFoe: GameContext['foeDecision'] = () => ({ kind: 'PASS' });

function sessionWith(foe?: GameContext['foeDecision']) {
  const base = createContext({ saves: [] });
  const ctx: GameContext = foe === undefined ? base : { ...base, foeDecision: foe };
  return { ctx, session: newGameSession(ctx) };
}

function battle(session: ReturnType<typeof sessionWith>['session']): BattleState {
  const state = session.data.run.battle_state;
  if (state === null) {
    throw new Error('バトル中ではない');
  }
  return state;
}

describe('[M-UI-WATCH] 立ち上がりエッジによる自動時間停止（1-01）', () => {
  it('『実行可能』をONにした心気（基本）が蓄積を終えたステップで停止し、事由を記録する', () => {
    const { session, ctx } = sessionWith(passiveFoe);
    expect(startBattle(session, ctx, { watchDefault: { ...allWatchFlags(false), READY: true } })).toBe('PAUSED');
    const state = battle(session);
    const hero = findUnit(state, 'MINE');
    expect(state.step).toBe(147); // [V-NUM-OPENING] 心気（基本）の必要思考147
    expect(state.pause_reason).toEqual({
      code: 'WATCH_MET',
      unit_id: hero.unit_id,
      instance_id: actionOf(hero, 'ACT_MIND_AR3').instance_id,
      watch_kind: 'READY',
      remaining_steps: 0,
    });
  });

  it('既に充足している条件は次ステップ以降で停止を起こさず、ONへ切り替えても停止しない', () => {
    const { session, ctx } = sessionWith(passiveFoe);
    startBattle(session, ctx, { watchDefault: { ...allWatchFlags(false), READY: true } });
    const state = battle(session);
    const hero = findUnit(state, 'MINE');
    for (const action of hero.acts) {
      setWatch(session, action.instance_id, 'READY', true);
    }
    const step = state.step;
    expect(resumeTime(session, ctx, { stopAtStep: step + 5 })).toBe('PAUSED');
    expect(battle(session).step).toBe(step + 5);
    expect(battle(session).pause_reason?.code).toBe('MANUAL_PAUSE');
  });

  it('監視OFFでは充足しても停止しないが、充足状態は更新される', () => {
    const { session, ctx } = sessionWith(passiveFoe);
    expect(startBattle(session, ctx, { stopAtStep: 150 })).toBe('PAUSED');
    const state = battle(session);
    const hero = findUnit(state, 'MINE');
    expect(state.step).toBe(150);
    expect(state.pause_reason?.code).toBe('MANUAL_PAUSE');
    expect(state.watch_prev_met[actionOf(hero, 'ACT_MIND_AR3').instance_id].READY).toBe(true);
  });
});

describe('[M-DATA-PAUSE-REASON] 停止事由レコード', () => {
  it('敵の通常アクション発生遷移で ENEMY_START を記録し、残ステップ数は発生満了までの値とする', () => {
    const { session, ctx } = sessionWith();
    expect(startBattle(session, ctx)).toBe('PAUSED');
    const state = battle(session);
    const reason = state.pause_reason;
    expect(reason?.code).toBe('ENEMY_START');
    const enemy = findUnit(state, 'FOE');
    expect(reason?.unit_id).toBe(enemy.unit_id);
    expect(reason?.instance_id).toBe(enemy.last_act?.instance_id);
    expect(reason?.remaining_steps).toBe(enemy.last_act?.params.step_startup);
  });

  it('停止中の指示確定では更新せず、アンドゥで停止時の事由を復元する', () => {
    const { session, ctx } = sessionWith();
    startBattle(session, ctx);
    const state = battle(session);
    const hero = findUnit(state, 'MINE');
    const before = structuredClone(state.pause_reason);
    const mind = executableActions(state, hero).find((a) => a.master_ref === 'ACT_MIND_AR3');
    expect(mind).toBeDefined();
    instruct(session, ctx, hero.unit_id, mind!.instance_id);
    expect(battle(session).pause_reason).not.toBeNull();
    undo(session);
    expect(battle(session).pause_reason).toEqual(before);
  });

  it('ステップ進行確定でプッシュされる停止中のステートは事由を保持し、再停止時は新たな事由を設定する', () => {
    const { session, ctx } = sessionWith(passiveFoe);
    startBattle(session, ctx, { stopAtStep: 150 });
    const history = session.data.run.history_stack;
    resumeTime(session, ctx, { stopAtStep: 152 });
    expect(history.at(-1)?.battle_state?.pause_reason?.code).toBe('MANUAL_PAUSE');
    expect(battle(session).step).toBe(152);
  });
});

describe('[M-UI-WATCH] 充足判定', () => {
  const MIND = makeAction('ACT_MIND', { gain_vp: 3, charge_pp: 100, step_startup: 5, step_recovery: 5 });

  function duel(heroActs: Parameters<typeof createDuel>[0]['heroActs'], enemyActs: Parameters<typeof createDuel>[0]['enemyActs']) {
    const state = createDuel({ heroMaxHp: 60, heroActs, enemyMaxHp: 60, enemyActs });
    return { state, hero: findUnit(state, 'MINE'), enemy: findUnit(state, 'FOE') };
  }

  function statusOf(state: BattleState, unit: Unit, classId: string) {
    const evaluation = evaluateActionWatch(state, unit, actionOf(unit, classId), NO_SUMMON_DEPS);
    return Object.fromEntries(Object.entries(evaluation).map(([kind, value]) => [kind, value.status]));
  }

  it('『前列命中』『後列命中』：射程内の列ごとに現在の実効防御力と比較し、空きマス・射程外は対象外', () => {
    const HIT = martialAction('HERO_HIT', { atk: 20, range: 2, dmg_hp: 100, step_startup: 5 });
    const { state, hero, enemy } = duel([HIT, MIND], [MIND]);
    enemy.ap = 20;
    expect(statusOf(state, hero, 'HERO_HIT')).toMatchObject({ HIT_FRONT: 'MET', HIT_BACK: 'NA' });
    const creature = placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 3, maxHp: 10, acts: [MIND], counter: { instance_id_seq: 50 } });
    creature.ap = 21;
    expect(statusOf(state, hero, 'HERO_HIT')).toMatchObject({ HIT_FRONT: 'MET', HIT_BACK: 'UNMET' });
    expect(statusOf(state, hero, 'ACT_MIND')).toMatchObject({ HIT_FRONT: 'NA', HIT_BACK: 'NA' });
  });

  it('『スタン』：発動までにスタン付き武技が着弾しなければ充足、先に着弾すれば未充足、スタン源がなければ対象外', () => {
    const SLOW = martialAction('HERO_SLOW', { atk: 10, dmg_hp: 100, step_startup: 10, step_recovery: 5 });
    const QUICK = martialAction('HERO_QUICK', { atk: 10, dmg_hp: 100, step_startup: 0, step_recovery: 5 });
    const STUN = martialAction('FOE_STUN', { atk: 10, dmg_hp: 100, stun: true, step_startup: 20, step_recovery: 5 });
    const early = duel([SLOW, QUICK], [STUN]);
    setStartup(early.enemy, 'FOE_STUN', 15); // 残り5：主人公の発動（10）より先に着弾
    expect(statusOf(early.state, early.hero, 'HERO_SLOW').STUN).toBe('UNMET');
    expect(statusOf(early.state, early.hero, 'HERO_QUICK').STUN).toBe('NA');
    const late = duel([SLOW], [STUN]);
    setStartup(late.enemy, 'FOE_STUN', 5); // 残り15
    expect(statusOf(late.state, late.hero, 'HERO_SLOW').STUN).toBe('MET');
    const none = duel([SLOW], [MIND]);
    expect(statusOf(none.state, none.hero, 'HERO_SLOW').STUN).toBe('NA');
  });

  it('『回避』：脅威の発動までに防御が成立すれば充足、間に合わなければ未充足、脅威がなければ待機、手段がなければ対象外', () => {
    const FAST_GUARD = makeAction('HERO_FAST_GUARD', { deploy_ap: 50, step_startup: 2, step_recovery: 20 });
    const SLOW_GUARD = makeAction('HERO_SLOW_GUARD', { deploy_ap: 50, step_startup: 8, step_recovery: 20 });
    const STRIKE = martialAction('FOE_STRIKE', { atk: 30, dmg_hp: 500, step_startup: 10, step_recovery: 5 });
    const threatened = duel([FAST_GUARD, SLOW_GUARD, MIND], [STRIKE]);
    setStartup(threatened.enemy, 'FOE_STRIKE', 5); // 残り5
    const evaluation = evaluateActionWatch(threatened.state, threatened.hero, actionOf(threatened.hero, 'HERO_FAST_GUARD'), NO_SUMMON_DEPS);
    expect(evaluation.EVADE).toEqual({ status: 'MET', remainingSteps: 5 });
    expect(statusOf(threatened.state, threatened.hero, 'HERO_SLOW_GUARD').EVADE).toBe('UNMET');
    expect(statusOf(threatened.state, threatened.hero, 'ACT_MIND').EVADE).toBe('NA');
    const calm = duel([FAST_GUARD], [STRIKE]);
    expect(statusOf(calm.state, calm.hero, 'HERO_FAST_GUARD').EVADE).toBe('IDLE');
  });

  it('途中で生成されたインスタンスは全要素 False で登録し、破棄されたキーは削除する', () => {
    const { state, hero } = duel([MIND], [MIND]);
    syncWatchKeys(state);
    const removed = hero.acts[0].instance_id;
    hero.acts = [];
    placeUnit(state, { side: 'MINE', kind: 'CREATURE', pos: 0, maxHp: 10, acts: [MIND], counter: { instance_id_seq: 70 } });
    syncWatchKeys(state);
    expect(state.watching[removed]).toBeUndefined();
    expect(state.watching.IID0070).toEqual(allWatchFlags(false));
    expect(state.watch_prev_met.IID0070).toEqual(allWatchFlags(false));
  });

  it('同時成立時はマスインデックス → アクション配列インデックス → 条件の順で並べる', () => {
    const HIT = martialAction('HERO_HIT', { atk: 10, dmg_hp: 100, step_startup: 5 });
    const { state } = duel([HIT, MIND], [MIND]);
    const creature = placeUnit(state, { side: 'MINE', kind: 'CREATURE', pos: 0, maxHp: 10, acts: [MIND], counter: { instance_id_seq: 70 } });
    syncWatchKeys(state);
    for (const id of Object.keys(state.watching)) {
      state.watching[id] = allWatchFlags(true);
    }
    const edges = detectWatchEdges(state, NO_SUMMON_DEPS);
    expect(edges.map((edge) => [edge.unitId, edge.instanceId, edge.kind])).toEqual([
      [creature.unit_id, 'IID0070', 'READY'],
      ['U0000', 'IID0000', 'READY'],
      ['U0000', 'IID0000', 'HIT_FRONT'],
      ['U0000', 'IID0001', 'READY'],
    ]);
    expect(detectWatchEdges(state, NO_SUMMON_DEPS)).toEqual([]);
  });
});
