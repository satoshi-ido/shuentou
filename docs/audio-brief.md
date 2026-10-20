# 音声の生成の指示書（審査範囲）

[I-PLAN-ASSETS]【実体の投入】に従い、審査範囲（アクト1・2、1-01〜2-04）で鳴る音声の実体を生成AIで制作するための指示書である。合本には含めない。発火の契機は [M-DATA-AUDIO-CUE]、資産の割り当ては表示アセットマスタ（`tools/genmaster/authoring/assets.js`）に従う。画像の指示書（`docs/asset-brief.md`）と同じ手順で取り込む。

## 1. ツールの選び方

ツールは人が選ぶ。生成を始める日に利用規約を確かめ、次の3点を満たすものに限る（[I-PLAN-SUBMISSION]【AIの使用の開示】）。確かめた日付と根拠の条文は `docs/ai-usage.md` に記録する。

1. 生成物を商用で利用できる（無料の版では商用利用を認めないツールが多い。有料の版の条件を確かめる）。
2. 生成物の権利が利用者に帰属するか、利用者に利用を許す旨が明示されている。
3. 学習データの扱いが説明されている。権利者との訴訟を抱えるツールは、権利の保証の説明が難しくなる。

候補の例（いずれも規約は変わりうるため、生成の日に確かめる）：

| ツール | 用途 | 確かめる点 |
| :---- | :---- | :---- |
| ElevenLabs（Music・Sound Effects） | BGM と SE の両方 | 有料の版での商用利用。音楽の学習データについての説明 |
| Stable Audio（Stability AI） | BGM と SE | 商用利用に要るライセンスの種類 |
| Suno・Udio | BGM | 有料の版での権利の帰属。権利者との訴訟の状況 |

1つのツールで BGM と SE の両方を作れると、記録が簡単になる。

**決定**：Stable Audio（Stability AI）を用い、BGM と SE の両方を作る。

- 生成を始める日に、Stable Audio の利用規約とライセンスの条文で、用いるプランが商用での利用を認めること、生成物の権利の扱い、学習データについての説明を確かめ、`docs/ai-usage.md` に記録する。無料の版で作ったものは、商用の条件を満たすプランで作り直す。
- 依頼文は英語で書く（本書 6）。3・4 の日本語の依頼文は、狙いを人が確かめるためのものとして残す。

## 2. 共通の決まり

- **形式**：MP3（192kbps 以上）。ツールが MP3 を出せない場合は、生成を進める前に Claude Code に相談する（取り込みの道具は MP3 のみを扱う）。
- **歌**：歌詞のある歌を入れない（作中の言葉と食い違うため）。声は、言葉を持たない合唱やハミングに限る。
- **既存の作品**：依頼文に作曲家名・作品名・ゲーム名を入れない。「〇〇風」と書かない。
- **保存**：リポジトリの中の `art-src\` に、`asset_id` に `.mp3` を付けた名前で置く（例：`ASSET_BGM_PULSE.mp3`）。
- **記録**：生成した日付・ツール・依頼文を `art-src\log.txt` に1行ずつ残す。

## 3. BGM（重低音1件・層2件・戦闘の合奏7件）

BGM は、一定の間隔で鳴り続ける重低音の一打を土台とする（[M-DATA-AUDIO-CUE]【BGM の構成】）。重低音は曲ではなく一打の音とし、プログラムが 1.6 秒ごとに鳴らす。バトル中は、男声合唱の掛け声・ハンマーダルシマー・聖堂の大鐘の一打を、プログラムが重低音の拍に合わせて譜どおりに鳴らす（【戦闘の合奏】）。バトル以外の画面では、打楽器を持たない持続音の層を重ねる。

- **調**：すべて **D**（重低音の音高を D とし、層は D の短調か、D を主音とする旋法）。
- **重低音**：1〜2 秒の一打。頭に無音を入れず、余韻は 1 秒以内に収める。拍子の感じを持たない、深い低音とする。ノートPCや小さなスピーカーは 100Hz より低い音をほとんど鳴らせないため、低い基音（D2 付近）だけにせず、100〜300Hz の倍音と、打った瞬間の短い打撃の立ち上がりを含める。生成した音は、ノートPCのスピーカーでも聞こえることを確かめて採る。
- **層**：60〜120 秒。打楽器・拍・はっきりしたテンポを持たない。終わりから始まりへ切れ目なくつながる（ループする）もの。旋律はゆるやかにとどめ、重低音の拍の上に漂うようにする。
- **戦闘の合奏**：曲ではなく一打の音を7つ用意する。声は 0.1〜0.3 秒、打弦は 1〜1.5 秒、低い弦は 1.5〜2 秒、鐘は 3 秒前後とし、頭に無音を入れない。打弦・低い弦・鐘は **D の高さ**で作る（プログラムが再生の速さを変えて音階の各音にするため、元の音の高さが D からずれていると旋律全体がずれる。ずれていた場合は Claude Code が測って補正する）。
- **音量**：層どうしの音量差を小さくする。重低音は、層の上でも聞こえ、層を覆わない大きさとする。

| asset_id | 鳴る状況 | 狙い |
| :---- | :---- | :---- |
| `ASSET_BGM_PULSE` | エンディングを除くすべての画面で、1.6 秒ごと（燈の中の声の間は 3.2 秒ごと） | 作中の時を刻む確定した法則。心拍とも鐘ともつかない、深く乾いた低音の一打 |
| `ASSET_BGM_CALM` | バトル開始前・脚本の提示 | 灰の降る静けさ。かすかな弦の持続音と、遠い風 |
| `ASSET_BGM_INTERMISSION` | インターミッション・従者補充 | 燈を見つめる時間。温かいが寂しい、柔らかな持続音と、まばらな撥弦 |
| `ASSET_BGM_ENSEMBLE_CHANT` | バトル中、戦闘の合奏の譜どおり | 男声合唱の短く強い掛け声「ハッ」（高め）。修道士の詠唱を思わせる、鋭く短い一声 |
| `ASSET_BGM_ENSEMBLE_CHANT_LOW` | 同上 | 同じく低めの掛け声。高めの声と噛み合わせる |
| `ASSET_BGM_ENSEMBLE_CHANT_BASS` | 同上 | 低い男声の短い「ドム」。拍の頭を支える |
| `ASSET_BGM_ENSEMBLE_DULCIMER` | 同上 | ハンマーダルシマーの一音。**D（D4）** の高さ。弦を叩いた硬い立ち上がりと、弦の余韻 |
| `ASSET_BGM_ENSEMBLE_DULCIMER_HIGH` | 同上 | 同じくハンマーダルシマーの高い一音。**D（D5）** の高さ。明るく短い余韻 |
| `ASSET_BGM_ENSEMBLE_STRINGS` | 同上 | 低い弦楽合奏（チェロ・コントラバス）の持続音の一音。**D（D3）** の高さ。弓で弾き始め、1.5〜2 秒で静かに消える。プログラムが3つの高さで同時に鳴らし、和音にする |
| `ASSET_BGM_ENSEMBLE_BELL` | 同上 | 聖堂の大鐘の一打。**D（D2）** 付近の低い響きと、長い余韻 |

- エンディングの曲（`ASSET_BGM_ENDING`）は審査範囲の外であり、本書の対象としない。

## 4. SE（11件）

- **長さ**：0.2〜1.5秒。頭に無音を入れない。
- **用途**：バトル中に頻繁に重なって鳴るため、耳に刺さる高音を避け、短く切る。

| asset_id | 鳴る時点 | 依頼文（そのまま送る） |
| :---- | :---- | :---- |
| `ASSET_SE_HIT` | 武技が命中した | 剣が鎧ごと相手を打つ、短く重い打撃音。0.4秒程度。 |
| `ASSET_SE_MISS` | 武技が回避された | 刃が空を切る、短い風切り音。0.3秒程度。 |
| `ASSET_SE_UNIT_DESTROY` | ユニットが倒れた | 人が崩れ落ち、灰が舞うような、低く短い音。1秒程度。 |
| `ASSET_SE_WATCH_PAUSE` | 監視の条件が成り立ち、時間が止まった | 時間が止まったことを知らせる、澄んだ小さな鈴の一打と、残響。0.8秒程度。 |
| `ASSET_SE_UI_CONFIRM` | 指示を確定した | 小さな鉄の留め金が掛かるような、乾いた短い決定音。0.2秒程度。 |
| `ASSET_SE_UI_CANCEL` | 取消（アンドゥ）を行った | 布が擦れて引き戻されるような、柔らかく短い音。0.3秒程度。 |
| `ASSET_SE_ACTION_MIND` | 心気を発動した | 深い呼吸とともに、小さな炎がふっと立ち上がる音。0.6秒程度。 |
| `ASSET_SE_ACTION_MARTIAL` | 武技を発動した | 剣を振りかぶる、鋭く短い金属の擦過音。0.4秒程度。 |
| `ASSET_SE_ACTION_STANCE` | 体勢を発動した | 盾と鎧を構え直す、重い金属の擦れと軽い衝撃音。0.5秒程度。 |
| `ASSET_SE_ACTION_SUMMON` | 召喚を発動した | 黒い煙が渦を巻き、何かが形を結ぶ、低く不気味な音。1秒程度。 |
| `ASSET_SE_ACTION_SWAP` | 隊列交代を行った | 外套の翻りと、素早い足音が二つ。0.4秒程度。 |

## 5. 受け渡しの後

Claude Code が次を行う。

1. `art-src\` の音声を `pnpm art art-src` で `src/ui/public/art/audio/` に取り込む。
2. 配布版で、重低音と場面ごとの層、SE を鳴らし、音量の差、ループのつなぎ目、重ねたときの拍と調のぶつかりを確かめる。
3. `docs/ai-usage.md` の「表示アセット・音声」の表に、`asset_id` ごとの行を書く。

## 6. Stable Audio 向けの依頼文

Stable Audio には、次の英語の依頼文をそのまま送る。楽器・雰囲気・テンポを並べる書き方とし、作曲家名・作品名を含めない。

- **長さの指定**：層は生成画面で 90 秒前後、重低音と SE は 1〜2 秒に設定する（生成後に余分な無音を切ってよい）。
- **ループ**：層はつなぎ目が目立たないものを選ぶ。何度か生成して、終わりと始まりの音量と響きが近いものを採る。
- **確かめ方**：層を選ぶときは、重低音と重ねて鳴らし、拍や調がぶつからないものを採る（Claude Code が取り込んだ後に配布版で重ねて確かめる）。
- **書き出し**：MP3 で書き出す。

### BGM

重低音と層の依頼文。層には必ず `no drums, no percussion, no beat` と `D minor`（または `D dorian`）を含める。

| asset_id | Prompt |
| :---- | :---- |
| `ASSET_BGM_PULSE` | Single deep thump in low D, like a slow heartbeat or a large muffled drum, with a clear attack and audible low-mid harmonics so it is heard on small laptop speakers, one hit only, dry, short decay under one second, no melody, no music, sound effect |
| `ASSET_BGM_CALM` | Dark fantasy ambient layer, quiet ash falling, faint sustained strings and distant wind, D minor, no drums, no percussion, no beat, free tempo, slow evolving drone, instrumental, seamless loop |
| `ASSET_BGM_INTERMISSION` | Dark fantasy ambient layer, gazing at a small lantern flame in the dark, warm but lonely, soft sustained strings with sparse plucked notes, D minor, no drums, no percussion, no beat, free tempo, instrumental, seamless loop |
| `ASSET_BGM_ENSEMBLE_CHANT` | Single short shouted syllable "hah" by a medieval male monk choir, high and sharp, dry, one hit only, no music, sound effect |
| `ASSET_BGM_ENSEMBLE_CHANT_LOW` | Single short shouted syllable "hah" by a medieval male monk choir, lower and rounder, dry, one hit only, no music, sound effect |
| `ASSET_BGM_ENSEMBLE_CHANT_BASS` | Single short low male choir syllable "dom", deep bass voice, dry, one hit only, no music, sound effect |
| `ASSET_BGM_ENSEMBLE_DULCIMER` | Single struck hammered dulcimer note, medieval European folk instrument, pitch D4, crisp attack with ringing string decay, one note only, no music, sound effect |
| `ASSET_BGM_ENSEMBLE_DULCIMER_HIGH` | Single struck hammered dulcimer note, medieval European folk instrument, pitch D5, bright crisp attack with short ringing decay, one note only, no music, sound effect |
| `ASSET_BGM_ENSEMBLE_STRINGS` | Single sustained note by a low string section (cellos and basses), pitch D3, soft bowed attack, warm and dark, fades out within two seconds, one note only, no music, sound effect |
| `ASSET_BGM_ENSEMBLE_BELL` | Single strike of a huge cathedral bell, low pitch around D2, deep resonant hum, long decay about three seconds, one hit only, no music, sound effect |

### SE

| asset_id | Prompt |
| :---- | :---- |
| `ASSET_SE_HIT` | Sword striking armor and flesh, short heavy impact, single hit, game sound effect, no music |
| `ASSET_SE_MISS` | Blade cutting through empty air, short whoosh, single swing, game sound effect, no music |
| `ASSET_SE_UNIT_DESTROY` | Body collapsing to the ground with scattering ash, low short thud, game sound effect, no music |
| `ASSET_SE_WATCH_PAUSE` | Single clear small bell chime with soft reverb, time stops, game UI sound effect, no music |
| `ASSET_SE_UI_CONFIRM` | Small iron latch clicking shut, short dry click, game UI sound effect, no music |
| `ASSET_SE_UI_CANCEL` | Soft cloth rustle pulled back, short gentle sound, game UI sound effect, no music |
| `ASSET_SE_ACTION_MIND` | Deep breath followed by a small flame flaring up, short whoosh, game sound effect, no music |
| `ASSET_SE_ACTION_MARTIAL` | Raising a sword, sharp short metallic scrape, game sound effect, no music |
| `ASSET_SE_ACTION_STANCE` | Shield and armor being braced, heavy metal clank with a light thump, game sound effect, no music |
| `ASSET_SE_ACTION_SUMMON` | Black smoke swirling as something takes shape, low eerie rumble, game sound effect, no music |
| `ASSET_SE_ACTION_SWAP` | Cloak flapping and two quick footsteps, short movement sound, game sound effect, no music |
