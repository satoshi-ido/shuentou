// [M-RESOLVE-SUMMON] [M-DATA-CREATUREMASTER] [M-TMPL-CREATURE-PRINCIPLE]
// 召喚によるクリーチャーの実体化。

import { describe, expect, it } from 'vitest';
import { ACTION_MASTERS } from '../../src/data/generated/action-masters.js';
import { CREATURE_MASTERS } from '../../src/data/generated/creature-masters.js';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS } from '../../src/data/generated/hero-init.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import { createCreatureFactory } from '../../src/engine/creature.js';
import { executableActions } from '../../src/engine/decision.js';
import { advanceStep } from '../../src/engine/pipeline/step.js';
import { createScene } from '../../src/engine/setup.js';
import type { CreatureMasterRecord } from '../../src/data/types.js';
import type { BattleState, Unit } from '../../src/engine/types.js';

const creatures: Readonly<Record<string, CreatureMasterRecord>> = CREATURE_MASTERS;

const deps = {
  createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }),
};

// 2-01 腑分け師ヴォルグ。[M-TMPL-ENEMY-NORMAL] の追加枠に召喚（基本）AR ≒ L * 1.0 を持つ。
function scene201(): BattleState {
  return createScene({
    sceneLevel: SCENE_MASTERS.SCENE_2_01.level,
    heroMaxHp: 60,
    heroActionOrder: HERO_INIT_ACTIONS,
    enemyRecord: ENEMY_MASTERS.ENEMY_VOLG,
    actionMasters: ACTION_MASTERS,
  });
}

describe('[M-DATA-CREATUREMASTER] クリーチャーマスタ', () => {
  it('全ての summon_id がクリーチャーマスタのレコードを指す', () => {
    for (const record of Object.values(ACTION_MASTERS)) {
      const summonId: string | null = record.params.summon_id;
      if (summonId !== null) {
        expect(Object.keys(CREATURE_MASTERS)).toContain(summonId);
      }
    }
  });

  it('[M-TMPL-CREATURE-PRINCIPLE] 配列インデックス0は隊列交代（単体）で固定する', () => {
    for (const record of Object.values(CREATURE_MASTERS)) {
      expect(record.acts[0]).toBe('ACT_SWAP_SINGLE');
      expect(ACTION_MASTERS.ACT_SWAP_SINGLE.params.is_swap).toBe(true);
    }
  });

  it('[M-TMPL-CREATURE-PRINCIPLE]［標準基準式］最大HP ≒ 1.86 * (ar_summon ^ 1.5)', () => {
    // ar_summon = 4.0（2-01 の召喚（基本）AR ≒ L * 1.0、L = 4）→ round(1.86 * 8) = 15
    expect(CREATURE_MASTERS.CREATURE_THRALL_AR4.max_hp).toBe(15);
  });
});

describe('[M-RESOLVE-SUMMON] 新クリーチャー実体化', () => {
  it('敵軍マスター（idx: 2）の召喚は idx: 3 へ初期ステートで配置される', () => {
    const state = scene201();
    const enemy = state.units[2] as Unit;
    const summon = enemy.acts.find((action) => action.base_params.summon_id !== null);
    if (summon === undefined) {
      throw new Error('2-01 の敵マスターが召喚アクションを保持していない');
    }
    const creatureId = summon.base_params.summon_id as string;
    state.units[3] = deps.createCreature(creatureId, 3, 'FOE', state);

    const creature = state.units[3] as Unit;
    expect(creature.side).toBe('FOE');
    expect(creature.unit_kind).toBe('CREATURE');
    expect(creature.pos_idx).toBe(3);
    expect(creature.hp).toBe(creatures[creatureId].max_hp);
    expect(creature.max_hp).toBe(creatures[creatureId].max_hp);
    expect([creature.vp, creature.pp, creature.ap, creature.slip]).toEqual([0, 0, 0, 0]);
    expect(creature.state).toBe('THOUGHT');
    expect(creature.elapsed_thought).toBe(0);
    expect(creature.acts.every((action) => action.seal_accum === 0)).toBe(true);
    expect(creature.acts.map((action) => action.master_ref)).toEqual([...creatures[creatureId].acts]);
  });

  it('[I-STATE-ID] 実体化はステートの採番位置を消費し、既存インスタンスIDと衝突しない', () => {
    const state = scene201();
    const before = { units: state.unit_id_seq, instances: state.instance_id_seq };
    const creature = deps.createCreature('CREATURE_THRALL_AR4', 3, 'FOE', state);
    expect(state.unit_id_seq).toBe(before.units + 1);
    expect(state.instance_id_seq).toBe(before.instances + creature.acts.length);

    const existing = state.units
      .filter((unit): unit is Unit => unit !== null)
      .flatMap((unit) => unit.acts.map((action) => action.instance_id));
    for (const action of creature.acts) {
      expect(existing).not.toContain(action.instance_id);
    }
  });

  it('既存クリーチャーは発動の瞬間に撤去され、新しい個体へ置き換わる', () => {
    const state = scene201();
    const enemy = state.units[2] as Unit;
    const first = deps.createCreature('CREATURE_THRALL_AR4', 3, 'FOE', state);
    state.units[3] = first;
    const second = deps.createCreature('CREATURE_THRALL_AR4', 3, 'FOE', state);
    state.units[3] = second;
    expect(state.units[3]?.unit_id).toBe(second.unit_id);
    expect(second.unit_id).not.toBe(first.unit_id);
    expect(enemy.pos_idx).toBe(2);
  });
});

describe('[M-RESOLVE-SUMMON] 召喚を含むステップ実行', () => {
  it('敵が召喚アクションを実行するとクリーチャーが盤面へ現れる', () => {
    const state = scene201();
    const enemy = state.units[2] as Unit;
    const summonId = enemy.acts.find((action) => action.base_params.summon_id !== null)?.instance_id;
    if (summonId === undefined) {
      throw new Error('2-01 の敵マスターが召喚アクションを保持していない');
    }
    // 召喚は VPコストを要するため、成立するまで心気を撃たせる。
    let guard = 0;
    while (state.units[3] === null && guard < 2000) {
      advanceStep(
        state,
        (_s, unit) => {
          if (unit.side !== 'FOE') {
            return { kind: 'PASS' };
          }
          const options = executableActions(state, unit);
          const summon = options.find((action) => action.instance_id === summonId);
          if (summon !== undefined) {
            return { kind: 'ACT', instanceId: summon.instance_id };
          }
          const mind = options.find((action) => action.sys_flags.includes('FLAG_MIND'));
          return mind === undefined ? { kind: 'PASS' } : { kind: 'ACT', instanceId: mind.instance_id };
        },
        deps,
      );
      guard += 1;
    }
    expect(state.units[3]).not.toBeNull();
    expect((state.units[3] as Unit).unit_kind).toBe('CREATURE');
    expect((state.units[3] as Unit).side).toBe('FOE');
  });
});
