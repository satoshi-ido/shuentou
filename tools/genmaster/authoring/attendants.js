// [I-PLAN-MASTERGEN]［人が書く入力］従者マスタ（[M-DATA-ATTENDANTMASTER]）。
// 範囲は [I-PLAN-MILESTONE]［M3 のマスタ範囲］（join_act が 1 または 2）に従う。値の正本は [M-DATA-ATTENDANTS]。
// 係数は小数表記の文字列で書き、生成器が centi へ変換する。

export const ATTENDANTS = [
  {
    attendant_id: 'ATTENDANT_01',
    display_name: 'リナ',
    epithet: '灯し直しの手',
    join_act: 1,
    is_fixed: true,
    coeffs: { usesRate: '4.50' },
  },
  {
    attendant_id: 'ATTENDANT_02',
    display_name: 'ガルド',
    epithet: '鉄鎖の頭',
    join_act: 2,
    is_fixed: false,
    coeffs: { hpAddRate: '1.50', usesRate: '3.00' },
  },
  {
    attendant_id: 'ATTENDANT_03',
    display_name: 'ミレイユ',
    epithet: '秤の目',
    join_act: 2,
    is_fixed: false,
    coeffs: { costRate: '0.67', usesRate: '3.00' },
  },
];
