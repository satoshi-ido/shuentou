// [V-TEST-REFAI]［供犠の誘いの検証］主人公側を操作する脚本の代理。代理1（直情型）は初見の、代理2（応手型）は
// 既知の打ち方を表す。いずれも乱数を用いない（[A-CORE-DETERMINISM]#1）。

import { ROOT_COUNTER_ID } from '../../src/ai/constants.js';
import { generateMoves, isRootAction, opposingMaster } from '../../src/ai/movegen.js';
import { executableActions, type DecisionProvider } from '../../src/engine/decision.js';
import { currentDefense } from '../../src/engine/defense.js';
import {
  effectiveAtk,
  effectiveCostPp,
  effectiveDmgHpCenti,
  effectiveRange,
  effectiveStepRecovery,
  effectiveStepStartup,
  effectiveStepThought,
} from '../../src/engine/effective.js';
import { levelHpDamage } from '../../src/engine/calc.js';
import { hasFlag } from '../../src/engine/flags.js';
import type { ActionInstance, BattleState, Unit } from '../../src/engine/types.js';

const PASS = { kind: 'PASS' } as const;

function act(action: ActionInstance) {
  return { kind: 'ACT', instanceId: action.instance_id } as const;
}

// 拍止めを除き、実効HPダメージが0でない武技。
function isAttack(unit: Unit, action: ActionInstance): boolean {
  return (
    hasFlag(action.sys_flags, 'FLAG_MARTIAL') && action.master_ref !== ROOT_COUNTER_ID && effectiveDmgHpCenti(unit, action) > 0
  );
}

// 実効HPダメージの大きい順、同値は所持アクション配列インデックス昇順。
function byDamage(unit: Unit, actions: readonly ActionInstance[]): ActionInstance[] {
  const index = (action: ActionInstance) => unit.acts.indexOf(action);
  return [...actions].sort(
    (a, b) => effectiveDmgHpCenti(unit, b) - effectiveDmgHpCenti(unit, a) || index(a) - index(b),
  );
}

// [A-SEARCH-MOVEGEN]「拍止め」の発射の時機であれば拍止め。候補手が拍止めのみとなる。
function counterToFire(state: BattleState, unit: Unit): ActionInstance | null {
  const moves = generateMoves(state, unit);
  const only = moves.length === 1 ? moves[0] : undefined;
  return only !== undefined && only.kind === 'ACT' && only.action.master_ref === ROOT_COUNTER_ID ? only.action : null;
}

function mindOf(actions: readonly ActionInstance[]): ActionInstance | undefined {
  return actions.find((action) => hasFlag(action.sys_flags, 'FLAG_MIND'));
}

// 代理1（直情型）：拍止めの発射 → 実効HPダメージ最大の武技 → 心気 → パス。
export const impulsiveStandIn: DecisionProvider = (state, unit) => {
  const counter = counterToFire(state, unit);
  if (counter !== null) {
    return act(counter);
  }
  const executable = executableActions(state, unit);
  const attack = byDamage(unit, executable.filter((action) => isAttack(unit, action)))[0];
  if (attack !== undefined) {
    return act(attack);
  }
  const mind = mindOf(executable);
  return mind === undefined ? PASS : act(mind);
};

// 相手陣営のマスターが実行中の、実効HPダメージを持つ武技（発生中に限る）。
function chargingAttack(rival: Unit): ActionInstance | null {
  if (rival.state !== 'STARTUP' || rival.last_act === null) {
    return null;
  }
  const running = rival.acts.find((action) => action.instance_id === rival.last_act!.instance_id);
  return running !== undefined && isAttack(rival, running) ? running : null;
}

function usable(action: ActionInstance): boolean {
  return action.uses_left !== 0;
}

// 応手時間：相手陣営のマスターが思考中に戻ってから、スタン付き武技を主人公へ着弾させるまでの最短のステップ数。
// 硬直中の相手は経過思考を0として求める。相手は主人公の着手を次のステップの決定点で見て応じるため1を加える。
// 該当がなければ無限大。
export function responseTime(rival: Unit): number {
  const elapsed = rival.state === 'THOUGHT' ? rival.elapsed_thought : 0;
  const wait = (action: ActionInstance) =>
    Math.max(0, effectiveStepThought(rival, action) - elapsed) + effectiveStepStartup(rival, action);
  const minds = rival.acts.filter((action) => hasFlag(action.sys_flags, 'FLAG_MIND') && usable(action));
  const refill = minds.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...minds.map(wait));
  let best = Number.POSITIVE_INFINITY;
  for (const action of rival.acts) {
    if (!isAttack(rival, action) || !action.base_params.stun || !usable(action)) {
      continue;
    }
    if (isRootAction(action)) {
      continue;
    }
    const short = rival.pp < effectiveCostPp(rival, action);
    best = Math.min(best, wait(action) + (short ? refill : 0));
  }
  return best + 1;
}

// 相手陣営のマスターの、現在の PP で撃てる最速のスタン付き武技のPPコストと、主人公へ与える実効HPダメージ（[M-CALC-LEVEL]）。
function fastestAnswer(state: BattleState, rival: Unit): { cost: number; damage: number } | null {
  const elapsed = rival.state === 'THOUGHT' ? rival.elapsed_thought : 0;
  let best: { time: number; cost: number; damage: number } | null = null;
  for (const action of rival.acts) {
    if (!isAttack(rival, action) || !action.base_params.stun || !usable(action) || isRootAction(action)) {
      continue;
    }
    const cost = effectiveCostPp(rival, action);
    if (rival.pp < cost) {
      continue;
    }
    const time = Math.max(0, effectiveStepThought(rival, action) - elapsed) + effectiveStepStartup(rival, action);
    if (best === null || time < best.time) {
      best = { time, cost, damage: levelHpDamage(effectiveDmgHpCenti(rival, action), state.scene_level) };
    }
  }
  return best === null ? null : { cost: best.cost, damage: best.damage };
}

// 代理2（応手型）。[V-TEST-REFAI]［供犠の誘いの検証］の1.〜8.。
export const responsiveStandIn: DecisionProvider = (state, unit) => {
  const counter = counterToFire(state, unit);
  if (counter !== null) {
    return act(counter);
  }
  const rival = opposingMaster(state, unit);
  if (rival === null) {
    return PASS;
  }
  // 2. 拍止めの温存：温存が除く手は候補に含めない。
  const candidates = generateMoves(state, unit).flatMap((move) => (move.kind === 'ACT' ? [move.action] : []));
  const defense = currentDefense(rival);
  const distance = Math.abs(rival.pos_idx - unit.pos_idx);
  const reaching = byDamage(
    unit,
    candidates.filter(
      (action) =>
        isAttack(unit, action) && effectiveAtk(unit, action) >= defense && distance <= effectiveRange(unit, action),
    ),
  );
  // PPの留保と心気の要否は、PPコストを持たないマスター根源武技を除いて判定する。
  const costs = (actions: readonly ActionInstance[]) =>
    actions.filter((action) => !isRootAction(action)).map((action) => effectiveCostPp(unit, action));
  const reachingCosts = costs(reaching);
  const minCost = reachingCosts.length === 0 ? null : Math.min(...reachingCosts);
  const before = (limit: number, reserve: boolean) =>
    reaching.find(
      (action) =>
        effectiveStepStartup(unit, action) < limit &&
        (!reserve || rival.pp < 1 || unit.pp - effectiveCostPp(unit, action) >= (minCost ?? 0)),
    );

  const charging = chargingAttack(rival);
  // 3. 中断
  if (charging !== null) {
    const hit = before(effectiveStepStartup(rival, charging) - rival.elapsed_startup, false);
    if (hit !== undefined) {
      return act(hit);
    }
  }
  // 4. 硬直の咎め
  if (rival.state === 'RECOVERY') {
    const hit = before(rival.applied_recovery - rival.elapsed_recovery + responseTime(rival), true);
    if (hit !== undefined) {
      return act(hit);
    }
  }
  // 5. 突き
  if (rival.state === 'THOUGHT') {
    const hit = before(responseTime(rival), true);
    if (hit !== undefined) {
      return act(hit);
    }
  }
  // 6. 誘い：安全に突けず、相手の最速の応手1回で相手の PP がその応手のPPコストを下回るとき、PPコストの最小の届く武技を
  // 撃って応手を引き出す（相手の最速の応手を3回受けても尽きないHPがある場合に限る）。応手の後は相手の PP が尽き、
  // 心気で補うまで 5. の突きが通る。
  if (rival.state === 'THOUGHT') {
    const answer = fastestAnswer(state, rival);
    const bait = [...reaching].sort((a, b) => effectiveCostPp(unit, a) - effectiveCostPp(unit, b))[0];
    if (
      bait !== undefined &&
      answer !== null &&
      rival.pp - answer.cost < answer.cost &&
      unit.hp > answer.damage * 3
    ) {
      return act(bait);
    }
  }
  // 7. 心気：所持する心気のうち必要硬直実効値が最小のもの（同値は所持アクション配列インデックス昇順）。実行可能に
  // なるまで待ち、硬直の長い心気（心気（無想）等）で代えない。
  const preferred = unit.acts
    .filter((action) => hasFlag(action.sys_flags, 'FLAG_MIND'))
    .sort((a, b) => effectiveStepRecovery(unit, a) - effectiveStepRecovery(unit, b) || unit.acts.indexOf(a) - unit.acts.indexOf(b))[0];
  const mind = preferred !== undefined && candidates.includes(preferred) ? preferred : undefined;
  // いずれの届く武技も、相手が PP を持つ間は留保（最小のPPコスト）を残して撃てるだけの PP を蓄える。
  const pool = reachingCosts.length > 0 ? reachingCosts : costs(unit.acts.filter((action) => isAttack(unit, action)));
  const need = Math.max(...pool) + (rival.pp >= 1 ? Math.min(...pool) : 0);
  // 相手の攻撃の発生中は、心気が着弾より前に発動する場合に限る。
  const mindInTime =
    mind !== undefined &&
    (charging === null ||
      effectiveStepStartup(rival, charging) - rival.elapsed_startup > effectiveStepStartup(unit, mind));
  if (mind !== undefined && unit.pp < need && mindInTime) {
    return act(mind);
  }
  return PASS;
};
