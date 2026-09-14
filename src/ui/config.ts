// [M-UI-CONFIG] 表示・音響設定。セーブデータに含めず、端末ローカル設定として別のキーで保持する
// （[I-STATE-SNAPSHOT]「保存先」）。巻き戻し・周回移行・save_version のいずれにも関与しない。

import { WATCH_KINDS, type WatchFlags } from '../engine/types.js';

export type PlaybackSpeed = 'PAUSE' | 'X1' | 'X2' | 'X3';
export type TextSpeed = 'SLOW' | 'NORMAL' | 'FAST' | 'INSTANT';

export interface DisplayConfig {
  readonly bgmVolume: number; // 0〜100
  readonly seVolume: number; // 0〜100
  readonly defaultPlaybackSpeed: PlaybackSpeed; // 反映契機：バトル開始時
  readonly textSpeed: TextSpeed;
  readonly simplifyEffects: boolean;
  readonly watchDefault: WatchFlags; // 反映契機：バトル開始時
}

export const CONFIG_STORAGE_KEY = 'shuentou.config';

const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = ['PAUSE', 'X1', 'X2', 'X3'];
const TEXT_SPEEDS: readonly TextSpeed[] = ['SLOW', 'NORMAL', 'FAST', 'INSTANT'];

export function defaultConfig(): DisplayConfig {
  return {
    bgmVolume: 80,
    seVolume: 80,
    defaultPlaybackSpeed: 'X1',
    textSpeed: 'NORMAL',
    simplifyEffects: false,
    watchDefault: { READY: false, STUN: false, HIT_FRONT: false, HIT_BACK: false, EVADE: false },
  };
}

function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// 保存値の欠落・型違いは項目単位で既定値に戻す（端末ローカル設定は外部から改変されうるため）。
export function parseConfig(serialized: string | null): DisplayConfig {
  const fallback = defaultConfig();
  if (serialized === null) {
    return fallback;
  }
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (parsed === null || typeof parsed !== 'object') {
      return fallback;
    }
    raw = parsed as Record<string, unknown>;
  } catch {
    return fallback;
  }
  const rawWatch = (raw.watchDefault ?? {}) as Record<string, unknown>;
  const watchDefault = { ...fallback.watchDefault };
  for (const kind of WATCH_KINDS) {
    if (typeof rawWatch[kind] === 'boolean') {
      watchDefault[kind] = rawWatch[kind] as boolean;
    }
  }
  return {
    bgmVolume: volume(raw.bgmVolume, fallback.bgmVolume),
    seVolume: volume(raw.seVolume, fallback.seVolume),
    defaultPlaybackSpeed: oneOf(raw.defaultPlaybackSpeed, PLAYBACK_SPEEDS, fallback.defaultPlaybackSpeed),
    textSpeed: oneOf(raw.textSpeed, TEXT_SPEEDS, fallback.textSpeed),
    simplifyEffects: typeof raw.simplifyEffects === 'boolean' ? raw.simplifyEffects : fallback.simplifyEffects,
    watchDefault,
  };
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadConfig(storage: KeyValueStorage): DisplayConfig {
  return parseConfig(storage.getItem(CONFIG_STORAGE_KEY));
}

export function saveConfig(storage: KeyValueStorage, config: DisplayConfig): void {
  storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}
