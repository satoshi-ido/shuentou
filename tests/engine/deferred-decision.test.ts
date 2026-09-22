// [A-LATE-5-10] 5-10 の決定順の反転（時間停止 → プレイヤー指示 → 敵軍AI決定）と、
// 「時間停止トリガー2」の次ステップでの成立（[M-PIPE-PAUSE-TRIGGER]#2）。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { CREATURE_MASTERS } from '../../src/data/generated/creature-masters.js';
import { createCreatureFactory } from '../../src/engine/creature.js';
import { executableActions, isInstant, type DecisionProvider } from '../../src/engine/decision.js';
import { instruct, resumeTime, startBattle, type BattleResult } from '../../src/engine/game/battle.js';
import { undo } from '../../src/engine/game/rewind.js';
import { instantiateAction } from '../../src/engine/instantiate.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { MASTERS } from './game-fixtures.js';

type Event =
  | { readonly kind: 'FOE'; readonly step: number; readonly heroState: string; readonly acted: string | null }
  | { readonly kind: 'PAUSE'; readonly step: number };

function heroOf(state: BattleState): Unit {
  return state.units.find((unit): unit is Unit => unit !== null && unit.side === 'MINE' && unit.unit_kind === 'MASTER')!;
}

// 敵軍は必要発生2以上・攻撃力0の通常アクションを先頭から選ぶ固定スクリプト（foeActs が偽なら常にパス）。
// 主人公を倒さずに長く進めるため攻撃力を持つアクションを選ばない。呼び出しを記録する。
function setup(sceneId: string, foeActs = true): { session: GameSession; ctx: GameContext; events: Event[] } {
  const events: Event[] = [];
  const foe: DecisionProvider = (state, unit) => {
    const action = foeActs
      ? executableActions(state, unit).find((a) => !isInstant(a) && a.base_params.step_startup >= 2 && a.base_params.atk === 0)
      : undefined;
    events.push({ kind: 'FOE', step: state.step, heroState: heroOf(state).state, acted: action?.instance_id ?? null });
    return action === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: action.instance_id };
  };
  const ctx: GameContext = {
    masters: MASTERS,
    foeDecision: foe,
    stepDeps: { createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }) },
    persist: () => {},
  };
  const session = newGameSession(ctx);
  session.data.run.current_scene_id = sceneId;
  // 常に実行可能なアクション（必要思考0・コストなし・回数無限）を持たせ、毎ステップ時間停止が成立する
  // ようにする。指示には用いない。
  session.data.run.hero_acts.push(instantiateAction(ACTION_MASTERS.ACT_VESSEL_BREATH, session.data.run));
  return { session, ctx, events };
}

// 時間停止中の1手：主人公が根源武技・待機用以外の実行可能アクションを持てば先頭を指示し、なければ時間停止を解除する。
// 毎ステップに手動停止を要求する（[V-TEST-REFAI]［決定点］と同じ駆動）。
function operate(session: GameSession, ctx: GameContext): BattleResult {
  const state = session.data.run.battle_state!;
  const hero = heroOf(state);
  const options = { stopAtStep: state.step + 1 };
  const action = executableActions(state, hero).find(
    (a) => !ACTION_MASTERS[a.master_ref as keyof typeof ACTION_MASTERS]?.is_root && a.master_ref !== 'ACT_VESSEL_BREATH',
  );
  return action === undefined ? resumeTime(session, ctx, options) : instruct(session, ctx, hero.unit_id, action.instance_id, options);
}

function drive(sceneId: string, operations: number, foeActs = true) {
  const { session, ctx, events } = setup(sceneId, foeActs);
  const reasons: { step: number; code: string; instance: string | null }[] = [];
  let result = startBattle(session, ctx, { stopAtStep: 0 });
  for (let i = 0; i < operations && result === 'PAUSED'; i += 1) {
    const state = session.data.run.battle_state!;
    events.push({ kind: 'PAUSE', step: state.step });
    reasons.push({ step: state.step, code: state.pause_reason!.code, instance: state.pause_reason!.instance_id });
    result = operate(session, ctx);
  }
  return { session, ctx, events, reasons };
}

// 同一ステップに時間停止と敵軍AIの決定の双方があるとき、先に起きた方。
function orderWithinStep(events: readonly Event[]): Array<'PAUSE_FIRST' | 'FOE_FIRST'> {
  const firstIndex = new Map<string, number>();
  events.forEach((event, index) => {
    const key = `${event.kind}:${event.step}`;
    if (!firstIndex.has(key)) firstIndex.set(key, index);
  });
  const result: Array<'PAUSE_FIRST' | 'FOE_FIRST'> = [];
  for (const event of events) {
    if (event.kind !== 'PAUSE') continue;
    const foe = firstIndex.get(`FOE:${event.step}`);
    if (foe !== undefined) {
      result.push(firstIndex.get(`PAUSE:${event.step}`)! < foe ? 'PAUSE_FIRST' : 'FOE_FIRST');
    }
  }
  return result;
}

describe('[A-LATE-5-10] 決定順の反転', () => {
  it('5-10 では時間停止とプレイヤー指示の後に敵軍AIが決定する', () => {
    const { events } = drive('SCENE_5_10', 60);
    const orders = orderWithinStep(events);
    expect(orders.length).toBeGreaterThan(0);
    expect(new Set(orders)).toEqual(new Set(['PAUSE_FIRST']));
  });

  it('5-10 以外では敵軍AIの決定が時間停止に先立つ（[M-PIPE-P8-ORDER]）', () => {
    const { events } = drive('SCENE_5_01', 60);
    const orders = orderWithinStep(events);
    expect(orders.length).toBeGreaterThan(0);
    expect(new Set(orders)).toEqual(new Set(['FOE_FIRST']));
  });

  it('敵軍AIはプレイヤーが同ステップで確定した行動を見て決定する', () => {
    // 敵軍を常に思考中に保ち、主人公が指示したステップにも問い合わせが生じるようにする。
    const { events } = drive('SCENE_5_10', 300, false);
    const pausedSteps = new Set(events.filter((event) => event.kind === 'PAUSE').map((event) => event.step));
    const seen = events.filter(
      (event): event is Extract<Event, { kind: 'FOE' }> =>
        event.kind === 'FOE' && pausedSteps.has(event.step) && event.heroState !== 'THOUGHT',
    );
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('[A-LATE-5-10]「時間停止トリガー2」', () => {
  it('敵軍がステップ s で実行を開始したアクションは、ステップ s+1 の時間停止で提示する', () => {
    const { events, reasons } = drive('SCENE_5_10', 60);
    const started = events.filter(
      (event): event is Extract<Event, { kind: 'FOE' }> => event.kind === 'FOE' && event.acted !== null,
    );
    expect(started.length).toBeGreaterThan(0);
    let checked = 0;
    for (const event of started) {
      // ステップ s の時間停止は敵の決定より前であり、同ステップの敵アクションを提示しない。
      expect(reasons.some((reason) => reason.step === event.step && reason.instance === event.acted)).toBe(false);
      const next = reasons.find((reason) => reason.step === event.step + 1);
      if (next !== undefined) {
        expect(next).toEqual({ step: event.step + 1, code: 'ENEMY_START', instance: event.acted });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('[A-LATE-5-10] アンドゥ後の再開', () => {
  it('アンドゥで時間停止へ戻り同じ操作を与えると、同一のステートに至る', () => {
    const straight = drive('SCENE_5_10', 30);
    const replay = drive('SCENE_5_10', 29);
    // 29手目の後に1手進め、アンドゥで戻してから同じ1手を与え直す。
    operate(replay.session, replay.ctx);
    undo(replay.session);
    operate(replay.session, replay.ctx);
    expect(replay.session.data.run.battle_state).toEqual(straight.session.data.run.battle_state);
  });
});
