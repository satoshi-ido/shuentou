// [I-PLAN-ASSETS] 表示アセットのプレースホルダ。乱数を用いず、色相・頭文字をいずれも asset_id から導出する。

const ASSET_PREFIX = 'ASSET_';
const PORTRAIT_SIZE = 256;

// 背景色の色相：asset_id の文字コード和から定める。
export function placeholderHue(assetId: string): number {
  let sum = 0;
  for (const char of assetId) {
    sum += char.codePointAt(0) ?? 0;
  }
  return sum % 360;
}

// 頭文字1字：接頭辞 ASSET_ を除いた最初の1字。
export function placeholderInitial(assetId: string): string {
  const body = assetId.startsWith(ASSET_PREFIX) ? assetId.slice(ASSET_PREFIX.length) : assetId;
  return Array.from(body)[0] ?? '?';
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// slot = PORTRAIT：256×256 のSVG（頭文字1字と背景色のみ）。
// desaturated はエピローグの顔グラロールの彩度差（echo_unlocked から導出）をフィルタで表す。
export function portraitSvg(assetId: string, desaturated = false): string {
  const hue = placeholderHue(assetId);
  const filter = desaturated
    ? '<filter id="d"><feColorMatrix type="saturate" values="0"/></filter>'
    : '';
  const filterRef = desaturated ? ' filter="url(#d)"' : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT_SIZE}" height="${PORTRAIT_SIZE}" viewBox="0 0 ${PORTRAIT_SIZE} ${PORTRAIT_SIZE}">` +
    filter +
    `<g${filterRef}><rect width="${PORTRAIT_SIZE}" height="${PORTRAIT_SIZE}" fill="hsl(${hue} 45% 38%)"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="140" fill="#f4efe6" ` +
    `font-family="system-ui, 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', Meiryo, sans-serif">${escapeXml(placeholderInitial(assetId))}</text></g></svg>`
  );
}

export function portraitDataUrl(assetId: string, desaturated = false): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(assetId, desaturated))}`;
}

// slot = ICON：系統アイコン5種（心気・武技・体勢・召喚・隊列交代）の記号。
export type SystemIcon = 'MIND' | 'MARTIAL' | 'STANCE' | 'SUMMON' | 'SWAP';

export const SYSTEM_ICON_GLYPH: Readonly<Record<SystemIcon, string>> = {
  MIND: '◎',
  MARTIAL: '⚔',
  STANCE: '⛨',
  SUMMON: '✦',
  SWAP: '⇄',
};
