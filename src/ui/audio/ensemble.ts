// [M-DATA-AUDIO-CUE]【戦闘の合奏】男声合唱の掛け声が噛み合う声のリズムと、ハンマーダルシマーの旋律、聖堂の大鐘。
// 重低音の1拍を16の区切りに割り、2拍分の32区切りを1つの譜とする。譜は読みやすさのため1拍ごとに '|' で区切る。
// 値はすべて暫定値。

export const SCORE_STEPS = 32;
export const STEPS_PER_PULSE = 16;

export type Voice = 'CHANT' | 'CHANT_LOW' | 'CHANT_BASS' | 'DULCIMER' | 'DULCIMER_HIGH' | 'BELL';
export const VOICES: readonly Voice[] = ['CHANT', 'CHANT_LOW', 'CHANT_BASS', 'DULCIMER', 'DULCIMER_HIGH', 'BELL'];

// 打弦の声部。譜の数字は音階の度数を表し、資産（D の一音）の再生の速さを変えて鳴らす。
const PITCHED: readonly Voice[] = ['DULCIMER', 'DULCIMER_HIGH'];

// 【戦闘の合奏】「音階」D の短調の五音音階（D・F・G・A・C）。1度を D とし、各度の D からの隔たり（セント）。
export const SCALE_CENTS: readonly number[] = [0, 300, 500, 700, 1000];

export type Score = Readonly<Record<Voice, string>>;

export const SCENE_SCORES: Readonly<Record<string, Score>> = {
  SCENE_1_01: {
    CHANT: '..x...x...x...x.|..x...x...x.x.x.',
    CHANT_LOW: 'x.......x.......|x.......x.......',
    CHANT_BASS: 'x...............|x...............',
    DULCIMER: '1.......3.......|2.......1.......',
    DULCIMER_HIGH: '................|........6.7.6.5.',
    BELL: 'x...............|................',
  },
  SCENE_1_02: {
    CHANT: 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.',
    CHANT_LOW: '....x.......x...|....x.......x...',
    CHANT_BASS: 'x.......x.......|x.......x.......',
    DULCIMER: '1...2...3...5...|4...3...2...1...',
    DULCIMER_HIGH: '................|................',
    BELL: 'x...............|................',
  },
  SCENE_2_01: {
    CHANT: '..x..x....x..x..|..x..x....x..x..',
    CHANT_LOW: 'x.........x.....|x.........x.....',
    CHANT_BASS: 'x...............|x...............',
    DULCIMER: '1.......4.......|3.......2.......',
    DULCIMER_HIGH: '....9.....8.....|....7.....6.....',
    BELL: 'x...............|................',
  },
  SCENE_2_02: {
    CHANT: '..x...x...x...x.|..x...x...x...x.',
    CHANT_LOW: '................|................',
    CHANT_BASS: 'x.......x.......|x.......x.......',
    DULCIMER: '1...3...1...3...|2...4...2...3...',
    DULCIMER_HIGH: '6.7.6.7.6.7.6.7.|6.7.6.7.8.7.6.7.',
    BELL: 'x...............|................',
  },
  SCENE_2_03: {
    CHANT: 'x..x..x...x..x..|x..x..x...x..x..',
    CHANT_LOW: '......x.........|......x.........',
    CHANT_BASS: 'x...........x...|x...........x...',
    DULCIMER: '1.....2.....4...|5.....4.....2...',
    DULCIMER_HIGH: '...8.....9......|...7.....6......',
    BELL: 'x...............|................',
  },
  SCENE_2_04: {
    CHANT: 'x.xx.xx.x.xx.xx.|x.xx.xx.x.xx.xx.',
    CHANT_LOW: '.x..x..x.x..x..x|.x..x..x.x..x..x',
    CHANT_BASS: 'x...x...x...x...|x...x...x...x...',
    DULCIMER: '1.2.3.5.4.3.2.1.|5.4.3.2.3.4.5.1.',
    DULCIMER_HIGH: '6767898767678987|0989878676786767',
    BELL: 'x...............|x...............',
  },
};

// 譜の1文字の再生の速さ。休みは Null。打弦の数字は度数（1〜5、6〜9・0 は1オクターブ上）を速さへ写す。
function rateOf(voice: Voice, mark: string): number | null {
  if (mark === '.') {
    return null;
  }
  if (!PITCHED.includes(voice)) {
    return mark === 'x' ? 1 : null;
  }
  const digit = mark === '0' ? 10 : Number(mark);
  if (!Number.isInteger(digit) || digit < 1 || digit > 10) {
    return null;
  }
  const degree = (digit - 1) % 5;
  const octave = digit > 5 ? 1 : 0;
  return 2 ** ((SCALE_CENTS[degree] ?? 0) / 1200 + octave);
}

// 声部の譜を、区切りごとの再生の速さ（休みは Null）へ読む。'|' は読み飛ばす。
export function readScore(voice: Voice, line: string): (number | null)[] {
  return [...line.replace(/\|/g, '')].map((mark) => rateOf(voice, mark));
}
