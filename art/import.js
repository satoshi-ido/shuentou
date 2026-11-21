// [I-PLAN-ASSETS]【実体の投入】生成した画像と音声を取り込む。Electron の主プロセスとして動かす。
//   pnpm art <取り込み元のフォルダ> [asset_id …]
// 取り込み元の <asset_id>.png を読み、共通のドットの格子（論理解像度 1280×720 の2画素を1ドットとする、640×360 ドット）へ
// 縮める。立ち絵は背景を除いて余白を詰め、人物ごとの表示の高さ（heights.js。無ければ 64×96 ドットの枠に収める）に縮めて
// 透明な枠（64×96 ドット以上）の下端に置いた PNG に、背景は 16:9 に切り出して
// 640×360 ドットの PNG にして、src/ui/public/art/ へ書き出す。構えの画（<立ち絵のID>_MARTIAL・_STAGGER 等）は元の立ち絵と
// 同じ倍率で縮め、幅を 96 ドット、高さを 104 ドットまで広げてよい（取り込み元に元の立ち絵も置く）。人物が元の画と異なる大きさで
// 描かれた構えの画は、取り込み元の scales.json（{ "<asset_id>": 倍率 }）で倍率を補正する。画面は image-rendering: pixelated で拡大して描く。
// 音声は取り込み元の <asset_id>.mp3 をそのまま写す。
// 背景の切り出しの縦位置は、取り込み元の crops.json（{ "<asset_id>": -1〜1 }）で選べる。

import { app, nativeImage } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeManifest } from './manifest.js';
import { FIGURE_HEIGHTS } from './heights.js';
import { crop16x9, fitLike, hasTransparency, opaqueBounds, placeBottomCenter, removeFlatBackground, snapAlpha, targetOf } from './image.js';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'public', 'art');
// 1ドット = 論理解像度の2画素。立ち絵は戦闘の表示の高さ 192px（96ドット）、背景は 1280×720（640×360 ドット）。
const STANDING_BOX = { width: 64, height: 96 };
const BACKGROUND_SIZE = { width: 640, height: 360 };
// 構えの画（[S-LOOK-PRINCIPLE]【盤面の構え】）。得物を伸ばした構え・振りかぶった構えのために、枠をここまで広げてよい。
// 高さの上限は、盤面のマスの立ち絵の上の余白（style.css の --cell-height）に収まる大きさとする。
const POSE_SUFFIX = /_((MARTIAL|STANCE|MIND)(_FOLLOW)?|STAGGER)$/;
const POSE_MAX = { width: 96, height: 104 };

// 背景を除いた画素と、不透明な範囲。
function cutOut(source) {
  const { width, height } = source.getSize();
  const raw = source.toBitmap();
  const pixels = hasTransparency(raw) ? raw : removeFlatBackground(raw, width, height);
  const bounds = opaqueBounds(pixels, width, height);
  if (bounds === null) {
    throw new Error('不透明な画素が無い');
  }
  return { pixels, width, height, bounds };
}

// [S-LOOK-PRINCIPLE]【盤面の大きさ】元の立ち絵を縮める枠。表（heights.js）にある立ち絵は範囲の高さをその値に揃え、
// 無い立ち絵は 64×96 の枠に収める。
function standingBoxOf(id) {
  const entry = FIGURE_HEIGHTS[id];
  return entry === undefined ? STANDING_BOX : { width: Infinity, height: entry.height };
}

// base は倍率を決める元の立ち絵の範囲（元の立ち絵そのものでは Null）と枠。構えの画（[S-LOOK-PRINCIPLE]【盤面の構え】）は元の画と同じ倍率で縮め、
// 得物を伸ばした構えが枠を越える分は、枠を POSE_MAX まで広げて収める（足元は枠の下端に揃える）。
function importStanding(source, base) {
  const { pixels, width, height, bounds } = cutOut(source);
  const cropped = nativeImage.createFromBitmap(pixels, { width, height }).crop(bounds);
  const reference = base.bounds ?? bounds;
  const size = fitLike(
    bounds.width,
    bounds.height,
    reference.width,
    reference.height,
    base.box.width,
    base.box.height,
    POSE_MAX.width,
    POSE_MAX.height,
  );
  const box = { width: Math.max(STANDING_BOX.width, size.width + (size.width % 2)), height: Math.max(STANDING_BOX.height, size.height) };
  const scaled = cropped.resize({ ...size, quality: 'best' });
  const placed = placeBottomCenter(snapAlpha(scaled.toBitmap()), size.width, size.height, box.width, box.height);
  return nativeImage.createFromBitmap(placed, box).toPNG();
}

// 構えの画の asset_id から、元の立ち絵の asset_id を引く。構えの画でなければ Null。
function poseBaseOf(id) {
  return POSE_SUFFIX.test(id) ? id.replace(POSE_SUFFIX, '') : null;
}

function importBackground(source, offsetY) {
  const { width, height } = source.getSize();
  return source
    .crop(crop16x9(width, height, offsetY))
    .resize({ ...BACKGROUND_SIZE, quality: 'best' })
    .toPNG();
}

// 倍率を決める元の立ち絵の範囲と枠。元の立ち絵そのものは自身の範囲を用いる（Null）。構えの画を取り込むには、
// 取り込み元に元の立ち絵も置く。scale は構えの画の人物が元の画と異なる大きさで描かれたときの補正
// （取り込み元の scales.json、既定 1）。元の画の範囲を scale で割って与え、縮める倍率を scale 倍にする。
function standingBase(sourceDir, id, scale) {
  const baseId = poseBaseOf(id);
  if (baseId === null) {
    return { bounds: null, box: standingBoxOf(id) };
  }
  const base = nativeImage.createFromPath(path.join(sourceDir, `${baseId}.png`));
  if (base.isEmpty()) {
    throw new Error(`構えの画の元の立ち絵が取り込み元に無い：${baseId}`);
  }
  const { bounds } = cutOut(base);
  return { bounds: { width: bounds.width / scale, height: bounds.height / scale }, box: standingBoxOf(baseId) };
}

function main() {
  const [sourceDir, ...only] = process.argv.slice(2).filter((arg) => !arg.startsWith('--') && !arg.endsWith('import.js'));
  if (sourceDir === undefined || !existsSync(sourceDir)) {
    throw new Error('使用法: pnpm art <取り込み元のフォルダ> [asset_id …]');
  }
  const cropsFile = path.join(sourceDir, 'crops.json');
  const crops = existsSync(cropsFile) ? JSON.parse(readFileSync(cropsFile, 'utf8')) : {};
  const scalesFile = path.join(sourceDir, 'scales.json');
  const scales = existsSync(scalesFile) ? JSON.parse(readFileSync(scalesFile, 'utf8')) : {};
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
    const data =
      target.kind === 'STANDING'
        ? importStanding(source, standingBase(sourceDir, id, scales[id] ?? 1))
        : importBackground(source, crops[id] ?? 0);
    writeFileSync(out, data);
    console.log(`${id} → art/${target.file}（${Math.round(data.length / 1024)}KB）`);
  }
}

app.whenReady().then(() => {
  try {
    main();
    console.log(`実体の目録：${writeManifest()} 件`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  app.quit();
});
