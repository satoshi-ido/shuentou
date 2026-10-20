// [I-PLAN-ASSETS] 音声ドライバ。音源を持たない空実装でも、音量設定の適用（[M-UI-CONFIG]）・
// SILENCE による停止（[S-SCRIPT-DIRECTIVE]）・cue の発火契機（[M-DATA-AUDIO-CUE]）の呼び出し経路を検査できるよう、
// 呼び出しを記録する。BGM は重低音（PULSE）と層の二重である（[M-DATA-AUDIO-CUE]【BGM の構成】）。

export type AudioCue =
  | 'PULSE'
  | 'INTERMISSION'
  | 'CALM'
  | 'ENSEMBLE'
  | 'ENDING'
  | 'SCRIPT'
  | 'ACTION_TRIGGER'
  | 'HIT'
  | 'MISS'
  | 'UNIT_DESTROY'
  | 'WATCH_PAUSE'
  | 'UI_CONFIRM'
  | 'UI_CANCEL';

export interface AudioDriver {
  // 重低音の一打を intervalMs ごとに鳴らす。assetId が Null なら止める。間隔の変更は次の一打から効く。
  setPulse(assetId: string | null, intervalMs: number): void;
  // 層を入れ替える（前の層を下げながら次の層を上げる）。同じ資産は鳴らし直さない。
  playBgm(cue: AudioCue, assetId: string): void;
  muffleLayers(muffled: boolean): void; // 時間が進んでいない間、層と合奏をこもらせる（重低音は変えない）
  // [M-META-COMMIT]【提示】BGM を潜める。FAINT は層と合奏を途切れさせ重低音だけをごく小さく残し（巻き戻しの保留中）、
  // SILENT は重低音を含めて途切れさせる（回帰の暗転）。いずれも重低音の拍は数え続ける。
  hushBgm(hush: BgmHush): void;
  // 戦闘の合奏の譜（声部の鍵 → 区切りごとの再生の速さ。休みは Null）。重低音の拍に合わせて鳴らす。Null なら止める。
  // 声部の鍵は資産ID。1つの資産を同時に複数の高さで鳴らす声部は「資産ID#番号」とする。
  setEnsemble(parts: Readonly<Record<string, readonly (number | null)[]>> | null): void;
  playSe(cue: AudioCue, assetId: string): void; // 重複再生を認める
  silence(): void; // 層を止める。重低音は止めない
  setVolumes(bgm: number, se: number): void;
}

export type BgmHush = 'NONE' | 'FAINT' | 'SILENT';

export type AudioEvent =
  | { readonly kind: 'BGM' | 'SE'; readonly cue: AudioCue; readonly assetId: string; readonly volume: number }
  | { readonly kind: 'PULSE'; readonly assetId: string | null; readonly intervalMs: number }
  | { readonly kind: 'MUFFLE'; readonly muffled: boolean }
  | { readonly kind: 'HUSH'; readonly hush: BgmHush }
  | { readonly kind: 'ENSEMBLE'; readonly parts: readonly string[] }
  | { readonly kind: 'SILENCE' };

// 長い再生でも際限なく積み上がらないよう、記録は直近のみを残す。
const MAX_EVENTS = 256;

export class RecordingAudioDriver implements AudioDriver {
  readonly events: AudioEvent[] = [];
  private bgmVolume = 80;
  private seVolume = 80;

  setPulse(assetId: string | null, intervalMs: number): void {
    this.record({ kind: 'PULSE', assetId, intervalMs });
  }

  playBgm(cue: AudioCue, assetId: string): void {
    this.record({ kind: 'BGM', cue, assetId, volume: this.bgmVolume });
  }

  muffleLayers(muffled: boolean): void {
    this.record({ kind: 'MUFFLE', muffled });
  }

  hushBgm(hush: BgmHush): void {
    this.record({ kind: 'HUSH', hush });
  }

  setEnsemble(parts: Readonly<Record<string, readonly (number | null)[]>> | null): void {
    this.record({ kind: 'ENSEMBLE', parts: parts === null ? [] : Object.keys(parts) });
  }

  playSe(cue: AudioCue, assetId: string): void {
    this.record({ kind: 'SE', cue, assetId, volume: this.seVolume });
  }

  silence(): void {
    this.record({ kind: 'SILENCE' });
  }

  setVolumes(bgm: number, se: number): void {
    this.bgmVolume = bgm;
    this.seVolume = se;
  }

  private record(event: AudioEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }
}

// 【BGM の構成】の暫定値。
const CROSSFADE_SEC = 1.5;
const MUFFLED_HZ = 800; // [M-UI-PLAYBACK]【静止中の演出】層と合奏をこもらせる低域通過の上限
const MUFFLED_GAIN = 0.6; // こもらせる間の層と合奏の音量の倍率
const FAINT_PULSE_GAIN = 0.15; // [M-META-COMMIT]【提示】巻き戻しの保留中に残す重低音の音量の倍率（ごく小さく）
const FAINT_REVERB_GAIN = 0.35; // 巻き戻しの保留中に重低音へ加える残響の大きさ（遠くで鳴るように）
const REVERB_SEC = 2.8; // 残響の長さ
const DARKEN_TIME_CONSTANT = 0.02; // 途切れさせる時定数（約 0.06 秒で下がる）
const BRIGHTEN_TIME_CONSTANT = 0.05; // 戻す時定数（約 0.15 秒で戻る）
const OPEN_HZ = 20000; // こもらせない間の上限（可聴域の全体を通す）
const MUFFLE_TIME_CONSTANT = 0.1; // 切り替えの時定数（約 0.3 秒で移る）
const SCHEDULE_AHEAD_SEC = 0.3; // 重低音の一打を先回りして予約する幅
const SCHEDULER_TICK_MS = 100;
const STEPS_PER_PULSE = 16; // 【戦闘の合奏】重低音の1拍の区切りの数
const ENSEMBLE_GAIN = 0.4; // 【戦闘の合奏】「音量」合奏全体の、資産の音量に対する倍率
const PULSE_DIP_GAIN = 0.5; // 重低音の一打ごとに層と合奏を下げる倍率
const PULSE_DIP_RECOVER_SEC = 0.07; // 下げた層と合奏を戻す時定数（約 0.2 秒で戻る）
const PULSE_HARMONICS_GAIN = 0.6; // 重低音に加える倍音（100〜300Hz）の大きさ

// 潜める度合い（大きいほど静か）と、度合いごとの層・合奏と重低音の音量の倍率。
const hushRank = (hush: BgmHush): number => ({ NONE: 0, FAINT: 1, SILENT: 2 })[hush];
const layersGainOf = (hush: BgmHush): number => (hush === 'NONE' ? 1 : 0);
const pulseGainOf = (hush: BgmHush): number => ({ NONE: 1, FAINT: FAINT_PULSE_GAIN, SILENT: 0 })[hush];
const reverbGainOf = (hush: BgmHush): number => (hush === 'FAINT' ? FAINT_REVERB_GAIN : 0);

// 残響の応答。減衰する雑音から作る。乱数 API は全層で禁じられているため（[I-ENV-TOOLING]）、固定の種の擬似乱数を用いる。
function reverbImpulse(context: BaseAudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate * REVERB_SEC);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 0x2545f491;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const noise = (seed >>> 0) / 0xffffffff - 0.5;
      data[index] = 2 * noise * (1 - index / length) ** 3;
    }
  }
  return buffer;
}

// 合奏の声部の鍵。和音のように1つの資産を同時に複数の高さで鳴らす声部は、資産IDに「#番号」を付けて分ける。
function baseAssetId(key: string): string {
  return key.split('#')[0] ?? key;
}

interface Layer {
  readonly assetId: string;
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

// [I-PLAN-ASSETS]【実体の投入】実体を鳴らすドライバ（Web Audio）。資産IDから実体のURLを引けない（実体が無い）場合は
// 鳴らさない。重低音は一打を実時間の間隔で予約して鳴らし、層は継ぎ目なく繰り返して入れ替える。
// 呼び出しは記録も残し、空実装と同じ経路で検査できるようにする。
export class WebAudioDriver extends RecordingAudioDriver {
  private context: AudioContext | null = null;
  private readonly buffers: Record<string, Promise<AudioBuffer | null>> = {};
  private bgmGain: GainNode | null = null;
  private seGain: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null; // 層と合奏をこもらせる低域通過
  private muffleGain: GainNode | null = null; // こもらせる間、層と合奏の音量を抑える
  private muffled = false;
  private hushLayers: GainNode | null = null; // 潜める間、層と合奏を途切れさせる
  private hushPulse: GainNode | null = null; // 潜める間、重低音を小さくする（または途切れさせる）
  private pulseReverb: GainNode | null = null; // 潜める間だけ重低音へ加える残響の戻り
  private hush: BgmHush = 'NONE';
  private ensembleGain: GainNode | null = null;
  private pulseDip: GainNode | null = null; // 重低音の一打ごとに層と合奏を短く下げる
  private pulseOut: GainNode | null = null; // 重低音の入口（そのままの音と、倍音を加える経路へ分ける）
  private bgmBus: DynamicsCompressorNode | null = null; // 音割れを防ぐ圧縮（BGM の音量の設定の手前）
  private bgmLevel = 0.8;
  private seLevel = 0.8;
  private layer: Layer | null = null;
  private layerRequest = ''; // 最後に求められた層（読み込みの間に入れ替わった場合の取り消しに用いる）
  private pulseAssetId: string | null = null;
  private pulseInterval = 1.6;
  private nextPulse = 0;
  private pulseCount = 0; // 予約した重低音の一打の数（譜の前半・後半を選ぶ）
  private ensemble: Readonly<Record<string, readonly (number | null)[]>> | null = null;
  private ensembleOrigin = 0; // 譜の1文字目に当たる一打の番号
  private readonly ready: Record<string, AudioBuffer> = {}; // 読み込みを終えた合奏の一打
  private scheduler: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly urlOf: (assetId: string) => string | null) {
    super();
  }

  override setPulse(assetId: string | null, intervalMs: number): void {
    super.setPulse(assetId, intervalMs);
    this.pulseInterval = intervalMs / 1000;
    if (assetId === this.pulseAssetId) {
      return;
    }
    this.pulseAssetId = assetId;
    if (assetId === null || this.urlOf(assetId) === null) {
      this.stopScheduler();
      return;
    }
    const context = this.ensureContext();
    this.nextPulse = context.currentTime + 0.05;
    if (this.scheduler === null) {
      this.scheduler = setInterval(() => void this.schedulePulses(), SCHEDULER_TICK_MS);
    }
  }

  override playBgm(cue: AudioCue, assetId: string): void {
    super.playBgm(cue, assetId);
    if (this.layerRequest === assetId) {
      return;
    }
    this.layerRequest = assetId;
    void this.load(assetId).then((buffer) => {
      if (buffer === null || this.layerRequest !== assetId) {
        return;
      }
      const context = this.ensureContext();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(1, context.currentTime + CROSSFADE_SEC);
      gain.connect(this.muffle as BiquadFilterNode);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      this.fadeOutLayer();
      this.layer = { assetId, gain, source };
    });
  }

  override muffleLayers(muffled: boolean): void {
    super.muffleLayers(muffled);
    this.muffled = muffled;
    if (this.muffle !== null && this.muffleGain !== null && this.context !== null) {
      this.muffle.frequency.setTargetAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, this.context.currentTime, MUFFLE_TIME_CONSTANT);
      this.muffleGain.gain.setTargetAtTime(muffled ? MUFFLED_GAIN : 1, this.context.currentTime, MUFFLE_TIME_CONSTANT);
    }
  }

  override hushBgm(hush: BgmHush): void {
    super.hushBgm(hush);
    const louder = hushRank(hush) < hushRank(this.hush);
    this.hush = hush;
    if (this.hushLayers !== null && this.hushPulse !== null && this.pulseReverb !== null && this.context !== null) {
      const constant = louder ? BRIGHTEN_TIME_CONSTANT : DARKEN_TIME_CONSTANT;
      this.hushLayers.gain.setTargetAtTime(layersGainOf(hush), this.context.currentTime, constant);
      this.hushPulse.gain.setTargetAtTime(pulseGainOf(hush), this.context.currentTime, constant);
      this.pulseReverb.gain.setTargetAtTime(reverbGainOf(hush), this.context.currentTime, constant);
    }
  }

  override setEnsemble(parts: Readonly<Record<string, readonly (number | null)[]>> | null): void {
    super.setEnsemble(parts);
    if (parts !== null && this.ensemble === null) {
      this.ensembleOrigin = this.pulseCount; // 次に予約する一打から譜を数える
    }
    this.ensemble = parts;
    for (const key of Object.keys(parts ?? {})) {
      const assetId = baseAssetId(key);
      void this.load(assetId).then((buffer) => {
        if (buffer !== null) {
          this.ready[assetId] = buffer;
        }
      });
    }
  }

  override playSe(cue: AudioCue, assetId: string): void {
    super.playSe(cue, assetId);
    if (this.seLevel === 0) {
      return;
    }
    void this.load(assetId).then((buffer) => {
      if (buffer !== null) {
        this.playOnce(buffer, this.seGain as GainNode, (this.context as AudioContext).currentTime);
      }
    });
  }

  override silence(): void {
    super.silence();
    this.layerRequest = '';
    this.fadeOutLayer();
  }

  override setVolumes(bgm: number, se: number): void {
    super.setVolumes(bgm, se);
    this.bgmLevel = Math.min(Math.max(bgm, 0), 100) / 100;
    this.seLevel = Math.min(Math.max(se, 0), 100) / 100;
    this.bgmGain?.gain.setValueAtTime(this.bgmLevel, this.context?.currentTime ?? 0);
    this.seGain?.gain.setValueAtTime(this.seLevel, this.context?.currentTime ?? 0);
  }

  private ensureContext(): AudioContext {
    if (this.context === null) {
      const context = new AudioContext();
      this.bgmGain = context.createGain();
      this.bgmGain.gain.value = this.bgmLevel;
      this.bgmGain.connect(context.destination);
      this.bgmBus = context.createDynamicsCompressor();
      this.bgmBus.threshold.value = -6;
      this.bgmBus.knee.value = 6;
      this.bgmBus.ratio.value = 8;
      this.bgmBus.attack.value = 0.003;
      this.bgmBus.release.value = 0.25;
      this.bgmBus.connect(this.bgmGain);
      this.hushLayers = context.createGain();
      this.hushLayers.gain.value = layersGainOf(this.hush);
      this.hushLayers.connect(this.bgmBus);
      this.hushPulse = context.createGain();
      this.hushPulse.gain.value = pulseGainOf(this.hush);
      this.hushPulse.connect(this.bgmBus);
      this.pulseDip = context.createGain();
      this.pulseDip.connect(this.hushLayers);
      this.muffle = context.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = this.muffled ? MUFFLED_HZ : OPEN_HZ;
      this.muffle.Q.value = 0.7;
      this.muffleGain = context.createGain();
      this.muffleGain.gain.value = this.muffled ? MUFFLED_GAIN : 1;
      this.muffleGain.connect(this.pulseDip);
      this.muffle.connect(this.muffleGain);
      this.pulseReverb = context.createGain();
      this.pulseReverb.gain.value = reverbGainOf(this.hush);
      this.pulseReverb.connect(this.bgmBus);
      const reverb = context.createConvolver();
      reverb.buffer = reverbImpulse(context);
      reverb.connect(this.pulseReverb);
      const pulseMix = context.createGain(); // 重低音（倍音を加えた後）を、そのままの経路と残響へ分ける
      pulseMix.connect(this.hushPulse);
      pulseMix.connect(reverb);
      this.pulseOut = this.createPulseOut(context, pulseMix);
      this.ensembleGain = context.createGain();
      this.ensembleGain.gain.value = ENSEMBLE_GAIN;
      this.ensembleGain.connect(this.muffle);
      this.seGain = context.createGain();
      this.seGain.gain.value = this.seLevel;
      this.seGain.connect(context.destination);
      this.context = context;
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
    return this.context;
  }

  // 資産を読み込んで復号する。実体が無い・読めない資産は Null とし、以後も鳴らさない。
  private load(assetId: string): Promise<AudioBuffer | null> {
    const cached = this.buffers[assetId];
    if (cached !== undefined) {
      return cached;
    }
    const url = this.urlOf(assetId);
    const loading =
      url === null
        ? Promise.resolve(null)
        : fetch(url)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
            .then((data) => this.ensureContext().decodeAudioData(data))
            .catch(() => null);
    this.buffers[assetId] = loading;
    return loading;
  }

  private async schedulePulses(): Promise<void> {
    const assetId = this.pulseAssetId;
    if (assetId === null || this.context === null) {
      return;
    }
    const buffer = await this.load(assetId);
    if (buffer === null || this.pulseAssetId !== assetId) {
      return;
    }
    const context = this.context;
    // 遅れて予約を逃した分は詰めずに捨て、現在から数え直す（間隔を保つ）。
    if (this.nextPulse < context.currentTime) {
      this.nextPulse = context.currentTime + 0.02;
    }
    while (this.nextPulse < context.currentTime + SCHEDULE_AHEAD_SEC) {
      this.playOnce(buffer, this.pulseOut as GainNode, this.nextPulse);
      this.dipUnderPulse(this.nextPulse);
      this.scheduleEnsemble(this.nextPulse);
      this.pulseCount += 1;
      this.nextPulse += this.pulseInterval;
    }
  }

  // 【戦闘の合奏】重低音の一打（when）から始まる1拍の区切りに、譜のうち当該の拍に当たる一打を、
  // 区切りごとの再生の速さ（打弦・弦は音の高さ）で予約する。譜は拍数ぶんの長さを持ち、繰り返す。
  private scheduleEnsemble(when: number): void {
    const parts = this.ensemble;
    if (parts === null) {
      return;
    }
    const step = this.pulseInterval / STEPS_PER_PULSE;
    for (const [key, steps] of Object.entries(parts)) {
      const buffer = this.ready[baseAssetId(key)];
      const pulses = Math.max(1, Math.floor(steps.length / STEPS_PER_PULSE));
      if (buffer === undefined) {
        continue;
      }
      const beat = (this.pulseCount - this.ensembleOrigin) % pulses;
      for (let index = 0; index < STEPS_PER_PULSE; index += 1) {
        const rate = steps[beat * STEPS_PER_PULSE + index] ?? null;
        if (rate !== null) {
          this.playOnce(buffer, this.ensembleGain as GainNode, when + index * step, rate);
        }
      }
    }
  }

  // 重低音の入口。そのままの音に、歪ませて生じた倍音のうち 100〜300Hz を加え、小さなスピーカーでも聞こえるようにする。
  private createPulseOut(context: AudioContext, destination: AudioNode): GainNode {
    const input = context.createGain();
    input.connect(destination);
    const shaper = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index += 1) {
      curve[index] = Math.tanh(4 * ((index / (curve.length - 1)) * 2 - 1));
    }
    shaper.curve = curve;
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 180;
    band.Q.value = 0.8;
    const harmonics = context.createGain();
    harmonics.gain.value = PULSE_HARMONICS_GAIN;
    input.connect(shaper);
    shaper.connect(band);
    band.connect(harmonics);
    harmonics.connect(destination);
    return input;
  }

  // 重低音の一打（when）に合わせて層と合奏を短く下げ、重低音を聞き取れるようにする。
  private dipUnderPulse(when: number): void {
    const gain = (this.pulseDip as GainNode).gain;
    gain.setValueAtTime(1, when);
    gain.linearRampToValueAtTime(PULSE_DIP_GAIN, when + 0.01);
    gain.setTargetAtTime(1, when + 0.05, PULSE_DIP_RECOVER_SEC);
  }

  private playOnce(buffer: AudioBuffer, destination: AudioNode, when: number, rate = 1): void {
    const context = this.context as AudioContext;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(destination);
    source.start(when);
  }

  private fadeOutLayer(): void {
    const layer = this.layer;
    if (layer === null || this.context === null) {
      return;
    }
    const now = this.context.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
    layer.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);
    layer.source.stop(now + CROSSFADE_SEC + 0.05);
    this.layer = null;
  }

  private stopScheduler(): void {
    if (this.scheduler !== null) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
  }
}
