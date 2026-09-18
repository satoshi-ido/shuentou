// [V-TEST-REFAI]［供犠の実行］対象の選択と判定。
import { describe, expect, it } from 'vitest';
import { BONUS_REFAI_STANCE } from '../../src/ai/constants.js';
import { referenceProfile } from '../../src/ai/profile.js';
import { needsBossSacrifice, needsSacrifice, sacrificeTarget } from './runner.js';

const party = (...ids: readonly string[]) => ({ party: ids.map((attendant_id) => ({ attendant_id })) });

describe('[V-TEST-REFAI]［供犠の実行］対象の選択', () => {
  it('従者01（リナ）以外を従者ID降順に並べた先頭を選ぶ', () => {
    expect(sacrificeTarget(party('ATTENDANT_01', 'ATTENDANT_02', 'ATTENDANT_04'))).toBe('ATTENDANT_04');
    expect(sacrificeTarget(party('ATTENDANT_04', 'ATTENDANT_02'))).toBe('ATTENDANT_04');
  });

  it('従者01のみのときは供犠しない', () => {
    expect(sacrificeTarget(party('ATTENDANT_01'))).toBeNull();
    expect(sacrificeTarget(party())).toBeNull();
  });
});

describe('[V-TEST-REFAI]［供犠の実行］判定', () => {
  it('現在HP × 8 < 最大HP のとき供犠する', () => {
    expect(needsSacrifice({ hero_hp: 35, hero_max_hp: 284 })).toBe(true); // 3-05 クリア後の実測値
    expect(needsSacrifice({ hero_hp: 7, hero_max_hp: 284 })).toBe(true); // 3-04 クリア後の実測値
  });

  it('閾値以上のときは供犠しない', () => {
    expect(needsSacrifice({ hero_hp: 45, hero_max_hp: 284 })).toBe(false); // 1/4 で誤って発動した水準
    expect(needsSacrifice({ hero_hp: 284, hero_max_hp: 284 })).toBe(false);
  });
});

describe('[V-TEST-REFAI]［供犠の実行］「ボス前の供犠」', () => {
  it('次に挑むシーンがアクトの最終シーンであり、満タンでないとき供犠する', () => {
    // 2-04・3-06 はそれぞれアクト2・3の最終シーンである（[A-DIFF-CONFIG]）。
    expect(needsBossSacrifice({ current_scene_id: 'SCENE_2_04', hero_hp: 92, hero_max_hp: 284 })).toBe(true);
    expect(needsBossSacrifice({ current_scene_id: 'SCENE_3_06', hero_hp: 163, hero_max_hp: 284 })).toBe(true);
  });

  it('満タンのとき、およびアクト最終シーン以外のときは供犠しない', () => {
    expect(needsBossSacrifice({ current_scene_id: 'SCENE_3_06', hero_hp: 284, hero_max_hp: 284 })).toBe(false);
    expect(needsBossSacrifice({ current_scene_id: 'SCENE_3_05', hero_hp: 163, hero_max_hp: 284 })).toBe(false);
    expect(needsBossSacrifice({ current_scene_id: 'SCENE_2_03', hero_hp: 92, hero_max_hp: 284 })).toBe(false);
  });
});

describe('[V-TEST-REFAI]「体勢への減点」', () => {
  it('参照プレイヤーAIのアクション種別ボーナスに STANCE = −1000 を与える', () => {
    expect(BONUS_REFAI_STANCE).toBe(-1000);
    expect(referenceProfile().actionBonus).toEqual({ STANCE: BONUS_REFAI_STANCE });
  });
});
