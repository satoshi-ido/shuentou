// [V-TEST-POSITIONS] T-02・T-03「命中不能な技を火力0と扱えているか」「閾値を1でも超えれば
// 火力計上するか」。[M-RESOLVE-MARTIAL]#3 の命中判定（実効攻撃力 >= 対象の防御力）が、
// [A-EVAL-TTK] の除外条件と decide_action の手選択に正しく反映されることを検証する。

import { describe, expect, it } from 'vitest';
import type { StepDeps } from '../../src/engine/pipeline/step.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { defaultProfile } from '../../src/ai/profile.js';
import { decideAction } from '../../src/ai/search.js';
import { createDuel, martialAction, makeAction } from './fixtures.js';

const deps: StepDeps = {
  createCreature: () => {
    throw new Error('この局面では召喚は発生しない');
  },
};

// 瞬動（step_startup=0・step_recovery=0）で構成し、[M-PIPE-INSTANT] により適用直後に
// 命中判定・HP決済まで完了させる。これにより1手の適用結果を即時に観測できる。
const MIND_ACTION = makeAction('ACT_MIND', { gain_vp: 1, step_startup: 0, step_recovery: 0 });
// 主人公側にも武技を持たせる（[A-EVAL-TTK] の TTK(主→敵) が敵の現在HPへ実際に依存するようにする）。
// フルサイクルが0だと連射のコストが常に0になり必要ヒット数の差が消えるため、必要思考を持たせる。
const HERO_MARTIAL = martialAction('ACT_HERO_HIT', { atk: 1, dmg_hp: 100, step_thought: 10, step_startup: 0, step_recovery: 0 });

function findUnit(state: BattleState, side: 'MINE' | 'FOE'): Unit {
  const unit = state.units.find((u) => u !== null && u.side === side) ?? null;
  if (unit === null) {
    throw new Error(`ユニットが見つからない: ${side}`);
  }
  return unit;
}

describe('[V-TEST-POSITIONS] T-02/T-03 命中閾値', () => {
  it('T-02: 実効攻撃力39 < 防御力40 の技は選ばれない（火力0として無視される）', () => {
    // 空振りする技であることに加え cost_hp=1 を持たせ、無意味な消耗であることを生存項の
    // 差として観測可能にする（[A-EVAL-TTK]の有効HPは対象マスターの現在HPを直接参照する）。
    const weak = martialAction('ACT_WEAK', { atk: 39, dmg_hp: 500, step_startup: 0, step_recovery: 0, cost_hp: 1 });
    const state = createDuel({
      heroMaxHp: 5,
      heroActs: [MIND_ACTION, HERO_MARTIAL],
      enemyMaxHp: 10,
      enemyActs: [weak, MIND_ACTION],
    });
    const hero = findUnit(state, 'MINE');
    hero.ap = 40; // 防御力40（思考中・非実行中は防御効率1.00）

    const enemy = findUnit(state, 'FOE');
    const decision = decideAction(state, enemy, defaultProfile(), deps);

    if (decision.kind === 'ACT') {
      const chosen = enemy.acts.find((a) => a.instance_id === decision.instanceId);
      expect(chosen?.master_ref).not.toBe('ACT_WEAK');
    }
  });

  it('T-03: 実効攻撃力41 >= 防御力40 の技は火力が計上され、勝利手として選ばれる', () => {
    const strong = martialAction('ACT_STRONG', { atk: 41, dmg_hp: 500, step_startup: 0, step_recovery: 0 });
    const state = createDuel({
      heroMaxHp: 5,
      heroActs: [MIND_ACTION, HERO_MARTIAL],
      enemyMaxHp: 10,
      enemyActs: [strong, MIND_ACTION],
    });
    const hero = findUnit(state, 'MINE');
    hero.ap = 40;

    const enemy = findUnit(state, 'FOE');
    const decision = decideAction(state, enemy, defaultProfile(), deps);

    expect(decision.kind).toBe('ACT');
    if (decision.kind === 'ACT') {
      const chosen = enemy.acts.find((a) => a.instance_id === decision.instanceId);
      expect(chosen?.master_ref).toBe('ACT_STRONG');
    }
  });
});
