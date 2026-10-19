// [M-STATE-PARAMIDS]
// 戦闘中バフ・デバフ対象パラメータID（全17種）。辞書のキー集合として用いる。
// I-STATE-JSON により Map/Set を用いず、素のオブジェクトとソート済み配列で表す。

export const PARAM_IDS = [
  'atk',
  'charge_pp',
  'cost_ap',
  'cost_hp',
  'cost_pp',
  'cost_vp',
  'decay_ap',
  'deploy_ap',
  'dmg_ap',
  'dmg_hp',
  'dmg_pp',
  'dmg_vp',
  'gain_vp',
  'range',
  'step_recovery',
  'step_startup',
  'step_thought',
] as const;

export type ParamId = (typeof PARAM_IDS)[number];

export type ParamMap = Readonly<Record<ParamId, number>>;

// [M-CALC-EFFECTIVE] 減少型（消費コスト系、必要ステップ数、AP減衰率）。I-STATE-JSON により Set を用いず配列で表す。
const DECREASING_PARAM_IDS: readonly ParamId[] = [
  'step_thought',
  'step_startup',
  'step_recovery',
  'cost_hp',
  'cost_vp',
  'cost_pp',
  'cost_ap',
  'decay_ap',
];

// 実効値の導出のたびに引くため、配列の走査ではなく表で引く。
const IS_DECREASING: Readonly<Partial<Record<ParamId, true>>> = Object.fromEntries(
  DECREASING_PARAM_IDS.map((id) => [id, true]),
);

export function isDecreasingParam(id: ParamId): boolean {
  return IS_DECREASING[id] === true;
}

// 全17項目 0.00（centi: 0）の辞書を生成する（[M-STATE-UNIT] 被バフ量・被デバフ量の初期値）。
export function createZeroParamMap(): Record<ParamId, number> {
  const map = {} as Record<ParamId, number>;
  for (const id of PARAM_IDS) {
    map[id] = 0;
  }
  return map;
}

// [I-STATE-JSON] 無限（uses_left・uses_initial・base_uses）のセンチネル値。
export const INFINITE_USES = -1;
