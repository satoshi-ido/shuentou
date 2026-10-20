// [M-DATA-AUDIO-CUE]【戦闘の合奏】フレームドラムと大太鼓が噛み合う打楽器のリズム、ハンマーダルシマーの旋律、低い弦の和音、聖堂の大鐘。
// 重低音の1拍を16の区切りに割り、4拍分の64区切りを1つの譜とする。譜は読みやすさのため1拍ごとに '|' で区切る。
// 和音は1拍に1つとし、旋律は短い動機を繰り返して緊迫感をつくる。値はすべて暫定値。

export const SCORE_STEPS = 64;
export const STEPS_PER_PULSE = 16;

export type Voice = 'DRUM_HIGH' | 'DRUM_LOW' | 'DRUM_BASS' | 'DULCIMER' | 'DULCIMER_HIGH' | 'STRINGS' | 'BELL';
export const VOICES: readonly Voice[] = ['DRUM_HIGH', 'DRUM_LOW', 'DRUM_BASS', 'DULCIMER', 'DULCIMER_HIGH', 'STRINGS', 'BELL'];

// 音の高さを持つ声部。譜の数字は音階の度数を表し、資産（D の一音）の再生の速さを変えて鳴らす。
const MELODIC: readonly Voice[] = ['DULCIMER', 'DULCIMER_HIGH'];

// 和音の声部。譜の数字は和音の根音の度数を表し、音階の音を3度ずつ重ねた三和音を同時に鳴らす。
export const CHORDAL: readonly Voice[] = ['STRINGS'];

// 【戦闘の合奏】「音階」D の和声的短音階（D・E・F・G・A・B♭・C♯）。1度を D とし、各度の D からの隔たり（セント）。
export const SCALE_CENTS: readonly number[] = [0, 200, 300, 500, 700, 800, 1100];

export type Score = Readonly<Record<Voice, string>>;

const repeat = (beat: string): string => [beat, beat, beat, beat].join('|');

export const SCENE_SCORES: Readonly<Record<string, Score>> = {
  // i–i–VI–V。D→C♯ の半音の下降を間を置いて置き、VI で B♭→A、V で導音を残して頭へ戻す。高い太鼓は2打だけ置く。
  SCENE_1_01: {
    DRUM_HIGH: repeat('..x..x..........'),
    DRUM_LOW: repeat('x.......x.......'),
    DRUM_BASS: repeat('x...............'),
    DULCIMER: '8...7...........|8...7...........|6...5...........|7...........5...',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|6...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–i–iv–V。F→E の半音の下降を繰り返し、iv で B♭→A、V で導音から D へ先回りする。
  SCENE_1_02: {
    DRUM_HIGH: repeat('x..x......x.....'),
    DRUM_LOW: repeat('......x.........'),
    DRUM_BASS: repeat('x.......x.......'),
    DULCIMER: '3...2...........|3...2...........|6...5...........|7...........8...',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|4...............|5...............',
    BELL: 'x...............|................|x...............|................',
  },
  SCENE_2_01: {
    DRUM_HIGH: repeat('..x..x....x..x..'),
    DRUM_LOW: repeat('x.........x.....'),
    DRUM_BASS: repeat('x...............'),
    DULCIMER: '6...5...........|6...5...........|6...5...........|7...8...........',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|4...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–VI–i–V。高い打弦の短い揺れが、子守歌のように止まらない。
  SCENE_2_02: {
    DRUM_HIGH: repeat('..x...x...x...x.'),
    DRUM_LOW: repeat('................'),
    DRUM_BASS: repeat('x.......x.......'),
    DULCIMER: '1...............|6...............|1...............|7...............',
    DULCIMER_HIGH: '5.3.5.3.5.3.5.3.|5.3.5.3.5.3.5.3.|5.3.5.3.5.3.5.3.|7.5.7.5.7.5.7.5.',
    STRINGS: '1...............|6...............|1...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–i–VI–V。D–E–D の動機を拍の裏へずらし、足もとを揺らす。
  SCENE_2_03: {
    DRUM_HIGH: repeat('x..x..x...x..x..'),
    DRUM_LOW: repeat('......x.........'),
    DRUM_BASS: repeat('x...........x...'),
    DULCIMER: '1..2..1.........|1..2..1.........|6..5..6.........|7..5..7.........',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|6...............|5...............',
    BELL: 'x...............|................|................|................',
  },
  // i–i–VI–V。ボス。D–D–E–D の細かい刻みと、4分で刻む弦。
  SCENE_2_04: {
    DRUM_HIGH: repeat('x.xx.xx.x.xx.xx.'),
    DRUM_LOW: repeat('.x..x..x.x..x..x'),
    DRUM_BASS: repeat('x...x...x...x...'),
    DULCIMER: '1.1.2.1.1.1.2.1.|1.1.2.1.1.1.2.1.|6.6.5.6.6.6.5.6.|7.7.5.7.7.7.5.7.',
    DULCIMER_HIGH: '8.......8.......|8.......8.......|6.......6.......|7.......7.......',
    STRINGS: '1...1...1...1...|1...1...1...1...|6...6...6...6...|5...5...5...5...',
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
