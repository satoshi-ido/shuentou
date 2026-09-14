// [V-TEST-POSITIONS] 1-01（祠守レフ戦）の実データによる局面。
// T-12：開幕（ステップ0）では実行可能手なしの正常処理としてパスが選ばれ、自動進行する（[V-NUM-OPENING]）。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import { executableActions } from '../../src/engine/decision.js';
import { startBattle } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { createScene } from '../../src/engine/setup.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { defaultProfile, type EffectiveProfile } from '../../src/ai/profile.js';
import { createContext } from '../engine/game-fixtures.js';
import { chosenClassId, findUnit, NO_SUMMON_DEPS } from './fixtures.js';

// [A-PROFILE-TABLE] 1-01 に割り当てられた狂乱プロファイルの PASS 減点。
const FRENZY_PASS = -800;

function lefOpening() {
  const state = createScene({
    sceneLevel: 3,
    heroMaxHp: 60,
    heroActionOrder: HERO_INIT_ACTIONS,
    enemyRecord: ENEMY_MASTERS.ENEMY_LEF,
    actionMasters: ACTION_MASTERS,
  });
  return { state, hero: findUnit(state, 'MINE'), enemy: findUnit(state, 'FOE') };
}

describe('[V-TEST-POSITIONS] T-12 実行可能手なしの正常処理・自動進行', () => {
  it('T-12: 既定の PASS 減点下で、敵は心気（無想）を撃たずパスする', () => {
    const { state, hero, enemy } = lefOpening();
    expect(executableActions(state, hero)).toEqual([]);
    expect(executableActions(state, enemy).map((a) => a.master_ref)).toEqual(['ACT_MUSOU_AR3']);
    expect(chosenClassId(state, enemy, defaultProfile())).toBe('PASS');
  });

  it('T-12: 狂乱プロファイルの PASS −800 下でもパスする', () => {
    const { state, enemy } = lefOpening();
    const frenzy: EffectiveProfile = { ...defaultProfile(), actionBonus: { PASS: FRENZY_PASS } };
    expect(chosenClassId(state, enemy, frenzy)).toBe('PASS');
  });

  // 再探索抑制（[A-SEARCH-REUSE]）を通さず全ステップで探索するため実行時間が長い。
  it('T-12: バトル開始から敵軍AIを通して自動進行し、ステップ147まで行動が発生しない', { timeout: 120_000 }, () => {
    const ctx = {
      ...createContext({ saves: [] }),
      foeDecision: createAiDecisionProvider({ ...defaultProfile(), actionBonus: { PASS: FRENZY_PASS } }, NO_SUMMON_DEPS),
    };
    const session = newGameSession(ctx);
    expect(startBattle(session, ctx)).toBe('PAUSED');
    const state = session.data.run.battle_state!;
    expect(state.step).toBeGreaterThanOrEqual(147);
    expect(findUnit(state, 'MINE').hp).toBe(60);
    expect(findUnit(state, 'FOE').hp).toBe(10);
  });
});
