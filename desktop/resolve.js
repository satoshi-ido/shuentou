// [I-ENV-STACK]【配布版の読み込み】
// 独自スキームの要求を dist/ 内のファイルへ写す。electron を参照せず、単体で検査できるようにする。
import path from 'node:path';

// スキーム名とホスト名はローカルストレージのオリジンを決めるため、版をまたいで変えない。
export const SCHEME = 'shuentou';
export const HOST = 'app';
export const ORIGIN = `${SCHEME}://${HOST}`;
export const ENTRY_URL = `${ORIGIN}/index.html`;

// dist/ の外を指す要求、別のホストへの要求には null を返す。
export function resolveDistPath(distDir, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== `${SCHEME}:` || url.host !== HOST) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  // バックスラッシュは Windows でのみ区切りとして働くため、環境によらず拒む。
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const relative = pathname.replace(/^\/+/, '') || 'index.html';
  const root = path.resolve(distDir);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
