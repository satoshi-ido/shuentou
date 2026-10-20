// [I-PLAN-MASTERGEN]［人が書く入力］クリーチャーの造形（[M-DATA-CREATUREID]【レコード一覧】）。
// シーンごとに、敵マスターの召喚の帯（ARの昇順）へ割り当てる creature_id と表示名を並べる。
// 帯の数と ids の数が一致しない入力は生成器が棄却する。

const one = (id, name) => ({ ids: [id], names: [name] });
const series = (base, count, name) => ({
  ids: Array.from({ length: count }, (_, index) => `${base}_${index + 1}`),
  names: Array.from({ length: count }, () => name),
});

export const CREATURE_FORMS = {
  SCENE_2_01: one('CREATURE_STITCHED', '縫い合わせの使役体'),
  SCENE_2_02: one('CREATURE_LISTENER', '聴き手の影'),
  SCENE_2_03: one('CREATURE_ROTTED_FAMILIAR', '腐れた使い魔'),
  // _3 は召喚（特殊）虚穴の招来が呼ぶ、常より大きな結晶の小腕。
  SCENE_2_04: series('CREATURE_SHARD_ARM', 3, '結晶の小腕'),
  SCENE_3_01: one('CREATURE_HOLLOW_ARMOR', '空鎧の門衛'),
  SCENE_3_02: one('CREATURE_ACOLYTE', '列の侍祭'),
  SCENE_3_03: one('CREATURE_BLOOD_SCRIBE', '血の書記'),
  SCENE_3_04: one('CREATURE_STROKE_SHADOW', '太刀筋の影'),
  SCENE_3_05: one('CREATURE_ROYAL_GUARD', '王の近衛'),
  SCENE_3_06: series('CREATURE_SAINT_IMAGE', 2, '槍持つ聖像'),
  SCENE_4_01: one('CREATURE_ASH_KNIGHT', '灰の騎士'),
  SCENE_4_02: one('CREATURE_STONE_COURIER', '石の伝令'),
  SCENE_4_03: one('CREATURE_HUNG_FOLLOWER', '吊られた後続'),
  SCENE_4_04: one('CREATURE_BELL_CHILD', '鐘の子'),
  SCENE_4_05: one('CREATURE_FERRY_SHADE', '渡しを待つ影'),
  SCENE_4_06: one('CREATURE_FLESH_BUD', '肉の芽'),
  SCENE_4_07: one('CREATURE_GATE_REMNANT', '番人の残骸'),
  SCENE_4_08: series('CREATURE_CORE_SHARD', 2, '核の欠片'),
  // 5-01〜5-08 の伏せる器は、シーンの順に _1〜_8 とする。
  SCENE_5_01: one('CREATURE_FALLEN_VESSEL_1', '伏せる器'),
  SCENE_5_02: one('CREATURE_FALLEN_VESSEL_2', '伏せる器'),
  SCENE_5_03: one('CREATURE_FALLEN_VESSEL_3', '伏せる器'),
  SCENE_5_04: one('CREATURE_FALLEN_VESSEL_4', '伏せる器'),
  SCENE_5_05: one('CREATURE_FALLEN_VESSEL_5', '伏せる器'),
  SCENE_5_06: one('CREATURE_FALLEN_VESSEL_6', '伏せる器'),
  SCENE_5_07: one('CREATURE_FALLEN_VESSEL_7', '伏せる器'),
  SCENE_5_08: one('CREATURE_FALLEN_VESSEL_8', '伏せる器'),
  SCENE_5_09: one('CREATURE_REFLECTION', '映り身'),
  SCENE_5_10: {
    ids: ['CREATURE_RIM_DEATH_1', 'CREATURE_RIM_DEATH_2', 'CREATURE_RIM_DEATH_3'],
    names: ['三度目の縁', '六度目の縁', '九度目の縁'],
  },
};
