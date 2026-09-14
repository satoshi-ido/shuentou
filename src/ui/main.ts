// UI のエントリ。論理解像度のステージを表示領域へ合わせ、入力はマウスのみを扱う（[M-UI-VIEWPORT]）。

import { loadConfig } from './config.js';
import { applyViewport } from './viewport.js';

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
if (viewport === null || stage === null) {
  throw new Error('ステージ要素が見つからない');
}

const fit = (): void => applyViewport(stage, viewport.clientWidth, viewport.clientHeight);
window.addEventListener('resize', fit);
fit();

// 右クリックは取り消し・1階層の遡行に割り当てるため、既定のコンテキストメニューを抑止する。
stage.addEventListener('contextmenu', (event) => event.preventDefault());

const config = loadConfig(window.localStorage);
stage.dataset.playbackSpeed = config.defaultPlaybackSpeed;
