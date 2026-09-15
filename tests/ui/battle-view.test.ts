// [M-UI-HUD] [M-UI-SORT] 盤面HUDの数値書式・表示順序・判定プレビュー・ビューモデル。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS, HERO_INIT_UNIT } from '../../src/data/generated/hero-init.js';
import { INFINITE_USES } from '../../src/engine/params.js';
import { createScene } from '../../src/engine/setup.js';
import type { ActionInstance, BattleState, Unit } from '../../src/engine/types.js';
import { allWatchFlags, syncWatchKeys } from '../../src/engine/watch.js';
import {
  correctionSign,
  formatCenti,
  formatHp,
  formatPercent,
  formatSteps,
  formatUses,
  INFINITY_MARK,
} from '../../src/ui/format.js';
import { buildBattleView, type UnitNaming } from '../../src/ui/view/battle-view.js';
import { previewOf } from '../../src/ui/view/preview.js';
import { activationRank, sortedActions } from '../../src/ui/view/sort.js';
import { createDuel, findUnit, makeAction, martialAction, NO_SUMMON_DEPS, setRecovery, setStartup } from '../ai/fixtures.js';

const naming: UnitNaming = {
  displayName: (unit: Unit) => (unit.side === 'MINE' ? HERO_INIT_UNIT.display_name : ENEMY_MASTERS.ENEMY_LEF.display_name),
  roleName: (unit: Unit) => (unit.side === 'MINE' ? HERO_INIT_UNIT.role_name : ENEMY_MASTERS.ENEMY_LEF.role_name),
  actionName: (action: ActionInstance) => action.master_ref,
};

const MIND = makeAction('MIND', { gain_vp: 2, charge_pp: 100, step_thought: 20, step_startup: 10, step_recovery: 5 });
const HIT = martialAction('HIT', { atk: 20, dmg_hp: 300, cost_pp: 2, step_thought: 5, step_startup: 10, step_recovery: 10 });
const GUARD = makeAction('GUARD', { deploy_ap: 30, def_efficiency: 200, cost_pp: 9, step_startup: 10, step_recovery: 20 });
const SEALED = martialAction('SEALED', { atk: 5, dmg_hp: 100, step_startup: 5 });

function duel(): { state: BattleState; hero: Unit; enemy: Unit } {
  const state = createDuel({ heroMaxHp: 60, heroActs: [MIND, HIT, GUARD, SEALED], enemyMaxHp: 40, enemyActs: [MIND] });
  syncWatchKeys(state);
  return { state, hero: findUnit(state, 'MINE'), enemy: findUnit(state, 'FOE') };
}

describe('[M-UI-HUD]［数値書式］', () => {
  it('小数は第2位まで表示し、末尾の0を省略しない', () => {
    expect(formatCenti(100)).toBe('1.00');
    expect(formatCenti(5)).toBe('0.05');
    expect(formatCenti(-250)).toBe('−2.50');
  });

  it('無限は ∞ の1文字、使用回数は分数形', () => {
    expect(formatUses(INFINITE_USES, INFINITE_USES)).toBe(INFINITY_MARK);
    expect(formatUses(3, 10)).toBe('3 / 10');
  });

  it('ステップ数は 経過 / 基準 の分数形とし、残数を併記する', () => {
    expect(formatSteps(4, 10)).toBe('4 / 10（残6）');
  });

  it('補正率はパーセント表記、現在HPはクランプ後の値', () => {
    expect(formatPercent(33)).toBe('33%');
    expect(formatHp(-5, 60)).toBe('0 / 60');
  });

  it('符号は増加型がバフ+／デバフ−、減少型がバフ−／デバフ+', () => {
    expect(correctionSign('atk', 'BUFF')).toBe('+');
    expect(correctionSign('atk', 'DEBUFF')).toBe('−');
    expect(correctionSign('step_thought', 'BUFF')).toBe('−');
    expect(correctionSign('cost_pp', 'DEBUFF')).toBe('+');
  });
});

describe('[M-UI-SORT] アクション一覧の表示順序', () => {
  it('発動可能性ランク → 必要思考実効値 → 配列インデックスの順に並べる', () => {
    const { state, hero } = duel();
    hero.elapsed_thought = 20; // 心気は実行可能、武技・体勢はPPコスト不足
    hero.acts[3].seal_accum = 100; // 封印により構造的に発動不可
    // ランク0（心気）→ ランク2（体勢：必要思考0 → 武技：必要思考5）→ ランク3（封印）
    expect(sortedActions(state, hero).map((action) => action.master_ref)).toEqual(['MIND', 'GUARD', 'HIT', 'SEALED']);
    expect(activationRank(state, hero, hero.acts[1])).toBe(2); // PPコスト不足
    expect(activationRank(state, hero, hero.acts[3])).toBe(3);
  });

  it('コスト充足だが思考蓄積待ちはランク1', () => {
    const { state, hero } = duel();
    expect(activationRank(state, hero, hero.acts[0])).toBe(1);
  });
});

describe('[M-UI-HUD]［判定プレビュー］', () => {
  it('武技：射程内の対象ごとに命中の成否とHPダメージ見込みを示す', () => {
    const { state, hero, enemy } = duel();
    enemy.ap = 10;
    expect(previewOf(state, hero, hero.acts[1], NO_SUMMON_DEPS)).toEqual({
      kind: 'MARTIAL',
      targets: [{ unitId: enemy.unit_id, posIdx: 2, hit: true, damage: 9 }],
    });
    enemy.ap = 30;
    expect(previewOf(state, hero, hero.acts[1], NO_SUMMON_DEPS)).toMatchObject({ kind: 'MARTIAL', targets: [{ hit: false, damage: null }] });
  });

  it('体勢：展開AP実効値と発動後の防御力', () => {
    const { state, hero } = duel();
    expect(previewOf(state, hero, hero.acts[2], NO_SUMMON_DEPS)).toEqual({ kind: 'STANCE', deployAp: 30, defenseAfter: 60 });
  });

  it('心気：加算VP実効値と充填後のPP目標値、目標値が現在PPを上回らない場合はその旨', () => {
    const { state, hero } = duel();
    expect(previewOf(state, hero, hero.acts[0], NO_SUMMON_DEPS)).toEqual({ kind: 'MIND', gainVp: 2, targetPp: 2, raises: true });
    hero.pp = 5;
    expect(previewOf(state, hero, hero.acts[0], NO_SUMMON_DEPS)).toMatchObject({ raises: false });
  });

  it('中断が予測される場合は、その旨と中断が成立するステップ数を優先して提示する', () => {
    const STUN = martialAction('FOE_STUN', { atk: 10, dmg_hp: 100, stun: true, step_startup: 20, step_recovery: 5 });
    const state = createDuel({ heroMaxHp: 60, heroActs: [HIT], enemyMaxHp: 40, enemyActs: [STUN] });
    const hero = findUnit(state, 'MINE');
    hero.pp = 5;
    hero.elapsed_thought = 5;
    setStartup(findUnit(state, 'FOE'), 'FOE_STUN', 15); // 残り5で着弾し、主人公の発生10より早い
    expect(previewOf(state, hero, hero.acts[0], NO_SUMMON_DEPS)).toEqual({ kind: 'INTERRUPT', steps: 5 });
  });
});

describe('[M-UI-HUD] ビューモデル', () => {
  it('ユニットプレート・補正チップ・実行中カードを組み立てる', () => {
    const { state, hero } = duel();
    hero.slip = 150;
    hero.debuff.atk = 33;
    hero.buff.step_thought = 20;
    setRecovery(hero, 'GUARD', 20, 5);
    hero.ap = 30;
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    const plate = view.plates.find((candidate) => candidate.side === 'MINE')!;
    expect(plate).toMatchObject({ name: 'セイン', roleName: 'マスター', hp: '60 / 60', ap: 30 });
    expect(plate.chips).toEqual([
      { kind: 'SLIP', label: '被スリップ', value: '1.50', sign: '' },
      { kind: 'BUFF', label: '必要思考', value: '0.20', sign: '−' },
      { kind: 'DEBUFF', label: '攻撃力', value: '0.33', sign: '−' },
    ]);
    expect(plate.running).toMatchObject({ stateLabel: '硬直中', steps: '5 / 20（残15）', defense: 60 });
  });

  it('アクションカードは実効値・監視トグルの状態を持ち、既定値のコストを描画しない', () => {
    const { state, hero } = duel();
    hero.elapsed_thought = 20;
    state.watching[hero.acts[0].instance_id] = { ...allWatchFlags(false), READY: true };
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    const mind = view.cards.find((card) => card.name === 'MIND')!;
    expect(mind).toMatchObject({ rank: 0, executable: true, uses: '10 / 10', stepThought: 20, stepStartup: 10, stepRecovery: 5 });
    expect(mind.costs).toEqual([]); // コスト0は描画しない
    expect(mind.watch.find((toggle) => toggle.kind === 'READY')).toMatchObject({ on: true, status: 'MET', symbol: '可' });
    expect(mind.watch.find((toggle) => toggle.kind === 'HIT_FRONT')).toMatchObject({ on: false, status: 'NA' });
    const hit = view.cards.find((card) => card.name === 'HIT')!;
    expect(hit.costs).toEqual([{ label: 'PP', value: 2 }]);
    expect(hit).toMatchObject({ range: 1, atk: 20, seal: null });
  });

  it('タイムラインと停止事由を含み、指示可能かどうかを示す', () => {
    const state = createScene({
      sceneLevel: 3,
      heroMaxHp: 60,
      heroActionOrder: HERO_INIT_ACTIONS,
      enemyRecord: ENEMY_MASTERS.ENEMY_LEF,
      actionMasters: ACTION_MASTERS,
    });
    syncWatchKeys(state);
    state.pause_reason = { code: 'STEP0_READY', unit_id: null, instance_id: null, watch_kind: null, remaining_steps: null };
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(view.timeline.start).toBe(0);
    expect(view.timeline.lanes).toHaveLength(2);
    expect(view.pauseReason?.code).toBe('STEP0_READY');
    expect(view.instructable).toBe(false); // [V-NUM-OPENING] 開幕は実行可能手がない
    expect(view.cards.map((card) => card.name)).toHaveLength(5);
  });
});
