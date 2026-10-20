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
  duckLayer(ducked: boolean): void; // 時間停止中は層だけを下げる
  // 戦闘の合奏の譜（資産ID → 区切りごとの再生の速さ。休みは Null）。重低音の拍に合わせて鳴らす。Null なら止める。
  setEnsemble(parts: Readonly<Record<string, readonly (number | null)[]>> | null): void;
  playSe(cue: AudioCue, assetId: string): void; // 重複再生を認める
  silence(): void; // 層を止める。重低音は止めない
  setVolumes(bgm: number, se: number): void;
}

export type AudioEvent =
  | { readonly kind: 'BGM' | 'SE'; readonly cue: AudioCue; readonly assetId: string; readonly volume: number }
  | { readonly kind: 'PULSE'; readonly assetId: string | null; readonly intervalMs: number }
  | { readonly kind: 'DUCK'; readonly ducked: boolean }
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

  duckLayer(ducked: boolean): void {
    this.record({ kind: 'DUCK', ducked });
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
const DUCKED_GAIN = 0.3;
const SCHEDULE_AHEAD_SEC = 0.3; // 重低音の一打を先回りして予約する幅
const SCHEDULER_TICK_MS = 100;
const STEPS_PER_PULSE = 16; // 【戦闘の合奏】重低音の1拍の区切りの数

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
  private duckGain: GainNode | null = null;
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
      gain.connect(this.duckGain as GainNode);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      this.fadeOutLayer();
      this.layer = { assetId, gain, source };
    });
  }

  override duckLayer(ducked: boolean): void {
    super.duckLayer(ducked);
    if (this.duckGain !== null && this.context !== null) {
      this.duckGain.gain.setTargetAtTime(ducked ? DUCKED_GAIN : 1, this.context.currentTime, 0.15);
    }
  }

  override setEnsemble(parts: Readonly<Record<string, readonly (number | null)[]>> | null): void {
    super.setEnsemble(parts);
    if (parts !== null && this.ensemble === null) {
      this.ensembleOrigin = this.pulseCount; // 次に予約する一打から譜を数える
    }
    this.ensemble = parts;
    for (const assetId of Object.keys(parts ?? {})) {
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
      this.duckGain = context.createGain();
      this.duckGain.connect(this.bgmGain);
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
      this.playOnce(buffer, this.bgmGain as GainNode, this.nextPulse);
      this.scheduleEnsemble(this.nextPulse);
      this.pulseCount += 1;
      this.nextPulse += this.pulseInterval;
    }
  }

  // 【戦闘の合奏】重低音の一打（when）から始まる1拍の区切りに、譜の前半または後半の一打を、
  // 区切りごとの再生の速さ（鍵盤は音の高さ）で予約する。
  private scheduleEnsemble(when: number): void {
    const parts = this.ensemble;
    if (parts === null) {
      return;
    }
    const half = (this.pulseCount - this.ensembleOrigin) % 2;
    const step = this.pulseInterval / STEPS_PER_PULSE;
    for (const [assetId, steps] of Object.entries(parts)) {
      const buffer = this.ready[assetId];
      if (buffer === undefined) {
        continue;
      }
      for (let index = 0; index < STEPS_PER_PULSE; index += 1) {
        const rate = steps[half * STEPS_PER_PULSE + index] ?? null;
        if (rate !== null) {
          this.playOnce(buffer, this.duckGain as GainNode, when + index * step, rate);
        }
      }
    }
  }

  private playOnce(buffer: AudioBuffer, destination: GainNode, when: number, rate = 1): void {
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
