// [I-PLAN-ASSETS]【実体の投入】立ち絵の描画。実体があれば画像を、無ければプレースホルダの人形を描く。
// 実体の参照先は表示アセットマスタから引く（[M-DATA-ASSETMASTER]【差分の選択】）。引き方は入口（src/ui/main.ts）が与える。

import type { AssetOwnerKind } from '../../data/types.js';
import { STANDING_HEIGHTS } from '../assets/art-manifest.js';

export type FigureLookup = (ownerKind: AssetOwnerKind, ownerId: string | null) => string | null;

let lookup: FigureLookup = () => null;

// 入口が、セッションの状態（差分の条件式）に応じた引き方を設ける。
export function setFigureLookup(next: FigureLookup): void {
  lookup = next;
}

export function figureUrl(ownerKind: AssetOwnerKind, ownerId: string | null): string | null {
  return lookup(ownerKind, ownerId);
}

function placeholderFigure(className: string): HTMLElement {
  const node = document.createElement('div');
  node.className = className;
  const head = document.createElement('div');
  head.className = 'head';
  const body = document.createElement('div');
  body.className = 'body';
  node.append(head, body);
  return node;
}

// 立ち絵の画像の参照先と高さ（ドット）を与える。
export function setFigureSource(image: HTMLImageElement, url: string): void {
  image.src = url;
  const dots = STANDING_HEIGHTS[url.split('#')[0] ?? ''];
  if (dots === undefined) {
    image.style.removeProperty('--figure-dots');
  } else {
    image.style.setProperty('--figure-dots', String(dots));
  }
}

// url が Null、または読み込めなかった場合はプレースホルダの人形に戻す。立ち絵の高さ（ドット）を --figure-dots に与え、
// 盤面は高さに比例して描く（96 ドットを越える構えの画も、元の立ち絵と同じ倍率で描く。style.css）。
export function figureNode(className: string, url: string | null): HTMLElement {
  if (url === null) {
    return placeholderFigure(className);
  }
  const image = document.createElement('img');
  image.className = `${className} figure-img`;
  image.alt = '';
  image.draggable = false;
  setFigureSource(image, url);
  image.addEventListener('error', () => image.replaceWith(placeholderFigure(className)));
  return image;
}
