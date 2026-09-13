// [M-RESOLVE-SWAP] 隊列交代コンポーネント解決アルゴリズム（[M-RESOLVE-ORDER] Step 2）。
// 実行条件（#1・#2）は選択可否の判定であり decision 層が担う。本モジュールは
// 「すでに選択が確定した」ことを前提に、位置入れ替え（#3）と相方の思考ステップリセット（#4）のみを行う。
// 実行者自身の状態遷移（#5）は、隊列交代アクションが常に必要発生0（即時型）であることから
// [M-PIPE-INSTANT] の汎用分岐に委ねる。

import { hasFlag } from '../flags.js';
import type { ActionInstance, Unit } from '../types.js';
import { partnerOf } from './partner.js';

export function resolveSwap(units: (Unit | null)[], actor: Unit, action: ActionInstance): void {
  if (!hasFlag(action.sys_flags, 'FLAG_SWAP')) {
    return;
  }
  const partner = partnerOf(units, actor);
  if (partner === null) {
    return;
  }
  const actorIdx = actor.pos_idx;
  const partnerIdx = partner.pos_idx;
  units[actorIdx] = partner;
  units[partnerIdx] = actor;
  partner.pos_idx = actorIdx;
  actor.pos_idx = partnerIdx;
  partner.elapsed_thought = 0;
}
