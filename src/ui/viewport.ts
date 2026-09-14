// [M-UI-VIEWPORT] 論理解像度 1280×720 の固定レイアウトを表示領域へ等倍拡縮して収める。
// 拡縮比は整数に限らず、表示領域が論理解像度を下回る場合も縮小して全体を収める。

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

export interface ViewportFit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function fitViewport(areaWidth: number, areaHeight: number): ViewportFit {
  const scale = Math.max(Math.min(areaWidth / LOGICAL_WIDTH, areaHeight / LOGICAL_HEIGHT), 0);
  return {
    scale,
    offsetX: (areaWidth - LOGICAL_WIDTH * scale) / 2,
    offsetY: (areaHeight - LOGICAL_HEIGHT * scale) / 2,
  };
}

export function applyViewport(stage: HTMLElement, areaWidth: number, areaHeight: number): void {
  const { scale, offsetX, offsetY } = fitViewport(areaWidth, areaHeight);
  stage.style.width = `${LOGICAL_WIDTH}px`;
  stage.style.height = `${LOGICAL_HEIGHT}px`;
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}
