// [I-PLAN-MASTERGEN]［人が書く入力］表示アセットマスタ（[M-DATA-ASSETMASTER]）。
// 実体は制作せずプレースホルダで全段階を通す（[I-PLAN-ASSETS]）。レコードは本番と同じ形で記述し、
// asset_id・slot・cue の対応を検査対象に置く。範囲は [I-PLAN-MILESTONE]［M4 のマスタ範囲］の敵マスターに合わせる。
// 立ち絵（STANDING）と背景（BACKGROUND）は、審査範囲（[I-PLAN-SUBMISSION]【審査範囲】）の実体を
// 生成AIで制作する（[I-PLAN-ASSETS]【実体の投入】、docs/asset-brief.md）。path は src/ui/public からの相対で実体を指す。

export const ASSETS = [
  // 主人公（owner_kind が HERO のとき owner_id は Null）
  { asset_id: 'ASSET_HERO_PORTRAIT', owner_kind: 'HERO', owner_id: null, slot: 'PORTRAIT', cue: null, path: 'placeholder/portrait/hero' },
  { asset_id: 'ASSET_HERO_PLATE', owner_kind: 'HERO', owner_id: null, slot: 'PLATE', cue: null, path: 'placeholder/plate/hero' },
  // 敵マスター（1-01・1-02）
  { asset_id: 'ASSET_LEF_PORTRAIT', owner_kind: 'ENEMY', owner_id: 'ENEMY_LEF', slot: 'PORTRAIT', cue: null, path: 'placeholder/portrait/lef' },
  { asset_id: 'ASSET_LEF_PLATE', owner_kind: 'ENEMY', owner_id: 'ENEMY_LEF', slot: 'PLATE', cue: null, path: 'placeholder/plate/lef' },
  { asset_id: 'ASSET_DORN_PORTRAIT', owner_kind: 'ENEMY', owner_id: 'ENEMY_DORN', slot: 'PORTRAIT', cue: null, path: 'placeholder/portrait/dorn' },
  { asset_id: 'ASSET_DORN_PLATE', owner_kind: 'ENEMY', owner_id: 'ENEMY_DORN', slot: 'PLATE', cue: null, path: 'placeholder/plate/dorn' },
  // 立ち絵（[S-LOOK-PRINCIPLE] 以下）。主人公の外套の差分は [S-LOOK-SEIN]【外套の差分】の condition で選ぶ。
  { asset_id: 'ASSET_HERO_STANDING', owner_kind: 'HERO', owner_id: null, slot: 'STANDING', cue: null, path: 'art/standing/hero.png' },
  { asset_id: 'ASSET_HERO_STANDING_COAT_ACT2', owner_kind: 'HERO', owner_id: null, slot: 'STANDING', cue: null, variant: 'COAT_ACT2', condition: 'ActNumber == 2', path: 'art/standing/hero-coat-act2.png' },
  { asset_id: 'ASSET_RINA_STANDING', owner_kind: 'ATTENDANT', owner_id: 'ATTENDANT_01', slot: 'STANDING', cue: null, path: 'art/standing/rina.png' },
  { asset_id: 'ASSET_GARUD_STANDING', owner_kind: 'ATTENDANT', owner_id: 'ATTENDANT_02', slot: 'STANDING', cue: null, path: 'art/standing/garud.png' },
  { asset_id: 'ASSET_MIREILLE_STANDING', owner_kind: 'ATTENDANT', owner_id: 'ATTENDANT_03', slot: 'STANDING', cue: null, path: 'art/standing/mireille.png' },
  { asset_id: 'ASSET_KAI_STANDING', owner_kind: 'ATTENDANT', owner_id: 'ATTENDANT_04', slot: 'STANDING', cue: null, path: 'art/standing/kai.png' },
  { asset_id: 'ASSET_SERVIS_STANDING', owner_kind: 'ATTENDANT', owner_id: 'ATTENDANT_05', slot: 'STANDING', cue: null, path: 'art/standing/servis.png' },
  { asset_id: 'ASSET_TOTO_STANDING', owner_kind: 'ATTENDANT', owner_id: 'ATTENDANT_06', slot: 'STANDING', cue: null, path: 'art/standing/toto.png' },
  { asset_id: 'ASSET_LEF_STANDING', owner_kind: 'ENEMY', owner_id: 'ENEMY_LEF', slot: 'STANDING', cue: null, path: 'art/standing/lef.png' },
  { asset_id: 'ASSET_DORN_STANDING', owner_kind: 'ENEMY', owner_id: 'ENEMY_DORN', slot: 'STANDING', cue: null, path: 'art/standing/dorn.png' },
  { asset_id: 'ASSET_VOLG_STANDING', owner_kind: 'ENEMY', owner_id: 'ENEMY_VOLG', slot: 'STANDING', cue: null, path: 'art/standing/volg.png' },
  { asset_id: 'ASSET_ISH_STANDING', owner_kind: 'ENEMY', owner_id: 'ENEMY_ISH', slot: 'STANDING', cue: null, path: 'art/standing/ish.png' },
  { asset_id: 'ASSET_CALVA_STANDING', owner_kind: 'ENEMY', owner_id: 'ENEMY_CALVA', slot: 'STANDING', cue: null, path: 'art/standing/calva.png' },
  { asset_id: 'ASSET_ASHAL_STANDING', owner_kind: 'ENEMY', owner_id: 'ENEMY_ASHAL', slot: 'STANDING', cue: null, path: 'art/standing/ashal.png' },
  // 背景（[S-BG-PRINCIPLE] 以下）。シーンの戦闘背景は variant を Null とし、演出の画は variant で区別する。
  { asset_id: 'ASSET_BG_TITLE', owner_kind: 'GLOBAL', owner_id: null, slot: 'BACKGROUND', cue: null, variant: 'TITLE', path: 'art/bg/title.jpg' },
  { asset_id: 'ASSET_BG_1_01', owner_kind: 'SCENE', owner_id: 'SCENE_1_01', slot: 'BACKGROUND', cue: null, path: 'art/bg/1-01.jpg' },
  { asset_id: 'ASSET_BG_1_01_OPENING', owner_kind: 'SCENE', owner_id: 'SCENE_1_01', slot: 'BACKGROUND', cue: null, variant: 'OPENING', path: 'art/bg/1-01-opening.jpg' },
  { asset_id: 'ASSET_BG_1_01_IGNITE', owner_kind: 'SCENE', owner_id: 'SCENE_1_01', slot: 'BACKGROUND', cue: null, variant: 'IGNITE', path: 'art/bg/1-01-ignite.jpg' },
  { asset_id: 'ASSET_BG_1_02', owner_kind: 'SCENE', owner_id: 'SCENE_1_02', slot: 'BACKGROUND', cue: null, path: 'art/bg/1-02.jpg' },
  { asset_id: 'ASSET_BG_1_02_HEARTH', owner_kind: 'SCENE', owner_id: 'SCENE_1_02', slot: 'BACKGROUND', cue: null, variant: 'HEARTH', path: 'art/bg/1-02-hearth.jpg' },
  { asset_id: 'ASSET_BG_1_02_GATE', owner_kind: 'SCENE', owner_id: 'SCENE_1_02', slot: 'BACKGROUND', cue: null, variant: 'GATE', path: 'art/bg/1-02-gate.jpg' },
  { asset_id: 'ASSET_BG_1_02_AFTER', owner_kind: 'SCENE', owner_id: 'SCENE_1_02', slot: 'BACKGROUND', cue: null, variant: 'AFTER', path: 'art/bg/1-02-after.jpg' },
  { asset_id: 'ASSET_BG_2_01', owner_kind: 'SCENE', owner_id: 'SCENE_2_01', slot: 'BACKGROUND', cue: null, path: 'art/bg/2-01.jpg' },
  { asset_id: 'ASSET_BG_2_01_INN', owner_kind: 'SCENE', owner_id: 'SCENE_2_01', slot: 'BACKGROUND', cue: null, variant: 'INN', path: 'art/bg/2-01-inn.jpg' },
  { asset_id: 'ASSET_BG_2_02', owner_kind: 'SCENE', owner_id: 'SCENE_2_02', slot: 'BACKGROUND', cue: null, path: 'art/bg/2-02.jpg' },
  { asset_id: 'ASSET_BG_2_03', owner_kind: 'SCENE', owner_id: 'SCENE_2_03', slot: 'BACKGROUND', cue: null, path: 'art/bg/2-03.jpg' },
  { asset_id: 'ASSET_BG_2_04', owner_kind: 'SCENE', owner_id: 'SCENE_2_04', slot: 'BACKGROUND', cue: null, path: 'art/bg/2-04.jpg' },
  { asset_id: 'ASSET_BG_2_04_ARCHIVE', owner_kind: 'SCENE', owner_id: 'SCENE_2_04', slot: 'BACKGROUND', cue: null, variant: 'ARCHIVE', path: 'art/bg/2-04-archive.jpg' },
  { asset_id: 'ASSET_BG_2_04_SKETCH', owner_kind: 'SCENE', owner_id: 'SCENE_2_04', slot: 'BACKGROUND', cue: null, variant: 'SKETCH', path: 'art/bg/2-04-sketch.jpg' },
  { asset_id: 'ASSET_BG_2_04_AFTER', owner_kind: 'SCENE', owner_id: 'SCENE_2_04', slot: 'BACKGROUND', cue: null, variant: 'AFTER', path: 'art/bg/2-04-after.jpg' },
  { asset_id: 'ASSET_BG_2_04_AFTER_UNKNOWN', owner_kind: 'SCENE', owner_id: 'SCENE_2_04', slot: 'BACKGROUND', cue: null, variant: 'AFTER_UNKNOWN', path: 'art/bg/2-04-after-unknown.jpg' },
  // 系統アイコン5種（心気・武技・体勢・召喚・隊列交代）。インラインSVGのシンボル集合1ファイルを指す。
  { asset_id: 'ASSET_ICON_MIND', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, variant: 'MIND', path: 'placeholder/icons#mind' },
  { asset_id: 'ASSET_ICON_MARTIAL', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, variant: 'MARTIAL', path: 'placeholder/icons#martial' },
  { asset_id: 'ASSET_ICON_STANCE', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, variant: 'STANCE', path: 'placeholder/icons#stance' },
  { asset_id: 'ASSET_ICON_SUMMON', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, variant: 'SUMMON', path: 'placeholder/icons#summon' },
  { asset_id: 'ASSET_ICON_SWAP', owner_kind: 'GLOBAL', owner_id: null, slot: 'ICON', cue: null, variant: 'SWAP', path: 'placeholder/icons#swap' },
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
