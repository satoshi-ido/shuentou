// [M-DATA-ASSETMASTER]【差分の選択】表示する画の選択と、実体の参照先。
// 実体の無い asset_id（path が art/ で始まらないもの、または実体の目録に無いもの）は Null を返し、呼び出し側がプレースホルダを描く（[I-PLAN-ASSETS]）。

import type { AssetMasterRecord, AssetOwnerKind, AssetPose, AssetSlot } from '../../data/types.js';
import { ART_FILES } from './art-manifest.js';

export type AssetCondition = (condition: string) => boolean;

// 同じ所有者・スロット・構えのレコードのうち、condition が成立するものを選ぶ。無ければ condition が Null の画
// （構えを持たないときは variant が Null の基準の画）。test が Null（ランの開始前など、条件式を評価できない時点）は
// condition が Null の画を選ぶ。pose は [M-DATA-ASSETMASTER]［構えの選択］の構えで、Null は構えを持たない画を選ぶ。
export function pickAsset(
  records: Readonly<Record<string, AssetMasterRecord>>,
  ownerKind: AssetOwnerKind,
  ownerId: string | null,
  slot: AssetSlot,
  test: AssetCondition | null,
  pose: AssetPose | null = null,
): AssetMasterRecord | null {
  const owned = Object.values(records).filter(
    (record) =>
      record.owner_kind === ownerKind && record.owner_id === ownerId && record.slot === slot && (record.pose ?? null) === pose,
  );
  const matched = test === null ? undefined : owned.find((record) => (record.condition ?? null) !== null && test(record.condition ?? ''));
  const fallback =
    pose === null
      ? owned.find((record) => (record.variant ?? null) === null)
      : owned.find((record) => (record.condition ?? null) === null);
  return matched ?? fallback ?? null;
}

// 実体のURL（index.html からの相対）。実体の目録（art/manifest.js）に無いもの・プレースホルダの path は Null。
export function assetUrl(record: AssetMasterRecord | null): string | null {
  if (record === null || !record.path.startsWith('art/')) {
    return null;
  }
  return ART_FILES.includes(record.path.split('#')[0] ?? '') ? record.path : null;
}

// asset_id で引く（脚本の行の background など）。
export function assetUrlById(records: Readonly<Record<string, AssetMasterRecord>>, assetId: string | null): string | null {
  return assetId === null ? null : assetUrl(records[assetId] ?? null);
}
