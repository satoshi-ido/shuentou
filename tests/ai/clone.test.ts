// [I-STATE-JSON] 探索器の複製がJSON往復と同じ結果を返すことを検査する。
import { describe, expect, it } from 'vitest';
import { cloneBattleState, cloneState, cloneUnit } from '../../src/ai/clone.js';
import { createDuel, findUnit, makeAction, martialAction, placeUnit, setRecovery, NO_SUMMON_DEPS } from './fixtures.js';
import { advanceStep } from '../../src/engine/pipeline/step.js';
import { createAiDecisionProvider } from '../../src/ai/decision.js';
import { referenceProfile } from '../../src/ai/profile.js';
import { syncWatchKeys } from '../../src/engine/watch.js';

const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('[I-STATE-JSON] 探索器の状態複製', () => {
  it('バトルステートの複製がJSON往復と一致する', () => {
    const state = createDuel({
      heroMaxHp: 60,
      heroActs: [martialAction('ACT_SLASH', { step_thought: 10 }), makeAction('ACT_GUARD', { deploy_ap: 20 })],
      enemyMaxHp: 40,
      enemyActs: [martialAction('ACT_HEAVY', { step_startup: 9, stun: true })],
    });
    setRecovery(findUnit(state, 'FOE'), 'ACT_HEAVY', 4, 1);
    expect(cloneState(state)).toEqual(jsonClone(state));
  });

  it('複製は元のステートと独立である', () => {
    const state = createDuel({
      heroMaxHp: 30,
      heroActs: [martialAction('ACT_SLASH', {})],
      enemyMaxHp: 30,
      enemyActs: [martialAction('ACT_SLASH', {})],
    });
    const copy = cloneState(state);
    const hero = findUnit(copy, 'MINE');
    hero.hp -= 7;
    hero.acts[0].uses_left -= 1;
    expect(findUnit(state, 'MINE').hp).toBe(30);
    expect(findUnit(state, 'MINE').acts[0].uses_left).not.toBe(hero.acts[0].uses_left);
  });

  it('JSONで表現できる値（配列・素のオブジェクト・null・真偽値）を保つ', () => {
    const value = { a: [1, 2, [3, null]], b: { c: true, d: 'x' }, e: null, f: -1 };
    expect(cloneState(value)).toEqual(jsonClone(value));
  });
});

describe('[M-STATE-ACTION] バトル中の静的パラメータの不変性', () => {
  it('静的パラメータ・系統フラグ・監視トグルを凍結してもバトルが進行する', () => {
    // 探索用の複製はこれらを参照共有する（src/ai/clone.ts）。書き込みがあれば strict mode の
    // 代入で TypeError となるため、凍結したまま進行できることが共有の前提を担保する。
    const state = createDuel({
      heroMaxHp: 60,
      heroActs: [
        martialAction('ACT_SLASH', { step_thought: 3, step_startup: 2, cost_pp: 0 }),
        makeAction('ACT_MIND', { gain_vp: 2, charge_pp: 100, step_thought: 2 }),
      ],
      enemyMaxHp: 40,
      enemyActs: [martialAction('ACT_HEAVY', { step_thought: 4, step_startup: 3, stun: true })],
    });
    for (const unit of state.units) {
      if (unit === null) {
        continue;
      }
      for (const action of unit.acts) {
        Object.freeze(action.base_params);
        Object.freeze(action.merge_params);
        Object.freeze(action.sys_flags);
      }
    }
    // 監視トグルとその充足状態も参照共有する。キーを揃えてから各値ごと凍結する。
    syncWatchKeys(state);
    for (const table of [state.watching, state.watch_prev_met]) {
      for (const flags of Object.values(table)) {
        Object.freeze(flags);
      }
      Object.freeze(table);
    }
    const provider = createAiDecisionProvider(referenceProfile(), NO_SUMMON_DEPS);
    for (let step = 0; step < 60; step += 1) {
      const { outcome } = advanceStep(state, provider, NO_SUMMON_DEPS);
      if (outcome !== 'NONE') {
        return;
      }
    }
  });
});

// 構造を既知とした探索用の複製（src/ai/clone.ts cloneBattleState）。
describe('[I-STATE-JSON] BattleState 専用の複製', () => {
  // 可変部分をひととおり持つ局面：クリーチャー、実行中アクション、停止事由、再探索抑制の記録、即時型の使用記録、鏡像統計。
  function richState() {
    const state = createDuel({
      heroMaxHp: 60,
      heroActs: [martialAction('ACT_SLASH', { step_thought: 10 }), makeAction('ACT_GUARD', { deploy_ap: 20 })],
      enemyMaxHp: 40,
      enemyActs: [martialAction('ACT_HEAVY', { step_startup: 9, stun: true })],
    });
    setRecovery(findUnit(state, 'FOE'), 'ACT_HEAVY', 4, 1);
    placeUnit(state, {
      side: 'FOE',
      kind: 'CREATURE',
      pos: 3,
      maxHp: 10,
      acts: [martialAction('ACT_BITE', {})],
      counter: { instance_id_seq: 500 },
    });
    findUnit(state, 'MINE').buff.atk = 20;
    state.pause_reason = { code: 'MANUAL_PAUSE', unit_id: null, instance_id: null, watch_kind: null, remaining_steps: null };
    state.ai_reuse = { U0001: { hash: 1, until: 10, executable: ['IID0001'] } };
    state.instant_used = { U0000: ['ACT_SLASH'] };
    state.mirror_tally.counts[0] = 3;
    syncWatchKeys(state);
    return state;
  }

  // 参照を共有してよいキー。これ以外の入れ子のオブジェクト・配列は複製されていなければならない。
  const SHARED = new Map<string, 'SHARED' | 'VALUES_SHARED'>([
    ['base_params', 'SHARED'],
    ['merge_params', 'SHARED'],
    ['sys_flags', 'SHARED'],
    ['last_act', 'SHARED'],
    ['watching', 'SHARED'],
    ['watch_prev_met', 'SHARED'],
    ['pause_reason', 'SHARED'],
    ['mirror_snapshot', 'SHARED'],
    ['instant_used', 'VALUES_SHARED'],
    ['ai_reuse', 'VALUES_SHARED'],
  ]);

  function unsharedViolations(copy: unknown, source: unknown, path: string, out: string[]): void {
    if (copy === null || typeof copy !== 'object') {
      return;
    }
    if (copy === source) {
      out.push(path);
      return;
    }
    for (const key of Object.keys(copy)) {
      const rule = SHARED.get(key);
      const child = (copy as Record<string, unknown>)[key];
      const original = (source as Record<string, unknown>)[key];
      if (rule === 'SHARED') {
        continue;
      }
      if (rule === 'VALUES_SHARED') {
        if (child === original) {
          out.push(`${path}.${key}`);
        }
        continue;
      }
      unsharedViolations(child, original, `${path}.${key}`, out);
    }
  }

  it('JSON往復と一致する', () => {
    const state = richState();
    expect(cloneBattleState(state)).toEqual(jsonClone(state));
  });

  it('共有を定めたキー以外の入れ子のオブジェクト・配列はすべて複製する', () => {
    const state = richState();
    const violations: string[] = [];
    unsharedViolations(cloneBattleState(state), state, 'state', violations);
    expect(violations).toEqual([]);
  });

  it('ユニットの複製は元のユニットと独立である', () => {
    const state = richState();
    const hero = findUnit(state, 'MINE');
    const copy = cloneUnit(hero);
    copy.buff.atk = 0;
    copy.acts[0].uses_left -= 1;
    copy.acts.pop();
    expect(hero.buff.atk).toBe(20);
    expect(hero.acts).toHaveLength(2);
    expect(hero.acts[0].uses_left).not.toBe(copy.acts[0].uses_left);
  });
});
