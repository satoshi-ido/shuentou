// [I-PLAN-MASTERGEN] 生成結果から [V-NUM-PARAMS] の掲載値が導出できることを検証する。
import { describe, expect, it } from 'vitest';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.js';
import { generateHeroInitActions } from '../../tools/genmaster/lib.js';
import { expandEnemyTemplate } from '../../tools/genmaster/templates.js';
import { ENEMIES } from '../../tools/genmaster/authoring/enemies.js';

function expandEnemy(enemyId: string, level: number) {
  const entry = ENEMIES.find((record: { enemy_id: string }) => record.enemy_id === enemyId);
  if (entry === undefined) {
    throw new Error(`敵マスターIDが見つからない: ${enemyId}`);
  }
  return expandEnemyTemplate(entry, level, () => null);
}

function findAction(records: ReadonlyArray<{ class_id: string }>, classId: string) {
  const found = records.find((record) => record.class_id === classId);
  if (found === undefined) {
    throw new Error(`class_id が見つからない: ${classId}`);
  }
  return found as {
    class_id: string;
    base_uses: number;
    params: {
      step_thought: number;
      step_startup: number;
      step_recovery: number;
      atk: number;
      cost_pp: number;
      deploy_ap: number;
    };
  };
}

describe('[V-NUM-PARAMS] 祠守レフ（L=3）', () => {
  const actions = expandEnemy('ENEMY_LEF', 3).records;
  const record = ENEMY_MASTERS.ENEMY_LEF;

  it('武技（基本）AR3', () => {
    const action = findAction(actions, 'ACT_SLASH_AR3');
    expect(action.params.step_thought).toBe(59);
    expect(action.params.step_startup).toBe(20);
    expect(action.params.step_recovery).toBe(79);
    expect(action.params.atk).toBe(6);
    expect(action.params.cost_pp).toBe(1);
  });

  it('武技（基本）AR6', () => {
    const action = findAction(actions, 'ACT_SLASH_AR6');
    expect(action.params.step_thought).toBe(42);
    expect(action.params.step_startup).toBe(14);
    expect(action.params.step_recovery).toBe(56);
    expect(action.params.atk).toBe(8);
    expect(action.params.cost_pp).toBe(2);
  });

  it('武技（重撃）AR3', () => {
    const action = findAction(actions, 'ACT_HEAVY_AR3');
    expect(action.params.step_thought).toBe(0);
    expect(action.params.step_startup).toBe(236);
    expect(action.params.step_recovery).toBe(0);
    expect(action.params.atk).toBe(12);
    expect(action.params.cost_pp).toBe(1);
  });

  it('体勢（基本）AR3', () => {
    const action = findAction(actions, 'ACT_GUARD_AR3');
    expect(action.params.step_startup).toBe(39);
    expect(action.params.step_recovery).toBe(118);
    expect(action.params.deploy_ap).toBe(16);
    expect(action.params.cost_pp).toBe(1);
  });

  it('体勢（基本）AR6', () => {
    const action = findAction(actions, 'ACT_GUARD_AR6');
    expect(action.params.step_startup).toBe(28);
    expect(action.params.step_recovery).toBe(83);
    expect(action.params.deploy_ap).toBe(23);
    expect(action.params.cost_pp).toBe(2);
  });

  it('敵マスターは HP10、[A-BOOK-TABLE] B-01・[A-PROFILE-TABLE] PROFILE_FRENZY を参照する', () => {
    expect(record.max_hp).toBe(10);
    expect(record.book_id).toBe('B-01');
    expect(record.ai_profile_id).toBe('PROFILE_FRENZY');
  });
});

describe('[V-NUM-PARAMS] 主人公初期キット', () => {
  const { records } = generateHeroInitActions();

  it('武技（重撃）AR15', () => {
    const action = findAction(records, 'ACT_HEAVY_AR15');
    expect(action.params.step_thought).toBe(0);
    expect(action.params.step_startup).toBe(105);
    expect(action.params.step_recovery).toBe(0);
    expect(action.params.atk).toBe(27);
    expect(action.params.cost_pp).toBe(5);
  });

  it('[M-DATA-HERO-INIT] の個別上書きにより base_uses は10回（centi: 1000）', () => {
    const action = findAction(records, 'ACT_HEAVY_AR15');
    expect(action.base_uses).toBe(1000);
  });
});
