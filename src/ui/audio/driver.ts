// [I-PLAN-ASSETS] 音声ドライバ。音源を持たない空実装でも、音量設定の適用（[M-UI-CONFIG]）・
// SILENCE による停止（[S-SCRIPT-DIRECTIVE]）・cue の発火契機（[M-DATA-AUDIO-CUE]）の呼び出し経路を検査できるよう、
// 呼び出しを記録する。

export type AudioCue =
  | 'BATTLE'
  | 'INTERMISSION'
  | 'SCRIPT'
  | 'ACTION_TRIGGER'
  | 'HIT'
  | 'MISS'
  | 'UNIT_DESTROY'
  | 'WATCH_PAUSE'
  | 'UI_CONFIRM'
  | 'UI_CANCEL';

export interface AudioDriver {
  playBgm(cue: AudioCue, assetId: string): void;
  playSe(cue: AudioCue, assetId: string): void; // 重複再生を認める
  silence(): void; // 音量設定に関わらず BGM を停止する
  setVolumes(bgm: number, se: number): void;
}

export type AudioEvent =
  | { readonly kind: 'BGM' | 'SE'; readonly cue: AudioCue; readonly assetId: string; readonly volume: number }
  | { readonly kind: 'SILENCE' };

// 長い再生でも際限なく積み上がらないよう、記録は直近のみを残す。
const MAX_EVENTS = 256;

export class RecordingAudioDriver implements AudioDriver {
  readonly events: AudioEvent[] = [];
  private bgmVolume = 80;
  private seVolume = 80;

  playBgm(cue: AudioCue, assetId: string): void {
    this.record({ kind: 'BGM', cue, assetId, volume: this.bgmVolume });
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

// [I-PLAN-ASSETS]【実体の投入】実体を鳴らすドライバ。資産IDから実体のURLを引けない（実体が無い）場合は鳴らさない。
// 呼び出しは記録も残し、空実装と同じ経路で検査できるようにする。BGM は1曲をループし、同じ資産は鳴らし直さない。
export class HtmlAudioDriver extends RecordingAudioDriver {
  private bgm: HTMLAudioElement | null = null;
  private bgmAssetId = '';
  private bgmGain = 0.8;
  private seGain = 0.8;

  constructor(private readonly urlOf: (assetId: string) => string | null) {
    super();
  }

  override playBgm(cue: AudioCue, assetId: string): void {
    super.playBgm(cue, assetId);
    if (assetId === this.bgmAssetId && this.bgm !== null) {
      return;
    }
    this.stopBgm();
    const url = this.urlOf(assetId);
    if (url === null) {
      return;
    }
    const track = new Audio(url);
    track.loop = true;
    track.volume = this.bgmGain;
    track.play().catch(() => undefined); // 自動再生が許されない環境では鳴らさない
    this.bgm = track;
    this.bgmAssetId = assetId;
  }

  override playSe(cue: AudioCue, assetId: string): void {
    super.playSe(cue, assetId);
    const url = this.urlOf(assetId);
    if (url === null || this.seGain === 0) {
      return;
    }
    const sound = new Audio(url);
    sound.volume = this.seGain;
    sound.play().catch(() => undefined);
  }

  override silence(): void {
    super.silence();
    this.stopBgm();
  }

  override setVolumes(bgm: number, se: number): void {
    super.setVolumes(bgm, se);
    this.bgmGain = Math.min(Math.max(bgm, 0), 100) / 100;
    this.seGain = Math.min(Math.max(se, 0), 100) / 100;
    if (this.bgm !== null) {
      this.bgm.volume = this.bgmGain;
    }
  }

  private stopBgm(): void {
    this.bgm?.pause();
    this.bgm = null;
    this.bgmAssetId = '';
  }
}
