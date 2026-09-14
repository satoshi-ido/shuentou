// M3 の進行・巻き戻し・セーブ検証用の共通フィクスチャ。マスタは [I-PLAN-MILESTONE]［M3 のマスタ範囲］の生成物。

import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ATTENDANT_MASTERS } from '../../src/data/generated/attendant-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { executableActions, type Decision, type DecisionProvider } from '../../src/engine/decision.js';
import { instruct, resumeTime, startBattle, type BattleResult } from '../../src/engine/game/battle.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import type { GameMasters } from '../../src/engine/run/masters.js';
import type { BattleState, Unit } from '../../src/engine/types.js';

export const MASTERS: GameMasters = {
  actions: ACTION_MASTERS,
  enemies: ENEMY_MASTERS,
  scenes: SCENE_MASTERS,
  attendants: ATTENDANT_MASTERS,
  heroInitActions: HERO_INIT_ACTIONS,
  crossIds: [],
  echoIds: [],
  helpIds: [],
};

function prefixOf(classId: string): string {
  return classId.split('_')[1] ?? '';
}

function pick(state: BattleState, unit: Unit, priority: readonly string[]) {
  const candidates = executableActions(state, unit);
  for (const prefix of priority) {
    const found = candidates.find((action) => prefixOf(action.master_ref) === prefix);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

const FOE_PRIORITY = ['SLASH', 'RUSH', 'GUARD', 'MIND'];
// 根源武技（[M-BASE-AR-SYSTEM]）のみを用いて短い操作列で決着させる。
export const HERO_PRIORITY = ['ROOT'];

// 敵軍の決定主体（検証用の固定スクリプト）。探索器の結果に依存せず操作列を固定するために用いる。
export const scriptedFoe: DecisionProvider = (state, unit): Decision => {
  const action = pick(state, unit, FOE_PRIORITY);
  return action === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: action.instance_id };
};

export interface Recorder {
  readonly saves: string[];
}

export function createContext(recorder: Recorder): GameContext {
  return {
    masters: MASTERS,
    foeDecision: scriptedFoe,
    stepDeps: {
      createCreature: () => {
        throw new Error('M3 のマスタ範囲では召喚は発生しない');
      },
    },
    persist: (serialized) => {
      recorder.saves.push(serialized);
    },
  };
}

function heroOf(state: BattleState): Unit {
  const hero = state.units.find((unit) => unit !== null && unit.side === 'MINE' && unit.unit_kind === 'MASTER');
  if (hero === undefined || hero === null) {
    throw new Error('主人公が存在しない');
  }
  return hero;
}

// 時間停止中の1手：優先順位に合う実行可能アクションがあれば指示し、なければ時間停止を解除する。
export function playOneOperation(session: GameSession, ctx: GameContext): BattleResult {
  const state = session.data.run.battle_state;
  if (state === null) {
    throw new Error('バトル中ではない');
  }
  const hero = heroOf(state);
  const action = pick(state, hero, HERO_PRIORITY);
  return action === undefined ? resumeTime(session, ctx) : instruct(session, ctx, hero.unit_id, action.instance_id);
}

export function playBattle(session: GameSession, ctx: GameContext, maxOperations = 1000): BattleResult {
  let result = startBattle(session, ctx);
  for (let i = 0; i < maxOperations && result === 'PAUSED'; i += 1) {
    result = playOneOperation(session, ctx);
  }
  return result;
}
