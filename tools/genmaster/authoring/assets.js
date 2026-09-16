// [I-PLAN-MASTERGEN]［人が書く入力］表示アセットマスタ（[M-DATA-ASSETMASTER]）。
// 実体は制作せずプレースホルダで全段階を通す（[I-PLAN-ASSETS]）。レコードは本番と同じ形で記述し、
// asset_id・slot・cue の対応を検査対象に置く。範囲は [I-PLAN-MILESTONE]［M4 のマスタ範囲］の敵マスターに合わせる。

export const ASSETS = [
  // 主人公（owner_kind が HERO のとき owner_id は Null）
  { asset_id: 'ASSET_HERO_PORTRAIT', owner_kind: 'HERO', owner_id: null, slot: 'PORTRAIT', cue: null, path: 'placeholder/portrait/hero' },
  { asset_id: 'ASSET_HERO_PLATE', owner_kind: 'HERO', owner_id: null, slot: 'PLATE', cue: null, path: 'placeholder/plate/hero' },
  // 敵マスター（1-01・1-02）
  { asset_id: 'ASSET_LEF_PORTRAIT', owner_kind: 'ENEMY', owner_id: 'ENEMY_LEF', slot: 'PORTRAIT', cue: null, path: 'placeholder/portrait/lef' },
  { asset_id: 'ASSET_LEF_PLATE', owner_kind: 'ENEMY', owner_id: 'ENEMY_LEF', slot: 'PLATE', cue: null, path: 'placeholder/plate/lef' },
  { asset_id: 'ASSET_DORN_PORTRAIT', owner_kind: 'ENEMY', owner_id: 'ENEMY_DORN', slot: 'PORTRAIT', cue: null, path: 'placeholder/portrait/dorn' },
  { asset_id: 'ASSET_DORN_PLATE', owner_kind: 'ENEMY', owner_id: 'ENEMY_DORN', slot: 'PLATE', cue: null, path: 'placeholder/plate/dorn' },
  // 系統アイコン5種（心気・武技・体勢・召喚・隊列交代）。インラインSVGのシンボル集合1ファイルを指す。
  { asset_id: 'ASSET_ICON_MIND', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, path: 'placeholder/icons#mind' },
  { asset_id: 'ASSET_ICON_MARTIAL', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, path: 'placeholder/icons#martial' },
  { asset_id: 'ASSET_ICON_STANCE', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, path: 'placeholder/icons#stance' },
  { asset_id: 'ASSET_ICON_SUMMON', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, path: 'placeholder/icons#summon' },
  { asset_id: 'ASSET_ICON_SWAP', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, path: 'placeholder/icons#swap' },
  // BGM（cue は [M-DATA-AUDIO-CUE] の語彙。BATTLE はシーン、INTERMISSION は GLOBAL が持つ）
  { asset_id: 'ASSET_BGM_1_01', owner_kind: 'SCENE', owner_id: 'SCENE_1_01', slot: 'BGM', cue: 'BATTLE', path: 'placeholder/bgm/1-01' },
  { asset_id: 'ASSET_BGM_1_02', owner_kind: 'SCENE', owner_id: 'SCENE_1_02', slot: 'BGM', cue: 'BATTLE', path: 'placeholder/bgm/1-02' },
  { asset_id: 'ASSET_BGM_INTERMISSION', owner_kind: 'GLOBAL', owner_id: null, slot: 'BGM', cue: 'INTERMISSION', path: 'placeholder/bgm/intermission' },
  // SE（発火契機ごとに1件）
  { asset_id: 'ASSET_SE_HIT', owner_kind: 'GLOBAL', owner_id: null, slot: 'SE', cue: 'HIT', path: 'placeholder/se/hit' },
  { asset_id: 'ASSET_SE_MISS', owner_kind: 'GLOBAL', owner_id: null, slot: 'SE', cue: 'MISS', path: 'placeholder/se/miss' },
  { asset_id: 'ASSET_SE_UNIT_DESTROY', owner_kind: 'GLOBAL', owner_id: null, slot: 'SE', cue: 'UNIT_DESTROY', path: 'placeholder/se/destroy' },
  { asset_id: 'ASSET_SE_WATCH_PAUSE', owner_kind: 'GLOBAL', owner_id: null, slot: 'SE', cue: 'WATCH_PAUSE', path: 'placeholder/se/watch-pause' },
  { asset_id: 'ASSET_SE_UI_CONFIRM', owner_kind: 'GLOBAL', owner_id: null, slot: 'SE', cue: 'UI_CONFIRM', path: 'placeholder/se/confirm' },
  { asset_id: 'ASSET_SE_UI_CANCEL', owner_kind: 'GLOBAL', owner_id: null, slot: 'SE', cue: 'UI_CANCEL', path: 'placeholder/se/cancel' },
  // アクションの発動時（[M-DATA-AUDIO-CUE] ACTION_TRIGGER）。M4 のマスタ範囲のアクションに1件ずつ置く。
  { asset_id: 'ASSET_SE_ACTION_MIND', owner_kind: 'ACTION', owner_id: 'ACT_MIND_AR3', slot: 'SE', cue: 'ACTION_TRIGGER', path: 'placeholder/se/mind' },
  { asset_id: 'ASSET_SE_ACTION_MARTIAL', owner_kind: 'ACTION', owner_id: 'ACT_SLASH_AR3', slot: 'SE', cue: 'ACTION_TRIGGER', path: 'placeholder/se/martial' },
  { asset_id: 'ASSET_SE_ACTION_STANCE', owner_kind: 'ACTION', owner_id: 'ACT_GUARD_AR3', slot: 'SE', cue: 'ACTION_TRIGGER', path: 'placeholder/se/stance' },
];
