// [A-BOOK-SEMANTICS] [A-BOOK-SCHEMA] [A-BOOK-TABLE] 定跡。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { BOOK_MASTERS } from '../../src/data/generated/book-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import type { BookMasterRecord } from '../../src/data/types.js';
import { executableActions, type DecisionProvider } from '../../src/engine/decision.js';
import { advanceStep } from '../../src/engine/pipeline/step.js';
import { createScene } from '../../src/engine/setup.js';
import { lookupBook } from '../../src/ai/book.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { defaultProfile } from '../../src/ai/profile.js';
import { decideActionDetailed } from '../../src/ai/search.js';
import { enemyLefTemplate, buildBookRecord } from '../../tools/genmaster/lib.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS } from './fixtures.js';

const MIND = makeAction('FOE_MIND', { gain_vp: 3, charge_pp: 100, step_thought: 20, step_startup: 5, step_recovery: 5 });
const HIT = martialAction('FOE_HIT', { atk: 10, dmg_hp: 300, cost_pp: 2, step_startup: 5, step_recovery: 5 });
const WAIT = makeAction('HERO_WAIT', { gain_vp: 1, step_thought: 999 });

function book(...classIds: string[]): BookMasterRecord {
  return {
    book_id: 'B-99',
    steps: classIds.map((class_id) => ({ kind: 'FIXED', class_id, resolver: null, resolved_by_system: null, can_wait: true })),
  };
}

function duel(enemyActs = [MIND, HIT]) {
  const state = createDuel({ heroMaxHp: 60, heroActs: [WAIT], enemyMaxHp: 60, enemyActs });
  return { state, enemy: findUnit(state, 'FOE') };
}

describe('[A-BOOK-SEMANTICS] lookup の状態遷移', () => {
  it('成立する定跡手を返し book_index を進め、待機時経過思考を Null に戻す', () => {
    const { state, enemy } = duel();
    state.book_wait_elapsed = 3;
    enemy.elapsed_thought = 20;
    expect(lookupBook(state, enemy, book('FOE_MIND'))).toEqual({
      kind: 'MOVE',
      instanceId: enemy.acts[0].instance_id,
      progress: { book_index: 1, book_aborted: false, book_wait_elapsed: null },
    });
  });

  it('不成立だが待機可能なら PASS_MOVE とし、現在の経過思考を記録する', () => {
    const { state, enemy } = duel();
    enemy.elapsed_thought = 7;
    expect(lookupBook(state, enemy, book('FOE_MIND'))).toEqual({
      kind: 'PASS_MOVE',
      progress: { book_index: 0, book_aborted: false, book_wait_elapsed: 7 },
    });
  });

  it('打ち切り済み・全手消化済みは BOOK_MISS（据え置き）', () => {
    const { state, enemy } = duel();
    state.book_aborted = true;
    expect(lookupBook(state, enemy, book('FOE_MIND')).kind).toBe('BOOK_MISS');
    state.book_aborted = false;
    state.book_index = 1;
    expect(lookupBook(state, enemy, book('FOE_MIND'))).toEqual({
      kind: 'BOOK_MISS',
      progress: { book_index: 1, book_aborted: false, book_wait_elapsed: null },
    });
  });

  it('所持しない class_id、封印蓄積1.00以上は定跡を破棄する', () => {
    const { state, enemy } = duel();
    expect(lookupBook(state, enemy, book('ACT_UNKNOWN')).progress.book_aborted).toBe(true);
    enemy.acts[0].seal_accum = 100;
    expect(lookupBook(state, enemy, book('FOE_MIND')).progress.book_aborted).toBe(true);
  });

  it('PPコスト不足は心気を所持すれば待機し、所持しなければ破棄する', () => {
    const withMind = duel();
    expect(lookupBook(withMind.state, withMind.enemy, book('FOE_HIT')).kind).toBe('PASS_MOVE');
    const withoutMind = duel([HIT]);
    expect(lookupBook(withoutMind.state, withoutMind.enemy, book('FOE_HIT'))).toEqual({
      kind: 'BOOK_MISS',
      progress: { book_index: 0, book_aborted: true, book_wait_elapsed: null },
    });
  });

  it('待機中にスタンで経過思考が0へ戻った場合は破棄する（判定4）', () => {
    const { state, enemy } = duel();
    state.book_wait_elapsed = 12;
    enemy.elapsed_thought = 13;
    expect(lookupBook(state, enemy, book('FOE_MIND')).kind).toBe('PASS_MOVE');
    enemy.elapsed_thought = 0;
    expect(lookupBook(state, enemy, book('FOE_MIND')).progress.book_aborted).toBe(true);
  });

  it('定跡は敵マスターの手のみを拘束し、定跡を持たないプロファイルでは参照しない', () => {
    const { state, enemy } = duel();
    const hero = findUnit(state, 'MINE');
    expect(decideActionDetailed(state, hero, { ...defaultProfile(), bookId: 'B-01' }, NO_SUMMON_DEPS).decision.book).toBeUndefined();
    expect(decideActionDetailed(state, enemy, defaultProfile(), NO_SUMMON_DEPS).decision.book).toBeUndefined();
  });
});

describe('[A-BOOK-SCHEMA] セレクタの展開', () => {
  it('B-01 は祠守レフの構成テンプレートから 心気（基本）AR3 → 体勢（基本）AR6 に展開される', () => {
    expect(BOOK_MASTERS['B-01'].steps.map((step) => step.class_id)).toEqual(['ACT_MIND_AR3', 'ACT_GUARD_AR6']);
    expect(ENEMY_MASTERS.ENEMY_LEF.book_id).toBe('B-01');
  });

  it('照合結果が一意でないセレクタはオーサリングエラーとして棄却する', () => {
    const template = enemyLefTemplate(3);
    const ambiguous = { book_id: 'B-99', steps: [{ kind: 'FIXED', selector: { component: 'STANCE', variant: 'BASIC', ar_mult: '3.00' }, can_wait: true }] };
    expect(() => buildBookRecord(ambiguous, template)).toThrow('一意でない');
  });
});

describe('[A-BOOK-TABLE] B-01 の実戦（1-01）', () => {
  it('敵は定跡どおり心気（基本）AR3、続いて体勢（基本）AR6 を撃ち、ステップ185に AP23 の壁を得る', () => {
    const state = createScene({
      sceneLevel: 3,
      heroMaxHp: 60,
      heroActionOrder: HERO_INIT_ACTIONS,
      enemyRecord: ENEMY_MASTERS.ENEMY_LEF,
      actionMasters: ACTION_MASTERS,
    });
    const foe = createAiDecisionProvider({ ...defaultProfile(), bookId: 'B-01', actionBonus: { PASS: -800 } }, NO_SUMMON_DEPS);
    const heroMind: DecisionProvider = (s, u) => {
      const mind = executableActions(s, u).find((a) => a.master_ref === 'ACT_MIND_AR3');
      return mind === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: mind.instance_id };
    };
    const decisionFor: DecisionProvider = (s, u) => (u.side === 'FOE' ? foe(s, u) : heroMind(s, u));
    const started: string[] = [];
    for (let i = 0; i <= 185; i += 1) {
      const enemy = findUnit(state, 'FOE');
      const before = enemy.last_act?.instance_id;
      advanceStep(state, decisionFor, NO_SUMMON_DEPS);
      const after = findUnit(state, 'FOE').last_act;
      if (after !== null && after.instance_id !== before) {
        started.push(`${i}:${after.class_id}`);
      }
    }
    expect(started).toEqual(['147:ACT_MIND_AR3', '157:ACT_GUARD_AR6']);
    expect(state.book_index).toBe(2);
    expect(state.book_aborted).toBe(false);
    expect(findUnit(state, 'FOE').ap).toBe(23);
  });
});
