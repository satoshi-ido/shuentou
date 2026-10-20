// [M-DATA-AUDIO-CUE]【戦闘の合奏】男声合唱の掛け声が噛み合う声のリズム、ハンマーダルシマーの旋律、弦の和音・刻み・旋律、聖堂の大鐘。
// 重低音の1拍を16の区切りに割り、4拍分の64区切りを1つの譜とする。譜は読みやすさのため1拍ごとに '|' で区切る。
// 和音は1拍に1つとし、旋律は短い動機を繰り返して緊迫感をつくる。値はすべて暫定値。

export const SCORE_STEPS = 64;
export const STEPS_PER_PULSE = 16;

export type Voice = 'CHANT' | 'CHANT_LOW' | 'CHANT_BASS' | 'DULCIMER' | 'DULCIMER_HIGH' | 'STRINGS' | 'BASS_LINE' | 'MELODY' | 'BELL';
export const VOICES: readonly Voice[] = ['CHANT', 'CHANT_LOW', 'CHANT_BASS', 'DULCIMER', 'DULCIMER_HIGH', 'STRINGS', 'BASS_LINE', 'MELODY', 'BELL'];

// 声部が鳴らす資産（ENSEMBLE の variant）。低い弦の刻み（BASS_LINE）は和音の弦と同じ資産を1オクターブ下で、
// 弦の旋律（MELODY）は1オクターブ上で鳴らす。
export const VOICE_ASSET: Readonly<Record<Voice, Voice>> = {
  CHANT: 'CHANT',
  CHANT_LOW: 'CHANT_LOW',
  CHANT_BASS: 'CHANT_BASS',
  DULCIMER: 'DULCIMER',
  DULCIMER_HIGH: 'DULCIMER_HIGH',
  STRINGS: 'STRINGS',
  BASS_LINE: 'STRINGS',
  MELODY: 'STRINGS',
  BELL: 'BELL',
};

// 声部ごとの、資産の高さからのオクターブのずれ。
const OCTAVE_SHIFT: Readonly<Partial<Record<Voice, number>>> = { BASS_LINE: -1, MELODY: 1 };

// 音の高さを持つ声部。譜の数字は音階の度数を表し、資産（D の一音）の再生の速さを変えて鳴らす。
const MELODIC: readonly Voice[] = ['DULCIMER', 'DULCIMER_HIGH', 'BASS_LINE', 'MELODY'];

// 和音の声部。譜の数字は和音の根音の度数を表し、音階の音を3度ずつ重ねた三和音を同時に鳴らす。
export const CHORDAL: readonly Voice[] = ['STRINGS'];

// 【戦闘の合奏】「音階」D の和声的短音階（D・E・F・G・A・B♭・C♯）。1度を D とし、各度の D からの隔たり（セント）。
export const SCALE_CENTS: readonly number[] = [0, 200, 300, 500, 700, 800, 1100];

export type Score = Readonly<Record<Voice, string>>;

const repeat = (beat: string): string => [beat, beat, beat, beat].join('|');

export const SCENE_SCORES: Readonly<Record<string, Score>> = {
  // i–i–VI–V。低い弦が拍の裏を刻み、VI で B♭、V で A から C♯ へせり上がる。打弦は緊張の一音だけを置く。
  // 声は拍の前半を 3+3 で刻み、後半の間に低い声が一打で答える。
  // 弦の旋律は長い音で A–B♭–A、F–E と沈み、VI で B♭–A–B♭、V で C♯ を伸ばして頭の A へ戻す。
  SCENE_1_01: {
    CHANT: repeat('x..x..x.........'),
    CHANT_LOW: repeat('..........x.....'),
    CHANT_BASS: repeat('x...............'),
    DULCIMER: '................|................|................|7...............',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|6...............|5...............',
    BASS_LINE: '1...1.1.1...1.1.|1...1.1.1...1.1.|6...6.6.6...6.6.|5...5.5.5...7.7.',
    MELODY: '5.......6...5...|3.......2.......|6.......5...6...|7...............',
    BELL: 'x...............|................|................|................',
  },
  // i–i–iv–V。付点で踏みしめる低い弦の行進。打弦は最後の V で導音を2度置く。
  // 声は8分の裏を刻み、低い声が半拍ごとに踏んで、付点の弦と噛み合う。
  // 弦の旋律は A を付点で踏んで B♭ へ触れ、F に沈む。iv で G–B♭–G、V で C♯ から A へ降りる。
  SCENE_1_02: {
    CHANT: repeat('.x...x...x...x..'),
    CHANT_LOW: repeat('x.......x.......'),
    CHANT_BASS: repeat('x.......x.......'),
    DULCIMER: '................|................|................|7.......7.......',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|4...............|5...............',
    BASS_LINE: '1..1..1.1..1..1.|1..1..1.1..1..1.|4..4..4.4..4..4.|5..5..5.7..7..7.',
    MELODY: '5.......5..6..5.|3...............|4.......4..6..4.|7...........5...',
    BELL: 'x...............|................|x...............|................',
  },
  SCENE_2_01: {
    CHANT: repeat('..x..x....x..x..'),
    CHANT_LOW: repeat('x.........x.....'),
    CHANT_BASS: repeat('x...............'),
    DULCIMER: '6...5...........|6...5...........|6...5...........|7...8...........',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|4...............|5...............',
    BASS_LINE: repeat('................'),
    MELODY: repeat('................'),
    BELL: 'x...............|................|................|................',
  },
  // i–VI–i–V。高い打弦の短い揺れが、子守歌のように止まらない。
  SCENE_2_02: {
    CHANT: repeat('..x...x...x...x.'),
    CHANT_LOW: repeat('................'),
    CHANT_BASS: repeat('x.......x.......'),
    DULCIMER: '1...............|6...............|1...............|7...............',
    DULCIMER_HIGH: '5.3.5.3.5.3.5.3.|5.3.5.3.5.3.5.3.|5.3.5.3.5.3.5.3.|7.5.7.5.7.5.7.5.',
    STRINGS: '1...............|6...............|1...............|5...............',
    BASS_LINE: repeat('................'),
    MELODY: repeat('................'),
    BELL: 'x...............|................|................|................',
  },
  // i–i–VI–V。D–E–D の動機を拍の裏へずらし、足もとを揺らす。
  SCENE_2_03: {
    CHANT: repeat('x..x..x...x..x..'),
    CHANT_LOW: repeat('......x.........'),
    CHANT_BASS: repeat('x...........x...'),
    DULCIMER: '1..2..1.........|1..2..1.........|6..5..6.........|7..5..7.........',
    DULCIMER_HIGH: repeat('................'),
    STRINGS: '1...............|1...............|6...............|5...............',
    BASS_LINE: repeat('................'),
    MELODY: repeat('................'),
    BELL: 'x...............|................|................|................',
  },
  // i–i–VI–V。ボス。D–D–E–D の細かい刻みと、4分で刻む弦。
  SCENE_2_04: {
    CHANT: repeat('x.xx.xx.x.xx.xx.'),
    CHANT_LOW: repeat('.x..x..x.x..x..x'),
    CHANT_BASS: repeat('x...x...x...x...'),
    DULCIMER: '1.1.2.1.1.1.2.1.|1.1.2.1.1.1.2.1.|6.6.5.6.6.6.5.6.|7.7.5.7.7.7.5.7.',
    DULCIMER_HIGH: '8.......8.......|8.......8.......|6.......6.......|7.......7.......',
    STRINGS: '1...1...1...1...|1...1...1...1...|6...6...6...6...|5...5...5...5...',
    BASS_LINE: repeat('................'),
    MELODY: repeat('................'),
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
  return rateOfCents(centsOf(degree + 2 * tone) + 1200 * (OCTAVE_SHIFT[voice] ?? 0));
}

// 声部の譜を、区切りごとの再生の速さ（休みは Null）へ読む。'|' は読み飛ばす。
// 和音の声部は tone（0: 根音、1: 3度、2: 5度）ごとに読む。
export function readScore(voice: Voice, line: string, tone = 0): (number | null)[] {
  return [...line.replace(/\|/g, '')].map((mark) => rateOf(voice, mark, tone));
}
