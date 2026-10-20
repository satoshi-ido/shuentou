// [M-UI-SCRIPT] 脚本の提示の描画。暗くした背景の中央に本文を行ごとに積む。下部の文字窓と立ち絵を用いない。

import type { ScriptView } from '../script-player.js';

export interface ScriptHandlers {
  readonly onAdvance: () => void; // 左クリック（[M-UI-VIEWPORT]【入力装置】）
  readonly onSkip: () => void;
}

// [M-UI-SCRIPT]【燈の中の声】台詞の話者名の代わりに置く燈の印。
const LANTERN_MARK = '🜂';

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

// 背景（[S-SCRIPT-SCHEMA]「背景」）。実体の無い間は色相によるプレースホルダ（[I-PLAN-ASSETS]）を描き、
// 実体があれば画像を重ねる。
export interface ScriptBackdrop {
  readonly hue: number;
  readonly url: string | null;
}

export function renderScriptScreen(view: ScriptView, backdrop: ScriptBackdrop, handlers: ScriptHandlers): HTMLElement {
  const root = element('div', `script-screen${view.lantern ? ' lantern' : ''}${view.fadeIn ? ' fade-in' : ''}`);
  const background = element('div', 'script-bg');
  background.style.setProperty('--script-hue', String(backdrop.hue));
  if (backdrop.url !== null) {
    background.style.setProperty('--script-image', `url("${backdrop.url}")`);
  }
  root.append(background);

  if (view.titleCard !== null) {
    root.append(element('div', 'script-title-card', view.titleCard));
  } else {
    const page = element('div', 'script-page');
    for (const line of view.lines) {
      const row = element('p', `script-line${line.speaker === null ? ' narration' : ' speech'}`);
      if (line.speaker === null) {
        row.textContent = line.text;
      } else {
        row.append(element('span', 'script-speaker', view.lantern ? LANTERN_MARK : line.speaker));
        // 閉じかぎ括弧は行の本文が現れ終えてから付け、その直前の句点は落とす（「拾え」）。
        const body = line.complete ? `${line.text.replace(/。$/, '')}」` : line.text;
        row.append(document.createTextNode(`「${body}`));
      }
      page.append(row);
    }
    root.append(page);
  }
  if (view.waiting) {
    root.append(element('span', 'script-wait', '▼'));
  }

  const skip = element('button', 'script-skip', '飛ばす');
  skip.addEventListener('mousedown', (event) => {
    if ((event as MouseEvent).button === 0) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onSkip();
    }
  });
  root.append(skip);

  root.addEventListener('mousedown', (event) => {
    if ((event as MouseEvent).button === 0) {
      event.preventDefault();
      handlers.onAdvance();
    }
  });
  return root;
}
