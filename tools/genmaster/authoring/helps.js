// [I-PLAN-MASTERGEN]［人が書く入力］解説マスタ（[M-DATA-HELPMASTER]）。要求集合の正本は [M-DATA-HELPS]。
// title / body は未執筆であり、[I-PLAN-TEXT]［プレースホルダの書式］に従って生成器が組み立てる。

export const HELPS = [
  // ［機構キー・補正キーによる自動提示（unlock_key 非Null）］
  { help_id: 'HELP_RUSH', unlock_key: 'RUSH', category: 'ACTION' },
  { help_id: 'HELP_SUMMON', unlock_key: 'SUMMON', category: 'ACTION' },
  { help_id: 'HELP_STRIP_VP', unlock_key: 'STRIP_VP', category: 'RESOURCE' },
  { help_id: 'HELP_STRIP_PP', unlock_key: 'STRIP_PP', category: 'RESOURCE' },
  { help_id: 'HELP_STRIP_AP', unlock_key: 'STRIP_AP', category: 'RESOURCE' },
  { help_id: 'HELP_INTERFERE', unlock_key: 'INTERFERE', category: 'ACTION' },
  { help_id: 'HELP_BUFF', unlock_key: 'BUFF_COST_HP', category: 'ACTION' },
  { help_id: 'HELP_DEBUFF', unlock_key: 'DEBUFF_STEP_RECOVERY', category: 'ACTION' },
  { help_id: 'HELP_SLIP', unlock_key: 'SLIP', category: 'ACTION' },
  { help_id: 'HELP_COPY', unlock_key: 'COPY', category: 'ACTION' },
  { help_id: 'HELP_SEAL', unlock_key: 'SEAL', category: 'ACTION' },
  // ［辞典専用（unlock_key は Null）］
  { help_id: 'HELP_RESOURCE_HP', unlock_key: null, category: 'RESOURCE' },
  { help_id: 'HELP_RESOURCE_VP', unlock_key: null, category: 'RESOURCE' },
  { help_id: 'HELP_RESOURCE_PP', unlock_key: null, category: 'RESOURCE' },
  { help_id: 'HELP_RESOURCE_AP', unlock_key: null, category: 'RESOURCE' },
  { help_id: 'HELP_STEP_THOUGHT', unlock_key: null, category: 'STEP' },
  { help_id: 'HELP_STEP_STARTUP', unlock_key: null, category: 'STEP' },
  { help_id: 'HELP_STEP_RECOVERY', unlock_key: null, category: 'STEP' },
  { help_id: 'HELP_DEFENSE', unlock_key: null, category: 'STEP' },
  { help_id: 'HELP_FIELD', unlock_key: null, category: 'ACTION' },
  { help_id: 'HELP_SYSTEM_FLAGS', unlock_key: null, category: 'ACTION' },
  { help_id: 'HELP_INHERIT', unlock_key: null, category: 'PROGRESS' },
  { help_id: 'HELP_SACRIFICE', unlock_key: null, category: 'PROGRESS' },
  { help_id: 'HELP_WATCH', unlock_key: null, category: 'UI' },
  { help_id: 'HELP_TIMELINE', unlock_key: null, category: 'UI' },
  { help_id: 'HELP_REWIND', unlock_key: null, category: 'UI' },
];
