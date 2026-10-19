// [M-UI-CONFIG]［選択肢の表示名］設定画面は列挙値の識別子を出さず、表示名で示す。

import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeDom, type FakeElement } from './fake-dom.js';
import { defaultConfig, type DisplayConfig } from '../../src/ui/config.js';
import { renderConfigOverlay, type ScreenHandlers } from '../../src/ui/dom/screens.js';

beforeAll(() => {
  installFakeDom();
});

function render(config: DisplayConfig, changes: DisplayConfig[] = []): FakeElement {
  const noop = (): undefined => undefined;
  const handlers = new Proxy({} as ScreenHandlers, {
    get: (_target, key) => (key === 'onConfigChange' ? (next: DisplayConfig) => changes.push(next) : noop),
  });
  return renderConfigOverlay(config, handlers) as unknown as FakeElement;
}

describe('[M-UI-CONFIG] 選択肢の表示名', () => {
  it('各行の選択肢を表示名で並べる', () => {
    const rows = render(defaultConfig())
      .findAll('config-row')
      .map((row) => row.findAll('config-choice').map((choice) => choice.textContent))
      .filter((choices) => choices.length > 0);
    expect(rows).toEqual([
      ['停止', '等速', '2倍速', '3倍速'],
      ['遅い', '普通', '速い', '瞬時'],
      ['しない', 'する'],
      ['既定の条件', 'すべて切る', 'すべて入れる'],
    ]);
  });

  it('現在値の選択肢に印を付け、選んだ表示名に対応する値を渡す', () => {
    const changes: DisplayConfig[] = [];
    const root = render(defaultConfig(), changes);
    const on = root.findAll('config-on').map((choice) => choice.textContent);
    expect(on).toEqual(['等速', '普通', 'しない', '既定の条件']);
    const pick = (text: string): void => root.findAll('config-choice').find((choice) => choice.textContent === text)?.dispatch('click', {});
    pick('3倍速');
    pick('する');
    pick('すべて切る');
    expect(changes.map((next) => [next.defaultPlaybackSpeed, next.simplifyEffects, next.watchDefault])).toEqual([
      ['X3', false, 'BY_SYSTEM'],
      ['X1', true, 'BY_SYSTEM'],
      ['X1', false, 'ALL_OFF'],
    ]);
  });
});
