// [M-DATA-AUDIO-CUE]【打楽器の型】重低音の1拍を8つに割り、2拍分の16区切りを1つの型とする。
// 'x' は一打、'.' は休み。1文字目と9文字目が重低音の一打と重なる。値は暫定値。

export const RHYTHM_STEPS = 16;
export const STEPS_PER_PULSE = 8;

export type Drum = 'KICK' | 'TOM' | 'FRAME' | 'METAL';
export const DRUMS: readonly Drum[] = ['KICK', 'TOM', 'FRAME', 'METAL'];

export type Rhythm = Readonly<Record<Drum, string>>;

export const SCENE_RHYTHMS: Readonly<Record<string, Rhythm>> = {
  SCENE_1_01: { KICK: 'x.......x.......', TOM: '....x.......x.x.', FRAME: '................', METAL: '..............x.' },
  SCENE_1_02: { KICK: 'x...x...x...x...', TOM: '..x...x...x.x.x.', FRAME: 'x.x.x.x.x.x.x.x.', METAL: '................' },
  SCENE_2_01: { KICK: 'x.......x.......', TOM: '......x.....x...', FRAME: '..x...x...x...x.', METAL: '....x...........' },
  SCENE_2_02: { KICK: 'x.......x.......', TOM: '................', FRAME: '....x.......x...', METAL: '..x...x...x...x.' },
  SCENE_2_03: { KICK: 'x.....x.x.......', TOM: '...x.......x....', FRAME: 'x..x..x..x..x...', METAL: '.......x......x.' },
  SCENE_2_04: { KICK: 'x..x..x.x..x..x.', TOM: '..x...x...x.xxx.', FRAME: 'x.x.x.x.x.x.x.x.', METAL: 'x.......x...x...' },
};
