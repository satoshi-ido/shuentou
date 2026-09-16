// [M-UI-HUD]［数値書式］［記号語彙］表示用の文字列化。実効値をそのまま描画し、再度の丸めを行わない。

import { INFINITE_USES } from '../engine/params.js';

export const INFINITY_MARK = '∞';
export const STEP_ARROW = '▸';

// 記号語彙。監視条件の短縮記号は [M-UI-WATCH] の5条件に対応する。
export const SYMBOL = {
  hp: 'HP',
  vp: 'VP',
  pp: 'PP',
  ap: 'AP',
  stepThought: '思',
  stepStartup: '発',
  stepRecovery: '硬',
  remaining: '残',
  atk: '攻',
  defense: '防',
  range: '射',
} as const;

export const WATCH_SYMBOL = { READY: '可', STUN: '止', HIT_FRONT: '中前', HIT_BACK: '中後', EVADE: '避' } as const;

// [M-STATE-PARAMIDS]「表示名」列。
export const PARAM_LABEL: Readonly<Record<string, string>> = {
  step_thought: '必要思考',
  step_startup: '発生',
  step_recovery: '硬直',
  cost_hp: 'HPコスト',
  cost_vp: 'VPコスト',
  cost_pp: 'PPコスト',
  cost_ap: 'APコスト',
  decay_ap: 'AP減衰率',
  deploy_ap: '展開AP',
  range: '射程',
  atk: '攻撃力',
  dmg_hp: 'HPダメージ',
  dmg_vp: 'VPダメージ',
  dmg_pp: 'PPダメージ',
  dmg_ap: 'APダメージ',
  gain_vp: '加算VP',
  charge_pp: 'PP充填効率',
};

// [M-DATA-COEFFKEYS] 従者特性係数キーの表示名。乗算先のパラメータ名に合わせる。
export const COEFF_LABEL: Readonly<Record<string, string>> = {
  thRate: '必要思考',
  stRate: '発生',
  rcRate: '硬直',
  costRate: 'コスト',
  decayApRate: 'AP減衰率',
  deployRate: '展開AP',
  rangeRate: '射程',
  atkRate: '攻撃力',
  dmgRate: 'ダメージ',
  gainVpRate: '加算VP',
  chargePpRate: 'PP充填効率',
  purifyRate: '浄化率',
  stripRate: '剥離率',
  giveBuffRate: '付与する強化',
  giveDebuffRate: '付与する弱化',
  usesRate: '使用回数',
  hpAddRate: '最大HP加算',
};

// [M-DATA-COEFFKEYS]「向き」列。減少は 1.00 未満が、増加は 1.00 を超える値が改善である。
const DECREASING_COEFFS: readonly string[] = ['thRate', 'stRate', 'rcRate', 'costRate', 'decayApRate'];

// 係数が改善（従者の強み）であるか。
export function isCoeffGain(key: string, centi: number): boolean {
  return DECREASING_COEFFS.includes(key) ? centi < 100 : centi > 100;
}

// [M-CALC-EFFECTIVE] 減少型のパラメータ（符号の向きの決定に用いる）。
const DECREASING_PARAMS: readonly string[] = [
  'step_thought',
  'step_startup',
  'step_recovery',
  'cost_hp',
  'cost_vp',
  'cost_pp',
  'cost_ap',
  'decay_ap',
];

// 2. 小数パラメータは小数第2位まで表示し、末尾の 0 を省略しない。
export function formatCenti(centi: number): string {
  const sign = centi < 0 ? '−' : '';
  const value = Math.abs(centi);
  const whole = Math.trunc(value / 100);
  const fraction = value % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}

// 6. 補正率はパーセント表記とし、値 × 100 を四捨五入して整数で表示する（内部は centi のため値そのもの）。
export function formatPercent(centi: number): string {
  return `${Math.round(centi)}%`;
}

// 3. 無限は ∞ の1文字。4. 使用回数は 残り / 実効初期使用回数 の分数形。
export function formatUses(usesLeft: number, usesInitial: number): string {
  if (usesLeft === INFINITE_USES || usesInitial === INFINITE_USES) {
    return INFINITY_MARK;
  }
  return `${usesLeft} / ${usesInitial}`;
}

// 5. ステップ数は 経過 / 基準 の分数形とし、残数を併記する。
export function formatSteps(elapsed: number, required: number): string {
  return `${elapsed} / ${required}（${SYMBOL.remaining}${Math.max(required - elapsed, 0)}）`;
}

// 7. 符号は補正の向きに従う。増加型はバフ +／デバフ −、減少型はバフ −／デバフ +。
export function correctionSign(paramId: string, kind: 'BUFF' | 'DEBUFF'): '+' | '−' {
  const decreasing = DECREASING_PARAMS.includes(paramId);
  if (kind === 'BUFF') {
    return decreasing ? '−' : '+';
  }
  return decreasing ? '+' : '−';
}

// 8. 既定値（0 / 0.00 / 空辞書）のパラメータは要素そのものを描画しない。
export function isDefaultValue(centi: number): boolean {
  return centi === 0;
}

// 9. 現在HPはクランプ後の値を表示する（負数を表示しない）。
export function formatHp(hp: number, maxHp: number): string {
  return `${Math.max(hp, 0)} / ${maxHp}`;
}
