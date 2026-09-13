// [V-TEST-POSITIONS] T-04・T-05「自滅ポリシーの MATE_TH 判定」「確定勝利の証明がない自滅の抑止」。
// [M-PIPE-SUICIDE]「スリップ決済自滅の許容」により瞬動アクションは実行者自身の被スリップ量が
// 致死量でも実行を制限されないが、[A-EVAL-MATE]「自滅手への対処」により、確定勝利
// （score >= MATE_TH）を伴わない限り探索結果からは除外されるべきことを確認する。

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

// 瞬動（[M-PIPE-INSTANT]）：ヒットしても倒しきれない程度の火力しか持たず、実行者自身の
// 被スリップ量の決済のみが問題になる。
const RASH_STRIKE = martialAction('ACT_RASH', { atk: 1, dmg_hp: 1, step_startup: 0, step_recovery: 0 });
// 通常アクション（step_startup > 0）：着地までスリップ決済が発生しない安全な代替手。
const SAFE_STANCE = makeAction('ACT_SAFE', { deploy_ap: 1, step_startup: 5, step_recovery: 5 });

function findUnit(state: BattleState, side: 'MINE' | 'FOE'): Unit {
  const unit = state.units.find((u) => u !== null && u.side === side) ?? null;
  if (unit === null) {
    throw new Error(`ユニットが見つからない: ${side}`);
  }
  return unit;
}

describe('[V-TEST-POSITIONS] T-04/T-05 自滅ポリシー', () => {
  it('T-04: 致死量のスリップを抱えたまま瞬動を撃つと自滅するため、安全な手を選ぶ', () => {
    const state = createDuel({
      heroMaxHp: 100,
      heroActs: [makeAction('ACT_HERO_NOOP', { step_startup: 5 })],
      enemyMaxHp: 2,
      enemyActs: [RASH_STRIKE, SAFE_STANCE],
    });
    const enemy = findUnit(state, 'FOE');
    enemy.slip = 1000; // levelSlipDamage(1000, L=3) = 30 >> enemyMaxHp(2)。瞬動で即死する。

    const decision = decideAction(state, enemy, defaultProfile(), deps);

    if (decision.kind === 'ACT') {
      const chosen = enemy.acts.find((a) => a.instance_id === decision.instanceId);
      expect(chosen?.master_ref).not.toBe('ACT_RASH');
    }
  });

  it('T-05: 被スリップ量が無害なら、同じ瞬動を安全に選べる', () => {
    const state = createDuel({
      heroMaxHp: 100,
      heroActs: [makeAction('ACT_HERO_NOOP', { step_startup: 5 })],
      enemyMaxHp: 10,
      enemyActs: [RASH_STRIKE, SAFE_STANCE],
    });
    const enemy = findUnit(state, 'FOE');
    enemy.slip = 0;

    const decision = decideAction(state, enemy, defaultProfile(), deps);

    expect(decision.kind).toBe('ACT');
    if (decision.kind === 'ACT') {
      const chosen = enemy.acts.find((a) => a.instance_id === decision.instanceId);
      expect(chosen?.master_ref).toBe('ACT_RASH');
    }
  });
});
