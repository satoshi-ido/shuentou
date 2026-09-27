// [V-TEST-REFAI]［体力の維持］攻撃型・防御型の最大HP加算への読み替えの判定。

import { describe, expect, it } from 'vitest';
import { needsHpRaise, ROLE_HP_STALE_INTERMISSIONS } from './runner.js';

// 4-08 を次に挑む時点（直前にクリアしたのは 4-07、hp_bonus_base 320）。
const before408 = (heroMaxHp: number) => ({ current_scene_id: 'SCENE_4_08', hero_max_hp: heroMaxHp });

describe('needsHpRaise', () => {
  it('最大HPが直前にクリアしたシーンの hp_bonus_base を下回るとき、攻撃型・防御型とも読み替える', () => {
    expect(needsHpRaise(before408(300), 'ATTACK', 0)).toBe(true);
    expect(needsHpRaise(before408(300), 'DEFENSE', 0)).toBe(true);
  });

  it('攻撃型に限り、最大HP加算の途絶が続くときも読み替える（[M-GUARD-LETHAL] の前提）', () => {
    // 最大HP572は hp_bonus_base 320 を上回るため、途絶の判定のみが働く。
    expect(needsHpRaise(before408(572), 'ATTACK', ROLE_HP_STALE_INTERMISSIONS)).toBe(true);
    expect(needsHpRaise(before408(572), 'ATTACK', ROLE_HP_STALE_INTERMISSIONS - 1)).toBe(false);
    expect(needsHpRaise(before408(572), 'DEFENSE', ROLE_HP_STALE_INTERMISSIONS)).toBe(false);
  });
});
