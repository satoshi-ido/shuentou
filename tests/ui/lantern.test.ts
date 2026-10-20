// [S-LOOK-LANTERN]・[S-BG-INTERMISSION] 燈の受け口と芯の四つの状態、煤の層。

import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeDom, type FakeElement } from './fake-dom.js';
import { renderLantern } from '../../src/ui/dom/lantern.js';
import { sootOf, type LanternView } from '../../src/ui/view/lantern-view.js';

beforeAll(() => {
  installFakeDom();
});

describe('[S-LOOK-LANTERN] 燈', () => {
  it('受け口は五つで、状態ごとの数だけ描き分ける', () => {
    const view: LanternView = { closed: 3, empty: 0, souls: 1, ash: 1, soot: 'NONE', rings: 0 };
    const root = renderLantern(view) as unknown as FakeElement;
    const sockets = root.findAll('lantern-socket').map((node) => node.className.split(' ').find((name) => name.startsWith('socket-')));
    expect(sockets).toEqual(['socket-soul', 'socket-ash', 'socket-closed', 'socket-closed', 'socket-closed']);
  });

  it('煤の層は浅い・深い・皆無が見分けられる', () => {
    expect(sootOf(0)).toEqual({ soot: 'NONE', rings: 0 });
    expect(sootOf(3)).toEqual({ soot: 'RINGS', rings: 3 });
    expect(sootOf(42)).toEqual({ soot: 'COVERED', rings: 0 });
    expect(sootOf(300)).toEqual({ soot: 'BURIED', rings: 0 });
  });
});
