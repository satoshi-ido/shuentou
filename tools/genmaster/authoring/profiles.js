// [I-PLAN-MASTERGEN]［人が書く入力］AIプロファイルマスタ（[A-PROFILE-SCHEMA]）。
// 値の正本は [A-PROFILE-TABLE]。範囲は [I-PLAN-MILESTONE]［M4 のマスタ範囲］に従う。
// weight_mult は小数第2位までの文字列で書き、生成時に centi へ変換する。

export const AI_PROFILES = [
  {
    profile_id: 'PROFILE_FRENZY',
    display_name: '狂乱',
    weight_mult: { impatience: '1.50', pp: '0.50' },
    action_bonus: { PASS: -800 },
    dynamic_weight: null,
  },
  {
    profile_id: 'PROFILE_ASSAULT',
    display_name: '強襲',
    weight_mult: { tempo: '1.50', position: '1.50' },
    action_bonus: { RUSH: 600, PASS: -600 },
    dynamic_weight: null,
  },
];
