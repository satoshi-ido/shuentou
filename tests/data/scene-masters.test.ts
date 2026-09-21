// [A-DIFF-CONFIG] `expected_length` の正本値。基準は通常シーン600であり、例外は
// 1-01〜2-01（壁割りが主人公初期キットの重撃AR15 に限られる区間。[M-GUARD-BREAKER]）、
// ボス（2-04・3-06・4-08）、5-10、および AI 設定を持たない 5-11（Null）である。
// 本値は [V-TEST-NONFUNC] D-02 の決着上限（3.0倍）を決めるため、静かな変動を許さない。

import { describe, expect, it } from 'vitest';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import type { SceneMasterRecord } from '../../src/data/types.js';

const scenes: Readonly<Record<string, SceneMasterRecord>> = SCENE_MASTERS;

// 基準値以外を持つシーン（[A-DIFF-CONFIG] の表と※注記）。
const EXCEPTIONS: Readonly<Record<string, number | null>> = {
  SCENE_1_01: 800,
  SCENE_1_02: 1000,
  SCENE_2_01: 800,
  SCENE_2_04: 800,
  SCENE_3_06: 800,
  SCENE_4_08: 800,
  SCENE_5_10: 1200,
  SCENE_5_11: null,
};
const BASELINE = 600;

describe('[A-DIFF-CONFIG] expected_length', () => {
  it('例外シーンは表のとおりの値を持つ', () => {
    const actual = Object.fromEntries(
      Object.keys(EXCEPTIONS).map((sceneId) => [sceneId, scenes[sceneId]?.expected_length]),
    );
    expect(actual).toEqual(EXCEPTIONS);
  });

  it('例外以外の全シーンは基準値600である', () => {
    const offenders = Object.values(scenes)
      .filter((scene) => !(scene.scene_id in EXCEPTIONS))
      .filter((scene) => scene.expected_length !== BASELINE)
      .map((scene) => `${scene.scene_id}=${scene.expected_length}`);
    expect(offenders).toEqual([]);
  });
});
