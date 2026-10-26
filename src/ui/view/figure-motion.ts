// [M-UI-HUD]［立ち絵の動き］盤面の立ち絵の姿勢。発生中・硬直中の進捗を、位置と明るさと輪郭の光に写す。
// 立ち絵は1件の画のまま動かし、位置の変化は立ち絵の実体の1画素（論理解像度の2px）を単位とする。
// 表示に限る値であり、BattleState に含まれず、[M-CORE-DETERMINISM] の対象外である（同項［更新と決定論］）。

import type { Side } from '../../engine/types.js';
import type { RunningCardView } from './battle-view.js';

export const FIGURE_PIXEL = 2; // 立ち絵の実体の1画素（論理解像度の px）
export const LEAN_MAX = 3; // 発生中に身を引く最大の画素数（暫定値）
export const SINK_MAX = 3; // 硬直の始めに沈む画素数（暫定値）
export const SINK_BRIGHTNESS = 0.85; // 硬直の始めの明るさ（暫定値）
export const BOB = 1; // 思考中の上下動の画素数
export const BOB_PERIOD_MS = 1600; // 思考中の上下動の周期（暫定値）
export const LUNGE = 4; // 発動の踏み込みの画素数（暫定値）
export const LUNGE_MS = 200;
export const PUSH = 2; // 被弾で押される画素数（暫定値）
export const HIT_MS = 250;
export const FADE_MS = 500; // 消滅猶予の薄れ（暫定値）

export interface FigurePose {
  readonly dx: number; // 画素。正は右
  readonly dy: number; // 画素。正は下
  readonly glow: number; // 輪郭の光（0〜1）
  readonly brightness: number;
}

export const NEUTRAL_POSE: FigurePose = { dx: 0, dy: 0, glow: 0, brightness: 1 };

// 「向き」自軍は右、敵軍は左を向く。前へ踏み込む向きの符号。
export function facingOf(side: Side): 1 | -1 {
  return side === 'MINE' ? 1 : -1;
}

// 「進捗」経過 ÷ 基準を 0〜1 に収める。基準が0の区間は姿勢を作らない（Null）。
export function progressOf(elapsed: number, required: number): number | null {
  if (required <= 0) {
    return null;
  }
  return Math.min(Math.max(elapsed / required, 0), 1);
}

// 発生中・硬直中の姿勢。演出の簡略化では位置を変えず、光と明るさだけで進捗を示す。
export function poseOf(running: RunningCardView | null, side: Side, simplify: boolean): FigurePose {
  if (running === null) {
    return NEUTRAL_POSE;
  }
  const progress = progressOf(running.elapsed, running.required);
  if (progress === null) {
    return NEUTRAL_POSE;
  }
  if (running.phase === 'STARTUP') {
    const lean = simplify ? 0 : Math.round(progress * LEAN_MAX); // 「画素に揃える」
    return { dx: lean === 0 ? 0 : -facingOf(side) * lean, dy: 0, glow: progress, brightness: 1 };
  }
  const rest = 1 - progress;
  return {
    dx: 0,
    dy: simplify ? 0 : Math.round(rest * SINK_MAX),
    glow: 0,
    brightness: SINK_BRIGHTNESS + (1 - SINK_BRIGHTNESS) * progress,
  };
}
