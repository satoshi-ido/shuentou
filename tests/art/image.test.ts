// [I-PLAN-ASSETS]【実体の投入】生成した画像の取り込みの画素処理（art/image.js）。

import { describe, expect, it } from 'vitest';
import { crop16x9, fitInto, fitLike, hasTransparency, opaqueBounds, placeBottomCenter, removeFlatBackground, targetOf } from '../../art/image.js';

// 幅 w・高さ h の画像を、内側の矩形だけ色を変えて作る（4バイト1画素）。
function picture(w: number, h: number, inner: { x: number; y: number; w: number; h: number }): Buffer {
  const pixels = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inside = x >= inner.x && x < inner.x + inner.w && y >= inner.y && y < inner.y + inner.h;
      pixels.set(inside ? [30, 40, 90, 255] : [200, 200, 200, 255], (y * w + x) * 4);
    }
  }
  return pixels;
}

describe('[I-PLAN-ASSETS] 画像の取り込み', () => {
  it('無地の背景を縁から透明にし、人物の矩形だけを残す', () => {
    const pixels = picture(10, 12, { x: 3, y: 4, w: 4, h: 6 });
    expect(hasTransparency(pixels)).toBe(false);
    const cut = removeFlatBackground(pixels, 10, 12);
    expect(hasTransparency(cut)).toBe(true);
    expect(opaqueBounds(cut, 10, 12)).toEqual({ x: 3, y: 4, width: 4, height: 6 });
  });

  it('縁と地続きでない同じ色は残す', () => {
    const pixels = picture(9, 9, { x: 2, y: 2, w: 5, h: 5 });
    pixels.set([200, 200, 200, 255], (4 * 9 + 4) * 4); // 人物の中の、背景と同じ色の1画素
    const cut = removeFlatBackground(pixels, 9, 9);
    expect(cut[(4 * 9 + 4) * 4 + 3]).toBe(255);
  });

  it('立ち絵は枠に収め、足元を枠の下端に揃える', () => {
    expect(fitInto(400, 1200, 512, 768)).toEqual({ width: 256, height: 768 });
    const placed = placeBottomCenter(Buffer.alloc(2 * 3 * 4, 255), 2, 3, 6, 5);
    expect(opaqueBounds(placed, 6, 5)).toEqual({ x: 2, y: 2, width: 2, height: 3 });
  });

  // [S-LOOK-PRINCIPLE]【盤面の構え】構えで人物の大きさを変えない。
  it('構えの画は元の立ち絵と同じ倍率で縮め、幅は上限の枠まで広げてよい', () => {
    // 元の画 400×1200 は 64×96 の枠へ 0.08 倍。身を低くした構え（高さ 900）も同じ倍率で縮める。
    expect(fitLike(500, 900, 400, 1200, 64, 96, 96)).toEqual({ width: 40, height: 72 });
    // 得物を伸ばした構え（幅 1000）は 80 ドットとなり、上限 96 の内に収まる。
    expect(fitLike(1000, 1200, 400, 1200, 64, 96, 96)).toEqual({ width: 80, height: 96 });
    // 上限を越える構え（幅 1500 → 120）は、上限に収まるまで縮める。
    expect(fitLike(1500, 1200, 400, 1200, 64, 96, 96)).toEqual({ width: 96, height: 77 });
  });

  it('構えの画の asset_id も立ち絵の取り込み先へ写す', () => {
    expect(targetOf('ASSET_DORN_STANDING_MARTIAL')).toEqual({ kind: 'STANDING', file: 'standing/dorn-martial.png' });
    expect(targetOf('ASSET_HERO_STANDING_COAT_ACT2_MIND')).toEqual({ kind: 'STANDING', file: 'standing/hero-coat-act2-mind.png' });
    expect(targetOf('ASSET_DORN_STANDING_MARTIAL_FOLLOW')).toEqual({ kind: 'STANDING', file: 'standing/dorn-martial-follow.png' });
    expect(targetOf('ASSET_HERO_STANDING_COAT_ACT2_STAGGER')).toEqual({ kind: 'STANDING', file: 'standing/hero-coat-act2-stagger.png' });
  });

  it('背景は 16:9 に切り出し、縦の位置を選べる', () => {
    expect(crop16x9(1536, 1024)).toEqual({ x: 0, y: 80, width: 1536, height: 864 });
    expect(crop16x9(1536, 1024, -1)).toEqual({ x: 0, y: 0, width: 1536, height: 864 });
    expect(crop16x9(2000, 900)).toEqual({ x: 200, y: 0, width: 1600, height: 900 });
  });

  it('asset_id から取り込み先を決める', () => {
    expect(targetOf('ASSET_BG_2_04_AFTER_UNKNOWN')).toEqual({ kind: 'BACKGROUND', file: 'bg/2-04-after-unknown.png' });
    expect(targetOf('ASSET_HERO_STANDING_COAT_ACT2')).toEqual({ kind: 'STANDING', file: 'standing/hero-coat-act2.png' });
    expect(targetOf('ASSET_SE_UI_CONFIRM')).toEqual({ kind: 'AUDIO', file: 'audio/se-ui-confirm.mp3' });
    expect(targetOf('ASSET_BGM_2_04')).toEqual({ kind: 'AUDIO', file: 'audio/bgm-2-04.mp3' });
    expect(targetOf('ASSET_HERO_PORTRAIT')).toBeNull();
  });
});
