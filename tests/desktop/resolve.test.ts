// [I-ENV-STACK]【配布版の読み込み】独自スキームの要求から dist/ 内のファイルへの写像。

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTRY_URL, ORIGIN, resolveDistPath } from '../../desktop/resolve.js';

const DIST = path.resolve('dist');

describe('I-ENV-STACK 配布版の読み込み', () => {
  it('入口の URL は dist/index.html を指す', () => {
    expect(resolveDistPath(DIST, ENTRY_URL)).toBe(path.join(DIST, 'index.html'));
  });

  it('ルートへの要求は index.html を返す', () => {
    expect(resolveDistPath(DIST, `${ORIGIN}/`)).toBe(path.join(DIST, 'index.html'));
  });

  it('入れ子のパスとクエリを扱う', () => {
    expect(resolveDistPath(DIST, `${ORIGIN}/assets/ai-worker.js?worker_file&type=module`)).toBe(
      path.join(DIST, 'assets', 'ai-worker.js'),
    );
  });

  it('URL の正規化で除かれる .. は dist/ の内に留まる', () => {
    expect(resolveDistPath(DIST, `${ORIGIN}/%2e%2e/index.html`)).toBe(path.join(DIST, 'index.html'));
  });

  it('dist/ の外を指す要求は返さない', () => {
    expect(resolveDistPath(DIST, `${ORIGIN}/assets/%2e%2e%2f%2e%2e%2fpackage.json`)).toBeNull();
    expect(resolveDistPath(DIST, `${ORIGIN}/..%5cpackage.json`)).toBeNull();
  });

  it('別のホストやスキームへの要求は返さない', () => {
    expect(resolveDistPath(DIST, 'shuentou://other/index.html')).toBeNull();
    expect(resolveDistPath(DIST, 'https://app/index.html')).toBeNull();
  });

  it('復号できないパスは返さない', () => {
    expect(resolveDistPath(DIST, `${ORIGIN}/%E0%A4%A`)).toBeNull();
  });
});
