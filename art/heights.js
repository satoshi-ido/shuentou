// [S-LOOK-PRINCIPLE]【盤面の大きさ】立ち絵の表示の大きさ（ドット）。正本の表は人物の背丈で定める。
//   height：取り込みで、元の立ち絵の不透明な範囲の高さをこの値に縮める（構えの画は元の立ち絵と同じ倍率）。
//           掲げた持ち物・立ち昇る煙が頭より上へ出る画は、生成した画で測った「範囲の高さ ÷ 背丈」を背丈に掛けた値とする。
//   body：背丈（省略時は height）。思考中の呼吸で立ち絵を分ける腰の高さ（背丈の下から55%）に用いる。
// 画を作り直したら測り直す。表に無い立ち絵は 64×96 の枠に収める。

export const FIGURE_HEIGHTS = {
  ASSET_HERO_STANDING: { height: 92 },
  ASSET_HERO_STANDING_COAT_ACT2: { height: 92 },
  ASSET_RINA_STANDING: { height: 82 },
  ASSET_GARUD_STANDING: { height: 102, body: 96 }, // 肩に担いだ大斧
  ASSET_MIREILLE_STANDING: { height: 86 },
  ASSET_KAI_STANDING: { height: 82 },
  ASSET_SERVIS_STANDING: { height: 84 },
  ASSET_TOTO_STANDING: { height: 68 },
  ASSET_LEF_STANDING: { height: 84 },
  ASSET_DORN_STANDING: { height: 104, body: 89 }, // 軍旗の穂先。背丈 92 では上限の 104 を越えるため、上限に収める
  ASSET_VOLG_STANDING: { height: 96 },
  ASSET_ISH_STANDING: { height: 92 },
  ASSET_CALVA_STANDING: { height: 91, body: 86 }, // 指先の煙
  ASSET_ASHAL_STANDING: { height: 96, body: 74 }, // 結晶の腕
  ASSET_STITCHED_STANDING: { height: 91, body: 88 }, // 輪郭の煙
  ASSET_LISTENER_STANDING: { height: 62, body: 50 }, // 座った姿。輪郭の煙
  ASSET_ROTTED_FAMILIAR_STANDING: { height: 32 },
  ASSET_SHARD_ARM_STANDING: { height: 60 },
};
