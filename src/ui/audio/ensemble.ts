// [M-DATA-AUDIO-CUE]【戦闘の合奏】男声合唱の掛け声が噛み合う声のリズム、ハンマーダルシマーの旋律、低い弦の和音、聖堂の大鐘。
// 重低音の1拍を16の区切りに割り、4拍分の64区切りを1つの譜とする。譜は読みやすさのため1拍ごとに '|' で区切る。
// 和音は1拍に1つとし、4拍で1つの句をなす。値はすべて暫定値。

export const SCORE_STEPS = 64;
export const STEPS_PER_PULSE = 16;

export type Voice = 'CHANT' | 'CHANT_LOW' | 'CHANT_BASS' | 'DULCIMER' | 'DULCIMER_HIGH' | 'STRINGS' | 'BELL';
export const VOICES: readonly Voice[] = ['CHANT', 'CHANT_LOW', 'CHANT_BASS', 'DULCIMER', 'DULCIMER_HIGH', 'STRINGS', 'BELL'];

// 音の高さを持つ声部。譜の数字は音階の度数を表し、資産（D の一音）の再生の速さを変えて鳴らす。
const MELODIC: readonly Voice[] = ['DULCIMER', 'DULCIMER_HIGH'];

// 和音の声部。譜の数字は和音の根音の度数を表し、音階の音を3度ずつ重ねた三和音を同時に鳴らす。
export const CHORDAL: readonly Voice[] = ['STRINGS'];

// 【戦闘の合奏】「音階」D の和声的短音階（D・E・F・G・A・B♭・C♯）。1度を D とし、各度の D からの隔たり（セント）。
export const SCALE_CENTS: readonly number[] = [0, 200, 300, 500, 700, 800, 1100];

export type Score = Readonly<Record<Voice, string>>;

const repeat = (beat: string): string => [beat, beat, beat, beat].join('|');

export const SCENE_SCORES: Readonly<Record<string, Score>> = {
  // i–VI–iv–V。旋律は A から下降して主音へ向かい、V の C♯ で句を閉じる。
  SCENE_1_01: {
    CHANT: '..x...x...x...x.|..x...x...x.x.x.|..x...x...x...x.|..x...x...x.x.x.',
    CHANT_LOW: repeat('x.......x.......'),
    CHANT_BASS: repeat('x...............'),
    DULCIMER: '5.......6...5...|3.......2...1...|4...3...2...3...|2.......7.......',
    DULCIMER_HIGH: '................|........8...7...|................|....5...7.......',
    STRINGS: '1...............|6...............|4...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–iv–V–i。付点のある行進の旋律。
  SCENE_1_02: {
    CHANT: repeat('x.x.x.x.x.x.x.x.'),
    CHANT_LOW: repeat('....x.......x...'),
    CHANT_BASS: repeat('x.......x.......'),
    DULCIMER: '1...1.3.5...3...|4...4.6.8...6...|5...7.5.2...7...|1...3...1.......',
    DULCIMER_HIGH: '................|................|........5.7.8...|................',
    STRINGS: '1...............|4...............|5...............|1...............',
    BELL: 'x...............|................|x...............|................',
  },
  // i–iv–VI–V。半音で這い上がる不気味な旋律。
  SCENE_2_01: {
    CHANT: repeat('..x..x....x..x..'),
    CHANT_LOW: repeat('x.........x.....'),
    CHANT_BASS: repeat('x...............'),
    DULCIMER: '1.....2.3.....2.|4.....3.4.....6.|6.....5.6.....8.|7.......5.......',
    DULCIMER_HIGH: '....5...........|....6...........|....3...........|....7...........',
    STRINGS: '1...............|4...............|6...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–VI–i–V。高い打弦が子守歌のように揺れ続ける。
  SCENE_2_02: {
    CHANT: repeat('..x...x...x...x.'),
    CHANT_LOW: repeat('................'),
    CHANT_BASS: repeat('x.......x.......'),
    DULCIMER: '1.......3.......|6.......5.......|1.......3.......|2.......7.......',
    DULCIMER_HIGH: '5.3.5.3.5.3.5.3.|6.3.6.3.6.3.6.3.|5.3.5.3.5.3.5.3.|7.5.7.5.7.5.2.7.',
    STRINGS: '1...............|6...............|1...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–iv–VI–V。拍の裏へずれる、つまずく旋律。
  SCENE_2_03: {
    CHANT: repeat('x..x..x...x..x..'),
    CHANT_LOW: repeat('......x.........'),
    CHANT_BASS: repeat('x...........x...'),
    DULCIMER: '1..3..5...3..2..|4..6..8...6..4..|6..5..3...5..6..|7..5..2...7.....',
    DULCIMER_HIGH: '................|..........8.....|................|..........7.....',
    STRINGS: '1...............|4...............|6...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–VI–iv–V。ボス。打弦は和音の音を細かく刻み、弦は半拍ごとに和音を打つ。
  SCENE_2_04: {
    CHANT: repeat('x.xx.xx.x.xx.xx.'),
    CHANT_LOW: repeat('.x..x..x.x..x..x'),
    CHANT_BASS: repeat('x...x...x...x...'),
    DULCIMER: '1.3.5.3.1.3.5.8.|6.5.3.5.6.5.3.1.|4.6.8.6.4.6.8.6.|7.5.2.5.7.5.2.7.',
    DULCIMER_HIGH: '8585858585858585|8636863686368636|8464846484648464|7525752575257527',
    STRINGS: '1.......1.......|6.......6.......|4.......4.......|5.......5.......',
    BELL: 'x...............|................|x...............|................',
  },
};

// 度数（1〜7、8 は1オクターブ上の1度）から、D からの隔たり（セント）。
function centsOf(index: number): number {
  const octave = Math.floor(index / SCALE_CENTS.length);
  return (SCALE_CENTS[index % SCALE_CENTS.length] ?? 0) + 1200 * octave;
}

const rateOfCents = (cents: number): number => 2 ** (cents / 1200);

function degreeOf(mark: string): number | null {
  const digit = Number(mark);
  return Number.isInteger(digit) && digit >= 1 && digit <= 8 ? digit - 1 : null;
}

// 譜の1文字の再生の速さ。休みは Null。旋律の声部の数字は度数を、和音の声部は根音から数えた音（tone 番目）を速さへ写す。
function rateOf(voice: Voice, mark: string, tone: number): number | null {
  if (mark === '.') {
    return null;
  }
  if (!MELODIC.includes(voice) && !CHORDAL.includes(voice)) {
    return mark === 'x' ? 1 : null;
  }
  const degree = degreeOf(mark);
  if (degree === null) {
    return null;
  }
  // 和音は音階の音を3度ずつ重ねる（根音・3度・5度）。
  return rateOfCents(centsOf(degree + 2 * tone));
}

// 声部の譜を、区切りごとの再生の速さ（休みは Null）へ読む。'|' は読み飛ばす。
// 和音の声部は tone（0: 根音、1: 3度、2: 5度）ごとに読む。
export function readScore(voice: Voice, line: string, tone = 0): (number | null)[] {
  return [...line.replace(/\|/g, '')].map((mark) => rateOf(voice, mark, tone));
}
