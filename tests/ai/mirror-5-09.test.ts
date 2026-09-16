// [A-MIRROR-5-09] 鏡像プロファイル（5-09）。動的重みの生成と、定跡 B-06 の MIRROR_FIRST_SYSTEM 解決。

import { describe, expect, it } from 'vitest';
import { AI_PROFILE_MASTERS } from '../../src/data/generated/ai-profile-masters.js';
import { BOOK_MASTERS } from '../../src/data/generated/book-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { createMirrorStats } from '../../src/engine/mirror.js';
import { buildEffectiveProfile, mirrorWeightMult } from '../../src/ai/profile.js';
import { lookupBook } from '../../src/ai/book.js';
import { createDuel, findUnit, makeAction, martialAction } from './fixtures.js';
import type { MirrorStats } from '../../src/engine/run/state.js';

const MIRROR = { scene: SCENE_MASTERS.SCENE_5_09, enemy: ENEMY_MASTERS.ENEMY_MIRROR_SEIN, profile: AI_PROFILE_MASTERS.PROFILE_MIRROR };

function statsOf(martial: number, stance: number, mind: number, summon: number): MirrorStats {
  return { counts: [martial, stance, mind, summon], first_system: 'NONE' };
}

describe('[A-MIRROR-5-09]［動的重みの生成規則］', () => {
  it('total == 0 のとき全キーを ×1.00 とする', () => {
    expect(mirrorWeightMult(createMirrorStats())).toEqual({ survival: 100, position: 100, pp: 100, vp: 100, board: 100 });
  });

  it('値域は ×1.00〜×2.00 に収まる', () => {
    const only = mirrorWeightMult(statsOf(10, 0, 0, 0));
    expect(only.survival).toBe(200); // 全量が武技 → SCALE + SCALE = 2 × SCALE
    expect(only.position).toBe(100);
    expect(only.board).toBe(100);
  });

  it('心気は pp・vp の両キーに同一倍率を与える', () => {
    const even = mirrorWeightMult(statsOf(1, 1, 1, 1));
    expect(even.pp).toBe(even.vp);
    expect(even.pp).toBe(125); // SCALE + SCALE//4 = 1280 → centi 125
  });

  it('表に現れないキーは生成対象外であり、マスタ値（seal 2.5）が保存される', () => {
    const profile = buildEffectiveProfile({ ...MIRROR, mirrorStats: statsOf(3, 1, 0, 0) });
    expect(profile.weightMult.seal).toBe(250);
    expect(profile.weightMult.survival).toBe(175); // SCALE + 3×SCALE//4 = 1792 → 175
    expect(profile.weightMult.position).toBe(125);
    expect(profile.weightMult.pp).toBe(100);
  });

  it('動的重みを持つプロファイルに鏡像統計がなければオーサリングエラーとする', () => {
    expect(() => buildEffectiveProfile({ ...MIRROR, mirrorStats: null })).toThrow('鏡像統計');
  });
});

describe('[A-BOOK-SCHEMA]［テンプレートとレコードの関係］B-06 の解決辞書', () => {
  it('各系統について ar_mult が最大の行に対応するクラスIDを保持する', () => {
    const step = BOOK_MASTERS['B-06'].steps[0];
    expect(step.kind).toBe('DYNAMIC');
    expect(step.resolver).toBe('MIRROR_FIRST_SYSTEM');
    expect(step.resolved_by_system).toEqual({
      NONE: null,
      // [M-TMPL-ENEMY-MIRROR] 心気は基本・無想とも ar_mult 1.0 で並ぶため配列インデックス昇順の最初。
      MIND: 'ACT_MIND_AR67',
      // 武技（重撃）AR ≒ L * 5.0 が最大倍率（主人公 ACT_HEAVY_AR15 に対応）。
      MARTIAL: 'ACT_HEAVY_AR335',
      STANCE: 'ACT_GUARD_AR134',
      SUMMON: 'ACT_SUMMON_AR67',
    });
  });

  it('辞書が指すクラスIDはいずれも 5-09 の所持アクション配列に存在する', () => {
    const dictionary = BOOK_MASTERS['B-06'].steps[0].resolved_by_system ?? {};
    for (const [system, classId] of Object.entries(dictionary)) {
      if (classId === null) {
        expect(system).toBe('NONE');
        continue;
      }
      expect(ENEMY_MASTERS.ENEMY_MIRROR_SEIN.acts).toContain(classId);
    }
  });
});

describe('[A-BOOK-SEMANTICS]［MIRROR_FIRST_SYSTEM リゾルバ］実行時の解決', () => {
  const MIND = makeAction('FOE_MIND', { gain_vp: 3, charge_pp: 100, step_thought: 20, step_startup: 5, step_recovery: 5 });
  const HIT = martialAction('FOE_HIT', { atk: 10, dmg_hp: 300, step_startup: 5, step_recovery: 5 });

  function dynamicBook(dictionary: Record<string, string | null>) {
    return {
      book_id: 'B-06',
      steps: [{ kind: 'DYNAMIC' as const, class_id: null, resolver: 'MIRROR_FIRST_SYSTEM' as const, resolved_by_system: dictionary, can_wait: true }],
    };
  }

  function duel() {
    const state = createDuel({ heroMaxHp: 60, heroActs: [MIND], enemyMaxHp: 60, enemyActs: [MIND, HIT] });
    return { state, enemy: findUnit(state, 'FOE') };
  }

  it('first_system が NONE のときは BOOK_MISS を返し、定跡を破棄しない', () => {
    const { state, enemy } = duel();
    expect(state.mirror_snapshot).toBeNull();
    const result = lookupBook(state, enemy, dynamicBook({ NONE: null, MARTIAL: 'FOE_HIT' }));
    expect(result.kind).toBe('BOOK_MISS');
    expect(result.progress.book_aborted).toBe(false);
  });

  it('スナップショットの first_system を鍵として辞書を引き、成立する手を返す', () => {
    const { state, enemy } = duel();
    state.mirror_snapshot = { counts: [1, 0, 0, 0], first_system: 'MARTIAL' };
    enemy.elapsed_thought = 99;
    const result = lookupBook(state, enemy, dynamicBook({ NONE: null, MARTIAL: 'FOE_HIT' }));
    expect(result.kind).toBe('MOVE');
    expect(result.progress.book_index).toBe(1);
  });

  it('得たクラスIDを所持していない場合は BOOK_MISS を返し book_aborted を True にする', () => {
    const { state, enemy } = duel();
    state.mirror_snapshot = { counts: [0, 1, 0, 0], first_system: 'STANCE' };
    const result = lookupBook(state, enemy, dynamicBook({ NONE: null, STANCE: 'FOE_ABSENT' }));
    expect(result.kind).toBe('BOOK_MISS');
    expect(result.progress.book_aborted).toBe(true);
  });
});
