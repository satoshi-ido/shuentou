// [A-SEARCH-MOVEGEN] [A-TIE-BREAK] 候補手の生成順序：瞬動 → 即発 → 通常 → パス。
// 同ランク内は所持アクション配列インデックス昇順（安定ソートにより保持される）。

import { describe, expect, it } from 'vitest';
import type { Unit } from '../../src/engine/types.js';
import { runStepEnd } from '../../src/engine/pipeline/stepend.js';
import { applyMove } from '../../src/ai/apply.js';
import { BONUS_DEFAULT_PASS } from '../../src/ai/constants.js';
import { defaultProfile } from '../../src/ai/profile.js';
import { generateMoves, isReswap, reswapPenaltyOf, tagsOf, type AiMove } from '../../src/ai/movegen.js';
import { createDuel, makeAction, martialAction, moveUnit, NO_SUMMON_DEPS, placeUnit } from './fixtures.js';

function findUnit(state: ReturnType<typeof createDuel>, side: 'MINE' | 'FOE'): Unit {
  const unit = state.units.find((u) => u !== null && u.side === side) ?? null;
  if (unit === null) {
    throw new Error(`ユニットが見つからない: ${side}`);
  }
  return unit;
}

describe('[A-TIE-BREAK] generateMoves の優先度', () => {
  it('瞬動 → 即発 → 通常（配列インデックス昇順） → パス の順に並ぶ', () => {
    const normalA = makeAction('ACT_NORMAL_A', { step_startup: 5, step_recovery: 5 });
    const instantQuick = makeAction('ACT_INSTANT_QUICK', { step_startup: 0, step_recovery: 0 });
    const instantSlow = makeAction('ACT_INSTANT_SLOW', { step_startup: 0, step_recovery: 5 });
    const normalB = makeAction('ACT_NORMAL_B', { step_startup: 5, step_recovery: 5 });

    const state = createDuel({
      heroMaxHp: 10,
      heroActs: [makeAction('ACT_HERO_NOOP', { step_startup: 5 })],
      enemyMaxHp: 10,
      enemyActs: [normalA, instantQuick, instantSlow, normalB],
    });
    const enemy = findUnit(state, 'FOE');

    const moves = generateMoves(state, enemy);
    const order = moves.map((m) => (m.kind === 'PASS' ? 'PASS' : m.action.master_ref));

    expect(order).toEqual(['ACT_INSTANT_QUICK', 'ACT_INSTANT_SLOW', 'ACT_NORMAL_A', 'ACT_NORMAL_B', 'PASS']);
  });
});

describe('[A-PROFILE-BONUS] 再交代の判定', () => {
  const SWAP = makeAction('ACT_SWAP', { is_swap: true, step_startup: 0, step_recovery: 0 });
  const WAIT = makeAction('ACT_WAIT', { gain_vp: 1, step_thought: 500 });

  // 敵マスター（後列）と前列のクリーチャーの組。クリーチャーが隊列交代を実行し、ステップ境界を越える。
  function afterSwap(boundaries: number) {
    const state = createDuel({ heroMaxHp: 10, heroActs: [WAIT], enemyMaxHp: 10, enemyActs: [SWAP, WAIT] });
    const master = findUnit(state, 'FOE');
    moveUnit(state, master, 3);
    const creature = placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 2, maxHp: 10, acts: [SWAP, WAIT], counter: { instance_id_seq: 50 } });
    const swapOf = (unit: Unit): AiMove => ({ kind: 'ACT', action: unit.acts.find((a) => a.master_ref === 'ACT_SWAP')! });
    applyMove(state, creature, swapOf(creature), NO_SUMMON_DEPS);
    for (let i = 0; i < boundaries; i += 1) {
      runStepEnd(state);
    }
    return { state, master, creature, swapOf };
  }

  it('交代の後に他のアクションを実行していない実行者の隊列交代は再交代とし、パスより1大きい減点を課す', () => {
    const { state, creature, swapOf } = afterSwap(1);
    expect(isReswap(state, creature, swapOf(creature))).toBe(true);
    expect(reswapPenaltyOf(state, creature, swapOf(creature), defaultProfile())).toBe(BONUS_DEFAULT_PASS - 1);
  });

  it('減点はプロファイルのパスの値（上書きを含む）に従う', () => {
    const { state, creature, swapOf } = afterSwap(1);
    const prof = { ...defaultProfile(), actionBonus: { PASS: -700 } };
    expect(reswapPenaltyOf(state, creature, swapOf(creature), prof)).toBe(-701);
  });

  it('相方が交代の後に他のアクションを実行していない場合も再交代とする', () => {
    const { state, master, swapOf } = afterSwap(1);
    expect(isReswap(state, master, swapOf(master))).toBe(true);
  });

  it('経過したステップ数を問わず再交代とする（3ステップごとの往復も捉える）', () => {
    const { state, master, creature, swapOf } = afterSwap(40);
    expect(creature.elapsed_thought).toBe(40);
    expect(isReswap(state, creature, swapOf(creature))).toBe(true);
    expect(isReswap(state, master, swapOf(master))).toBe(true);
  });

  it('交代の後に他のアクションを実行した組の隊列交代は再交代としない', () => {
    const { state, creature, swapOf } = afterSwap(1);
    creature.last_act = { ...creature.last_act!, class_id: 'ACT_WAIT', sys_flags: [] };
    expect(isReswap(state, creature, swapOf(creature))).toBe(false);
    expect(reswapPenaltyOf(state, creature, swapOf(creature), defaultProfile())).toBe(0);
  });

  it('隊列交代以外の手とパスは再交代としない', () => {
    const { state, creature } = afterSwap(1);
    const wait: AiMove = { kind: 'ACT', action: creature.acts.find((a) => a.master_ref === 'ACT_WAIT')! };
    expect(isReswap(state, creature, wait)).toBe(false);
    expect(isReswap(state, creature, { kind: 'PASS' })).toBe(false);
  });
});

describe('[A-SEARCH-MOVEGEN] 待機手の生成', () => {
  const READY = martialAction('ACT_READY', { atk: 10, step_thought: 0, step_startup: 5 });
  const WAITABLE = martialAction('ACT_WAITABLE', { atk: 40, step_thought: 20, step_startup: 5 });
  const COSTLY = martialAction('ACT_COSTLY', { atk: 40, cost_pp: 9, step_thought: 20, step_startup: 5 });
  const MIND_SLOW = makeAction('ACT_MIND_SLOW', { gain_vp: 1, step_thought: 20, step_startup: 5 });

  function hero(acts: Parameters<typeof createDuel>[0]['heroActs']) {
    const state = createDuel({ heroMaxHp: 10, heroActs: acts, enemyMaxHp: 10, enemyActs: [MIND_SLOW] });
    return { state, unit: findUnit(state, 'MINE') };
  }
  const labels = (moves: readonly AiMove[]) => moves.map((m) => (m.kind === 'PASS' ? 'PASS' : `${m.kind}:${m.action.master_ref}`));

  it('必要思考のみが未充足の武技について、通常の候補の後・パスの前に待機手を置く', () => {
    const { state, unit } = hero([WAITABLE, READY]);
    expect(labels(generateMoves(state, unit, true))).toEqual(['ACT:ACT_READY', 'WAIT:ACT_WAITABLE', 'PASS']);
  });

  it('プロファイルが待機手を含めない場合は生成しない', () => {
    const { state, unit } = hero([WAITABLE, READY]);
    expect(labels(generateMoves(state, unit, false))).toEqual(['ACT:ACT_READY', 'PASS']);
    expect(labels(generateMoves(state, unit))).toEqual(['ACT:ACT_READY', 'PASS']);
  });

  it('コストが未充足の武技、武技以外、マスター根源武技は待機手としない', () => {
    const { state, unit } = hero([COSTLY, MIND_SLOW]);
    unit.pp = 0;
    expect(labels(generateMoves(state, unit, true))).toEqual(['PASS']);
    const root = createDuel({ heroMaxHp: 10, heroActs: [], enemyMaxHp: 10, enemyActs: [MIND_SLOW] });
    const rootUnit = findUnit(root, 'MINE');
    rootUnit.acts = [{ ...unit.acts[0], instance_id: 'IID_ROOT', master_ref: 'ACT_ROOT_MARTIAL', base_params: { ...unit.acts[0].base_params, cost_pp: 0, step_thought: 550 } }];
    expect(labels(generateMoves(root, rootUnit, true))).toEqual(['PASS']);
  });

  it('相手陣営のマスターが射程外の場合は待機手としない（思考を待っても発射されない）', () => {
    const { state, unit } = hero([WAITABLE]);
    const enemy = findUnit(state, 'FOE');
    moveUnit(state, enemy, 3);
    expect(labels(generateMoves(state, unit, true))).toEqual(['PASS']);
    placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 2, maxHp: 10, acts: [MIND_SLOW], counter: { instance_id_seq: 50 } });
    expect(labels(generateMoves(state, unit, true))).toEqual(['PASS']);
  });

  it('前列がクリーチャーでも、後列のマスターが射程内なら待機手とする', () => {
    const { state, unit } = hero([martialAction('ACT_REACH', { atk: 40, range: 2, step_thought: 20, step_startup: 5 })]);
    moveUnit(state, findUnit(state, 'FOE'), 3);
    placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 2, maxHp: 10, acts: [MIND_SLOW], counter: { instance_id_seq: 50 } });
    expect(labels(generateMoves(state, unit, true))).toEqual(['WAIT:ACT_REACH', 'PASS']);
  });

  it('実効攻撃力が相手陣営のマスターの現在の防御力に満たない場合は待機手としない', () => {
    const { state, unit } = hero([WAITABLE]);
    findUnit(state, 'FOE').ap = 100;
    expect(labels(generateMoves(state, unit, true))).toEqual(['PASS']);
  });

  it('待機手のボーナスはパスと同じ既定値・上書きに従う', () => {
    const { state, unit } = hero([WAITABLE]);
    const wait = generateMoves(state, unit, true).find((m) => m.kind === 'WAIT')!;
    expect(tagsOf(wait)).toEqual(['PASS']);
  });
});

describe('[A-SEARCH-MOVEGEN] 拍止め', () => {
  // isRootAction はアクションマスタの is_root を引くため、主人公の根源武技は実在のクラスIDとする。
  const ROOT = martialAction('ACT_ROOT_MARTIAL', { atk: 999, range: 2, stun: true, step_thought: 550, step_startup: 1 });
  const COUNTER = martialAction('ACT_ROOT_COUNTER', { atk: 999, range: 2, stun: true, dmg_hp: 0, step_thought: 300, step_startup: 1 });
  const SHORT = makeAction('ACT_SHORT', { gain_vp: 1, step_startup: 5 });
  const LONG = makeAction('ACT_LONG', { gain_vp: 1, step_startup: 150, step_recovery: 50 });
  const SWAP = makeAction('ACT_SWAP', { is_swap: true, step_startup: 0, step_recovery: 0 });
  const labels = (moves: readonly AiMove[]) => moves.map((m) => (m.kind === 'PASS' ? 'PASS' : m.action.master_ref));

  // 主人公の経過思考 heroThought、敵マスターの経過思考 foeThought の局面。
  function duel(heroThought: number, foeThought: number) {
    const state = createDuel({ heroMaxHp: 10, heroActs: [ROOT], enemyMaxHp: 10, enemyActs: [SHORT, LONG, COUNTER] });
    const hero = findUnit(state, 'MINE');
    const foe = findUnit(state, 'FOE');
    hero.elapsed_thought = heroThought;
    foe.elapsed_thought = foeThought;
    return { state, hero, foe };
  }

  it('相手の根源武技の発動が拍止めの必要思考＋必要発生より近ければ、候補手は拍止めのみとする', () => {
    const { state, foe } = duel(260, 300); // 残り 291 ≦ 301
    expect(labels(generateMoves(state, foe))).toEqual(['ACT_ROOT_COUNTER']);
  });

  it('発射の時機でなければ拍止めを含めず、実行すると間に合わなくなる手を除く', () => {
    const { state, foe } = duel(100, 300); // 残り 451：LONG は 200 + 301 > 451
    expect(labels(generateMoves(state, foe))).toEqual(['ACT_SHORT', 'PASS']);
  });

  it('拍止めの着弾が根源武技の発動と同じステップになる手は、間に合わないものとして扱う', () => {
    // 残り 501：LONG は 200 + 301 = 501 で根源武技と同じステップに着弾するため除く。
    const early = duel(50, 300);
    expect(labels(generateMoves(early.state, early.foe))).toEqual(['ACT_SHORT', 'PASS']);
    // 残り 301：待っても拍止めは 301 に着弾し、根源武技と同じステップのため温存しない。
    const late = duel(250, 0);
    expect(labels(generateMoves(late.state, late.foe))).toEqual(['ACT_SHORT', 'ACT_LONG', 'PASS']);
  });

  it('相手のマスターへ通り、根源武技より前に着弾するスタン付与の武技（通る中断）は温存で除かない', () => {
    const STUN = martialAction('ACT_STUN', { atk: 10, range: 2, stun: true, step_thought: 0, step_startup: 20, step_recovery: 200 });
    const state = createDuel({ heroMaxHp: 10, heroActs: [ROOT], enemyMaxHp: 10, enemyActs: [SHORT, LONG, STUN, COUNTER] });
    const hero = findUnit(state, 'MINE');
    const foe = findUnit(state, 'FOE');
    hero.elapsed_thought = 100; // 残り 451：LONG は 200 + 301、STUN は 220 + 301 で、いずれも ≧ 451
    foe.elapsed_thought = 300;
    hero.ap = 10; // 攻撃力10 は防御力10 に通る
    expect(labels(generateMoves(state, foe))).toEqual(['ACT_SHORT', 'ACT_STUN', 'PASS']);
    hero.ap = 11; // 体勢などで防がれている
    expect(labels(generateMoves(state, foe))).toEqual(['ACT_SHORT', 'PASS']);
  });

  it('待っても間に合わないときは温存しない', () => {
    const { state, foe } = duel(400, 0); // 残り 151 < 301
    expect(labels(generateMoves(state, foe))).toEqual(['ACT_SHORT', 'ACT_LONG', 'PASS']);
  });

  it('相手のマスターが思考中でなければ拍止めを含めず、温存もしない', () => {
    const { state, hero, foe } = duel(100, 300);
    hero.state = 'STARTUP';
    expect(labels(generateMoves(state, foe))).toEqual(['ACT_SHORT', 'ACT_LONG', 'PASS']);
  });

  it('相方の拍止めが待てば間に合い、交代で経過思考を失うと間に合わないとき、隊列交代を除く', () => {
    const { state, foe } = duel(300, 100); // 残り 251：待てば 201、交代すると 301
    moveUnit(state, foe, 3);
    const creature = placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 2, maxHp: 10, acts: [SWAP, SHORT], counter: { instance_id_seq: 50 } });
    expect(labels(generateMoves(state, creature))).toEqual(['ACT_SHORT', 'PASS']);
    foe.elapsed_thought = 0; // 待っても間に合わない
    expect(labels(generateMoves(state, creature))).toEqual(['ACT_SWAP', 'ACT_SHORT', 'PASS']);
  });
});
