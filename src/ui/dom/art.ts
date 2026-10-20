// [I-PLAN-ASSETS]【実体の投入】立ち絵の描画。実体があれば画像を、無ければプレースホルダの人形を描く。
// 実体の参照先は表示アセットマスタから引く（[M-DATA-ASSETMASTER]【差分の選択】）。引き方は入口（src/ui/main.ts）が与える。

import type { AssetOwnerKind } from '../../data/types.js';

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

// url が Null、または読み込めなかった場合はプレースホルダの人形に戻す。
export function figureNode(className: string, url: string | null): HTMLElement {
  if (url === null) {
    return placeholderFigure(className);
  }
  const image = document.createElement('img');
  image.className = `${className} figure-img`;
  image.alt = '';
  image.draggable = false;
  image.src = url;
  image.addEventListener('error', () => image.replaceWith(placeholderFigure(className)));
  return image;
}
