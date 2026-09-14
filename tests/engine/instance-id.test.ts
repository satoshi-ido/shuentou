// [I-STATE-ID] [M-STATE-RUNSTATE]［主人公ステートの正本］ [M-PROG-CLEAR] バトル中のアクションインスタンスID採番。

import { describe, expect, it } from 'vitest';
import { executeAction } from '../../src/engine/pipeline/p8-decision.js';
import { simulateTimeline } from '../../src/engine/timeline.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS } from '../ai/fixtures.js';
import { createContext, playOneOperation } from './game-fixtures.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { startBattle } from '../../src/engine/game/battle.js';

function copyDuel() {
  // 即時型のコピー武技。命中した敵の直前アクション記憶からコピー枠を獲得する（[M-RESOLVE-MARTIAL]#5）。
  const COPY = martialAction('HERO_COPY', { atk: 1, dmg_hp: 0, initial_copy_val: 100, step_startup: 0, step_recovery: 5 });
  const FOE_GUARD = makeAction('FOE_GUARD', { deploy_ap: 0, gain_vp: 1, step_startup: 30, step_recovery: 5 });
  const state = createDuel({ heroMaxHp: 60, heroActs: [COPY], enemyMaxHp: 60, enemyActs: [FOE_GUARD] });
  const hero = findUnit(state, 'MINE');
  const enemy = findUnit(state, 'FOE');
  executeAction(state, enemy, enemy.acts[0], NO_SUMMON_DEPS); // 敵の直前アクション記憶を作る
  return { state, hero };
}

describe('[I-STATE-ID] コピー枠の採番', () => {
  it('BattleState の instance_id_seq から IID 形式で採番し、採番位置を進める', () => {
    const { state, hero } = copyDuel();
    expect(state.instance_id_seq).toBe(2);
    executeAction(state, hero, hero.acts[0], NO_SUMMON_DEPS);
    expect(hero.acts.map((a) => [a.instance_id, a.is_copy])).toEqual([
      ['IID0000', false],
      ['IID0002', true],
    ]);
    expect(state.instance_id_seq).toBe(3);
  });

  it('複製で行う試算は本体の採番位置を進めず、同一ステートからの再実行で同一のIDを得る', () => {
    const { state, hero } = copyDuel();
    const before = structuredClone(state);
    simulateTimeline(state, 30, NO_SUMMON_DEPS);
    expect(state).toEqual(before);
    const first = structuredClone(state);
    executeAction(first, findUnit(first, 'MINE'), findUnit(first, 'MINE').acts[0], NO_SUMMON_DEPS);
    executeAction(state, hero, hero.acts[0], NO_SUMMON_DEPS);
    expect(state).toEqual(first);
  });
});

describe('[M-STATE-RUNSTATE]［主人公ステートの正本］採番カウンタの引き継ぎと書き戻し', () => {
  it('バトル開始時に敵の実体化後の値を引き継ぎ、バトルクリア共通決済で RunState へ書き戻す', () => {
    const ctx = createContext({ saves: [] });
    const session = newGameSession(ctx);
    startBattle(session, ctx);
    const { run } = session.data;
    expect(run.battle_state?.instance_id_seq).toBe(run.instance_id_seq);
    run.battle_state!.instance_id_seq += 7; // バトル中の採番（コピー獲得等）を模す
    const expected = run.battle_state!.instance_id_seq;
    let result = 'PAUSED';
    for (let i = 0; i < 1000 && result === 'PAUSED'; i += 1) {
      result = playOneOperation(session, ctx);
    }
    expect(result).toBe('WIN');
    expect(session.data.run.instance_id_seq).toBe(expected);
  });
});
