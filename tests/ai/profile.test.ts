// [A-PROFILE-RESOLVE] [A-PROFILE-SCHEMA] 実効プロファイルの構築。

import { describe, expect, it } from 'vitest';
import { AI_PROFILE_MASTERS } from '../../src/data/generated/ai-profile-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { buildEffectiveProfile } from '../../src/ai/profile.js';

describe('[A-PROFILE-RESOLVE] 構築の手順', () => {
  it('1-01：敵マスタ→AIプロファイル→シーンマスタ→定跡の順に合成する', () => {
    const profile = buildEffectiveProfile({
      scene: SCENE_MASTERS.SCENE_1_01,
      enemy: ENEMY_MASTERS.ENEMY_LEF,
      profile: AI_PROFILE_MASTERS.PROFILE_FRENZY,
    });
    expect(profile).toEqual({
      profileId: 'PROFILE_FRENZY',
      weightMult: { impatience: 150, pp: 50 },
      actionBonus: { PASS: -800 },
      maxDepth: 3,
      nodeLimit: 3000,
      jointAction: false,
      deferredDecision: false,
      evalMask: ['board', 'survival', 'tempo'],
      inertiaSteps: 30,
      expectedLength: 600,
      bookId: 'B-01',
    });
  });

  it('1-02：強襲プロファイルとシーン固有値を写す', () => {
    const profile = buildEffectiveProfile({
      scene: SCENE_MASTERS.SCENE_1_02,
      enemy: ENEMY_MASTERS.ENEMY_DORN,
      profile: AI_PROFILE_MASTERS.PROFILE_ASSAULT,
    });
    expect(profile.profileId).toBe('PROFILE_ASSAULT');
    expect(profile.weightMult).toEqual({ position: 150, tempo: 150 });
    expect(profile.actionBonus).toEqual({ PASS: -600, RUSH: 600 });
    expect(profile.evalMask).toEqual(['board', 'position', 'survival', 'tempo']);
    expect(profile.bookId).toBe('B-02');
  });

  it('レコード側の参照を共有しない', () => {
    const profile = buildEffectiveProfile({
      scene: SCENE_MASTERS.SCENE_1_01,
      enemy: ENEMY_MASTERS.ENEMY_LEF,
      profile: AI_PROFILE_MASTERS.PROFILE_FRENZY,
    });
    expect(profile.weightMult).not.toBe(AI_PROFILE_MASTERS.PROFILE_FRENZY.weight_mult);
    expect(profile.actionBonus).not.toBe(AI_PROFILE_MASTERS.PROFILE_FRENZY.action_bonus);
  });

  it('敵マスタの参照先と一致しないプロファイルは棄却する', () => {
    expect(() =>
      buildEffectiveProfile({
        scene: SCENE_MASTERS.SCENE_1_01,
        enemy: ENEMY_MASTERS.ENEMY_LEF,
        profile: AI_PROFILE_MASTERS.PROFILE_ASSAULT,
      }),
    ).toThrow('一致しない');
  });
});
