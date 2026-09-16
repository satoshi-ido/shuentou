// [I-PLAN-MASTERGEN]［人が書く入力］定跡マスタ（[A-BOOK-SCHEMA]）。値の正本は [A-BOOK-TABLE]（全7件）。
// セレクタは参照元の敵マスターの構成テンプレートに照合して class_id へ展開する。
// can_wait は [A-BOOK-TABLE] の注記により全手 True である。

export const BOOKS = [
  {
    book_id: 'B-01',
    enemy_id: 'ENEMY_LEF',
    steps: [
      { kind: 'FIXED', selector: { component: 'MIND', variant: 'BASIC', ar_mult: '1.00' }, can_wait: true },
      { kind: 'FIXED', selector: { component: 'STANCE', variant: 'BASIC', ar_mult: '2.00' }, can_wait: true },
    ],
  },
  {
    book_id: 'B-02',
    enemy_id: 'ENEMY_DORN',
    steps: [
      { kind: 'FIXED', selector: { component: 'MIND', variant: 'BASIC', ar_mult: '1.00' }, can_wait: true },
      { kind: 'FIXED', selector: { component: 'STANCE', variant: 'BASIC', ar_mult: '1.00' }, can_wait: true },
      { kind: 'FIXED', selector: { component: 'MARTIAL', variant: 'RUSH', ar_mult: '1.00' }, can_wait: true },
    ],
  },
  {
    book_id: 'B-03',
    enemy_id: 'ENEMY_ASHAL',
    steps: [
      { kind: 'FIXED', selector: { component: 'MIND', variant: 'BASIC', ar_mult: '1.00' }, can_wait: true },
      { kind: 'FIXED', selector: { component: 'SUMMON', variant: 'BASIC', ar_mult: '1.00' }, can_wait: true },
    ],
  },
  {
    book_id: 'B-04',
    enemy_id: 'ENEMY_ZEFAL',
    steps: [
      { kind: 'FIXED', selector: { component: 'MIND', variant: 'SPECIAL', ar_mult: '1.50' }, can_wait: true },
      { kind: 'FIXED', selector: { component: 'SUMMON', variant: 'BASIC', ar_mult: '2.00' }, can_wait: true },
    ],
  },
  {
    book_id: 'B-05',
    enemy_id: 'ENEMY_ZOL_VOD',
    steps: [
      { kind: 'FIXED', selector: { component: 'MIND', variant: 'SPECIAL', ar_mult: '1.50' }, can_wait: true },
      { kind: 'FIXED', selector: { component: 'STANCE', variant: 'BASIC', ar_mult: '3.00' }, can_wait: true },
    ],
  },
  {
    // [A-BOOK-SEMANTICS]［MIRROR_FIRST_SYSTEM リゾルバ］解決辞書は生成器が構成テンプレートから導く。
    book_id: 'B-06',
    enemy_id: 'ENEMY_MIRROR_SEIN',
    steps: [{ kind: 'DYNAMIC', resolver: 'MIRROR_FIRST_SYSTEM', can_wait: true }],
  },
  {
    book_id: 'B-07',
    enemy_id: 'ENEMY_VEIN',
    steps: [{ kind: 'FIXED', selector: { component: 'MIND', variant: 'SPECIAL', ar_mult: '1.50' }, can_wait: true }],
  },
];
