// [I-PLAN-SUBMISSION]【配布形態】・[I-ENV-STACK]
// vite build の出力と主プロセスを Windows x64 向けに包み、提出用の ZIP を作る。
// 実行前に dist/ が最新であること（pnpm package が vite build を先に行う）。
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'release');
const STAGE_DIR = path.join(OUT_DIR, 'stage');
// 製品名はセーブデータの保存先（%APPDATA% 下のフォルダ名）を決めるため、版をまたいで変えない。
const APP_NAME = 'Shuentou';

if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/index.html がありません。先に vite build を行ってください。');
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(path.join(STAGE_DIR, 'desktop'), { recursive: true });

// 主プロセスが参照するファイルと dist/ を、リポジトリと同じ相対配置で置く。
for (const file of ['main.js', 'resolve.js']) {
  cpSync(path.join(ROOT, 'desktop', file), path.join(STAGE_DIR, 'desktop', file));
}
cpSync(path.join(ROOT, 'dist'), path.join(STAGE_DIR, 'dist'), { recursive: true });
writeFileSync(
  path.join(STAGE_DIR, 'package.json'),
  JSON.stringify(
    { name: 'shuentou', productName: APP_NAME, version: '0.1.0', type: 'module', main: 'desktop/main.js' },
    null,
    2,
  ),
);

const [appDir] = await packager({
  dir: STAGE_DIR,
  out: OUT_DIR,
  name: APP_NAME,
  platform: 'win32',
  arch: 'x64',
  asar: true,
  overwrite: true,
});

// Chromium の表示言語のうち、日本語と既定の英語を残す（[I-PLAN-TEXT]【言語】）。ZIP を小さくするためである。
const KEPT_LOCALES = ['ja.pak', 'en-US.pak'];
const localesDir = path.join(appDir, 'locales');
for (const file of readdirSync(localesDir)) {
  if (!KEPT_LOCALES.includes(file)) rmSync(path.join(localesDir, file));
}

// ZIP に同梱する説明文（署名の無い実行ファイルに対する警告と、その下での起動の手順）。
cpSync(path.join(ROOT, 'desktop', 'README.txt'), path.join(appDir, 'README.txt'));

// Windows の tar（bsdtar）で ZIP を作る。対象環境は Windows に限る（[I-PLAN-SUBMISSION]【対象環境】）。
const zipPath = path.join(OUT_DIR, `${APP_NAME}-win32-x64.zip`);
// PATH 上には GNU tar（Git for Windows など）が先に来ることがあり、ZIP を作れないため、付属の tar.exe を名指しする。
const bsdtar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
execFileSync(bsdtar, ['-a', '-c', '-f', zipPath, '-C', OUT_DIR, path.basename(appDir)], {
  stdio: 'inherit',
});
rmSync(STAGE_DIR, { recursive: true, force: true });
console.log(zipPath);
