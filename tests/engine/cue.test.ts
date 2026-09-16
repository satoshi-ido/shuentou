// [M-DATA-AUDIO-CUE] 発火契機の通知：ACTION_TRIGGER（統合解決パイプライン Step 1 直前）と
// HIT / MISS（[M-RESOLVE-MARTIAL]#3 命中判定の確定時）。

import { describe, expect, it } from 'vitest';
import type { ActionCue, BattleCue } from '../../src/engine/cue.js';
import { advanceStep } from '../../src/engine/pipeline/step.js';
import { runInstant } from '../../src/engine/pipeline/instant.js';
import type { Decision } from '../../src/engine/decision.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS, setStartup } from '../ai/fixtures.js';

const HIT = martialAction('HERO_HIT', { atk: 30, dmg_hp: 100, step_startup: 1, step_recovery: 5 });
const WEAK = martialAction('HERO_WEAK', { atk: 0, dmg_hp: 100, step_startup: 1, step_recovery: 5 });
const MIND = makeAction('HERO_MIND', { gain_vp: 3, charge_pp: 100, step_startup: 0, step_recovery: 0 });
const FOE_MIND = makeAction('FOE_MIND', { gain_vp: 3, charge_pp: 100, step_startup: 5, step_recovery: 5 });

const pass = (): Decision => ({ kind: 'PASS' });

function collect(): { sink: (cue: BattleCue) => void; cues: BattleCue[] } {
  const cues: BattleCue[] = [];
  return { sink: (cue) => cues.push(cue), cues };
}

describe('[M-DATA-AUDIO-CUE] 発火契機の通知', () => {
  it('通常アクションの発動で ACTION_TRIGGER、武技の命中で HIT を通知する', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [HIT], enemyMaxHp: 60, enemyActs: [FOE_MIND] });
    const hero = findUnit(state, 'MINE');
    const enemy = findUnit(state, 'FOE');
    enemy.ap = 0; // 実効防御力0：攻撃力30は命中する
    state.step = 5; // ステップ0は《処理1》〜《処理7》を行わない
    setStartup(hero, 'HERO_HIT', 1); // 次のステップで発動
    const { sink, cues } = collect();
    advanceStep(state, pass, { ...NO_SUMMON_DEPS, onCue: sink });
    expect(cues.map((cue) => [cue.kind, cue.unitId, (cue as ActionCue).classId])).toEqual([
      ['ACTION_TRIGGER', hero.unit_id, 'HERO_HIT'],
      ['HIT', enemy.unit_id, 'HERO_HIT'],
    ]);
    expect(cues[1].posIdx).toBe(enemy.pos_idx);
  });

  it('回避された武技は MISS を通知する', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [WEAK], enemyMaxHp: 60, enemyActs: [FOE_MIND] });
    const hero = findUnit(state, 'MINE');
    const enemy = findUnit(state, 'FOE');
    enemy.ap = 40; // 実効防御力40 > 攻撃力0
    state.step = 5; // ステップ0は《処理1》〜《処理7》を行わない
    setStartup(hero, 'HERO_WEAK', 1);
    const { sink, cues } = collect();
    advanceStep(state, pass, { ...NO_SUMMON_DEPS, onCue: sink });
    expect(cues.map((cue) => cue.kind)).toEqual(['ACTION_TRIGGER', 'MISS']);
  });

  it('即時型アクションも発動時に通知する', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [FOE_MIND] });
    const hero = findUnit(state, 'MINE');
    const { sink, cues } = collect();
    runInstant(state, hero, hero.acts[0], { ...NO_SUMMON_DEPS, onCue: sink });
    expect(cues.map((cue) => [cue.kind, (cue as ActionCue).classId])).toEqual([['ACTION_TRIGGER', 'HERO_MIND']]);
  });

  it('受け口を与えない展開では通知しない（探索・未来予測）', () => {
    const state = createDuel({ heroMaxHp: 60, heroActs: [HIT], enemyMaxHp: 60, enemyActs: [FOE_MIND] });
    state.step = 5;
    setStartup(findUnit(state, 'MINE'), 'HERO_HIT', 1);
    expect(() => advanceStep(state, pass, NO_SUMMON_DEPS)).not.toThrow();
  });
});
