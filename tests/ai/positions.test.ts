// [V-TEST-POSITIONS] 局面テストスイート（EPD方式）。各評価項につき3局面を置く。
// 局面は実データに依存しない最小構成で組み、検証対象の特徴量・境界だけを直接指定する。
// T-12 は 1-01 の実データによる局面（tests/ai/positions-1-01.test.ts）、T-18 の TTK 実数値は tests/ai/step157-ttk.test.ts にある。
// 手の選択は参照プレイヤーAIと同じ全11項のプロファイル（[V-TEST-REFAI]）で判定する。

import { describe, expect, it } from 'vitest';
import type { ActionMasterRecord } from '../../src/data/types.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { runPreDecision } from '../../src/engine/pipeline/step.js';
import { cloneState } from '../../src/ai/clone.js';
import { evaluate } from '../../src/ai/evaluate.js';
import { referenceProfile } from '../../src/ai/profile.js';
import { runQuiescence } from '../../src/ai/quiesce.js';
import { ttk } from '../../src/ai/ttk.js';
import {
  chosenClassId,
  createDuel,
  creatureFactory,
  findUnit,
  makeAction,
  martialAction,
  moveUnit,
  NO_SUMMON_DEPS,
  placeUnit,
  setRecovery,
  setStartup,
} from './fixtures.js';

// 心気（基本）：VP加算とPP充填を持つ（[M-BASE-AR-MIND] の基本形）。
const MIND = makeAction('ACT_MIND', { gain_vp: 3, charge_pp: 100, step_startup: 5, step_recovery: 5 });

interface Duel {
  readonly state: BattleState;
  readonly hero: Unit;
  readonly enemy: Unit;
}

function duel(heroActs: readonly ActionMasterRecord[], enemyActs: readonly ActionMasterRecord[], heroHp = 60, enemyHp = 60): Duel {
  const state = createDuel({ heroMaxHp: heroHp, heroActs, enemyMaxHp: enemyHp, enemyActs });
  return { state, hero: findUnit(state, 'MINE'), enemy: findUnit(state, 'FOE') };
}

describe('[V-TEST-POSITIONS] T-01 命中閾値・無防備ウィンドウ', () => {
  // 防御効率0.00の重撃は、発生中・硬直中の防御力を AP に関わらず 0 にする（[M-CALC-DEFENSE]）。
  const HEAVY = martialAction('HERO_HEAVY', { atk: 50, dmg_hp: 1000, def_efficiency: 0, step_startup: 30, step_recovery: 20 });
  const STANCE = makeAction('FOE_STANCE', { deploy_ap: 30, step_startup: 5, step_recovery: 5 });

  it.each([
    { name: '急襲の発生5（残り発生10の内側で着弾）', rush: { step_startup: 5, step_recovery: 5 }, heroAp: 40, elapsed: 20 },
    { name: '即時型の急襲', rush: { step_startup: 0, step_recovery: 5 }, heroAp: 40, elapsed: 20 },
    { name: 'AP100でも防御効率0.00の窓は開いている', rush: { step_startup: 3, step_recovery: 5 }, heroAp: 100, elapsed: 25 },
  ])('T-01: $name', ({ rush, heroAp, elapsed }) => {
    const RUSH = martialAction('FOE_RUSH', { atk: 10, dmg_hp: 800, ...rush });
    const { state, hero, enemy } = duel([HEAVY, MIND], [MIND, STANCE, RUSH]);
    hero.ap = heroAp;
    setStartup(hero, 'HERO_HEAVY', elapsed);
    expect(chosenClassId(state, enemy)).toBe('FOE_RUSH');
  });
});

describe('[V-TEST-POSITIONS] T-06 テンポ項による投資の破壊', () => {
  const STANCE = makeAction('FOE_STANCE', { deploy_ap: 20, step_startup: 5, step_recovery: 5 });

  // スタン武技は大技の発動より前に着弾する最後の機会にある。1ステップ待てば同一ステップでの
  // 発動（相打ち、[M-PIPE-P2-APPLY]#3）となり中断できない。
  it.each([
    { name: '必要発生24・経過20、発生3のスタン武技', big: 24, elapsed: 20, stun: { step_startup: 3, step_recovery: 10 } },
    { name: '必要発生24・経過23、即時型のスタン武技', big: 24, elapsed: 23, stun: { step_startup: 0, step_recovery: 10 } },
    { name: '必要発生48・経過38、発生9のスタン武技', big: 48, elapsed: 38, stun: { step_startup: 9, step_recovery: 10 } },
  ])('T-06: $name', ({ big, elapsed, stun }) => {
    const BIG = martialAction('HERO_BIG', { atk: 30, dmg_hp: 2000, step_startup: big, step_recovery: 10 });
    const STUN = martialAction('FOE_STUN', { atk: 10, dmg_hp: 100, stun: true, ...stun });
    const { state, hero, enemy } = duel([BIG, MIND], [MIND, STANCE, STUN], 60, 50);
    setStartup(hero, 'HERO_BIG', elapsed);
    expect(chosenClassId(state, enemy)).toBe('FOE_STUN');
  });
});

describe('[V-TEST-POSITIONS] T-07 盤面項・位置項', () => {
  const SWAP = makeAction('FOE_SWAP', { is_swap: true, step_startup: 0, step_recovery: 0 });
  const CREATURE_IDLE = makeAction('CR_IDLE', { gain_vp: 1, step_thought: 500 });

  function position(options: { readonly creatureHp: number; readonly heroElapsed: number; readonly masterAp: number }): Duel {
    const HIT = martialAction('HERO_HIT', { atk: 30, dmg_hp: 1000, step_startup: 10, step_recovery: 10 });
    const { state, hero, enemy } = duel([HIT, MIND], [MIND, SWAP]);
    moveUnit(state, enemy, 3);
    enemy.ap = options.masterAp;
    const creature = placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 2, maxHp: 30, acts: [CREATURE_IDLE], counter: { instance_id_seq: 50 } });
    creature.hp = options.creatureHp;
    setStartup(hero, 'HERO_HIT', options.heroElapsed);
    return { state, hero, enemy };
  }

  it.each([
    { name: '瀕死のクリーチャーに残り発生2の武技が迫る', creatureHp: 5, heroElapsed: 8, masterAp: 40 },
    { name: '残り発生5', creatureHp: 5, heroElapsed: 5, masterAp: 40 },
    { name: 'マスターのAPが厚い', creatureHp: 3, heroElapsed: 8, masterAp: 80 },
  ])('T-07: $name', (options) => {
    const { state, enemy } = position(options);
    expect(chosenClassId(state, enemy)).toBe('FOE_SWAP');
  });
});

describe('[V-TEST-POSITIONS] T-09 リソース項・候補生成', () => {
  it.each([
    { name: '武技のPPコスト2', ppCost: 2, charge: 100 },
    { name: '武技のPPコスト5', ppCost: 5, charge: 200 },
    { name: '武技2本ともコスト不足', ppCost: 3, charge: 100 },
  ])('T-09: $name', ({ ppCost, charge }) => {
    const BASIC_MIND = makeAction('FOE_MIND_BASIC', { gain_vp: 5, charge_pp: charge, step_startup: 5, step_recovery: 5 });
    const HIT = martialAction('FOE_HIT', { atk: 10, dmg_hp: 500, cost_pp: ppCost, step_startup: 5, step_recovery: 5 });
    const HEAVY = martialAction('FOE_HEAVY', { atk: 20, dmg_hp: 1000, cost_pp: ppCost + 2, step_startup: 10, step_recovery: 10 });
    const HERO_SLOW = martialAction('HERO_SLOW', { atk: 10, dmg_hp: 500, step_thought: 60, step_startup: 10, step_recovery: 10 });
    const { state, enemy } = duel([HERO_SLOW], [HIT, HEAVY, BASIC_MIND]);
    enemy.pp = 0;
    expect(chosenClassId(state, enemy)).toBe('FOE_MIND_BASIC');
  });
});

describe('[V-TEST-POSITIONS] T-10 リソース項の飽和', () => {
  const CREATURE_IDLE = makeAction('CR_IDLE', { gain_vp: 1, step_thought: 500 });

  it.each([
    { name: 'VPが召喚コストの3倍', vp: 30, cost: 10 },
    { name: 'VPが召喚コストの3倍（コスト20）', vp: 60, cost: 20 },
    { name: 'VPが召喚コストの4倍', vp: 40, cost: 10 },
  ])('T-10: $name', ({ vp, cost }) => {
    const SUMMON = makeAction('FOE_SUMMON', { summon_id: 'CREATURE_T10', cost_vp: cost, step_startup: 5, step_recovery: 5 });
    const HIT = martialAction('FOE_HIT', { atk: 10, dmg_hp: 300, step_startup: 10, step_recovery: 10 });
    const { state, enemy } = duel([MIND], [SUMMON, MIND, HIT]);
    enemy.vp = vp;
    placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 3, maxHp: 30, acts: [CREATURE_IDLE], counter: { instance_id_seq: 50 } });
    const deps = creatureFactory(state, { CREATURE_T10: { maxHp: 30, acts: [CREATURE_IDLE] } });
    expect(chosenClassId(state, enemy, undefined, deps)).not.toBe('FOE_SUMMON');
  });
});

describe('[V-TEST-POSITIONS] T-13 着弾予測時点の防御力判定', () => {
  // 主人公は次のステップで武技の硬直を満了し、AP減衰50%で壁が半減する（[M-PIPE-P7-LANDING]#2）。
  // 現在の防御力では貫通武技は通らないが、着弾時点の防御力では通り、残りHPを削り切る。
  // 主人公は硬直明けに壁を張り直せ、その着弾は今撃った貫通武技と同一ステップ（《処理1》の凍結値は
  // 半減後の壁）となる。1ステップでも遅れれば張り直し後の壁に阻まれ、主人公の致命打を待つだけになる。
  it.each([
    { name: '壁40が20へ半減、攻撃力25・発生5', ap: 40, atk: 25, startup: 5 },
    { name: '壁60が30へ半減、攻撃力35・発生4', ap: 60, atk: 35, startup: 4 },
    { name: '壁30が15へ半減、攻撃力20・発生7', ap: 30, atk: 20, startup: 7 },
  ])('T-13: $name', ({ ap, atk, startup }) => {
    const HERO_HIT = martialAction('HERO_HIT', { atk: 10, dmg_hp: 300, decay_ap: 50, step_thought: 30, step_startup: 10, step_recovery: 10 });
    const HERO_STANCE = makeAction('HERO_STANCE', { deploy_ap: ap, step_startup: startup - 1, step_recovery: 10 });
    const HERO_FINISH = martialAction('HERO_FINISH', { atk: 99, dmg_hp: 3000, step_startup: 40, step_recovery: 10 });
    const PIERCE = martialAction('FOE_PIERCE', { atk, dmg_hp: 800, step_startup: startup, step_recovery: 10 });
    const WEAK = martialAction('FOE_WEAK', { atk: atk - 6, dmg_hp: 1200, step_startup: startup, step_recovery: 10 });
    const { state, hero, enemy } = duel([HERO_HIT, HERO_STANCE, HERO_FINISH], [WEAK, MIND, PIERCE], 24, 60);
    hero.ap = ap;
    setRecovery(hero, 'HERO_HIT', 10, 9);
    expect(chosenClassId(state, enemy)).toBe('FOE_PIERCE');
  });
});

describe('[V-TEST-POSITIONS] T-16 妨害モデル t_deny', () => {
  // 「蓄積」は思考ステップの蓄積を指す。思考中ユニットへのスタンは経過思考を0へ戻す（[M-PIPE-P2-APPLY]#4）。
  // スタン武技の必要発生は、今撃てば根源武技の蓄積完了に間に合い、次の決定点まで待てば間に合わない長さとする。
  it.each([
    { name: '経過400／必要550、発生145のスタン武技', elapsed: 400, stunStartup: 145 },
    { name: '経過500／必要550、発生45のスタン武技', elapsed: 500, stunStartup: 45 },
    { name: '経過544／必要550、発生5のスタン武技', elapsed: 544, stunStartup: 5 },
  ])('T-16: $name', ({ elapsed, stunStartup }) => {
    const ROOT = martialAction('HERO_ROOT', { atk: 99, dmg_hp: 3000, step_thought: 550, step_startup: 14, step_recovery: 50 });
    const HERO_WAIT = makeAction('HERO_WAIT', { gain_vp: 1, step_thought: 1000 });
    const STUN = martialAction('FOE_STUN', { atk: 5, dmg_hp: 100, stun: true, step_startup: stunStartup, step_recovery: 20 });
    const STANCE = makeAction('FOE_STANCE', { deploy_ap: 30, step_startup: 10, step_recovery: 10 });
    const { state, hero, enemy } = duel([ROOT, HERO_WAIT], [MIND, STANCE, STUN]);
    hero.elapsed_thought = elapsed;
    expect(chosenClassId(state, enemy)).toBe('FOE_STUN');
  });
});

describe('[V-TEST-POSITIONS] T-17 硬直中スタン無効の反映', () => {
  it.each([
    { name: '残り硬直60', applied: 100, elapsedRecovery: 40 },
    { name: '残り硬直80', applied: 100, elapsedRecovery: 20 },
    { name: '残り硬直45', applied: 50, elapsedRecovery: 5 },
  ])('T-17: $name', ({ applied, elapsedRecovery }) => {
    const ROOT = martialAction('HERO_ROOT', { atk: 99, dmg_hp: 5000, step_startup: 550, step_recovery: 50 });
    const STUN = martialAction('FOE_STUN', { atk: 5, dmg_hp: 100, stun: true, step_startup: 5, step_recovery: 60 });
    const CHARGE = makeAction('FOE_CHARGE', { gain_vp: 3, charge_pp: 100, step_startup: 5, step_recovery: 5 });
    const { state, hero, enemy } = duel([ROOT, MIND], [CHARGE, STUN]);
    setRecovery(hero, 'HERO_ROOT', applied, elapsedRecovery);
    expect(chosenClassId(state, enemy)).not.toBe('FOE_STUN');
  });
});

describe('[V-TEST-POSITIONS] T-20 減衰前提の封印価値評価', () => {
  it.each([
    { name: '封印蓄積3.00', seal: 300 },
    { name: '封印蓄積2.00', seal: 200 },
    { name: '封印蓄積5.00', seal: 500 },
  ])('T-20: $name', ({ seal }) => {
    const HERO_MAIN = martialAction('HERO_MAIN', { atk: 20, dmg_hp: 1000, step_thought: 10, step_startup: 10, step_recovery: 10 });
    const HERO_MIND = makeAction('HERO_MIND_BASIC', { gain_vp: 2, charge_pp: 100, purify_rate: 30, step_startup: 5, step_recovery: 5 });
    const SEALER = martialAction('FOE_SEALER', { atk: 5, dmg_hp: 100, give_seal: 300, step_startup: 5, step_recovery: 10 });
    const STRIKE = martialAction('FOE_STRIKE', { atk: 5, dmg_hp: 600, step_startup: 8, step_recovery: 10 });
    const { state, hero, enemy } = duel([HERO_MAIN, HERO_MIND], [SEALER, STRIKE, MIND]);
    const main = hero.acts.find((a) => a.master_ref === 'HERO_MAIN')!;
    main.seal_accum = seal;
    setRecovery(hero, 'HERO_MAIN', 10, 5);
    expect(chosenClassId(state, enemy)).not.toBe('FOE_SEALER');
  });
});

describe('[V-TEST-POSITIONS] T-22/T-23 斥けによる射程外化と両マス占有条件', () => {
  const CREATURE_IDLE = makeAction('CR_IDLE', { gain_vp: 1, step_thought: 500 });

  // 射程1の武技は敵マスターを一撃で倒す。敵は着弾前に射程外へ押し出すか、硬直の重い壁で受けるほかない。
  // 押し出しが成立する局面では、硬直の軽い斥けが壁より優れる。
  function position(options: { readonly withCreature: boolean; readonly elapsed: number; readonly pushStartup: number }): Duel {
    const SHORT = martialAction('HERO_SHORT', { atk: 30, dmg_hp: 3000, step_startup: 24, step_recovery: 10 });
    const PUSH = martialAction('FOE_PUSH', { atk: 5, dmg_hp: 100, interfere_pos: 'PUSH', step_startup: options.pushStartup, step_recovery: 5 });
    const GUARD = makeAction('FOE_GUARD', { deploy_ap: 40, step_startup: options.pushStartup, step_recovery: 30 });
    const d = duel([SHORT, MIND], [MIND, GUARD, PUSH]);
    if (options.withCreature) {
      placeUnit(d.state, { side: 'MINE', kind: 'CREATURE', pos: 0, maxHp: 30, acts: [CREATURE_IDLE], counter: { instance_id_seq: 50 } });
    }
    setStartup(d.hero, 'HERO_SHORT', options.elapsed);
    return d;
  }

  it.each([
    { name: '即時型の斥け', elapsed: 20, pushStartup: 0 },
    { name: '発生2の斥け', elapsed: 20, pushStartup: 2 },
    { name: '残り発生3、発生2の斥け', elapsed: 21, pushStartup: 2 },
  ])('T-22: $name', ({ elapsed, pushStartup }) => {
    const { state, enemy } = position({ withCreature: true, elapsed, pushStartup });
    expect(chosenClassId(state, enemy)).toBe('FOE_PUSH');
  });

  it.each([
    { name: '即時型の斥け', elapsed: 20, pushStartup: 0 },
    { name: '発生2の斥け', elapsed: 20, pushStartup: 2 },
    { name: '残り発生3、発生2の斥け', elapsed: 21, pushStartup: 2 },
  ])('T-23: $name（後列が空きマス）', ({ elapsed, pushStartup }) => {
    const { state, enemy } = position({ withCreature: false, elapsed, pushStartup });
    expect(chosenClassId(state, enemy)).not.toBe('FOE_PUSH');
  });
});

describe('[V-TEST-POSITIONS] T-04/T-05 自滅ポリシーの MATE_TH 判定', () => {
  // 瞬動の武技は [M-PIPE-INSTANT]#3 の勝敗判定を経てから #4 のスリップ決済に進む。敵は致死量の
  // 被スリップ量を抱えており、主人公を倒しきれなければ自身のスリップ決済で消滅する。
  const SAFE = makeAction('FOE_SAFE', { deploy_ap: 5, step_startup: 5, step_recovery: 5 });
  const HERO_WAIT = makeAction('HERO_WAIT', { gain_vp: 1, step_startup: 5, step_recovery: 5 });

  function position(heroHp: number, strikeDamage: number, slip: number): Duel {
    const STRIKE = martialAction('FOE_STRIKE', { atk: 1, dmg_hp: strikeDamage, step_startup: 0, step_recovery: 0 });
    const d = duel([HERO_WAIT], [SAFE, STRIKE], heroHp, 5);
    d.enemy.slip = slip; // levelSlipDamage(slip, L=3) >= 敵HP5
    return d;
  }

  it.each([
    { name: '主人公HP9を9ダメージで倒す', heroHp: 9, dmg: 300, slip: 200 },
    { name: '主人公HP30を30ダメージで倒す', heroHp: 30, dmg: 1000, slip: 500 },
    { name: '主人公HP1を超過ダメージで倒す', heroHp: 1, dmg: 900, slip: 1000 },
  ])('T-04: $name', ({ heroHp, dmg, slip }) => {
    const { state, enemy } = position(heroHp, dmg, slip);
    expect(chosenClassId(state, enemy)).toBe('FOE_STRIKE');
  });

  it.each([
    { name: '主人公HP10に9ダメージ', heroHp: 10, dmg: 300, slip: 200 },
    { name: '主人公HP31に30ダメージ', heroHp: 31, dmg: 1000, slip: 500 },
    { name: '主人公HP100に27ダメージ', heroHp: 100, dmg: 900, slip: 1000 },
  ])('T-05: $name', ({ heroHp, dmg, slip }) => {
    const { state, enemy } = position(heroHp, dmg, slip);
    expect(chosenClassId(state, enemy)).not.toBe('FOE_STRIKE');
  });
});

describe('[V-TEST-POSITIONS] T-15 同着の非対称性', () => {
  // 双方の根源武技が同一ステップに到達する対称局面では tp == te となり、TIE_BONUS により敵側が正となる。
  it.each([
    { name: '双方思考0から', elapsed: 0 },
    { name: '双方経過思考300', elapsed: 300 },
    { name: '双方経過思考549', elapsed: 549 },
  ])('T-15: $name', ({ elapsed }) => {
    const HERO_ROOT = martialAction('HERO_ROOT', { atk: 8, dmg_hp: 1000, step_thought: 550, step_startup: 14, step_recovery: 50 });
    const FOE_ROOT = martialAction('FOE_ROOT', { atk: 8, dmg_hp: 1000, step_thought: 550, step_startup: 14, step_recovery: 50 });
    const { state, hero, enemy } = duel([HERO_ROOT], [FOE_ROOT]);
    hero.elapsed_thought = elapsed;
    enemy.elapsed_thought = elapsed;
    expect(evaluate(state, referenceProfile(), 0, NO_SUMMON_DEPS)).toBeGreaterThan(0);
  });
});

describe('[V-TEST-POSITIONS] T-14 リソース補充の加算', () => {
  // TTK(a→d) = 到達時間 + 初回補充時間 + 実効発生 + (必要ヒット数−1)×フルサイクル + 後続補充回数×補充サイクル（[A-EVAL-TTK]）。
  const HIT = martialAction('HERO_HIT', { atk: 10, dmg_hp: 1000, cost_pp: 2, step_thought: 20, step_startup: 10, step_recovery: 10 });
  const CHARGE = makeAction('HERO_CHARGE', { gain_vp: 2, charge_pp: 100, step_thought: 30, step_startup: 5, step_recovery: 5 });
  const HIT_CYCLE = 40;
  const CHARGE_CYCLE = 40;

  it.each([
    { name: 'PP2・コスト2・必要ヒット数3', pp: 2, enemyHp: 90, expected: 20 + 10 + 2 * HIT_CYCLE + 2 * CHARGE_CYCLE },
    { name: 'PP4・コスト2・必要ヒット数3', pp: 4, enemyHp: 90, expected: 20 + 10 + 2 * HIT_CYCLE + 1 * CHARGE_CYCLE },
    { name: 'PP0・コスト2・必要ヒット数2', pp: 0, enemyHp: 60, expected: 20 + CHARGE_CYCLE + 10 + 1 * HIT_CYCLE + 1 * CHARGE_CYCLE },
  ])('T-14: $name', ({ pp, enemyHp, expected }) => {
    const { state, hero, enemy } = duel([HIT, CHARGE], [MIND], 60, enemyHp);
    hero.pp = pp;
    const { trace } = runQuiescence(cloneState(state), NO_SUMMON_DEPS);
    const value = ttk(hero, enemy, { trace, level: state.scene_level });
    const requiredHits = Math.ceil(enemyHp / 30);
    const naiveVolley = 20 + 10 + (requiredHits - 1) * HIT_CYCLE;
    expect(value).toBe(expected);
    expect(value).toBeGreaterThan(naiveVolley);
  });
});

describe('[V-TEST-POSITIONS] T-24 同一陣営1ステップ1回制限', () => {
  // 主人公マスター（前列）とクリーチャー（後列）の位置干渉付き通常武技が同一ステップに発動し、
  // いずれも敵陣の前列・後列に命中する。入れ替えは1回のみ成立する（[M-PIPE-P2-APPLY]#3・[M-RESOLVE-INTERFERE]#4）。
  it.each([
    { name: '斥けと招き', master: 'PUSH', creature: 'PULL' },
    { name: '斥けと斥け', master: 'PUSH', creature: 'PUSH' },
    { name: '双方と双方', master: 'BOTH', creature: 'BOTH' },
  ] as const)('T-24: $name', ({ master, creature }) => {
    const M_HIT = martialAction('HERO_INTERFERE', { atk: 10, range: 2, dmg_hp: 100, interfere_pos: master, step_startup: 5, step_recovery: 10 });
    const C_HIT = martialAction('CR_INTERFERE', { atk: 10, range: 3, dmg_hp: 100, interfere_pos: creature, step_startup: 5, step_recovery: 10 });
    const IDLE = makeAction('FOE_IDLE', { gain_vp: 1, step_thought: 500 });
    const { state, hero, enemy } = duel([M_HIT], [IDLE], 60, 60);
    const counter = { instance_id_seq: 50 };
    const heroCreature = placeUnit(state, { side: 'MINE', kind: 'CREATURE', pos: 0, maxHp: 30, acts: [C_HIT], counter });
    const foeCreature = placeUnit(state, { side: 'FOE', kind: 'CREATURE', pos: 3, maxHp: 30, acts: [IDLE], counter });
    setStartup(hero, 'HERO_INTERFERE', 5);
    setStartup(heroCreature, 'CR_INTERFERE', 5);
    state.step = 1;

    runPreDecision(state, NO_SUMMON_DEPS);

    expect([enemy.pos_idx, foeCreature.pos_idx]).toEqual([3, 2]);
    expect(state.units[2]).toBe(foeCreature);
    expect(state.units[3]).toBe(enemy);
  });
});

describe('[V-TEST-POSITIONS] T-02/T-03 命中不能な技の火力0扱いと閾値', () => {
  const STANCE = makeAction('FOE_STANCE', { deploy_ap: 30, step_startup: 5, step_recovery: 5 });
  const HERO_HIT = martialAction('HERO_HIT', { atk: 20, dmg_hp: 500, step_thought: 20, step_startup: 10, step_recovery: 10 });

  // 敵PPは潤沢。武技はいずれもPPコストを持ち、コストでは選択が妨げられない。
  function position(heroAp: number, martials: readonly ActionMasterRecord[]): Duel {
    const d = duel([HERO_HIT], [...martials, MIND, STANCE]);
    d.hero.ap = heroAp;
    d.enemy.pp = 50;
    return d;
  }

  it.each([
    { name: 'AP40、武技の攻撃力39・30', heroAp: 40, atks: [39, 30] },
    { name: 'AP60、武技の攻撃力59', heroAp: 60, atks: [59] },
    { name: 'AP25、武技の攻撃力24・10・1', heroAp: 25, atks: [24, 10, 1] },
  ])('T-02: $name', ({ heroAp, atks }) => {
    const martials = atks.map((atk, i) => martialAction(`FOE_HIT_${i}`, { atk, dmg_hp: 1500, cost_pp: 2, step_startup: 5, step_recovery: 5 }));
    const { state, enemy } = position(heroAp, martials);
    expect(['ACT_MIND', 'FOE_STANCE']).toContain(chosenClassId(state, enemy));
  });

  it.each([
    { name: 'AP40、重撃の攻撃力41', heroAp: 40 },
    { name: 'AP60、重撃の攻撃力61', heroAp: 60 },
    { name: 'AP25、重撃の攻撃力26', heroAp: 25 },
  ])('T-03: $name', ({ heroAp }) => {
    const weak = martialAction('FOE_HIT_0', { atk: heroAp - 1, dmg_hp: 1500, cost_pp: 2, step_startup: 5, step_recovery: 5 });
    const heavy = martialAction('FOE_HEAVY', { atk: heroAp + 1, dmg_hp: 1500, cost_pp: 2, step_startup: 5, step_recovery: 5 });
    const { state, enemy } = position(heroAp, [weak, heavy]);
    expect(chosenClassId(state, enemy)).toBe('FOE_HEAVY');
  });
});

describe('[V-TEST-POSITIONS] T-08 焦燥項', () => {
  // 双方が体勢で壁を張り合った長期戦。敵はAP・PPともに潤沢で、壁を割れる武技を持つ。
  it.each([
    { name: '600ステップ経過', step: 600 },
    { name: '800ステップ経過', step: 800 },
    { name: '1200ステップ経過', step: 1200 },
  ])('T-08: $name', ({ step }) => {
    const HERO_GUARD = makeAction('HERO_GUARD', { deploy_ap: 60, step_thought: 60, step_startup: 20, step_recovery: 40 });
    const FOE_GUARD = makeAction('FOE_GUARD', { deploy_ap: 60, step_startup: 20, step_recovery: 40 });
    const BREAK = martialAction('FOE_BREAK', { atk: 65, dmg_hp: 800, cost_pp: 5, step_startup: 20, step_recovery: 20 });
    const { state, hero, enemy } = duel([HERO_GUARD], [FOE_GUARD, MIND, BREAK]);
    state.step = step;
    hero.ap = 60;
    enemy.ap = 60;
    enemy.pp = 40;
    setRecovery(hero, 'HERO_GUARD', 40, 10);
    expect(chosenClassId(state, enemy)).toBe('FOE_BREAK');
  });
});

describe('[V-TEST-POSITIONS] T-21 招きの固有発火条件（前列回避・後列命中）', () => {
  // 主人公側は前列クリーチャーが体勢展開中（防御力40）、後列マスターは思考中でAP0・HP45。
  // 敵の射程1の武技は後列マスターに届かない。招きでマスターを前列へ引き出せば、その武技で倒しきれる。
  it.each([
    { name: '射程2・攻撃力30の招き', range: 2, atk: 30, wall: 40 },
    { name: '射程3・攻撃力30の招き', range: 3, atk: 30, wall: 40 },
    { name: '射程2・攻撃力50の招きと壁60', range: 2, atk: 50, wall: 60 },
  ])('T-21: $name', ({ range, atk, wall }) => {
    const HERO_ROOT = martialAction('HERO_ROOT', { atk: 8, dmg_hp: 1000, step_thought: 300, step_startup: 14, step_recovery: 50 });
    const CR_WALL = makeAction('CR_WALL', { deploy_ap: wall, def_efficiency: 100, step_startup: 5, step_recovery: 200 });
    const PULL = martialAction('FOE_PULL', { atk, range, dmg_hp: 300, cost_pp: 2, interfere_pos: 'PULL', step_startup: 5, step_recovery: 10 });
    const FOE_SLASH = martialAction('FOE_SLASH', { atk, dmg_hp: 1500, cost_pp: 2, step_startup: 10, step_recovery: 10 });
    const { state, hero, enemy } = duel([HERO_ROOT], [MIND, FOE_SLASH, PULL], 45, 60);
    moveUnit(state, hero, 0);
    const creature = placeUnit(state, { side: 'MINE', kind: 'CREATURE', pos: 1, maxHp: 30, acts: [CR_WALL], counter: { instance_id_seq: 50 } });
    creature.ap = wall;
    setRecovery(creature, 'CR_WALL', 200, 10);
    enemy.pp = 10;
    expect(chosenClassId(state, enemy)).toBe('FOE_PULL');
  });
});
