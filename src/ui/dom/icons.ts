// [I-PLAN-ASSETS] 系統アイコン。シンボル集合（src/ui/public/art/icons.svg）の1件を参照して描く。
// 表示アセットマスタの ICON（ASSET_ICON_*）の path が指すシンボルと同じものである。

import type { SystemIcon } from '../assets/placeholder.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPRITE = 'art/icons.svg';

const SYMBOL_ID: Readonly<Record<SystemIcon, string>> = {
  MIND: 'mind',
  MARTIAL: 'martial',
  STANCE: 'stance',
  SUMMON: 'summon',
  SWAP: 'swap',
};

export function systemIconNode(icon: SystemIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'sys-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${new URL(SPRITE, document.baseURI).href}#${SYMBOL_ID[icon]}`);
  svg.append(use);
  return svg;
}
