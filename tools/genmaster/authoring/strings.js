// [I-PLAN-MASTERGEN]［人が書く入力］文言マスタ（[M-DATA-STRINGMASTER]）。
// 要求集合の正本は [M-DATA-STRINGS]・[M-DATA-PAUSE-REASON]・[M-UI-OBJECTIVE]。
// 本文（text）、確認ダイアログの見出し（head）と決定ボタン名（button）を記す。未執筆の入力は、
// [I-PLAN-TEXT]［プレースホルダの書式］に従って生成器が組み立てる。
// 生成AIによる執筆を含む（[I-PLAN-SUBMISSION]【AIの使用の開示】）。

// context は [M-DATA-INTERP]［文脈束］の語彙。keys はプレースホルダの組み立てにのみ用い、
// 束の代表キー（生成器の BUNDLE_KEYS）以外に本文が用いるキーを列挙する。
// 呼称の置換対象語（天疵）は古名のまま書き、表示時に [S-NAMING-SCHEMA] が置換する（[M-UI-OBJECTIVE]【呼称】）。
export const STRINGS = [
  // ［継承・供犠・インターミッション決済］
  {
    string_id: 'STR_CONFIRM_FORFEIT',
    context: [],
    confirm: true,
    text: 'まだ継承していない従者がいる。このまま進むと、次の継承枠は失われる。',
    head: '継承枠の失効',
    button: '失効させて進む',
  },
  { string_id: 'STR_CONFIRM_FORFEIT_ROW', context: ['ATTENDANT'], text: '{AttendantName}〈{AttendantEpithet}〉の継承枠' },
  { string_id: 'STR_INHERIT_NO_IMPROVE', context: ['ACTION'], text: 'この継承では、{ActionName}の性能は何も変わらない。' },
  {
    string_id: 'STR_CONFIRM_SACRIFICE',
    context: ['ATTENDANT', 'SACRIFICE'],
    confirm: true,
    text: '{AttendantName}の魂を焚き、{HeroName}の傷を癒す。焚かれた魂は、二度と戻らない。同行する従者は{PartyCountAfter}名になる。',
    head: '供犠',
    button: '捧げる',
  },
  { string_id: 'STR_LOCK_NO_ATTENDANT', context: [], text: '同行する従者がいないため、継承も供犠も行えない。' },
  {
    string_id: 'STR_CONFIRM_IM_COMMIT',
    context: [],
    confirm: true,
    text: 'この編成で、次の戦いへ向かう。',
    head: '編成の確定',
    button: '向かう',
  },
  {
    string_id: 'STR_INHERIT_HP_ADD',
    context: ['ATTENDANT'],
    keys: ['HpAdd'],
    text: '{AttendantName}を介して、{HeroName}の最大HPが{HpAdd}増えた。',
  },
  { string_id: 'STR_INHERIT_VANISH', context: [], text: '使用回数が残らず、受け継いだ技は形にならなかった。' },
  { string_id: 'STR_INHERIT_NEW_SLOT', context: ['ACTION'], text: '{ActionName}を新たに得た。' },
  {
    string_id: 'STR_INHERIT_MERGED',
    context: ['ACTION', 'ATTENDANT'],
    keys: ['ImprovedList'],
    text: '{AttendantName}の資質が{ActionName}に重なった。改善：{ImprovedList}',
  },
  { string_id: 'STR_SACRIFICE_DONE', context: ['ATTENDANT'], text: '{AttendantName}を焚いた。{HeroName}の傷が癒えた。' },
  { string_id: 'STR_IM_COMMIT_DONE', context: [], text: '次の戦いへ向かう。' },
  // ［従者補充］
  {
    string_id: 'STR_CONFIRM_REFILL',
    context: [],
    confirm: true,
    text: '次の者を同行させる。',
    head: '従者の補充',
    button: '同行させる',
  },
  { string_id: 'STR_CONFIRM_REFILL_ROW', context: ['ATTENDANT'], text: '{AttendantName}〈{AttendantEpithet}〉' },
  {
    string_id: 'STR_REFILL_SHORT',
    context: ['REFILL'],
    text: '同行枠{SlotCount}のうち、{RemainCount}枠が空いている。空いた枠は、このアクトのあいだ埋まらない。',
  },
  { string_id: 'STR_REFILL_DONE', context: [], text: '新たな魂が芯に結ばれた。{HeroName}の傷が癒えた。' },
  // ［巻き戻し］
  {
    string_id: 'STR_CONFIRM_ROLLBACK_BATTLE',
    context: [],
    confirm: true,
    text: 'この戦いを、始まりからやり直す。',
    head: '戦いの再走',
    button: 'やり直す',
  },
  {
    string_id: 'STR_CONFIRM_ROLLBACK_IM',
    context: [],
    confirm: true,
    text: '選んだインターミッションまで戻り、継承と編成をやり直す。それより後の記録は失われる。',
    head: '編成の再走',
    button: '戻る',
  },
  { string_id: 'STR_CONFIRM_ROLLBACK_IM_ROW', context: [], text: '失われるインターミッション' },
  { string_id: 'STR_REWIND_PENDING', context: [], text: '燈火が揺らいでいる。次の操作を確定したとき、この巻き戻しは燈に刻まれる。' },
  { string_id: 'STR_UNDO_UNAVAILABLE', context: [], text: '取り消せる操作がない。' },
  // ［バトル・結果］
  { string_id: 'STR_RESULT_WIN', context: ['ENEMY'], text: '{EnemyName}を討った。' },
  { string_id: 'STR_RESULT_LOSE', context: ['ENEMY'], text: '{EnemyName}に敗れた。戦いの始まりか、過去のインターミッションからやり直せる。' },
  { string_id: 'STR_RESULT_LOSE_SUICIDE', context: [], text: '自らの消耗に耐えきれず、倒れた。' },
  { string_id: 'STR_LOCK_NO_PARTNER', context: [], text: '入れ替わる相方がいない' },
  { string_id: 'STR_LOCK_PARTNER_STARTUP', context: ['UNIT'], text: '{UnitName}が発生中' },
  { string_id: 'STR_LOCK_PARTNER_RECOVERY', context: ['UNIT'], text: '{UnitName}が硬直中' },
  { string_id: 'STR_SACRAMENT_AWAKEN', context: [], text: '燈の底で、〈復輪の秘蹟〉が目を覚ました。' },
  // ［セーブ・タイトル］
  {
    string_id: 'STR_CONFIRM_QUIT_BATTLE',
    context: [],
    confirm: true,
    text: '戦いを中断して、タイトルへ戻る。再開すると、この戦いの始まりからになる。',
    head: '中断',
    button: '中断する',
  },
  { string_id: 'STR_TITLE_RUN_CLOSED', context: [], text: 'この周回は終わっている。続きからは始められない。' },
  {
    string_id: 'STR_CONFIRM_NEWGAME',
    context: [],
    confirm: true,
    text: 'いまの記録を消して、最初から始める。',
    head: 'ニューゲーム',
    button: '最初から始める',
  },
  // ［目的表示］[M-UI-OBJECTIVE]
  { string_id: 'STR_OBJECTIVE_KALDEN', context: [], text: '王都カルデンで、討伐隊の裁可を得る' },
  { string_id: 'STR_OBJECTIVE_VOID_LORD', context: [], text: '天疵の底に棲む主を討つ' },
  { string_id: 'STR_OBJECTIVE_VEIN', context: [], text: '天の座の主を討つ' },
  // ［解説の初出自動提示］[M-DATA-HELPMASTER]
  { string_id: 'STR_HELP_FIRST_SIGHT', context: ['HELP'], text: 'この戦いでは〈{HelpTitle}〉が現れる。' },
  // ［自動時間停止の事由文言］[M-DATA-PAUSE-REASON]
  { string_id: 'STR_PAUSE_STEP0_READY', context: [], text: '戦いが始まった。最初の指示を選ぶ。' },
  {
    string_id: 'STR_PAUSE_ENEMY_START',
    context: ['UNIT', 'ACTION', 'PAUSE'],
    text: '{UnitName}が{ActionName}の構えに入った。発動まで{RemainingSteps}ステップ。',
  },
  { string_id: 'STR_PAUSE_ENEMY_IMMEDIATE', context: ['UNIT', 'ACTION'], text: '{UnitName}が{ActionName}を即座に放った。' },
  { string_id: 'STR_PAUSE_WATCH_MET', context: ['UNIT', 'ACTION', 'PAUSE'], text: '{UnitName}の{ActionName}が『{WatchLabel}』になった。' },
  { string_id: 'STR_PAUSE_MANUAL', context: [], text: '時を止めた。' },
  // ［監視条件ラベル］[M-DATA-PAUSE-REASON]。いずれも context は空配列である。
  // [M-DATA-PAUSE-REASON]「STR_WATCH_STUN の本文は『拍断ち』とする」。
  { string_id: 'STR_WATCH_STUN', context: [], text: '拍断ち' },
  { string_id: 'STR_WATCH_HIT_FRONT', context: [], text: '前列命中' },
  { string_id: 'STR_WATCH_HIT_BACK', context: [], text: '後列命中' },
  { string_id: 'STR_WATCH_EVADE_FRONT', context: [], text: '前列回避' },
  { string_id: 'STR_WATCH_EVADE_BACK', context: [], text: '後列回避' },
  { string_id: 'STR_WATCH_NA', context: [], text: '対象外' },
  { string_id: 'STR_WATCH_IDLE', context: [], text: '待機' },
];
