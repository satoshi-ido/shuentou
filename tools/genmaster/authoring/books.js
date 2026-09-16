// [I-PLAN-MASTERGEN]［人が書く入力］定跡マスタ（[A-BOOK-SCHEMA]）。値の正本は [A-BOOK-TABLE]。
// セレクタは参照元の敵マスターの構成テンプレートに照合して class_id へ展開する。

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
];
