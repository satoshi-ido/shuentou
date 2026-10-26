// [I-PLAN-ASSETS]【実体の投入】実体の目録。src/ui/public/art/ にあるファイルの一覧を src/ui/assets/art-manifest.ts へ書き出す。
// 画面は目録にあるファイルだけを読みに行き、実体の無い資産はプレースホルダのまま描く（無いファイルを要求し続けない）。
// 立ち絵は高さ（ドット）も書き出す。盤面は高さに比例して描き、96 ドットを越える構えの画も同じ倍率で描く。
//   node art/manifest.js

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = path.join(ROOT, 'src', 'ui', 'public', 'art');
const OUT = path.join(ROOT, 'src', 'ui', 'assets', 'art-manifest.ts');

function listFiles(dir, prefix) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = path.join(dir, name);
      const relative = `${prefix}/${name}`;
      return statSync(full).isDirectory() ? listFiles(full, relative) : [relative];
    });
}

// PNG の IHDR から高さを読む。
function pngHeight(file) {
  return readFileSync(path.join(ROOT, 'src', 'ui', 'public', file)).readUInt32BE(20);
}

export function writeManifest() {
  const files = listFiles(ART_DIR, 'art').sort();
  const body = files.map((file) => `  ${JSON.stringify(file)},`).join('\n');
  const heights = files
    .filter((file) => file.startsWith('art/standing/') && file.endsWith('.png'))
    .map((file) => `  ${JSON.stringify(file)}: ${pngHeight(file)},`)
    .join('\n');
  writeFileSync(
    OUT,
    `// このファイルは art/manifest.js により生成される（[I-PLAN-ASSETS]【実体の投入】）。生成後に人が編集しない。\n` +
      `// src/ui/public/art/ にある実体の一覧。\n` +
      `export const ART_FILES: readonly string[] = [\n${body}${body === '' ? '' : '\n'}];\n\n` +
      `// 立ち絵の高さ（ドット）。\n` +
      `export const STANDING_HEIGHTS: Readonly<Record<string, number>> = {\n${heights}${heights === '' ? '' : '\n'}};\n`,
  );
  return files.length;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`実体の目録：${writeManifest()} 件`);
}
