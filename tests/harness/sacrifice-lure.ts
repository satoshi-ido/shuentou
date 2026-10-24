// [V-TEST-REFAI]［供犠の誘いの検証］代理ごとに 1-01 を戦い、1-01 後のインターミッションで供犠する・しないの
// 2通りから 1-02 を戦う。

import type { DecisionProvider } from '../../src/engine/decision.js';
import { confirmInherit, settleIntermission } from '../../src/engine/game/intermission.js';
import { inheritPool, type InheritTarget } from '../../src/engine/progress/inherit.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { createRun, MASTERS, playerDecisionOverride, playIntermission, playScene } from './runner.js';

// 1-01 後の供犠の対象（アクト1の同行従者はリナのみ：[M-TMPL-ENEMY-1-02]【供犠の誘い】）。
export const LURE_VICTIM = 'ATTENDANT_01';

export interface LureBattle {
  readonly sceneId: string;
  readonly result: string;
  readonly steps: number;
  readonly minHp: number; // 主人公マスターの最低HP
  readonly startHp: number;
  readonly maxHp: number;
  readonly rootLoss: boolean; // 敗北が敵マスターの根源武技の着弾による
}

export interface LureOutcome {
  readonly scene101: LureBattle;
  // 1-01 後に供犠しない。継承プールの各項目を継承した試行（キーは class_id または MAX_HP）。1-01 で敗北した場合は空。
  readonly kept: Readonly<Record<string, LureBattle>>;
  readonly sacrificed: LureBattle | null; // 1-01 後にリナを供犠する
}

function labelOf(target: InheritTarget): string {
  return target.kind === 'ACTION' ? target.class_id : target.kind;
}

function master(state: BattleState, side: 'MINE' | 'FOE'): Unit | undefined {
  return state.units.find((unit): unit is Unit => unit !== null && unit.side === side && unit.unit_kind === 'MASTER');
}

function battle(session: ReturnType<typeof createRun>['session'], ctx: ReturnType<typeof createRun>['ctx']): LureBattle {
  const run = session.data.run;
  const startHp = run.hero_hp;
  const maxHp = run.hero_max_hp;
  let minHp = startHp;
  let last: BattleState | null = null;
  const outcome = playScene(
    session,
    ctx,
    'BALANCE',
    (state) => {
      last = state;
      const hero = master(state, 'MINE');
      if (hero !== undefined) {
        minHp = Math.min(minHp, hero.hp);
      }
    },
    undefined,
    20000,
  );
  const final = session.data.run.battle_state ?? last;
  const foe = final === null ? undefined : master(final, 'FOE');
  const hero = final === null ? undefined : master(final, 'MINE');
  if (outcome.result === 'LOSS') {
    minHp = 0;
  }
  return {
    sceneId: outcome.scene_id,
    result: outcome.result,
    steps: outcome.steps,
    minHp,
    startHp,
    maxHp,
    rootLoss: outcome.result === 'LOSS' && foe?.last_act?.class_id === 'ACT_ROOT_MARTIAL' && (hero?.hp ?? 0) <= 0,
  };
}

export function lureTrial(standIn: DecisionProvider, withSacrifice: boolean): LureOutcome {
  playerDecisionOverride.provider = standIn;
  try {
    const { session, ctx } = createRun();
    const scene101 = battle(session, ctx);
    if (scene101.result !== 'WIN') {
      return { scene101, kept: {}, sacrificed: null };
    }
    const afterClear = structuredClone(session.data);
    // 供犠しない条件は、リナの継承枠で継承プールの各項目を継承した試行とする。
    const kept: Record<string, LureBattle> = {};
    for (const target of inheritPool(session.data.run, MASTERS)) {
      const branch = createRun(structuredClone(afterClear));
      confirmInherit(branch.session, branch.ctx, LURE_VICTIM, target);
      settleIntermission(branch.session, branch.ctx);
      kept[labelOf(target)] = battle(branch.session, branch.ctx);
    }
    let sacrificed: LureBattle | null = null;
    if (withSacrifice) {
      const branch = createRun(structuredClone(afterClear));
      playIntermission(branch.session, branch.ctx, 'BALANCE', 0, LURE_VICTIM);
      sacrificed = battle(branch.session, branch.ctx);
    }
    return { scene101, kept, sacrificed };
  } finally {
    playerDecisionOverride.provider = null;
  }
}
