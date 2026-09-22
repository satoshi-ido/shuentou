// [V-TEST-REFAI] 参照プレイヤーAI。
//
// 「エンジンは敵AIと同一のものを陣営を反転して使用する（別実装を作らない）」との規定どおり、
// 探索深度固定 depth 3 / node 10,000・相手モデル best_reply の参照AIは、[createAiDecisionProvider]
// をプレイヤー側（MINE）ユニットへ適用するだけで成立する（[decideAction] は unit.side を見て
// FOEを最大化・MINEを最小化するため、追加の鏡像実装を要しない）。
//
// 「攻撃型」「防御型」「バランス型」の3方針は、継承する従者・技の選択規則（[M-INHERIT-POOL]相当の
// 装備構築）を定めるものであり、RunState・継承プール（M3以降）が未実装のM2時点では対象外とする。
// 「無操作型」（常にパス）はビルド選択を要さないため、本モジュールで提供する。

import type { DecisionProvider } from '../engine/decision.js';
import type { StepDeps } from '../engine/pipeline/step.js';
import { createAiDecisionProvider } from './decision.js';
import { referenceProfile } from './profile.js';

// [V-TEST-REFAI]［役割充足による選択］最大HP加算の途絶とみなすインターミッション数（暫定値）。2では体力の
// 役割が他の役割の枠を奪い 4-07 で14件が敗北し、3では 4-04 の敗北が解消する（摂動21件、1-01〜4-08）。
// [M-GUARD-LETHAL] の最低配分率 1 / (本値 + 1) を定める（体力の役割は4回に1回以上の最大HP加算を保証する）。
export const ROLE_HP_STALE_INTERMISSIONS = 3;

// 「無操作型」：常にパス。敵AIの単独完走時間の計測に用いる。
export const passiveDecisionProvider: DecisionProvider = () => ({ kind: 'PASS' });

// 探索ベースの参照プレイヤーAI（depth 3 / node 10,000 / best_reply）。
export function createReferenceDecisionProvider(deps: StepDeps): DecisionProvider {
  return createAiDecisionProvider(referenceProfile(), deps);
}
