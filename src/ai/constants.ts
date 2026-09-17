// [A-EVAL-REFIMPL] 評価定数・系統フラグのビット割当。
// 評価器・探索器の内部表現は 1/1024 刻みの int32 固定小数（[A-EVAL-FORM]）であり、
// [I-NUM-FIXEDPOINT]「評価器との境界」により centi とは別系として扱う。

export const SCALE = 1024;
export const MATE = 100000;
export const SIMUL_PEN = 1000; // Δ（両軍マスター同時撃破の減点）
export const MATE_TH = MATE - 10000;
export const QMATE = MATE_TH - 1; // [A-EVAL-MATE]「静止探索中の決着」のスコア基準
export const INF = MATE + SCALE;
export const TTK_MAX = 999;
export const TIE_BONUS = 16; // SCALE // 64
export const PURIFY_ITER_MAX = 8;
export const BONUS_DEFAULT_PASS = -400; // [A-PROFILE-BONUS]
// [A-PROFILE-BONUS] 再交代の判定窓。隊列交代で思考中へ着地してからの経過思考がこれ未満の組を「直前の
// ステップで交代した組」とみなす（瞬動の実行者は次の決定点で経過思考1となるため、2で直前のステップを捉える）。
export const RESWAP_WINDOW_STEPS = 2;
// [A-PROFILE-BONUS] 再交代の減点。パスの既定減点と同じ値とする。
export const RESWAP_PENALTY = BONUS_DEFAULT_PASS;

// [A-EVAL-REFIMPL]「系統フラグのビット割当」。[M-STATE-FLAGS] のフラグ名で直接扱うため
// 本実装ではビット値そのものは使用しないが、参照用に残す。
export const FLAG_BITS: Readonly<Record<string, number>> = {
  FLAG_SUMMON: 1 << 0,
  FLAG_SWAP: 1 << 1,
  FLAG_MIND: 1 << 2,
  FLAG_MARTIAL: 1 << 3,
  FLAG_STANCE: 1 << 4,
  FLAG_PURIFY: 1 << 5,
};

// [M-STATE-PARAMIDS]「標準付与量」列（centi）。[A-EVAL-STATUS] x_debuff の正規化に用いる。
export const STD: Readonly<Record<string, number>> = {
  step_thought: 33,
  step_startup: 33,
  step_recovery: 33,
  cost_hp: 33,
  cost_vp: 33,
  cost_pp: 33,
  cost_ap: 33,
  decay_ap: 33,
  deploy_ap: 50,
  range: 50,
  atk: 50,
  dmg_hp: 50,
  dmg_vp: 50,
  dmg_pp: 50,
  dmg_ap: 50,
  gain_vp: 50,
  charge_pp: 50,
};

// [M-STATE-PARAMIDS]「AI評価重み」列。合計1024（[A-EVAL-STATUS] x_debuff の加重和に用いる）。
export const DEBUFF_IMPORTANCE: Readonly<Record<string, number>> = {
  step_thought: 96,
  step_startup: 64,
  step_recovery: 96,
  cost_hp: 16,
  cost_vp: 8,
  cost_pp: 48,
  cost_ap: 32,
  decay_ap: 48,
  deploy_ap: 96,
  range: 64,
  atk: 128,
  dmg_hp: 128,
  dmg_vp: 8,
  dmg_pp: 32,
  dmg_ap: 48,
  gain_vp: 48,
  charge_pp: 64,
};
