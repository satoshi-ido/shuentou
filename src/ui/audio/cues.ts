// [M-DATA-AUDIO-CUE] 発火契機と音声資産の対応。[M-DATA-ASSETMASTER] の cue 欄から引く。
// 音源を持たない段階（[I-PLAN-ASSETS]）でも、契機から資産IDまでの経路は本番と同じ形で通す。

import type { AssetMasterRecord } from '../../data/types.js';
import type { BattleCue } from '../../engine/cue.js';
import { hasFlag } from '../../engine/flags.js';
import type { AudioCue } from './driver.js';

// 系統別の発動音。[M-DATA-ASSETMASTER] は ACTION_TRIGGER を系統ごとに持つ。
const TRIGGER_ASSET: Readonly<Record<string, string>> = {
  FLAG_MARTIAL: 'ASSET_SE_ACTION_MARTIAL',
  FLAG_MIND: 'ASSET_SE_ACTION_MIND',
  FLAG_STANCE: 'ASSET_SE_ACTION_STANCE',
};

// 契機1件に対応する SE の資産ID。対応する資産がなければ鳴らさない。
export function seAssetOf(cue: BattleCue, assets: Readonly<Record<string, AssetMasterRecord>>): string | null {
  if (cue.kind === 'ACTION_TRIGGER') {
    for (const flag of ['FLAG_MARTIAL', 'FLAG_MIND', 'FLAG_STANCE'] as const) {
      if (hasFlag(cue.sysFlags, flag)) {
        return assetIdOf(TRIGGER_ASSET[flag] ?? '', assets);
      }
    }
    return null; // 系統を持たないアクション（パス等）は鳴らさない
  }
  return globalAssetOf(cue.kind, assets);
}

// GLOBAL な契機（HIT・MISS・UNIT_DESTROY・WATCH_PAUSE・UI_CONFIRM・UI_CANCEL）の資産ID。
export function globalAssetOf(cue: AudioCue, assets: Readonly<Record<string, AssetMasterRecord>>): string | null {
  const found = Object.values(assets).find((record) => record.slot === 'SE' && record.cue === cue);
  return found?.asset_id ?? null;
}

// BGM の資産ID。シーンに紐づく BATTLE は当該シーンのレコードを、それ以外は GLOBAL を引く。
export function bgmAssetOf(
  cue: AudioCue,
  sceneId: string | null,
  assets: Readonly<Record<string, AssetMasterRecord>>,
): string | null {
  const found = Object.values(assets).find(
    (record) =>
      record.slot === 'BGM' && record.cue === cue && (record.owner_kind !== 'SCENE' || record.owner_id === sceneId),
  );
  return found?.asset_id ?? null;
}

function assetIdOf(assetId: string, assets: Readonly<Record<string, AssetMasterRecord>>): string | null {
  return assets[assetId] === undefined ? null : assetId;
}
