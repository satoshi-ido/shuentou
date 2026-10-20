// [I-PLAN-ASSETS]【実体の投入】生成した画像の取り込みに用いる画素の処理。
// 画素は Electron の nativeImage.toBitmap() が返す4バイト1画素の並び（B・G・R・A）として扱う。
// 色はアルファを掛けた値（premultiplied）で持つため、アルファを下げた画素は色も同じ割合で下げる。
// 色の比較は3つの色成分を対称に扱うため、成分の並び（BGRA／RGBA）に依らない。

// 画像に透明な画素が既にあるか。透明な背景で生成された画像は、背景の除去を行わない。
export function hasTransparency(pixels) {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 250) {
      return true;
    }
  }
  return false;
}

function distance(pixels, offset, color) {
  return Math.abs(pixels[offset] - color[0]) + Math.abs(pixels[offset + 1] - color[1]) + Math.abs(pixels[offset + 2] - color[2]);
}

// 無地の背景（四隅の色の平均）を、画像の縁から塗りつぶして透明にする。
// 縁から地続きの画素だけを消すため、人物の中の同じ色は残る。tolerance は3成分の差の和の上限。
export function removeFlatBackground(pixels, width, height, tolerance = 60) {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const color = [0, 1, 2].map((c) => Math.round(corners.reduce((sum, p) => sum + pixels[p * 4 + c], 0) / corners.length));
  const out = Buffer.from(pixels);
  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) {
    stack.push(x, (height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    stack.push(y * width, y * width + width - 1);
  }
  while (stack.length > 0) {
    const p = stack.pop();
    if (visited[p] === 1) {
      continue;
    }
    visited[p] = 1;
    const d = distance(out, p * 4, color);
    if (d > tolerance * 2) {
      continue;
    }
    // 境目の画素は半透明にして、切り抜きの縁を和らげる。
    const alpha = d <= tolerance ? 0 : Math.round((255 * (d - tolerance)) / tolerance);
    for (let c = 0; c < 3; c += 1) {
      out[p * 4 + c] = Math.round((out[p * 4 + c] * alpha) / 255);
    }
    out[p * 4 + 3] = alpha;
    if (d > tolerance) {
      continue;
    }
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < (height - 1) * width) stack.push(p + width);
  }
  return out;
}

// 不透明な画素（アルファが threshold を超える）を囲む最小の矩形。無ければ null。
export function opaqueBounds(pixels, width, height, threshold = 16) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > threshold) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

// 立ち絵を収める寸法。縦横比を保ち、枠に収まる最大の大きさにする。
export function fitInto(width, height, boxWidth, boxHeight) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// 透明な枠（boxWidth×boxHeight）の下端・左右中央へ画素を置く。立ち絵の足元を枠の下端に揃える。
export function placeBottomCenter(pixels, width, height, boxWidth, boxHeight) {
  const out = Buffer.alloc(boxWidth * boxHeight * 4);
  const left = Math.floor((boxWidth - width) / 2);
  const top = boxHeight - height;
  for (let y = 0; y < height; y += 1) {
    pixels.copy(out, ((top + y) * boxWidth + left) * 4, y * width * 4, (y + 1) * width * 4);
  }
  return out;
}

// 背景を 16:9 に切り出す矩形。縦に余る場合は offsetY（-1〜1、0 で中央）で位置を選ぶ。
export function crop16x9(width, height, offsetY = 0) {
  if (width * 9 >= height * 16) {
    const cropWidth = Math.round((height * 16) / 9);
    return { x: Math.floor((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round((width * 9) / 16);
  const spare = height - cropHeight;
  return { x: 0, y: Math.round((spare * (1 + offsetY)) / 2), width, height: cropHeight };
}

// asset_id から取り込み先のファイル名と種別を決める。ASSET_BG_* は背景、ASSET_BGM_*・ASSET_SE_* は音声、*_STANDING* は立ち絵。
export function targetOf(assetId) {
  const name = assetId.replace(/^ASSET_/, '').toLowerCase().replace(/_/g, '-');
  if (/^ASSET_BG_/.test(assetId)) {
    return { kind: 'BACKGROUND', file: `bg/${name.replace(/^bg-/, '')}.jpg` };
  }
  if (/^ASSET_(BGM|SE)_/.test(assetId)) {
    return { kind: 'AUDIO', file: `audio/${name}.mp3` };
  }
  if (/_STANDING(_|$)/.test(assetId)) {
    return { kind: 'STANDING', file: `standing/${name.replace('-standing', '')}.png` };
  }
  return null;
}
