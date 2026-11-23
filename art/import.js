// [I-PLAN-ASSETS]【実体の投入】生成した画像と音声を取り込む。Electron の主プロセスとして動かす。
//   pnpm art <取り込み元のフォルダ> [asset_id …]
// 取り込み元の <asset_id>.png を読み、共通のドットの格子（論理解像度 1280×720 の2画素を1ドットとする、640×360 ドット）へ
// 縮める。立ち絵は背景を除いて余白を詰め、人物ごとの表示の高さ（heights.js。無ければ 64×96 ドットの枠に収める）に縮めて
// 透明な枠（64×96 ドット以上）の下端に置いた PNG に、背景は 16:9 に切り出して
// 640×360 ドットの PNG にして、src/ui/public/art/ へ書き出す。構えの画（<立ち絵のID>_MARTIAL・_STAGGER 等）は元の立ち絵と
// 同じ倍率で縮め、幅を 96 ドット（倒れの画 _DOWN は 120 ドット）、高さを 104 ドットまで広げてよい（取り込み元に元の立ち絵も置く）。人物が元の画と異なる大きさで
// 描かれた構えの画は、取り込み元の scales.json（{ "<asset_id>": 倍率 }）で倍率を補正する。画面は image-rendering: pixelated で拡大して描く。
// 音声は取り込み元の <asset_id>.mp3 をそのまま写す。
// 背景の切り出しの縦位置は、取り込み元の crops.json（{ "<asset_id>": -1〜1 }）で選べる。
// 溜めの画（<構えの画のID>_CHARGE_<段>）と中割りの画（<構えの画のID>_SWING_<順>）は、取り込み元の <構えの画のID>_SWING.gif から、swings.json
// （{ "<構えの画のID>": { "charge": [コマの番号…], "frames": [コマの番号…], "follow": コマの番号 } }）が挙げるコマを取り出す。follow を挙げたときは、
// 振り抜きの画（<構えの画のID>_FOLLOW）も .png の代わりにそのコマから作る。コマの0番は構えの画と同じ姿として、倍率と左右の位置の基準に用いる。

import { app, nativeImage } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGif } from './gif.js';
import { writeManifest } from './manifest.js';
import { FIGURE_HEIGHTS } from './heights.js';
import { crop16x9, fitLike, hasTransparency, opaqueBounds, placeBottomCenter, removeFlatBackground, snapAlpha, targetOf } from './image.js';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'public', 'art');
// 1ドット = 論理解像度の2画素。立ち絵は戦闘の表示の高さ 192px（96ドット）、背景は 1280×720（640×360 ドット）。
const STANDING_BOX = { width: 64, height: 96 };
const BACKGROUND_SIZE = { width: 640, height: 360 };
// 構えの画（[S-LOOK-PRINCIPLE]【盤面の構え】）。得物を伸ばした構え・振りかぶった構えのために、枠をここまで広げてよい。
// 高さの上限は、盤面のマスの立ち絵の上の余白（style.css の --cell-height）に収まる大きさとする。
const POSE_SUFFIX = /_((MARTIAL|STANCE|MIND)(_FOLLOW)?|STAGGER|DOWN)$/;
const POSE_MAX = { width: 96, height: 104 };
// 倒れの画（DOWN）は横たわる姿のため、幅をここまで広げてよい（盤面のマスは立ち絵の左右に余白を持つ）。
const DOWN_MAX = { width: 120, height: 104 };

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
// 得物を伸ばした構えが枠を越える分は、枠を POSE_MAX（倒れの画は DOWN_MAX）まで広げて収める（足元は枠の下端に揃える）。
function importStanding(source, base) {
  const { pixels, width, height, bounds } = cutOut(source);
  const cropped = nativeImage.createFromBitmap(pixels, { width, height }).crop(bounds);
  return placeStanding(cropped, standingSize(bounds, base));
}

// 立ち絵を縮める大きさ。範囲（bounds）を元の画と同じ倍率で縮め、POSE_MAX を越える分は収める。
function standingSize(bounds, base) {
  const reference = base.bounds ?? bounds;
  return fitLike(
    bounds.width,
    bounds.height,
    reference.width,
    reference.height,
    base.box.width,
    base.box.height,
    base.max.width,
    base.max.height,
  );
}

// 縮めた画を、透明な枠（64×96 ドット以上）の下端・左右中央に置いた PNG にする。
function placeStanding(cropped, size) {
  const box = { width: Math.max(STANDING_BOX.width, size.width + (size.width % 2)), height: Math.max(STANDING_BOX.height, size.height) };
  const scaled = cropped.resize({ ...size, quality: 'best' });
  const placed = placeBottomCenter(snapAlpha(scaled.toBitmap()), size.width, size.height, box.width, box.height);
  return nativeImage.createFromBitmap(placed, box).toPNG();
}

// 構えの画の asset_id から、元の立ち絵の asset_id を引く。構えの画でなければ Null。
function poseBaseOf(id) {
  return POSE_SUFFIX.test(id) ? id.replace(POSE_SUFFIX, '') : null;
}

// 溜めと中割りの画（[S-LOOK-PRINCIPLE]【盤面の構え】）。GIF のコマはどれも同じ画面に描かれているため、コマごとに余白を詰めず、
// 使うコマのすべてを含む共通の窓で切り出す。盤面は画を左右中央に置くため、窓の左右の中心を、0番のコマ（構えの画と同じ姿）を
// 構えの画に最もよく重ねる位置に取り、構えの画とコマの間で体が左右に跳ばないようにする。倍率は、0番のコマの範囲の高さを、
// 構えの画を取り込んだ高さに揃える。返すのは [asset_id, PNG] の並び。
const ALIGN_RANGE = 16; // 0番のコマを構えの画に重ねる位置を探す幅（ドット）

// 不透明な画素の重なりが最も多くなる、構えの画の中心から見た0番のコマの中心の位置（ドット）。どちらも下端に揃える。
function alignOffset(stance, key) {
  let best = { dx: 0, overlap: -1 };
  for (let dx = -ALIGN_RANGE; dx <= ALIGN_RANGE; dx += 1) {
    const left = Math.floor((stance.width - key.width) / 2) + dx;
    let overlap = 0;
    for (let y = 0; y < key.height; y += 1) {
      const sy = stance.height - key.height + y;
      if (sy < 0) {
        continue;
      }
      for (let x = 0; x < key.width; x += 1) {
        const sx = left + x;
        if (sx >= 0 && sx < stance.width && key.pixels[(y * key.width + x) * 4 + 3] > 0 && stance.pixels[(sy * stance.width + sx) * 4 + 3] > 0) {
          overlap += 1;
        }
      }
    }
    if (overlap > best.overlap || (overlap === best.overlap && Math.abs(dx) < Math.abs(best.dx))) {
      best = { dx, overlap };
    }
  }
  return best.dx;
}

function frameWindow(gif, index, window) {
  const pixels = Buffer.alloc(window.width * window.height * 4);
  for (let y = 0; y < window.height; y += 1) {
    const sy = window.y + y;
    if (sy < 0 || sy >= gif.height) {
      continue;
    }
    for (let x = 0; x < window.width; x += 1) {
      const sx = window.x + x;
      if (sx >= 0 && sx < gif.width) {
        gif.frames[index].pixels.copy(pixels, (y * window.width + x) * 4, (sy * gif.width + sx) * 4, (sy * gif.width + sx) * 4 + 4);
      }
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: window.width, height: window.height });
}

function importSwing(sourceDir, stanceId, spec, scales) {
  const gif = decodeGif(readFileSync(path.join(sourceDir, `${stanceId}_SWING.gif`)));
  const boundsOf = (index) => {
    const frame = gif.frames[index];
    if (frame === undefined) {
      throw new Error(`中割りの GIF にコマが無い：${stanceId} の ${index}`);
    }
    const bounds = opaqueBounds(frame.pixels, gif.width, gif.height);
    if (bounds === null) {
      throw new Error(`中割りのコマに不透明な画素が無い：${stanceId} の ${index}`);
    }
    return bounds;
  };
  const outputs = [
    ...(spec.charge ?? []).map((index, order) => [`${stanceId}_CHARGE_${order + 1}`, index]),
    ...(spec.frames ?? []).map((index, order) => [`${stanceId}_SWING_${order + 1}`, index]),
    ...(spec.follow === undefined ? [] : [[`${stanceId}_FOLLOW`, spec.follow]]),
  ];
  const source = nativeImage.createFromPath(path.join(sourceDir, `${stanceId}.png`));
  if (source.isEmpty()) {
    throw new Error(`中割りの構えの画が取り込み元に無い：${stanceId}`);
  }
  const stancePng = nativeImage.createFromBuffer(importStanding(source, standingBase(sourceDir, stanceId, scales[stanceId] ?? 1)));
  const stance = { pixels: stancePng.toBitmap(), ...stancePng.getSize() };
  const stanceHeight = opaqueBounds(stance.pixels, stance.width, stance.height).height;

  const keyBounds = boundsOf(0);
  const keyRatio = stanceHeight / keyBounds.height;
  const keySize = { width: Math.max(1, Math.round(keyBounds.width * keyRatio)), height: stanceHeight };
  const key = { pixels: snapAlpha(frameWindow(gif, 0, keyBounds).resize({ ...keySize, quality: 'best' }).toBitmap()), ...keySize };
  const center = keyBounds.x + keyBounds.width / 2 - alignOffset(stance, key) / keyRatio;

  const used = outputs.map(([, index]) => boundsOf(index));
  const half = Math.max(...used.map((b) => Math.max(center - b.x, b.x + b.width - center)));
  const top = Math.min(...used.map((b) => b.y));
  const window = {
    x: Math.round(center - half),
    y: top,
    width: Math.round(2 * half),
    height: Math.max(...used.map((b) => b.y + b.height)) - top,
  };
  const ratio = Math.min(keyRatio, POSE_MAX.width / window.width, POSE_MAX.height / window.height);
  if (ratio < keyRatio) {
    console.log(`中割りの窓が枠を越えるため、構えの画より小さく縮める：${stanceId}`);
  }
  const size = { width: Math.max(1, Math.round(window.width * ratio)), height: Math.max(1, Math.round(window.height * ratio)) };
  return outputs.map(([id, index]) => [id, placeStanding(frameWindow(gif, index, window), size)]);
}

function writeStanding(id, data) {
  const target = targetOf(id);
  const out = path.join(OUT_DIR, target.file);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, data);
  console.log(`${id} → art/${target.file}（${Math.round(data.length / 1024)}KB）`);
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
    return { bounds: null, box: standingBoxOf(id), max: POSE_MAX };
  }
  const base = nativeImage.createFromPath(path.join(sourceDir, `${baseId}.png`));
  if (base.isEmpty()) {
    throw new Error(`構えの画の元の立ち絵が取り込み元に無い：${baseId}`);
  }
  const { bounds } = cutOut(base);
  return { bounds: { width: bounds.width / scale, height: bounds.height / scale }, box: standingBoxOf(baseId), max: id.endsWith('_DOWN') ? DOWN_MAX : POSE_MAX };
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
  const swingsFile = path.join(sourceDir, 'swings.json');
  const swings = existsSync(swingsFile) ? JSON.parse(readFileSync(swingsFile, 'utf8')) : {};
  // 中割りの GIF から作る振り抜きの画は、.png から作らない
  const fromSwing = new Set(Object.entries(swings).filter(([, spec]) => spec.follow !== undefined).map(([id]) => `${id}_FOLLOW`));
  const ids = readdirSync(sourceDir)
    .filter((name) => /^ASSET_[A-Z0-9_]+\.(png|mp3)$/.test(name))
    .map((name) => name.replace(/\.(png|mp3)$/, ''))
    .filter((id) => only.length === 0 || only.includes(id))
    .sort();
  for (const [stanceId, spec] of Object.entries(swings)) {
    const outputs = importSwing(sourceDir, stanceId, spec, scales);
    if (only.length === 0 || only.includes(stanceId) || outputs.some(([id]) => only.includes(id))) {
      outputs.forEach(([id, data]) => writeStanding(id, data));
    }
  }
  for (const id of ids) {
    if (fromSwing.has(id)) {
      console.log(`飛ばす（中割りの GIF から作る）：${id}`);
      continue;
    }
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
