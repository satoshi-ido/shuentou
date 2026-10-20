// [S-LOOK-LANTERN] 燈の描画。黒鉄の枠と雲母の窓、火皿の熾と燈火、火皿を囲む五つの受け口を描く。
// 受け口と芯の四つの状態は、色を抜いても見分けられるよう形で描き分ける（閉じた蓋・火の無い芯・細い火・縮れた黒）。

import type { LanternView } from '../view/lantern-view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 受け口の並び（中央から外へ）。魂の宿る芯・魂のない芯・空芯・閉じた受け口の順に割り当てる。
const SOCKET_X = [80, 67, 93, 54, 106];
const SOCKET_Y = 151; // 芯の根元
const CORE_HEIGHT = 18;

function svg(tag: string, attributes: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node as SVGElement;
}

// 燈火・芯の火の形。根元 (x, y) から高さ h、幅 w。
function flame(x: number, y: number, h: number, w: number): string {
  return `M${x} ${y - h} C ${x + w} ${y - h * 0.6} ${x + w} ${y - h * 0.2} ${x} ${y} C ${x - w} ${y - h * 0.2} ${x - w} ${y - h * 0.6} ${x} ${y - h} Z`;
}

type SocketState = 'SOUL' | 'EMPTY' | 'ASH' | 'CLOSED';

function socketStates(view: LanternView): SocketState[] {
  return [
    ...Array<SocketState>(view.souls).fill('SOUL'),
    ...Array<SocketState>(view.empty).fill('EMPTY'),
    ...Array<SocketState>(view.ash).fill('ASH'),
    ...Array<SocketState>(view.closed).fill('CLOSED'),
  ].slice(0, SOCKET_X.length);
}

// 芯の根元の煤（[S-LOOK-LANTERN]【煤の層】）。主のいない燈は乾いた鉄の色のまま（NONE）。
function soot(group: SVGElement, x: number, view: LanternView): void {
  if (view.soot === 'RINGS') {
    for (let i = 0; i < view.rings; i += 1) {
      group.append(svg('ellipse', { cx: x, cy: SOCKET_Y - 1 - i * 1.4, rx: 3.2, ry: 0.9, fill: 'none', stroke: '#050406', 'stroke-width': 0.8 }));
    }
  } else if (view.soot !== 'NONE') {
    const height = view.soot === 'COVERED' ? 5 : CORE_HEIGHT / 2;
    group.append(svg('rect', { x: x - 3, y: SOCKET_Y - height, width: 6, height, rx: 1.5, fill: '#060508' }));
  }
}

export function renderLantern(view: LanternView): SVGElement {
  const root = svg('svg', { class: 'im-lantern', viewBox: '0 0 160 200', 'aria-hidden': 'true' });
  const defs = svg('defs', {});
  const glow = svg('radialGradient', { id: 'lantern-glow' });
  glow.append(svg('stop', { offset: '0%', 'stop-color': 'rgba(255, 150, 60, 0.55)' }));
  glow.append(svg('stop', { offset: '100%', 'stop-color': 'rgba(255, 150, 60, 0)' }));
  defs.append(glow);
  root.append(defs);

  // 光の滲み・取っ手・笠・枠と雲母の窓・台座
  root.append(svg('circle', { cx: 80, cy: 120, r: 78, fill: 'url(#lantern-glow)' }));
  root.append(svg('circle', { cx: 80, cy: 16, r: 10, fill: 'none', stroke: '#5a5262', 'stroke-width': 3 }));
  root.append(svg('path', { d: 'M58 26 H102 L110 38 H50 Z', fill: '#1b1820', stroke: '#5a5262', 'stroke-width': 1.5 }));
  root.append(svg('rect', { x: 48, y: 38, width: 64, height: 128, fill: 'rgba(255, 176, 96, 0.07)', stroke: '#5a5262', 'stroke-width': 2.5 }));
  for (const x of [64, 96]) {
    root.append(svg('line', { x1: x, y1: 38, x2: x, y2: 166, stroke: '#3a3444', 'stroke-width': 1.5 }));
  }
  root.append(svg('rect', { x: 44, y: 166, width: 72, height: 12, fill: '#1b1820', stroke: '#5a5262', 'stroke-width': 1.5 }));

  // 火皿と熾
  root.append(svg('ellipse', { cx: 80, cy: 156, rx: 30, ry: 5, fill: '#24160f', stroke: '#5a3a28', 'stroke-width': 1 }));
  root.append(svg('ellipse', { cx: 80, cy: 155, rx: 15, ry: 2.6, fill: '#c2491d', opacity: 0.9 }));

  // 燈火（熾の上に立つ）
  root.append(svg('path', { d: flame(80, 150, 46, 13), fill: '#ff8a2b', opacity: 0.92 }));
  root.append(svg('path', { d: flame(80, 148, 28, 6), fill: '#ffd28a' }));

  // 受け口と芯
  socketStates(view).forEach((state, index) => {
    const x = SOCKET_X[index] ?? 80;
    const group = svg('g', { class: `lantern-socket socket-${state.toLowerCase()}` });
    group.append(svg('rect', { x: x - 4, y: SOCKET_Y, width: 8, height: 3, fill: '#3a3444' }));
    if (state === 'CLOSED') {
      group.append(svg('rect', { x: x - 5, y: SOCKET_Y - 3, width: 10, height: 3, rx: 1, fill: '#5a5262' }));
    } else if (state === 'ASH') {
      group.append(
        svg('polyline', {
          points: `${x},${SOCKET_Y} ${x - 2},${SOCKET_Y - 4} ${x + 2},${SOCKET_Y - 8} ${x - 1.5},${SOCKET_Y - 12} ${x + 1},${SOCKET_Y - 14}`,
          fill: 'none',
          stroke: '#0a080c',
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
        }),
      );
      soot(group, x, view);
    } else {
      group.append(svg('line', { x1: x, y1: SOCKET_Y, x2: x, y2: SOCKET_Y - CORE_HEIGHT, stroke: '#7a7282', 'stroke-width': 1.6 }));
      soot(group, x, view);
      if (state === 'SOUL') {
        // 燈火より細く長い火。火の色は芯ごとにわずかに異なる。
        group.append(svg('path', { d: flame(x, SOCKET_Y - CORE_HEIGHT, 20, 2.6), fill: `hsl(${24 + index * 9} 95% 62%)` }));
      }
    }
    root.append(group);
  });
  return root;
}
