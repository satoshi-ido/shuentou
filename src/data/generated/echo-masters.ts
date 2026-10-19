// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { EchoMasterRecord } from '../types.js';

export const ECHO_MASTERS = {
  "ECHO_01": {
    "echo_id": "ECHO_01",
    "attendant_id": "ATTENDANT_01",
    "trigger_kind": "D",
    "trigger_param": null,
    "script_id": "SCRIPT_ECHO_01"
  },
  "ECHO_02": {
    "echo_id": "ECHO_02",
    "attendant_id": "ATTENDANT_02",
    "trigger_kind": "A",
    "trigger_param": "SCENE_2_02",
    "script_id": "SCRIPT_ECHO_02"
  },
  "ECHO_03": {
    "echo_id": "ECHO_03",
    "attendant_id": "ATTENDANT_03",
    "trigger_kind": "A",
    "trigger_param": "SCENE_3_03",
    "script_id": "SCRIPT_ECHO_03_UNKNOWN"
  },
  "ECHO_04": {
    "echo_id": "ECHO_04",
    "attendant_id": "ATTENDANT_04",
    "trigger_kind": "A",
    "trigger_param": "SCENE_4_03",
    "script_id": "SCRIPT_ECHO_04"
  },
  "ECHO_05": {
    "echo_id": "ECHO_05",
    "attendant_id": "ATTENDANT_05",
    "trigger_kind": "B",
    "trigger_param": null,
    "script_id": "SCRIPT_ECHO_05_UNKNOWN"
  },
  "ECHO_06": {
    "echo_id": "ECHO_06",
    "attendant_id": "ATTENDANT_06",
    "trigger_kind": "A",
    "trigger_param": "SCENE_5_02",
    "script_id": "SCRIPT_ECHO_06"
  },
  "ECHO_07": {
    "echo_id": "ECHO_07",
    "attendant_id": "ATTENDANT_07",
    "trigger_kind": "A",
    "trigger_param": "SCENE_4_02",
    "script_id": "SCRIPT_ECHO_07"
  },
  "ECHO_08_0010": {
    "echo_id": "ECHO_08_0010",
    "attendant_id": "ATTENDANT_08",
    "trigger_kind": "C",
    "trigger_param": 10,
    "script_id": "SCRIPT_ECHO_08_0010"
  },
  "ECHO_08_0050": {
    "echo_id": "ECHO_08_0050",
    "attendant_id": "ATTENDANT_08",
    "trigger_kind": "C",
    "trigger_param": 50,
    "script_id": "SCRIPT_ECHO_08_0050"
  },
  "ECHO_08_0200": {
    "echo_id": "ECHO_08_0200",
    "attendant_id": "ATTENDANT_08",
    "trigger_kind": "C",
    "trigger_param": 200,
    "script_id": "SCRIPT_ECHO_08_0200"
  },
  "ECHO_08_0500": {
    "echo_id": "ECHO_08_0500",
    "attendant_id": "ATTENDANT_08",
    "trigger_kind": "C",
    "trigger_param": 500,
    "script_id": null
  },
  "ECHO_09": {
    "echo_id": "ECHO_09",
    "attendant_id": "ATTENDANT_09",
    "trigger_kind": "D",
    "trigger_param": null,
    "script_id": "SCRIPT_ECHO_09"
  },
  "ECHO_10": {
    "echo_id": "ECHO_10",
    "attendant_id": "ATTENDANT_10",
    "trigger_kind": "A",
    "trigger_param": "SCENE_4_05",
    "script_id": "SCRIPT_ECHO_10"
  },
  "ECHO_11": {
    "echo_id": "ECHO_11",
    "attendant_id": "ATTENDANT_11",
    "trigger_kind": "A",
    "trigger_param": "SCENE_5_08",
    "script_id": "SCRIPT_ECHO_11"
  },
  "ECHO_12": {
    "echo_id": "ECHO_12",
    "attendant_id": "ATTENDANT_12",
    "trigger_kind": "A",
    "trigger_param": "SCENE_5_04",
    "script_id": "SCRIPT_ECHO_12"
  },
  "ECHO_13": {
    "echo_id": "ECHO_13",
    "attendant_id": "ATTENDANT_13",
    "trigger_kind": "A",
    "trigger_param": "SCENE_5_07",
    "script_id": "SCRIPT_ECHO_13"
  },
  "ECHO_14": {
    "echo_id": "ECHO_14",
    "attendant_id": "ATTENDANT_14",
    "trigger_kind": "A",
    "trigger_param": "SCENE_5_06",
    "script_id": "SCRIPT_ECHO_14"
  },
  "ECHO_15": {
    "echo_id": "ECHO_15",
    "attendant_id": "ATTENDANT_15",
    "trigger_kind": "A",
    "trigger_param": "SCENE_5_05",
    "script_id": "SCRIPT_ECHO_15"
  },
} as const satisfies Record<string, EchoMasterRecord>;
