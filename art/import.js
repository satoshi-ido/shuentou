// [I-PLAN-ASSETS]【実体の投入】生成した画像と音声を取り込む。Electron の主プロセスとして動かす。
//   pnpm art <取り込み元のフォルダ> [asset_id …]
// 取り込み元の <asset_id>.png を読み、立ち絵は背景を除いて余白を詰め、512×768 の透明な枠の下端に置いた PNG に、
// 背景は 16:9 に切り出して 1280×720 の JPEG にして、src/ui/public/art/ へ書き出す。
// 音声は取り込み元の <asset_id>.mp3 をそのまま写す。
// 背景の切り出しの縦位置は、取り込み元の crops.json（{ "<asset_id>": -1〜1 }）で選べる。

import { app, nativeImage } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crop16x9, fitInto, hasTransparency, opaqueBounds, placeBottomCenter, removeFlatBackground, targetOf } from './image.js';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'public', 'art');
const STANDING_BOX = { width: 512, height: 768 };
const BACKGROUND_SIZE = { width: 1280, height: 720 };
const JPEG_QUALITY = 85;

function importStanding(source) {
  const { width, height } = source.getSize();
  const raw = source.toBitmap();
  const pixels = hasTransparency(raw) ? raw : removeFlatBackground(raw, width, height);
  const bounds = opaqueBounds(pixels, width, height);
  if (bounds === null) {
    throw new Error('不透明な画素が無い');
  }
  const cropped = nativeImage.createFromBitmap(pixels, { width, height }).crop(bounds);
  const size = fitInto(bounds.width, bounds.height, STANDING_BOX.width, STANDING_BOX.height);
  const scaled = cropped.resize({ ...size, quality: 'best' });
  const placed = placeBottomCenter(scaled.toBitmap(), size.width, size.height, STANDING_BOX.width, STANDING_BOX.height);
  return nativeImage.createFromBitmap(placed, STANDING_BOX).toPNG();
}

function importBackground(source, offsetY) {
  const { width, height } = source.getSize();
  return source
    .crop(crop16x9(width, height, offsetY))
    .resize({ ...BACKGROUND_SIZE, quality: 'best' })
    .toJPEG(JPEG_QUALITY);
}

function main() {
  const [sourceDir, ...only] = process.argv.slice(2).filter((arg) => !arg.startsWith('--') && !arg.endsWith('import.js'));
  if (sourceDir === undefined || !existsSync(sourceDir)) {
    throw new Error('使用法: pnpm art <取り込み元のフォルダ> [asset_id …]');
  }
  const cropsFile = path.join(sourceDir, 'crops.json');
  const crops = existsSync(cropsFile) ? JSON.parse(readFileSync(cropsFile, 'utf8')) : {};
  const ids = readdirSync(sourceDir)
    .filter((name) => /^ASSET_[A-Z0-9_]+\.(png|mp3)$/.test(name))
    .map((name) => name.replace(/\.(png|mp3)$/, ''))
    .filter((id) => only.length === 0 || only.includes(id))
    .sort();
  for (const id of ids) {
    const target = targetOf(id);
    if (target === null) {
      console.log(`飛ばす（種別が分からない）：${id}`);
      continue;
    }
    const out = path.join(OUT_DIR, target.file);
    mkdirSync(path.dirname(out), { recursive: true });
    if (target.kind === 'AUDIO') {
      copyFileSync(path.join(sourceDir, `${id}.mp3`), out);
      console.log(`${id} → art/${target.file}`);
      continue;
    }
    const source = nativeImage.createFromPath(path.join(sourceDir, `${id}.png`));
    if (source.isEmpty()) {
      throw new Error(`読めない：${id}`);
    }
    const data = target.kind === 'STANDING' ? importStanding(source) : importBackground(source, crops[id] ?? 0);
    writeFileSync(out, data);
    console.log(`${id} → art/${target.file}（${Math.round(data.length / 1024)}KB）`);
  }
}

app.whenReady().then(() => {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  app.quit();
});
