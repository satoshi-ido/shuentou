// [I-PLAN-MASTERGEN]［人が書く入力］残響マスタ（[S-ECHO-SCHEMA]）。
// 種別とトリガー条件値は [S-RETAINER-01]〜[S-RETAINER-15] の「残響トリガー」、IDの形式は [S-ECHO-ID]。
// 版を持つ残響（03・05）の script_id は初見版を指し、再生する版は branch_group で選ぶ（[S-ECHO-SCHEMA]【版の切り替え】）。

const sceneA = (number, sceneId) => ({
  echo_id: `ECHO_${number}`,
  attendant_id: `ATTENDANT_${number}`,
  trigger_kind: 'A',
  trigger_param: sceneId,
  script_id: `SCRIPT_ECHO_${number}`,
});

const marks08 = (threshold, scriptId) => ({
  echo_id: `ECHO_08_${String(threshold).padStart(4, '0')}`,
  attendant_id: 'ATTENDANT_08',
  trigger_kind: 'C',
  trigger_param: threshold,
  script_id: scriptId,
});

export const ECHOES = [
  { echo_id: 'ECHO_01', attendant_id: 'ATTENDANT_01', trigger_kind: 'D', trigger_param: null, script_id: 'SCRIPT_ECHO_01' },
  sceneA('02', 'SCENE_2_02'),
  { ...sceneA('03', 'SCENE_3_03'), script_id: 'SCRIPT_ECHO_03_UNKNOWN' },
  sceneA('04', 'SCENE_4_03'),
  { echo_id: 'ECHO_05', attendant_id: 'ATTENDANT_05', trigger_kind: 'B', trigger_param: null, script_id: 'SCRIPT_ECHO_05_UNKNOWN' },
  sceneA('06', 'SCENE_5_02'),
  sceneA('07', 'SCENE_4_02'),
  marks08(10, 'SCRIPT_ECHO_08_0010'),
  marks08(50, 'SCRIPT_ECHO_08_0050'),
  marks08(200, 'SCRIPT_ECHO_08_0200'),
  // [S-ECHO-SCHEMA]【本文を持たない開示】
  marks08(500, null),
  { echo_id: 'ECHO_09', attendant_id: 'ATTENDANT_09', trigger_kind: 'D', trigger_param: null, script_id: 'SCRIPT_ECHO_09' },
  sceneA('10', 'SCENE_4_05'),
  sceneA('11', 'SCENE_5_08'),
  sceneA('12', 'SCENE_5_04'),
  sceneA('13', 'SCENE_5_07'),
  sceneA('14', 'SCENE_5_06'),
  sceneA('15', 'SCENE_5_05'),
];
