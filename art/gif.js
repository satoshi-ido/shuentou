// [I-PLAN-ASSETS]【実体の投入】アニメーション GIF のコマを読む。中割りの画（[S-LOOK-PRINCIPLE]【盤面の構え】）の取り込みに用いる。
// Electron の nativeImage は GIF の2コマ目以降を読めないため、ここで復号する。各コマは前のコマの処理方法（disposal）に従って
// 画面全体へ重ねた BGRA の画素（nativeImage.toBitmap と同じ並び）として返す。

function readSubBlocks(bytes, start) {
  const parts = [];
  let at = start;
  for (let size = bytes[at]; size !== 0; size = bytes[at]) {
    parts.push(bytes.subarray(at + 1, at + 1 + size));
    at += size + 1;
  }
  return { data: Buffer.concat(parts), next: at + 1 };
}

// 可変長 LZW の復号。色の番号の並びを返す。
function decodeLzw(data, minCodeSize, pixelCount) {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const length = new Int32Array(4096);
  for (let code = 0; code < clear; code += 1) {
    suffix[code] = code;
    first[code] = code;
    length[code] = 1;
  }
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let previous = -1;
  let written = 0;
  let bits = 0;
  let bitCount = 0;
  const stack = new Uint8Array(4096);
  for (let i = 0; i < data.length && written < pixelCount; i += 1) {
    bits |= data[i] << bitCount;
    bitCount += 8;
    while (bitCount >= codeSize && written < pixelCount) {
      const code = bits & ((1 << codeSize) - 1);
      bits >>= codeSize;
      bitCount -= codeSize;
      if (code === clear) {
        codeSize = minCodeSize + 1;
        next = end + 1;
        previous = -1;
        continue;
      }
      if (code === end) {
        return out;
      }
      let current = code;
      if (code >= next) {
        // まだ表に無い番号は、直前の列にその先頭を足したもの
        if (previous < 0) {
          throw new Error('GIF の LZW が壊れている');
        }
        current = previous;
      }
      let depth = 0;
      for (let walk = current; ; walk = prefix[walk]) {
        stack[depth] = suffix[walk];
        depth += 1;
        if (length[walk] === 1) {
          break;
        }
      }
      for (let k = depth - 1; k >= 0 && written < pixelCount; k -= 1) {
        out[written] = stack[k];
        written += 1;
      }
      if (code >= next && written < pixelCount) {
        out[written] = first[previous];
        written += 1;
      }
      if (previous >= 0 && next < 4096) {
        prefix[next] = previous;
        suffix[next] = code >= next ? first[previous] : first[code];
        first[next] = first[previous];
        length[next] = length[previous] + 1;
        next += 1;
        if (next === 1 << codeSize && codeSize < 12) {
          codeSize += 1;
        }
      }
      previous = code;
    }
  }
  return out;
}

// 飛び越し（interlace）の行の並びを、上からの並びへ戻す番号。
function interlacedRows(height) {
  const rows = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) {
    for (let y = start; y < height; y += step) {
      rows.push(y);
    }
  }
  return rows;
}

function readColorTable(bytes, at, size) {
  return bytes.subarray(at, at + size * 3);
}

// { width, height, frames: [{ pixels (BGRA), delayMs }] }
export function decodeGif(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = Buffer.from(bytes.subarray(0, 6)).toString('latin1');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new Error('GIF ではない');
  }
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const flags = bytes[10];
  let at = 13;
  let globalTable = null;
  if (flags & 0x80) {
    const size = 1 << ((flags & 0x07) + 1);
    globalTable = readColorTable(bytes, at, size);
    at += size * 3;
  }
  const canvas = Buffer.alloc(width * height * 4);
  const frames = [];
  let control = { disposal: 0, transparent: -1, delayMs: 0 };
  while (at < bytes.length) {
    const marker = bytes[at];
    if (marker === 0x3b) {
      break;
    }
    if (marker === 0x21) {
      const label = bytes[at + 1];
      if (label === 0xf9) {
        const packed = bytes[at + 3];
        control = {
          disposal: (packed >> 2) & 0x07,
          transparent: packed & 0x01 ? bytes[at + 6] : -1,
          delayMs: (bytes[at + 4] | (bytes[at + 5] << 8)) * 10,
        };
      }
      at = readSubBlocks(bytes, at + 2).next;
      continue;
    }
    if (marker !== 0x2c) {
      throw new Error(`GIF の未知の区切り：${marker}`);
    }
    const left = bytes[at + 1] | (bytes[at + 2] << 8);
    const top = bytes[at + 3] | (bytes[at + 4] << 8);
    const frameWidth = bytes[at + 5] | (bytes[at + 6] << 8);
    const frameHeight = bytes[at + 7] | (bytes[at + 8] << 8);
    const packed = bytes[at + 9];
    at += 10;
    let table = globalTable;
    if (packed & 0x80) {
      const size = 1 << ((packed & 0x07) + 1);
      table = readColorTable(bytes, at, size);
      at += size * 3;
    }
    if (table === null) {
      throw new Error('GIF に色の表が無い');
    }
    const minCodeSize = bytes[at];
    const { data, next } = readSubBlocks(bytes, at + 1);
    at = next;
    const indices = decodeLzw(data, minCodeSize, frameWidth * frameHeight);
    const rows = packed & 0x40 ? interlacedRows(frameHeight) : null;
    const before = control.disposal === 3 ? Buffer.from(canvas) : null;
    for (let row = 0; row < frameHeight; row += 1) {
      const y = top + (rows === null ? row : rows[row]);
      if (y >= height) {
        continue;
      }
      for (let x = 0; x < frameWidth; x += 1) {
        const index = indices[row * frameWidth + x];
        if (index === control.transparent || left + x >= width) {
          continue;
        }
        const o = (y * width + left + x) * 4;
        canvas[o] = table[index * 3 + 2];
        canvas[o + 1] = table[index * 3 + 1];
        canvas[o + 2] = table[index * 3];
        canvas[o + 3] = 255;
      }
    }
    frames.push({ pixels: Buffer.from(canvas), delayMs: control.delayMs });
    if (control.disposal === 2) {
      for (let y = top; y < Math.min(height, top + frameHeight); y += 1) {
        canvas.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + frameWidth)) * 4);
      }
    } else if (before !== null) {
      before.copy(canvas);
    }
    control = { disposal: 0, transparent: -1, delayMs: 0 };
  }
  return { width, height, frames };
}
