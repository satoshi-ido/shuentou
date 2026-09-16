// [I-PLAN-MASTERGEN]［人が書く入力］文言マスタ（[M-DATA-STRINGMASTER]）。
// 要求集合の正本は [M-DATA-STRINGS]・[M-DATA-PAUSE-REASON]・[M-UI-OBJECTIVE]。
// 本文は未執筆であり、[I-PLAN-TEXT]［プレースホルダの書式］に従って生成器が組み立てる
// （レコードIDを角括弧で囲み、当該レコードが用いる補間キーを列挙する）。執筆時に text を直接記す。

// context は [M-DATA-INTERP]［文脈束］の語彙。keys は本文が用いる文脈キーのうち、
// 束の代表キー（下記 BUNDLE_KEYS）以外に用いるものを列挙する。
export const STRINGS = [
  // ［継承・供犠・インターミッション決済］
  { string_id: 'STR_CONFIRM_FORFEIT', context: [], confirm: true },
  { string_id: 'STR_CONFIRM_FORFEIT_ROW', context: ['ATTENDANT'] },
  { string_id: 'STR_INHERIT_NO_IMPROVE', context: ['ACTION'] },
  { string_id: 'STR_CONFIRM_SACRIFICE', context: ['ATTENDANT', 'SACRIFICE'], confirm: true },
  { string_id: 'STR_LOCK_NO_ATTENDANT', context: [] },
  { string_id: 'STR_CONFIRM_IM_COMMIT', context: [], confirm: true },
  { string_id: 'STR_INHERIT_HP_ADD', context: ['ATTENDANT'], keys: ['HpAdd'] },
  { string_id: 'STR_INHERIT_VANISH', context: [] },
  { string_id: 'STR_INHERIT_NEW_SLOT', context: ['ACTION'] },
  { string_id: 'STR_INHERIT_MERGED', context: ['ACTION', 'ATTENDANT'], keys: ['ImprovedList'] },
  { string_id: 'STR_SACRIFICE_DONE', context: ['ATTENDANT'] },
  { string_id: 'STR_IM_COMMIT_DONE', context: [] },
  // ［従者補充］
  { string_id: 'STR_CONFIRM_REFILL', context: [], confirm: true },
  { string_id: 'STR_CONFIRM_REFILL_ROW', context: ['ATTENDANT'] },
  { string_id: 'STR_REFILL_SHORT', context: ['REFILL'] },
  { string_id: 'STR_REFILL_DONE', context: [] },
  // ［巻き戻し］
  { string_id: 'STR_CONFIRM_ROLLBACK_BATTLE', context: [], confirm: true },
  { string_id: 'STR_CONFIRM_ROLLBACK_IM', context: [], confirm: true },
  { string_id: 'STR_CONFIRM_ROLLBACK_IM_ROW', context: [] },
  { string_id: 'STR_REWIND_PENDING', context: [] },
  { string_id: 'STR_UNDO_UNAVAILABLE', context: [] },
  // ［バトル・結果］
  { string_id: 'STR_RESULT_WIN', context: ['ENEMY'] },
  { string_id: 'STR_RESULT_LOSE', context: ['ENEMY'] },
  { string_id: 'STR_RESULT_LOSE_SUICIDE', context: [] },
  { string_id: 'STR_LOCK_NO_PARTNER', context: [] },
  { string_id: 'STR_LOCK_PARTNER_STARTUP', context: ['UNIT'] },
  { string_id: 'STR_LOCK_PARTNER_RECOVERY', context: ['UNIT'] },
  { string_id: 'STR_SACRAMENT_AWAKEN', context: [] },
  // ［セーブ・タイトル］
  { string_id: 'STR_CONFIRM_QUIT_BATTLE', context: [], confirm: true },
  { string_id: 'STR_TITLE_RUN_CLOSED', context: [] },
  { string_id: 'STR_CONFIRM_NEWGAME', context: [], confirm: true },
  // ［目的表示］[M-UI-OBJECTIVE]
  { string_id: 'STR_OBJECTIVE_VOID_LORD', context: [] },
  { string_id: 'STR_OBJECTIVE_VEIN', context: [] },
  // ［解説の初出自動提示］[M-DATA-HELPMASTER]
  { string_id: 'STR_HELP_FIRST_SIGHT', context: ['HELP'] },
  // ［自動時間停止の事由文言］[M-DATA-PAUSE-REASON]
  { string_id: 'STR_PAUSE_STEP0_READY', context: [] },
  { string_id: 'STR_PAUSE_ENEMY_START', context: ['UNIT', 'ACTION', 'PAUSE'] },
  { string_id: 'STR_PAUSE_ENEMY_IMMEDIATE', context: ['UNIT', 'ACTION'] },
  { string_id: 'STR_PAUSE_WATCH_MET', context: ['UNIT', 'ACTION', 'PAUSE'] },
  { string_id: 'STR_PAUSE_MANUAL', context: [] },
  // ［監視条件ラベル］[M-DATA-PAUSE-REASON]。いずれも context は空配列である。
  { string_id: 'STR_WATCH_READY', context: [] },
  { string_id: 'STR_WATCH_STUN', context: [] },
  { string_id: 'STR_WATCH_HIT_FRONT', context: [] },
  { string_id: 'STR_WATCH_HIT_BACK', context: [] },
  { string_id: 'STR_WATCH_EVADE', context: [] },
  { string_id: 'STR_WATCH_NA', context: [] },
  { string_id: 'STR_WATCH_IDLE', context: [] },
];
