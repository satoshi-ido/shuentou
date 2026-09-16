// [M-DATA-INTERP] 文字列補間。補間箇所は { と } で囲んだキー1個とし、リテラルの波括弧は二重化で表す。
// 未定義キーを空文字で埋めず、解決できないキーはオーサリングエラーとして棄却する。
// 文言マスタの text は、context が列挙する束のみを用いる。呼び出し側は当該の束をすべて供給する義務を負う。

import type { ContextBundle, HelpMasterRecord, StringMasterRecord } from '../data/types.js';

export type InterpValue = string | number;

// ［キーの語彙］共通キー。あらゆる文脈で解決できる。
export const COMMON_KEYS: readonly string[] = [
  'TotalRewindCount',
  'PlaythroughCount',
  'SacrificeCount',
  'EnshrinedCount',
  'UnenshrinedCount',
  'CoreCount',
  'ActNumber',
  'PartyCount',
  'SceneName',
  'SceneNumber',
  'HeroName',
  'HeroHp',
  'HeroHpMax',
];

// ［キーの語彙］文脈キー。対応する束が供給されている場合に限り解決できる。
// アクション実効値キーはパラメータID（[M-STATE-PARAMIDS]）をそのままの綴りで用いる。
export const BUNDLE_KEYS: Readonly<Record<ContextBundle, readonly string[]>> = {
  ACTION: [
    'ActionName',
    'atk',
    'range',
    'deploy_ap',
    'gain_vp',
    'charge_pp',
    'cost_hp',
    'cost_vp',
    'cost_pp',
    'cost_ap',
    'step_thought',
    'step_startup',
    'step_recovery',
    'uses_left',
    'uses_initial',
    'ImprovedList',
  ],
  UNIT: ['UnitName', 'UnitRoleName', 'UnitHp', 'UnitHpMax', 'UnitVp', 'UnitPp', 'UnitAp'],
  ATTENDANT: ['AttendantName', 'AttendantEpithet', 'HpAdd'],
  ENEMY: ['EnemyName', 'EnemyRoleName'],
  PAUSE: ['WatchLabel', 'RemainingSteps'],
  SACRIFICE: ['PartyCountAfter'],
  REFILL: ['SlotCount', 'RemainCount'],
  HELP: ['HelpTitle', 'HelpBody'],
};

export type BundleValues = Readonly<Record<string, InterpValue>>;

export interface TextContext {
  readonly common: BundleValues;
  readonly bundles?: Partial<Record<ContextBundle, BundleValues>>;
}

const PLACEHOLDER = /\{\{|\}\}|\{([^{}]*)\}/g;

function resolveKey(key: string, record: StringMasterRecord, context: TextContext): InterpValue {
  if (COMMON_KEYS.includes(key)) {
    const value = context.common[key];
    if (value === undefined) {
      throw new Error(`共通キーの値が供給されていない: ${record.string_id} {${key}}`);
    }
    return value;
  }
  for (const bundle of record.context) {
    if (!BUNDLE_KEYS[bundle].includes(key)) {
      continue;
    }
    const values = context.bundles?.[bundle];
    if (values === undefined) {
      throw new Error(`文脈束が供給されていない: ${record.string_id} ${bundle}`);
    }
    const value = values[key];
    if (value === undefined) {
      throw new Error(`文脈キーの値が供給されていない: ${record.string_id} {${key}}`);
    }
    return value;
  }
  throw new Error(`解決できない補間キー: ${record.string_id} {${key}}`);
}

// 本文1件を解決する。context が列挙する束は、値の要否に関わらず供給されていなければならない。
export function resolveText(record: StringMasterRecord, context: TextContext): string {
  for (const bundle of record.context) {
    if (context.bundles?.[bundle] === undefined) {
      throw new Error(`文脈束が供給されていない: ${record.string_id} ${bundle}`);
    }
  }
  return record.text.replace(PLACEHOLDER, (matched, key: string | undefined) => {
    if (matched === '{{') {
      return '{';
    }
    if (matched === '}}') {
      return '}';
    }
    return String(resolveKey(key ?? '', record, context));
  });
}

export interface StringTable {
  readonly resolve: (stringId: string, context?: TextContext) => string;
  readonly record: (stringId: string) => StringMasterRecord;
}

const EMPTY_CONTEXT: TextContext = { common: {} };

export function createStringTable(masters: Readonly<Record<string, StringMasterRecord>>): StringTable {
  const record = (stringId: string): StringMasterRecord => {
    const found = masters[stringId];
    if (found === undefined) {
      throw new Error(`未知の文言ID: ${stringId}`);
    }
    return found;
  };
  return {
    record,
    resolve: (stringId, context = EMPTY_CONTEXT) => resolveText(record(stringId), context),
  };
}

// [M-DATA-HELPMASTER] 解説の title / body は共通キーのみで解決する（[M-DATA-INTERP]［束の供給元］）。
export function resolveHelp(record: HelpMasterRecord, common: BundleValues): { readonly title: string; readonly body: string } {
  const asString = (id: string, text: string): StringMasterRecord => ({ string_id: id, text, context: [] });
  const context: TextContext = { common };
  return {
    title: resolveText(asString(record.help_id, record.title), context),
    body: resolveText(asString(record.help_id, record.body), context),
  };
}

// [I-PLAN-TEXT]［プレースホルダの書式］に一致する本文か（残存件数の検査に用いる）。
export function isPlaceholderText(recordId: string, text: string): boolean {
  return text.startsWith(`[${recordId}]`);
}
