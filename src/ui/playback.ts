// [M-UI-PLAYBACK] バトル再生速度の実時間対応。歩進は描画フレーム同期とし、実時刻を刻みに用いない。

import type { PlaybackSpeed } from './config.js';

const STEPS_PER_FRAME: Readonly<Record<PlaybackSpeed, number>> = { PAUSE: 0, X1: 1, X2: 2, X3: 4 };

export function stepsPerFrame(speed: PlaybackSpeed): number {
  return STEPS_PER_FRAME[speed];
}

// 1フレーム分の歩進。advance は1ステップ進めて、時間停止または決着に至ったら false を返す。
// 未歩進のステップは次フレームへ繰り越さない（フレーム落ちの扱い）。
export function runFrame(speed: PlaybackSpeed, advance: () => boolean): number {
  const budget = stepsPerFrame(speed);
  let advanced = 0;
  while (advanced < budget) {
    advanced += 1;
    if (!advance()) {
      break;
    }
  }
  return advanced;
}

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

// 再生ループ。速度は歩進の刻みのみを決め、停止の成立は advance の戻り値が決める。
export class PlaybackLoop {
  private handle: number | null = null;

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly onFrame: (speed: PlaybackSpeed) => boolean,
  ) {}

  speed: PlaybackSpeed = 'X1';

  start(): void {
    if (this.handle !== null) {
      return;
    }
    const tick = (): void => {
      this.handle = null;
      if (this.onFrame(this.speed)) {
        this.handle = this.scheduler.request(tick);
      }
    };
    this.handle = this.scheduler.request(tick);
  }

  stop(): void {
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
  }

  get running(): boolean {
    return this.handle !== null;
  }
}
