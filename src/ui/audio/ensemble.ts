// [M-DATA-AUDIO-CUE]【戦闘の合奏】ケチャを思わせる声のリズムと、ガムランを思わせる鍵盤の旋律。
// 重低音の1拍を16の区切りに割り、2拍分の32区切りを1つの譜とする。譜は読みやすさのため1拍ごとに '|' で区切る。
// 値はすべて暫定値。

export const SCORE_STEPS = 32;
export const STEPS_PER_PULSE = 16;

export type Voice = 'CAK' | 'CAK_LOW' | 'PUNG' | 'SARON' | 'GANGSA' | 'GONG';
export const VOICES: readonly Voice[] = ['CAK', 'CAK_LOW', 'PUNG', 'SARON', 'GANGSA', 'GONG'];

// 鍵盤の声部。譜の数字は音階の度数を表し、資産（D の一音）の再生の速さを変えて鳴らす。
const PITCHED: readonly Voice[] = ['SARON', 'GANGSA'];

// 【戦闘の合奏】「音階」ペログ（セリシル）の5音。1度を D とし、各度の D からの隔たり（セント）。
export const PELOG_CENTS: readonly number[] = [0, 120, 270, 540, 670];

export type Score = Readonly<Record<Voice, string>>;

export const SCENE_SCORES: Readonly<Record<string, Score>> = {
  SCENE_1_01: {
    CAK: '..x...x...x...x.|..x...x...x.x.x.',
    CAK_LOW: 'x.......x.......|x.......x.......',
    PUNG: 'x...............|x...............',
    SARON: '1.......3.......|2.......1.......',
    GANGSA: '................|........6.7.6.5.',
    GONG: 'x...............|................',
  },
  SCENE_1_02: {
    CAK: 'x.x.x.x.x.x.x.x.|x.x.x.x.x.x.x.x.',
    CAK_LOW: '....x.......x...|....x.......x...',
    PUNG: 'x.......x.......|x.......x.......',
    SARON: '1...2...3...5...|4...3...2...1...',
    GANGSA: '................|................',
    GONG: 'x...............|................',
  },
  SCENE_2_01: {
    CAK: '..x..x....x..x..|..x..x....x..x..',
    CAK_LOW: 'x.........x.....|x.........x.....',
    PUNG: 'x...............|x...............',
    SARON: '1.......4.......|3.......2.......',
    GANGSA: '....9.....8.....|....7.....6.....',
    GONG: 'x...............|................',
  },
  SCENE_2_02: {
    CAK: '..x...x...x...x.|..x...x...x...x.',
    CAK_LOW: '................|................',
    PUNG: 'x.......x.......|x.......x.......',
    SARON: '1...3...1...3...|2...4...2...3...',
    GANGSA: '6.7.6.7.6.7.6.7.|6.7.6.7.8.7.6.7.',
    GONG: 'x...............|................',
  },
  SCENE_2_03: {
    CAK: 'x..x..x...x..x..|x..x..x...x..x..',
    CAK_LOW: '......x.........|......x.........',
    PUNG: 'x...........x...|x...........x...',
    SARON: '1.....2.....4...|5.....4.....2...',
    GANGSA: '...8.....9......|...7.....6......',
    GONG: 'x...............|................',
  },
  SCENE_2_04: {
    CAK: 'x.xx.xx.x.xx.xx.|x.xx.xx.x.xx.xx.',
    CAK_LOW: '.x..x..x.x..x..x|.x..x..x.x..x..x',
    PUNG: 'x...x...x...x...|x...x...x...x...',
    SARON: '1.2.3.5.4.3.2.1.|5.4.3.2.3.4.5.1.',
    GANGSA: '6767898767678987|0989878676786767',
    GONG: 'x...............|x...............',
  },
};

// 譜の1文字の再生の速さ。休みは Null。鍵盤の数字は度数（1〜5、6〜9・0 は1オクターブ上）を速さへ写す。
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
  return 2 ** ((PELOG_CENTS[degree] ?? 0) / 1200 + octave);
}

// 声部の譜を、区切りごとの再生の速さ（休みは Null）へ読む。'|' は読み飛ばす。
export function readScore(voice: Voice, line: string): (number | null)[] {
  return [...line.replace(/\|/g, '')].map((mark) => rateOf(voice, mark));
}
