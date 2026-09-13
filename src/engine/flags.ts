// [M-STATE-FLAGS] 系統フラグの自動確定アルゴリズム。
// [M-STATE-FLAGS-EXCEPTION] の手動付与例外は本モジュールでは扱わない
// （対象2件は M-CH-ENDING・M-TMPL-VESSEL に属し、いずれも M1 の範囲外）。

import type { ActionParams } from '../data/types.js';
import type { SysFlag, SysFlags } from './types.js';

// 確定順序は [M-STATE-FLAGS] の表の掲載順。ソート済み配列として返す（I-STATE-JSON）。
export function deriveSysFlags(params: ActionParams): SysFlags {
  const flags: SysFlag[] = [];
  if (params.summon_id !== null) {
    flags.push('FLAG_SUMMON');
  }
  if (params.is_swap) {
    flags.push('FLAG_SWAP');
  }
  const hasGiveBuff = Object.keys(params.give_buff).length > 0;
  if (params.gain_vp > 0 || params.charge_pp > 0 || hasGiveBuff) {
    flags.push('FLAG_MIND');
  }
  if (params.range > 0) {
    flags.push('FLAG_MARTIAL');
  }
  if (params.deploy_ap > 0) {
    flags.push('FLAG_STANCE');
  }
  if (params.purify_rate > 0) {
    flags.push('FLAG_PURIFY');
  }
  return flags;
}

export function hasFlag(flags: SysFlags, flag: SysFlag): boolean {
  return flags.includes(flag);
}
