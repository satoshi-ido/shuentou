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
import { buildBattleView, focusPreview, type UnitNaming } from '../../src/ui/view/battle-view.js';
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
      atk: 20,
      targets: [{ unitId: enemy.unit_id, posIdx: 2, hit: true, damage: 9, defense: 10, hpBefore: 40, hpAfter: 31 }],
    });
    enemy.ap = 30;
    expect(previewOf(state, hero, hero.acts[1], NO_SUMMON_DEPS)).toMatchObject({ kind: 'MARTIAL', targets: [{ hit: false, damage: null }] });
  });

  it('体勢：展開AP実効値と発動後の防御力', () => {
    const { state, hero } = duel();
    expect(previewOf(state, hero, hero.acts[2], NO_SUMMON_DEPS)).toEqual({
      kind: 'STANCE',
      deployAp: 30,
      efficiencyCenti: 200,
      defenseAfter: 60,
    });
  });

  it('心気：加算VP実効値と充填後のPP目標値、目標値が現在PPを上回らない場合はその旨', () => {
    const { state, hero } = duel();
    expect(previewOf(state, hero, hero.acts[0], NO_SUMMON_DEPS)).toEqual({
      kind: 'MIND',
      gainVp: 2,
      vpBefore: 0,
      targetPp: 2,
      ppBefore: 0,
      chargeCenti: 100,
      raises: true,
    });
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
    expect(hit.costs).toEqual([{ label: 'PP', value: 2, short: true }]); // PP0 では払えない
    hero.pp = 2;
    const afforded = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(afforded.cards.find((card) => card.name === 'HIT')!.costs).toEqual([{ label: 'PP', value: 2, short: false }]);
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

describe('[M-FIELD-GRID] 盤面カラムのビューモデル', () => {
  it('4マスを並べ、空きマスはプレートもアクションも持たない', () => {
    const { state } = duel();
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(view.columns.map((column) => column.posIdx)).toEqual([0, 1, 2, 3]);
    expect(view.columns[0]).toMatchObject({ plate: null, cards: [] });
    expect(view.columns[3]).toMatchObject({ plate: null, cards: [] });
    expect(view.columns[1].plate?.side).toBe('MINE');
    expect(view.columns[2].plate?.side).toBe('FOE');
    expect(view.cards).toEqual(view.columns[1].cards); // 注目自軍ユニットの一覧は当該マスの一覧と同一
  });

  it('敵軍のカードは提示のみで、監視トグルも確定の対象も持たない', () => {
    const { state } = duel();
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    const foe = view.columns[2].cards;
    expect(foe.length).toBeGreaterThan(0);
    expect(foe.every((card) => card.watch.length === 0)).toBe(true);
    expect(foe.every((card) => !card.executable)).toBe(true);
    expect(view.columns[1].cards.every((card) => card.watch.length === 5)).toBe(true);
  });

  it('実行中カードは経過・基準ステップ数を持ち、思考中は蓄積の充足率を示す', () => {
    const { state, hero } = duel();
    hero.elapsed_thought = 5;
    const waiting = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(waiting.columns[1].plate).toMatchObject({ thought: 5, running: null });
    expect(waiting.columns[1].cards.find((card) => card.name === 'MIND')?.thoughtProgress).toBe(25); // 5 / 20
    setStartup(hero, 'HIT', 4);
    const acting = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(acting.columns[1].plate?.running).toMatchObject({ phase: 'STARTUP', elapsed: 4, required: 10, stateLabel: '発生中' });
    expect(acting.columns[1].cards.find((card) => card.name === 'HIT')?.running).toBe(true);
  });
});

describe('[M-UI-HUD]［判定プレビュー］注目中のアクションへの問い合わせ', () => {
  it('実行可能な自軍アクションの見込みをインスタンスIDから引ける', () => {
    const { state, hero } = duel();
    hero.pp = 5;
    hero.elapsed_thought = 5;
    const hit = hero.acts.find((action) => action.master_ref === 'HIT')!;
    expect(focusPreview(state, hit.instance_id, NO_SUMMON_DEPS, naming).preview).toEqual(previewOf(state, hero, hit, NO_SUMMON_DEPS));
  });

  it('実行できないアクションと敵軍の手札は見込みを提示しない', () => {
    const { state, hero, enemy } = duel();
    hero.elapsed_thought = 5; // PP不足のまま（HIT の実効消費PPは2）
    const hit = hero.acts.find((action) => action.master_ref === 'HIT')!;
    expect(focusPreview(state, hit.instance_id, NO_SUMMON_DEPS, naming)).toMatchObject({ preview: null, stamps: [], deltas: [], timeline: null });
    const mind = hero.acts[0]; // 思考蓄積待ち（必要思考20）
    expect(focusPreview(state, mind.instance_id, NO_SUMMON_DEPS, naming)).toMatchObject({ preview: null, stamps: [], timeline: null });
    // 敵軍の手札は理由も示さない。
    expect(focusPreview(state, enemy.acts[0].instance_id, NO_SUMMON_DEPS, naming)).toEqual({
      preview: null,
      stamps: [],
      deltas: [],
      timeline: null,
      lock: null,
    });
    expect(focusPreview(state, 'ACT_MISSING', NO_SUMMON_DEPS, naming)).toEqual({
      preview: null,
      stamps: [],
      deltas: [],
      timeline: null,
      lock: null,
    });
  });

  it('自軍の実行できないアクションは、実行できない理由を示す', () => {
    const { state, hero } = duel();
    hero.elapsed_thought = 5;
    const hit = hero.acts.find((action) => action.master_ref === 'HIT')!; // 必要思考5・消費PP2
    expect(focusPreview(state, hit.instance_id, NO_SUMMON_DEPS, naming).lock?.reasons).toEqual([
      { kind: 'COST', label: 'PP', need: 2, have: 0, strict: false },
    ]);
    const mind = hero.acts[0]; // 必要思考20
    expect(focusPreview(state, mind.instance_id, NO_SUMMON_DEPS, naming).lock?.reasons).toEqual([
      { kind: 'THOUGHT', elapsed: 5, required: 20 },
    ]);
    const sealed = hero.acts.find((action) => action.master_ref === 'SEALED')!;
    sealed.seal_accum = 100;
    sealed.uses_left = 0;
    expect(focusPreview(state, sealed.instance_id, NO_SUMMON_DEPS, naming).lock?.reasons).toEqual([
      { kind: 'NO_USES' },
      { kind: 'SEALED', seal: '1.00' },
    ]);
    setStartup(hero, 'HIT', 1); // 実行中のユニットは、どの手も実行できない
    expect(focusPreview(state, mind.instance_id, NO_SUMMON_DEPS, naming).lock?.reasons[0]).toEqual({
      kind: 'RUNNING',
      stateLabel: '発生中',
    });
  });

  it('実行中（発生中）のアクションは自軍・敵軍いずれも提示する', () => {
    const { state, hero, enemy } = duel();
    setStartup(hero, 'HIT', 4);
    const hit = hero.acts.find((action) => action.master_ref === 'HIT')!;
    expect(focusPreview(state, hit.instance_id, NO_SUMMON_DEPS, naming).stamps).toMatchObject([{ kind: 'HIT', running: true }]);
    setStartup(enemy, 'MIND', 2);
    const foeMind = enemy.acts[0];
    expect(focusPreview(state, foeMind.instance_id, NO_SUMMON_DEPS, naming).preview).toEqual(
      previewOf(state, enemy, foeMind, NO_SUMMON_DEPS),
    );
  });

  it('武技は注目した時点の仮定として、対象マスへの着弾予測を伴う', () => {
    const { state, hero } = duel();
    hero.pp = 5;
    hero.elapsed_thought = 20; // いずれの手も実行可能な局面
    const hit = hero.acts.find((action) => action.master_ref === 'HIT')!;
    // 発生10の武技。命中見込みと、発動ステップ・HPの推移を対象マスに示す。
    expect(focusPreview(state, hit.instance_id, NO_SUMMON_DEPS, naming).stamps).toEqual([
      {
        unitId: hero.unit_id,
        side: 'MINE',
        posIdx: 2,
        kind: 'HIT',
        running: false,
        actionName: 'HIT',
        atk: 20,
        defense: 0,
        damage: 9,
        hpBefore: 40,
        hpAfter: 31,
        fireStep: 10,
      },
    ]);
    // 心気のように対象を持たない系統は着弾予測を持たない。
    expect(focusPreview(state, hero.acts[0].instance_id, NO_SUMMON_DEPS, naming).stamps).toEqual([]);
  });
});

describe('[M-UI-HUD]［判定プレビュー］発生中アクションの着弾予測', () => {
  it('発生中のユニットの見込みは、選択や注目によらず常に戦域へ示される', () => {
    const { state, hero } = duel();
    setStartup(hero, 'HIT', 4); // 発生10のうち4経過、残6で着弾
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(view.stamps).toEqual([
      {
        unitId: hero.unit_id,
        side: 'MINE',
        posIdx: 2,
        kind: 'HIT',
        running: true,
        actionName: 'HIT',
        atk: 20,
        defense: 0,
        damage: 9,
        hpBefore: 40,
        hpAfter: 31,
        fireStep: 6,
      },
    ]);
  });

  it('攻撃力が防御力に満たない場合は回避として示す', () => {
    const { state, hero, enemy } = duel();
    enemy.ap = 40; // 防御力 40 > 攻撃力 20
    setStartup(hero, 'HIT', 0);
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(view.stamps).toMatchObject([{ posIdx: 2, kind: 'MISS', atk: 20, defense: 40, damage: 0 }]);
  });

  it('思考中・硬直中のユニットは着弾予測を持たない', () => {
    const { state, hero } = duel();
    expect(buildBattleView({ state, deps: NO_SUMMON_DEPS, naming }).stamps).toEqual([]);
    setRecovery(hero, 'HIT', 10, 2);
    expect(buildBattleView({ state, deps: NO_SUMMON_DEPS, naming }).stamps).toEqual([]);
  });
});

describe('[M-UI-HUD]［判定プレビュー］ユニットプレートへの反映', () => {
  it('通常アクションは指示確定で確定する消費のみを映し、発動時の効果は映さない', () => {
    const { state, hero } = duel();
    hero.pp = 5;
    hero.elapsed_thought = 5;
    const hit = hero.acts.find((action) => action.master_ref === 'HIT')!; // 発生10の武技
    const focus = focusPreview(state, hit.instance_id, NO_SUMMON_DEPS, naming);
    // 実効消費PP2はこの時点で支払う。着弾は発動時のため、対象側の見込みは持たない。
    expect(focus.deltas).toEqual([{ unitId: hero.unit_id, tone: 'SELF', hp: null, vp: null, pp: 3, ap: null }]);
  });

  it('即時型アクションは発動時の効果まで映す', () => {
    const INSTANT_MIND = makeAction('INSTANT_MIND', { gain_vp: 2, charge_pp: 100, step_thought: 0, step_startup: 0, step_recovery: 5 });
    const state = createDuel({ heroMaxHp: 60, heroActs: [INSTANT_MIND], enemyMaxHp: 40, enemyActs: [MIND] });
    syncWatchKeys(state);
    const hero = findUnit(state, 'MINE');
    expect(focusPreview(state, hero.acts[0].instance_id, NO_SUMMON_DEPS, naming).deltas).toEqual([
      { unitId: hero.unit_id, tone: 'SELF', hp: null, vp: 2, pp: 2, ap: null },
    ]);
  });

  it('発生中の通常アクションは、着弾の見込みをプレートへ映さない（戦域の着弾予測で示す）', () => {
    const { state, hero } = duel();
    setStartup(hero, 'HIT', 4);
    const view = buildBattleView({ state, deps: NO_SUMMON_DEPS, naming });
    expect(view.previewDeltas).toEqual([]);
    expect(view.stamps).toMatchObject([{ kind: 'HIT', hpAfter: 31 }]);
  });
});

describe('[M-UI-HUD]［実効消費コスト］不足しているリソースの提示', () => {
  // 最大HP30・消費PP3のアクション1枚だけを持つ局面を、消費HPと所持PPを変えて組む。
  const costsWith = (costHp: number, pp: number) => {
    const state = createDuel({
      heroMaxHp: 30,
      heroActs: [makeAction('COST', { cost_hp: costHp, cost_pp: 3, step_startup: 5 })],
      enemyMaxHp: 40,
      enemyActs: [MIND],
    });
    syncWatchKeys(state);
    findUnit(state, 'MINE').pp = pp;
    return buildBattleView({ state, deps: NO_SUMMON_DEPS, naming }).cards[0].costs;
  };

  it('リソースごとに払えるかどうかを示す（HPは支払い後に残る必要がある）', () => {
    // HP30 に対し消費HP30：支払うと0になるため払えない（[M-PIPE-SUICIDE]）。PPは同値まで払える。
    expect(costsWith(30, 3)).toEqual([
      { label: 'HP', value: 30, short: true },
      { label: 'PP', value: 3, short: false },
    ]);
    expect(costsWith(29, 2)).toEqual([
      { label: 'HP', value: 29, short: false },
      { label: 'PP', value: 3, short: true },
    ]);
  });
});
