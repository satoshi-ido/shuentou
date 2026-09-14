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

export class RecordingAudioDriver implements AudioDriver {
  readonly events: AudioEvent[] = [];
  private bgmVolume = 80;
  private seVolume = 80;

  playBgm(cue: AudioCue, assetId: string): void {
    this.events.push({ kind: 'BGM', cue, assetId, volume: this.bgmVolume });
  }

  playSe(cue: AudioCue, assetId: string): void {
    this.events.push({ kind: 'SE', cue, assetId, volume: this.seVolume });
  }

  silence(): void {
    this.events.push({ kind: 'SILENCE' });
  }

  setVolumes(bgm: number, se: number): void {
    this.bgmVolume = bgm;
    this.seVolume = se;
  }
}
