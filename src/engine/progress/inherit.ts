// [M-INHERIT-POOL] [M-INHERIT-MERGE] [M-DATA-COEFFKEYS] [M-DATA-INSTANTIATE] [M-CALC-ROUNDING]
// 継承プールの導出と、従者1名分の継承の実行。

import type { ActionParams, AttendantMasterRecord, CoeffKey } from '../../data/types.js';
import { roundDiv } from '../../num/helpers.js';
import { deriveSysFlags } from '../flags.js';
import { allocateInstanceId } from '../instantiate.js';
import { INFINITE_USES } from '../params.js';
import type { ActionInstance } from '../types.js';
import { actionOf, attendantOf, enemyOf, sceneByOrder, sceneOf, type GameMasters } from '../run/masters.js';
import type { RunState } from '../run/state.js';

export type InheritTarget = { readonly kind: 'MAX_HP' } | { readonly kind: 'ACTION'; readonly class_id: string };

const CENTI = 100;
const RATE_MAX = 100;

type IntParam =
  | 'cost_hp'
  | 'cost_vp'
  | 'cost_pp'
  | 'cost_ap'
  | 'step_thought'
  | 'step_startup'
  | 'step_recovery'
  | 'deploy_ap'
  | 'gain_vp'
  | 'range'
  | 'atk';
type CentiParam = 'charge_pp' | 'dmg_hp' | 'dmg_vp' | 'dmg_pp' | 'dmg_ap';
type RateParam = 'decay_ap' | 'purify_rate' | 'strip_rate';
type DictParam = 'give_buff' | 'give_debuff';

// [M-DATA-COEFFKEYS] 係数キー → 乗算先。
const INT_TARGETS: Partial<Record<CoeffKey, readonly IntParam[]>> = {
  thRate: ['step_thought'],
  stRate: ['step_startup'],
  rcRate: ['step_recovery'],
  costRate: ['cost_hp', 'cost_vp', 'cost_pp', 'cost_ap'],
  deployRate: ['deploy_ap'],
  rangeRate: ['range'],
  atkRate: ['atk'],
  gainVpRate: ['gain_vp'],
};
const CENTI_TARGETS: Partial<Record<CoeffKey, readonly CentiParam[]>> = {
  chargePpRate: ['charge_pp'],
  dmgRate: ['dmg_hp', 'dmg_vp', 'dmg_pp', 'dmg_ap'],
};
const RATE_TARGETS: Partial<Record<CoeffKey, readonly RateParam[]>> = {
  decayApRate: ['decay_ap'],
  purifyRate: ['purify_rate'],
  stripRate: ['strip_rate'],
};
const DICT_TARGETS: Partial<Record<CoeffKey, readonly DictParam[]>> = {
  giveBuffRate: ['give_buff'],
  giveDebuffRate: ['give_debuff'],
};

// [M-INHERIT-MERGE] 減少型は最小値、増加型は最大値を採る。
const DECREASING_MERGE: readonly (keyof ActionParams)[] = [
  'cost_hp',
  'cost_vp',
  'cost_pp',
  'cost_ap',
  'step_thought',
  'step_startup',
  'step_recovery',
  'decay_ap',
];
const INCREASING_MERGE: readonly (keyof ActionParams)[] = [
  'deploy_ap',
  'range',
  'atk',
  'dmg_hp',
  'dmg_vp',
  'dmg_pp',
  'dmg_ap',
  'gain_vp',
  'charge_pp',
  'purify_rate',
  'strip_rate',
];

function coeffOf(attendant: AttendantMasterRecord, key: CoeffKey): number {
  return attendant.coeffs[key] ?? CENTI;
}

// 基礎値 × 係数（centi）を四捨五入する。基礎値0は0を維持する（基礎値0固定ルール）。
function scale(base: number, coeffCenti: number): number {
  return roundDiv(base * coeffCenti, CENTI);
}

// [M-DATA-INSTANTIATE] 手順2〜3（従者特性係数の乗算と丸め）。
function applyCoefficients(params: ActionParams, attendant: AttendantMasterRecord): ActionParams {
  const result = { ...params, give_buff: { ...params.give_buff }, give_debuff: { ...params.give_debuff } };
  const keys = Object.keys(attendant.coeffs) as CoeffKey[];
  for (const key of keys) {
    const coeff = coeffOf(attendant, key);
    for (const id of INT_TARGETS[key] ?? []) {
      const scaled = scale(params[id], coeff);
      // 通常アクションの必要発生ステップのみ下限1（即時型の0は基礎値0固定ルールで維持される）。
      result[id] = id === 'step_startup' && params[id] > 0 ? Math.max(scaled, 1) : scaled;
    }
    for (const id of CENTI_TARGETS[key] ?? []) {
      result[id] = scale(params[id], coeff);
    }
    for (const id of RATE_TARGETS[key] ?? []) {
      result[id] = Math.min(scale(params[id], coeff), RATE_MAX);
    }
    for (const id of DICT_TARGETS[key] ?? []) {
      const scaledDict: Record<string, number> = {};
      for (const paramId of Object.keys(params[id]).sort()) {
        scaledDict[paramId] = scale(params[id][paramId] ?? 0, coeff);
      }
      result[id] = scaledDict;
    }
  }
  return result;
}

function sortedDict(dict: Readonly<Record<string, number>>): string {
  return JSON.stringify(Object.keys(dict).sort().map((key) => [key, dict[key]]));
}

function paramsEqual(a: ActionParams, b: ActionParams): boolean {
  const keys = Object.keys(a) as (keyof ActionParams)[];
  return keys.every((key) => {
    if (key === 'give_buff' || key === 'give_debuff') {
      return sortedDict(a[key]) === sortedDict(b[key]);
    }
    return a[key] === b[key];
  });
}

function mergeDict(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const key of [...Object.keys(a), ...Object.keys(b)].sort()) {
    merged[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
  }
  return merged;
}

function mergeParams(existing: ActionParams, incoming: ActionParams): ActionParams {
  const merged: Record<string, unknown> = { ...existing };
  for (const key of DECREASING_MERGE) {
    merged[key] = Math.min(existing[key] as number, incoming[key] as number);
  }
  for (const key of INCREASING_MERGE) {
    merged[key] = Math.max(existing[key] as number, incoming[key] as number);
  }
  merged.give_buff = mergeDict(existing.give_buff, incoming.give_buff);
  merged.give_debuff = mergeDict(existing.give_debuff, incoming.give_debuff);
  return merged as unknown as ActionParams;
}

// 直前にクリアしたシーン（phase == INTERMISSION の current_scene_id の1つ前）。
function clearedScene(run: RunState, masters: GameMasters) {
  return sceneByOrder(masters, sceneOf(masters, run.current_scene_id).order - 1);
}

// [M-INHERIT-POOL] 直前バトルの敵マスター初期所持アクション ＋ 最大HP加算。無限使用アクションは除外する。
export function inheritPool(run: RunState, masters: GameMasters): InheritTarget[] {
  const scene = clearedScene(run, masters);
  const pool: InheritTarget[] = [];
  const seen: string[] = [];
  for (const classId of enemyOf(masters, scene.enemy_id).acts) {
    const record = actionOf(masters, classId);
    if (!record.inheritable || record.base_uses === INFINITE_USES || seen.includes(classId)) {
      continue;
    }
    seen.push(classId);
    pool.push({ kind: 'ACTION', class_id: classId });
  }
  if (scene.hp_bonus_base !== null) {
    pool.push({ kind: 'MAX_HP' });
  }
  return pool;
}

function inPool(pool: readonly InheritTarget[], target: InheritTarget): boolean {
  return pool.some(
    (entry) => entry.kind === target.kind && (entry.kind === 'MAX_HP' || (target.kind === 'ACTION' && entry.class_id === target.class_id)),
  );
}

export function canInherit(run: RunState, masters: GameMasters, attendantId: string, target: InheritTarget): boolean {
  if (run.phase !== 'INTERMISSION' || run.intermission_stage !== 'INHERIT') {
    return false;
  }
  const slot = run.party.find((entry) => entry.attendant_id === attendantId);
  return slot !== undefined && slot.inherit_state === 'UNUSED' && inPool(inheritPool(run, masters), target);
}

// [M-INHERIT-MERGE]［UI要件］継承対象の確定前に提示する見込み。ステートを変更しない。
export type InheritPreview =
  | {
      readonly kind: 'MAX_HP';
      readonly add: number;
      readonly maxHpBefore: number;
      readonly maxHpAfter: number;
      readonly boosted: readonly string[];
    }
  | { readonly kind: 'VANISH'; readonly classId: string } // 実効初期使用回数0により消滅（継承権は消費）
  | {
      readonly kind: 'NEW_SLOT';
      readonly classId: string;
      readonly params: ActionParams;
      readonly usesInitial: number;
      // 従者特性係数により基礎値から改善した項目（[M-DATA-INSTANTIATE]・[M-DATA-COEFFKEYS]）。
      readonly boosted: readonly string[];
    }
  | {
      readonly kind: 'MERGE';
      readonly classId: string;
      readonly params: ActionParams; // 統合後の基礎値
      readonly usesInitial: number; // 統合後の実効初期使用回数（最大値・合算しない）
      readonly improved: readonly string[]; // 統合により改善された項目（0件は「改善なし」）
      readonly boosted: readonly string[];
    };

// 統合により値が改善した項目を列挙する。回数の改善は 'uses' として扱う。
function improvedKeys(existing: ActionInstance, merged: ActionParams, usesInitial: number): string[] {
  const keys = Object.keys(merged) as (keyof ActionParams)[];
  const improved = keys.filter((key) => {
    if (key === 'give_buff' || key === 'give_debuff') {
      return sortedDict(existing.base_params[key]) !== sortedDict(merged[key]);
    }
    return existing.base_params[key] !== merged[key];
  });
  const result = improved.map((key) => String(key));
  if (usesInitial > existing.uses_initial) {
    result.push('uses');
  }
  return result;
}

// 従者特性係数の適用で基礎値から改善した項目。減少型は小さく、増加型は大きくなったものを採る。
function boostedKeys(base: ActionParams, scaled: ActionParams, baseUses: number, usesInitial: number): string[] {
  const keys: string[] = [];
  for (const key of DECREASING_MERGE) {
    if ((scaled[key] as number) < (base[key] as number)) {
      keys.push(String(key));
    }
  }
  for (const key of INCREASING_MERGE) {
    if (key === 'give_buff' || key === 'give_debuff') {
      if (sortedDict(scaled[key]) !== sortedDict(base[key])) {
        keys.push(String(key));
      }
      continue;
    }
    if ((scaled[key] as number) > (base[key] as number)) {
      keys.push(String(key));
    }
  }
  if (usesInitial > baseUses) {
    keys.push('uses');
  }
  return keys;
}

export function previewInherit(
  run: RunState,
  masters: GameMasters,
  attendantId: string,
  target: InheritTarget,
): InheritPreview {
  const attendant = attendantOf(masters, attendantId);
  if (target.kind === 'MAX_HP') {
    const base = clearedScene(run, masters).hp_bonus_base ?? 0;
    const add = scale(base, coeffOf(attendant, 'hpAddRate'));
    return {
      kind: 'MAX_HP',
      add,
      maxHpBefore: run.hero_max_hp,
      maxHpAfter: run.hero_max_hp + add,
      boosted: add > base ? ['hp_add'] : [],
    };
  }
  const record = actionOf(masters, target.class_id);
  const usesInitial = roundDiv(record.base_uses * coeffOf(attendant, 'usesRate'), CENTI * CENTI);
  if (usesInitial === 0) {
    return { kind: 'VANISH', classId: record.class_id };
  }
  const params = applyCoefficients(record.params, attendant);
  const boosted = boostedKeys(record.params, params, roundDiv(record.base_uses, CENTI), usesInitial);
  const existing = run.hero_acts.find(
    (action) => action.master_ref === record.class_id && paramsEqual(action.merge_params, record.params),
  );
  if (existing === undefined) {
    return { kind: 'NEW_SLOT', classId: record.class_id, params, usesInitial, boosted };
  }
  const merged = mergeParams(existing.base_params, params);
  return {
    kind: 'MERGE',
    classId: record.class_id,
    params: merged,
    usesInitial: Math.max(existing.uses_initial, usesInitial),
    improved: improvedKeys(existing, merged, usesInitial),
    boosted,
  };
}

// [M-INHERIT-POOL]［継承・統合パイプライン］従者1名分を実行する。事前条件は canInherit。
export function applyInherit(run: RunState, masters: GameMasters, attendantId: string, target: InheritTarget): void {
  const attendant = attendantOf(masters, attendantId);
  const slot = run.party.find((entry) => entry.attendant_id === attendantId);
  if (slot === undefined) {
    throw new Error(`同行枠に存在しない従者: ${attendantId}`);
  }
  slot.inherit_state = 'SPENT';

  if (target.kind === 'MAX_HP') {
    const base = clearedScene(run, masters).hp_bonus_base ?? 0;
    run.hero_max_hp += scale(base, coeffOf(attendant, 'hpAddRate'));
    return;
  }

  const record = actionOf(masters, target.class_id);
  const usesInitial = roundDiv(record.base_uses * coeffOf(attendant, 'usesRate'), CENTI * CENTI);
  if (usesInitial === 0) {
    return; // 配列に追加されず消滅（継承権は消費）
  }
  const params = applyCoefficients(record.params, attendant);

  const existing = run.hero_acts.find(
    (action) => action.master_ref === record.class_id && paramsEqual(action.merge_params, record.params),
  );
  if (existing !== undefined) {
    existing.base_params = mergeParams(existing.base_params, params);
    existing.sys_flags = deriveSysFlags(existing.base_params);
    existing.uses_initial = Math.max(existing.uses_initial, usesInitial);
    existing.uses_left = Math.max(existing.uses_left, usesInitial);
    return;
  }

  const instance: ActionInstance = {
    instance_id: allocateInstanceId(run),
    master_ref: record.class_id,
    sys_flags: deriveSysFlags(params),
    base_params: params,
    merge_params: { ...record.params },
    uses_initial: usesInitial,
    uses_left: usesInitial,
    seal_accum: 0,
    is_copy: false,
    copy_fixation: 0,
  };
  run.hero_acts.push(instance);
}
