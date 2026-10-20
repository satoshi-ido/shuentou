// [M-REWIND-UNDO]【提示】アンドゥの適用時に、時が逆へ流れるさまを短く示す。ゲームステートは即時に復元済みであり、
// ここで行うのは見た目のみである。画面を組み直すと提示は打ち切られる（要素ごと入れ替わるため）。

import type { Timeline, TimelineSegment } from '../../engine/timeline.js';
import type { PlateView } from '../view/battle-view.js';

export const UNDO_MOTION_MS = 400; // 提示の長さ（暫定値）
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

// アンドゥの直前の姿。タイムラインとユニットプレートの値を、復元後の姿へ動かす起点とする。
export interface UndoMotion {
  readonly timeline: Timeline;
  readonly plates: readonly PlateView[];
}

// 【タイムラインの巻き戻し】戻ったステップ数 Δ。表示枠の幅で打ち切る。
export function rewoundSteps(from: Timeline, to: Timeline, span: number): number {
  return Math.min(Math.max(from.start - to.start, 0), span);
}

const sameSegment = (left: TimelineSegment, right: TimelineSegment): boolean =>
  left.kind === right.kind && left.start === right.start && left.length === right.length && left.instanceId === right.instanceId;

// 【取り消された区間】適用前のレーンにあり、復元後のレーンに無い区間。
export function vanishedSegments(from: Timeline, to: Timeline, unitId: string): TimelineSegment[] {
  const before = from.lanes.find((lane) => lane.unitId === unitId)?.segments ?? [];
  const after = to.lanes.find((lane) => lane.unitId === unitId)?.segments ?? [];
  return before.filter((segment) => !after.some((candidate) => sameSegment(segment, candidate)));
}

// 【値の巻き戻し】経過の割合 t（0〜1）における、数え戻しの途中の値。
export function countedValue(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * Math.min(Math.max(t, 0), 1));
}

// 要素を動かす。描画環境が Web Animations を持たない場合（検査環境など）は動かさない。
export function slide(node: HTMLElement, keyframes: Keyframe[], onFinish?: () => void): void {
  if (typeof node.animate !== 'function') {
    onFinish?.();
    return;
  }
  const animation = node.animate(keyframes, { duration: UNDO_MOTION_MS, easing: EASING, fill: 'backwards' });
  if (onFinish !== undefined) {
    animation.onfinish = onFinish;
  }
}

// 数値を適用前の値から復元後の値へ数え戻す。format は値から表示する文字列を作る。
export function countBack(node: HTMLElement, from: number, to: number, format: (value: number) => string): void {
  if (from === to || typeof window.requestAnimationFrame !== 'function') {
    return;
  }
  node.classList.add('undo-changed');
  let origin: number | null = null;
  const tick = (now: number): void => {
    origin ??= now;
    const t = (now - origin) / UNDO_MOTION_MS;
    node.textContent = format(countedValue(from, to, t));
    if (t < 1) {
      window.requestAnimationFrame(tick);
    }
  };
  node.textContent = format(from);
  window.requestAnimationFrame(tick);
}
