// [V-TEST-NONFUNC] D-15 の実地の確認（[M-GUARD-ROOTWAIT]）。
// 審査範囲のうち主人公が体勢を継承しうるシーンで、主人公が開幕から心気で体勢のPPを満たし、体勢を展開した後は
// パスを続けて根源武技を指示する。敵マスターが拍止めで主人公の思考を中断させ、決着上限（D-02）までに根源武技の
// 着弾による勝利を許さないことを確かめる。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { executableActions } from '../../src/engine/decision.js';
import { instruct, resumeTime, startBattle, type BattleResult } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import type { GameSession } from '../../src/engine/game/session.js';
import { instantiateAction } from '../../src/engine/instantiate.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { buildAuditInput, maxDeploy, poolOf } from '../../tools/audit/lib.js';
import { createHarnessContext, decisionLimit } from './runner.js';

type ActionId = keyof typeof ACTION_MASTERS;

function heroOf(state: BattleState): Unit {
  return state.units.find((unit): unit is Unit => unit !== null && unit.side === 'MINE' && unit.unit_kind === 'MASTER')!;
}

// pool(N) のうち max_deploy(N) を与える体勢（[V-AUDIT-SYMBOLS]）。
function bestStanceOf(sceneId: string): ActionId {
  const scenes = buildAuditInput();
  const index = scenes.findIndex((scene) => scene.scene_id === sceneId);
  const pool = poolOf(scenes, index);
  const best = maxDeploy(pool);
  return pool.find((record) => record.params.deploy_ap === best && record.params.deploy_ap > 0)!.class_id as ActionId;
}

function playRootWait(sceneId: string): { result: BattleResult; step: number } {
  let session: GameSession | null = null;
  const ctx = createHarnessContext(() => session!);
  session = newGameSession(ctx);
  session.data.run.current_scene_id = sceneId;
  const stance = bestStanceOf(sceneId);
  session.data.run.hero_acts.push(instantiateAction(ACTION_MASTERS[stance], session.data.run));

  const limit = decisionLimit(SCENE_MASTERS[sceneId as keyof typeof SCENE_MASTERS].expected_length);
  let deployed = false;
  let result = startBattle(session, ctx, { stopAtStep: 0 });
  let step = 0;
  while (result === 'PAUSED' || result === 'RUNNING') {
    const state = session.data.run.battle_state!;
    step = state.step;
    if (step > limit) {
      break;
    }
    const hero = heroOf(state);
    const options = hero.state === 'THOUGHT' ? executableActions(state, hero) : [];
    if (deployed) {
      // 体勢の展開を指示した後は、根源武技が実行可能になるまでパスを続け、実行可能になれば指示する。
      const root = options.find((action) => action.master_ref === 'ACT_ROOT_MARTIAL');
      result = root === undefined ? resumeTime(session, ctx) : instruct(session, ctx, hero.unit_id, root.instance_id);
      continue;
    }
    if (hero.state !== 'THOUGHT') {
      result = resumeTime(session, ctx, { stopAtStep: step + 1 });
      continue;
    }
    const guard = options.find((action) => action.master_ref === stance);
    const mind = options.find((action) => action.master_ref === 'ACT_MIND_AR3');
    const next = { stopAtStep: step + 1 };
    if (guard !== undefined) {
      deployed = true;
      result = instruct(session, ctx, hero.unit_id, guard.instance_id, next);
    } else if (mind !== undefined && hero.pp < ACTION_MASTERS[stance].params.cost_pp) {
      result = instruct(session, ctx, hero.unit_id, mind.instance_id, next);
    } else {
      result = resumeTime(session, ctx, next);
    }
  }
  return { result, step };
}

describe('[M-GUARD-ROOTWAIT] 心気・体勢の後に待つだけの手順', () => {
  it.each(['SCENE_1_02', 'SCENE_2_01', 'SCENE_2_02', 'SCENE_2_03', 'SCENE_2_04'])('%s で主人公は勝利しない', (sceneId) => {
    const { result, step } = playRootWait(sceneId);
    expect(result, `${sceneId} step ${step}`).not.toBe('WIN');
  });
});
