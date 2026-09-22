// [I-PLAN-MASTERGEN]［人が書く入力］脚本マスタ（[S-SCRIPT-SCHEMA]）。
// 要求集合の正本は [S-SCRIPT-RECORDS]、発火点は [S-SCRIPT-TRIGGER]、表示条件は [S-SCRIPT-CONDITION]。
// 範囲は [I-PLAN-TEXT]［執筆時点］が M5 に置く全件。
//
// 本文は [I-PLAN-TEXT]［プレースホルダの書式］に従い未執筆とし、lines を1行・speaker を Null・
// directives を WAIT_INPUT のみとする。例外はアクト表題カードであり、提示する文字列が
// [S-ACT-TITLECARD] に確定しているため本文を書き、同項が定める directives を用いる。
//
// `SCRIPT_SCENE_<シーン番号>_INTRO` の31件は全シーンに対して一様であるため、
// 生成器がシーンマスタの入力から展開する（本ファイルには置かない）。

// [S-SCRIPT-CONDITION] INTACT / REWOUND の対は total_rewind_count による二択である
// （[S-SCRIPT-RECORDS] が SCRIPT_END_C2_TAIL_* について明示する分岐条件に揃える）。
const INTACT = 'TotalRewindCount == 0';
const REWOUND = 'TotalRewindCount > 0';

// [S-ACT-TITLECARD]「レコードは旧称の形で保持する」。アクト4は `天疵` で記述し、
// 表示時に `虚穴` へ置換する（[S-NAMING-SCHEMA]）。
const ACT_TITLE_DIRECTIVES = ['FADE_IN', 'ACT_TITLE_CARD', 'WAIT_INPUT'];

function actTitle(number, trigger, anchor, text) {
  return {
    script_id: `SCRIPT_ACT_TITLE_${number}`,
    trigger,
    anchor,
    order: 1,
    branch_group: null,
    condition: null,
    replay_on_rollback: true,
    lines: [{ speaker: null, text, directives: ACT_TITLE_DIRECTIVES }],
  };
}

// 残響・交差残響が相乗りするレコードの anchor は Null とする（[S-SCRIPT-TRIGGER]）。
function ridealong(scriptId, trigger) {
  return { script_id: scriptId, trigger, anchor: null, order: 1, branch_group: null, condition: null, replay_on_rollback: true };
}

// [M-META-ECHO]［トリガー種別と判定タイミング］種別A の対象従者。
const ECHO_A_ATTENDANTS = ['02', '03', '04', '06', '07', '10', '11', '12', '13', '14', '15'];

// [S-CROSS-02-03]〜[S-CROSS-12-13]。IDの形式は [S-CROSS-ID]。
const CROSS_PAIRS = ['02_03', '03_05', '03_15', '04_06', '07_15', '10_11', '11_12', '12_13'];

export const SCRIPTS = [
  // ［SCENE_INTRO］
  actTitle(1, 'SCENE_INTRO', 'SCENE_1_01', 'アクト1：灰の村'),
  {
    // [S-END-A]（周回時の開幕差し替え）
    script_id: 'SCRIPT_SCENE_1_01_MONO_INTACT',
    trigger: 'SCENE_INTRO',
    anchor: 'SCENE_1_01',
    order: 3,
    branch_group: 'SCENE_1_01_MONO',
    condition: INTACT,
    replay_on_rollback: true,
  },
  {
    script_id: 'SCRIPT_SCENE_1_01_MONO_REWOUND',
    trigger: 'SCENE_INTRO',
    anchor: 'SCENE_1_01',
    order: 3,
    branch_group: 'SCENE_1_01_MONO',
    condition: REWOUND,
    replay_on_rollback: true,
  },
  {
    // [S-SCENE-1-02]［開幕］
    script_id: 'SCRIPT_SCENE_1_02_NAMING_INTACT',
    trigger: 'SCENE_INTRO',
    anchor: 'SCENE_1_02',
    order: 2,
    branch_group: 'SCENE_1_02_NAMING',
    condition: INTACT,
    replay_on_rollback: true,
  },
  {
    script_id: 'SCRIPT_SCENE_1_02_NAMING_REWOUND',
    trigger: 'SCENE_INTRO',
    anchor: 'SCENE_1_02',
    order: 2,
    branch_group: 'SCENE_1_02_NAMING',
    condition: REWOUND,
    replay_on_rollback: true,
  },
  {
    script_id: 'SCRIPT_SCENE_1_02_DECLARE',
    trigger: 'SCENE_INTRO',
    anchor: 'SCENE_1_02',
    order: 3,
    branch_group: null,
    condition: null,
    replay_on_rollback: true,
  },
  // 種別A の残響（[M-META-ECHO]）。
  ...ECHO_A_ATTENDANTS.map((number) => ridealong(`SCRIPT_ECHO_${number}`, 'SCENE_INTRO')),

  // ［INTERMISSION_ENTER］交差残響（[S-CROSS-DESIGN]）と種別C の残響（従者08）。
  ...CROSS_PAIRS.map((pair) => ridealong(`SCRIPT_CROSS_${pair}`, 'INTERMISSION_ENTER')),
  ...['0010', '0050', '0200'].map((threshold) => ridealong(`SCRIPT_ECHO_08_${threshold}`, 'INTERMISSION_ENTER')),

  // ［SACRIFICE_CONFIRM］種別D の残響（[S-RETAINER-01]・[S-RETAINER-09]）。
  ridealong('SCRIPT_ECHO_01', 'SACRIFICE_CONFIRM'),
  ridealong('SCRIPT_ECHO_09', 'SACRIFICE_CONFIRM'),

  // ［ACT_TRANSITION］anchor は移行元アクト番号（[S-ACT-TITLECARD]）。
  actTitle(2, 'ACT_TRANSITION', '1', 'アクト2：崩れる都'),
  actTitle(3, 'ACT_TRANSITION', '2', 'アクト3：裏切りの環'),
  actTitle(4, 'ACT_TRANSITION', '3', 'アクト4：天疵'),
  actTitle(5, 'ACT_TRANSITION', '4', 'アクト5：終わらない黄昏'),
  ridealong('SCRIPT_ECHO_05', 'ACT_TRANSITION'),

  // ［ENDING］anchor は分岐記号（[M-END-BRANCH]）。
  { script_id: 'SCRIPT_END_A', trigger: 'ENDING', anchor: 'a', order: 1, branch_group: null, condition: null, replay_on_rollback: true },
  { script_id: 'SCRIPT_END_B', trigger: 'ENDING', anchor: 'b', order: 1, branch_group: null, condition: null, replay_on_rollback: true },
  { script_id: 'SCRIPT_END_C1', trigger: 'ENDING', anchor: 'c-1', order: 1, branch_group: null, condition: null, replay_on_rollback: true },
  { script_id: 'SCRIPT_END_C2', trigger: 'ENDING', anchor: 'c-2', order: 1, branch_group: null, condition: null, replay_on_rollback: true },
  { script_id: 'SCRIPT_END_D', trigger: 'ENDING', anchor: 'd', order: 1, branch_group: null, condition: null, replay_on_rollback: true },
  {
    // [S-END-C2]（total_rewind_count による分岐）
    script_id: 'SCRIPT_END_C2_TAIL_INTACT',
    trigger: 'ENDING',
    anchor: 'c-2',
    order: 2,
    branch_group: 'END_C2_TAIL',
    condition: INTACT,
    replay_on_rollback: true,
  },
  {
    script_id: 'SCRIPT_END_C2_TAIL_REWOUND',
    trigger: 'ENDING',
    anchor: 'c-2',
    order: 2,
    branch_group: 'END_C2_TAIL',
    condition: REWOUND,
    replay_on_rollback: true,
  },

  // ［EPILOGUE］[S-EPILOGUE] が b・c-1・c-2・d に共通の提示順を保持し、各分岐は差分のみを持つ。
  // 6件を分岐ごとに複製しないため anchor は Null とする。
  { script_id: 'SCRIPT_EPILOGUE_OPEN', trigger: 'EPILOGUE', anchor: null, order: 1, branch_group: null, condition: null, replay_on_rollback: true },
  { script_id: 'SCRIPT_EPILOGUE_COUNT', trigger: 'EPILOGUE', anchor: null, order: 2, branch_group: null, condition: null, replay_on_rollback: true },
  {
    // [S-REVEAL-STAGES-FOREKNOWN] 既知感演出の表示条件による二択。
    script_id: 'SCRIPT_EPILOGUE_INTACT',
    trigger: 'EPILOGUE',
    anchor: null,
    order: 3,
    branch_group: 'EPILOGUE_FOREKNOWN',
    condition: INTACT,
    replay_on_rollback: true,
  },
  {
    script_id: 'SCRIPT_EPILOGUE_REWOUND',
    trigger: 'EPILOGUE',
    anchor: null,
    order: 3,
    branch_group: 'EPILOGUE_FOREKNOWN',
    condition: REWOUND,
    replay_on_rollback: true,
  },
  {
    // [S-EPILOGUE]【交差残響の反映】締めの直前へ挿入する。
    script_id: 'SCRIPT_EPILOGUE_CROSS',
    trigger: 'EPILOGUE',
    anchor: null,
    order: 4,
    branch_group: null,
    condition: 'CrossUnlockedAny == True',
    replay_on_rollback: true,
  },
  { script_id: 'SCRIPT_EPILOGUE_CLOSE', trigger: 'EPILOGUE', anchor: null, order: 5, branch_group: null, condition: null, replay_on_rollback: true },

  // ［NEWGAME_INTRO］[M-META-NEWGAMEPLUS]
  { script_id: 'SCRIPT_NEWGAME_INTRO', trigger: 'NEWGAME_INTRO', anchor: null, order: 1, branch_group: null, condition: null, replay_on_rollback: true },
];
