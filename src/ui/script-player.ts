// [M-UI-SCRIPT] 脚本の提示の進行。1回の発火で再生するレコードの列を1回の提示とし、行の文字送り・
// 入力待ち・頁の積み直し・飛ばす操作を扱う。DOM を持たず、描画は src/ui/dom/script-screen.ts が行う。

import type { ScriptDirective, ScriptMasterRecord } from '../data/types.js';
import type { TextSpeed } from './config.js';

// 燈の中の声（[M-UI-SCRIPT]【燈の中の声】）として示すかどうかは、レコードの組ごとに呼び出し側が決める。
export interface ScriptSegment {
  readonly records: readonly ScriptMasterRecord[];
  readonly lantern: boolean;
}

interface QueuedLine {
  readonly recordIndex: number;
  readonly speaker: string | null;
  readonly text: string;
  readonly directives: readonly ScriptDirective[];
  readonly lantern: boolean;
}

export interface ShownLine {
  readonly speaker: string | null;
  readonly text: string; // 現れている部分
  readonly complete: boolean; // 本文がすべて現れた
}

export interface ScriptView {
  readonly lines: readonly ShownLine[];
  readonly lantern: boolean;
  readonly titleCard: string | null; // ACT_TITLE_CARD の行を提示しているとき、その本文
  readonly fadeIn: boolean; // 頁の始まりが FADE_IN を持つ
  readonly waiting: boolean; // 本文がすべて現れ、左クリックを待っている
}

// 飛ばした行のうち、音と進行に関わるものは実行する（[M-UI-SCRIPT]【飛ばす】）。
const KEPT_ON_SKIP: readonly ScriptDirective[] = ['SILENCE', 'BLACKOUT_TO_1_01'];

// テキスト送り速度（[M-UI-CONFIG]）。1描画フレームあたりに現れる文字数と、文字を出すフレームの間隔。
const SPEED: Readonly<Record<Exclude<TextSpeed, 'INSTANT'>, { readonly chars: number; readonly every: number }>> = {
  SLOW: { chars: 1, every: 3 },
  NORMAL: { chars: 1, every: 1 },
  FAST: { chars: 3, every: 1 },
};

// 本文の領域に収まる行数の目安。全角換算で1行あたりの文字数を超えた本文は複数行として数える。
const PAGE_ROWS = 9;
const CHARS_PER_ROW = 34;

function rowsOf(line: QueuedLine): number {
  const length = (line.speaker === null ? 0 : line.speaker.length + 2) + line.text.length;
  return Math.max(1, Math.ceil(length / CHARS_PER_ROW));
}

export class ScriptPlayer {
  private readonly queue: QueuedLine[] = [];
  private index = 0;
  private pageStart = 0;
  private shownChars = 0;
  private frames = 0;
  private finished = false;

  constructor(segments: readonly ScriptSegment[]) {
    let recordIndex = 0;
    for (const segment of segments) {
      for (const record of segment.records) {
        for (const line of record.lines) {
          this.queue.push({
            recordIndex,
            speaker: line.speaker,
            text: line.text,
            directives: line.directives,
            lantern: segment.lantern,
          });
        }
        recordIndex += 1;
      }
    }
    this.finished = this.queue.length === 0;
  }

  get done(): boolean {
    return this.finished;
  }

  // 現在の行が持つ演出指示。表示側が行の提示に伴って実行する（音・暗転など）。
  get currentDirectives(): readonly ScriptDirective[] {
    return this.queue[this.index]?.directives ?? [];
  }

  private get current(): QueuedLine | undefined {
    return this.queue[this.index];
  }

  private get lineComplete(): boolean {
    const line = this.current;
    return line === undefined || this.shownChars >= line.text.length;
  }

  // 1描画フレーム分の文字送り。WAIT_INPUT を持たない行は、現れ終えたら次の行へ進む。
  tick(speed: TextSpeed): void {
    const line = this.current;
    if (this.finished || line === undefined) {
      return;
    }
    if (!this.lineComplete) {
      if (speed === 'INSTANT') {
        this.shownChars = line.text.length;
      } else {
        this.frames += 1;
        const { chars, every } = SPEED[speed];
        if (this.frames >= every) {
          this.frames = 0;
          this.shownChars = Math.min(line.text.length, this.shownChars + chars);
        }
      }
    }
    if (this.lineComplete && !line.directives.includes('WAIT_INPUT')) {
      this.advance();
    }
  }

  // 左クリック。文字が現れている途中なら行の全体を示し、現れ終えていれば次の行へ進む。
  click(): void {
    if (this.finished) {
      return;
    }
    const line = this.current;
    if (line !== undefined && !this.lineComplete) {
      this.shownChars = line.text.length;
      return;
    }
    this.advance();
  }

  // 「飛ばす」。残りの行を示さずに終え、飛ばした行のうち実行すべき演出指示を返す。
  skip(): ScriptDirective[] {
    const kept: ScriptDirective[] = [];
    for (const line of this.queue.slice(this.index + 1)) {
      kept.push(...line.directives.filter((directive) => KEPT_ON_SKIP.includes(directive)));
    }
    this.finished = true;
    return kept;
  }

  private advance(): void {
    const previous = this.current;
    this.index += 1;
    this.shownChars = 0;
    this.frames = 0;
    const next = this.current;
    if (next === undefined) {
      this.finished = true;
      return;
    }
    // レコードが替わったとき、および本文の領域に収まらなくなったときは積み直す。
    const titleBoundary =
      next.directives.includes('ACT_TITLE_CARD') || previous?.directives.includes('ACT_TITLE_CARD') === true;
    const rows = this.queue.slice(this.pageStart, this.index + 1).reduce((sum, line) => sum + rowsOf(line), 0);
    if (previous === undefined || next.recordIndex !== previous.recordIndex || rows > PAGE_ROWS || titleBoundary) {
      this.pageStart = this.index;
    }
  }

  view(): ScriptView {
    const line = this.current;
    const lantern = line?.lantern ?? false;
    if (line !== undefined && line.directives.includes('ACT_TITLE_CARD')) {
      return { lines: [], lantern, titleCard: line.text, fadeIn: line.directives.includes('FADE_IN'), waiting: true };
    }
    const lines: ShownLine[] = this.queue.slice(this.pageStart, this.index).map((shown) => ({
      speaker: shown.speaker,
      text: shown.text,
      complete: true,
    }));
    if (line !== undefined) {
      lines.push({ speaker: line.speaker, text: line.text.slice(0, this.shownChars), complete: this.lineComplete });
    }
    const head = this.queue[this.pageStart];
    return {
      lines,
      lantern,
      titleCard: null,
      fadeIn: head?.directives.includes('FADE_IN') ?? false,
      waiting: line !== undefined && this.lineComplete && line.directives.includes('WAIT_INPUT'),
    };
  }
}
