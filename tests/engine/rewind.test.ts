// [M-STATE-HISTORY] [M-REWIND-UNDO] [M-REWIND-ROLLBACK] [M-STATE-IMSNAPSHOT] [M-META-PENDING] [M-META-COMMIT]
// [M-META-SAVEDATA] [I-STATE-JSON] [I-PLAN-MILESTONE]（M3 受け入れ線）

import { describe, expect, it } from 'vitest';
import { resumeBattle, resumeTime, startBattle } from '../../src/engine/game/battle.js';
import {
  confirmInherit,
  confirmRefill,
  confirmSacrifice,
  enterTransition,
  settleIntermission,
} from '../../src/engine/game/intermission.js';
import { rollbackBattle, rollbackIntermission, undo } from '../../src/engine/game/rewind.js';
import { loadGame, newGameSession, peekSave } from '../../src/engine/game/save.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import { createContext, playBattle, playOneOperation, scriptedFoe } from './game-fixtures.js';

function setup() {
  const recorder = { saves: [] as string[] };
  let foeCalls = 0;
  const base = createContext(recorder);
  const ctx: GameContext = {
    ...base,
    foeDecision: (state, unit) => {
      foeCalls += 1;
      return scriptedFoe(state, unit);
    },
  };
  return { recorder, ctx, session: newGameSession(ctx), foeCalls: () => foeCalls };
}

const runJson = (session: GameSession): string => JSON.stringify(session.data.run);

describe('[M-REWIND-UNDO] アンドゥ', () => {
  it('バトル中の確定操作を1操作単位で巻き戻し、敵軍AIを再計算しない', () => {
    const { session, ctx, foeCalls } = setup();
    expect(startBattle(session, ctx)).toBe('PAUSED');
    for (let i = 0; i < 2; i += 1) {
      const before = runJson(session);
      expect(playOneOperation(session, ctx)).toBe('PAUSED');
      const calls = foeCalls();
      undo(session);
      expect(foeCalls()).toBe(calls);
      expect(runJson(session)).toBe(before);
      expect(playOneOperation(session, ctx)).toBe('PAUSED');
    }
    expect(session.data.run.history_stack).toHaveLength(2);
  });

  it('インターミッションの確定操作を巻き戻し、決済確定後の PRE_BATTLE からも戻れる', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx);
    const beforeInherit = runJson(session);
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(session, ctx);
    expect(session.data.run.phase).toBe('PRE_BATTLE');
    expect(session.data.run.history_stack).toHaveLength(1);
    undo(session);
    expect(runJson(session)).toBe(beforeInherit);
  });

  it('バトル開始時に HistoryStack を破棄する', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx);
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
    settleIntermission(session, ctx);
    startBattle(session, ctx);
    expect(session.data.run.history_stack).toEqual([]);
  });
});

describe('[M-PIPE-PAUSE-TRIGGER] 時間停止', () => {
  it('敵軍のアクション実行開始で停止し、手動停止は指示可能な自軍ユニットがいる最初のステップで成立する', () => {
    const { session, ctx } = setup();
    expect(startBattle(session, ctx)).toBe('PAUSED');
    const step = session.data.run.battle_state?.step ?? 0;
    expect(step).toBe(147); // [V-NUM-OPENING] 敵の最初の行動
    expect(resumeTime(session, ctx, { stopAtStep: step + 1 })).toBe('PAUSED');
    expect(session.data.run.battle_state?.step).toBe(step + 1);
  });
});

describe('[M-META-PENDING] [M-META-COMMIT] 巻き戻しの保留と確定', () => {
  it('アンドゥは保留とし、後続の確定操作で1回だけ加算する', () => {
    const { session, ctx } = setup();
    startBattle(session, ctx);
    playOneOperation(session, ctx);
    playOneOperation(session, ctx);
    undo(session);
    undo(session);
    expect(session.data.pending).toEqual({ rewind_pending: true, rewind_pending_type: 'UNDO' });
    expect(session.data.meta.total_rewind_count).toBe(0);
    playOneOperation(session, ctx);
    expect(session.data.pending).toEqual({ rewind_pending: false, rewind_pending_type: 'NONE' });
    expect(session.data.meta.total_rewind_count).toBe(1);
  });

  it('バトル中の確定イベントはラン進行ステートをバトル開始時のまま保存する', () => {
    const { session, ctx, recorder } = setup();
    startBattle(session, ctx);
    const battleStartSave = JSON.parse(recorder.saves[0] ?? '');
    playOneOperation(session, ctx);
    undo(session);
    playOneOperation(session, ctx);
    const commitSave = JSON.parse(recorder.saves.at(-1) ?? '');
    expect(recorder.saves).toHaveLength(2);
    expect(commitSave.run).toEqual(battleStartSave.run);
    expect(commitSave.meta.total_rewind_count).toBe(1);
    expect(commitSave.pending.rewind_pending).toBe(false);
  });

  it('過去インターミッションへのロールバックは補充では確定せず、継承・供犠・決済で確定する', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx);
    settleIntermission(session, ctx);
    playBattle(session, ctx);
    rollbackIntermission(session, 2);
    enterTransition(session, ctx);
    confirmRefill(session, ctx, 'ATTENDANT_02');
    // 補充確定は ROLLBACK_INTERMISSION の確定イベントではないが、enshrine_anchor の記録で
    // total_rewind_count を読み出すため参照時フラッシュ（[M-META-FLUSH]）により決済される。
    expect(session.data.meta.total_rewind_count).toBe(1);
    expect(session.data.meta.enshrine_anchor.ATTENDANT_02).toEqual({ playthrough: 1, rewind_count: 1 });
  });
});

describe('[M-REWIND-ROLLBACK] ロールバック', () => {
  it('バトル開始時ロールバックはステップ0から最初の時間停止までを再現する', () => {
    const { session, ctx } = setup();
    startBattle(session, ctx);
    const firstPause = runJson(session);
    for (let i = 0; i < 2; i += 1) {
      expect(playOneOperation(session, ctx)).toBe('PAUSED');
    }
    expect(rollbackBattle(session, ctx)).toBe('PAUSED');
    expect(runJson(session)).toBe(firstPause);
    expect(session.data.pending.rewind_pending_type).toBe('ROLLBACK_BATTLE');
  });

  it('過去インターミッションへ復帰し、より後のスナップショットを破棄する', () => {
    const { session, ctx } = setup();
    playBattle(session, ctx);
    const snapshot = session.data.run.im_snapshots[0];
    settleIntermission(session, ctx);
    playBattle(session, ctx);
    expect(session.data.run.im_snapshots.map((entry) => entry.order)).toEqual([1, 2]);
    rollbackIntermission(session, 1);
    const { run } = session.data;
    expect(run.im_snapshots.map((entry) => entry.order)).toEqual([1]);
    expect(run.history_stack).toEqual([]);
    expect(JSON.stringify({ ...run, history_stack: undefined, im_snapshots: undefined })).toBe(
      JSON.stringify({ ...snapshot?.state, history_stack: undefined, im_snapshots: undefined }),
    );
    expect(session.data.pending.rewind_pending_type).toBe('ROLLBACK_INTERMISSION');
  });
});

describe('[M-META-SAVEDATA] セーブとロード', () => {
  it('バトル開始時セーブのロードは ROLLBACK_BATTLE の保留を立てて最初の時間停止から再開する', () => {
    const first = setup();
    startBattle(first.session, first.ctx);
    const firstPause = runJson(first.session);
    const loaded = loadGame(first.recorder.saves[0] ?? '', setup().ctx);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.battle).toBe('PAUSED');
    expect(runJson(loaded.session)).toBe(firstPause);
    expect(loaded.session.data.pending).toEqual({ rewind_pending: true, rewind_pending_type: 'ROLLBACK_BATTLE' });
  });

  it('現行の save_version は 3 であり、そのセーブはロードできる', () => {
    const { session, ctx, recorder } = setup();
    startBattle(session, ctx);
    const data = JSON.parse(recorder.saves[0] ?? '');
    expect(data.save_version).toBe(3);
    expect(loadGame(JSON.stringify(data), ctx).ok).toBe(true);
  });

  // 1: 初期版。2: BattleState に監視トグル・停止事由・定跡の項目を加えた版（instance_id_seq の追加前）。
  it.each([1, 2])('旧版 save_version %i のセーブはマイグレーションせずロードを拒否する', (oldVersion) => {
    const { session, ctx, recorder } = setup();
    startBattle(session, ctx);
    const data = JSON.parse(recorder.saves[0] ?? '');
    data.save_version = oldVersion;
    expect(loadGame(JSON.stringify(data), ctx)).toEqual({ ok: false, reason: 'VERSION_MISMATCH', save_version: oldVersion });
  });
});

describe('進行の防護', () => {
  it('タイトルの読み取りはバトル中のセーブでも進行を伴わない', () => {
    const { session, ctx, recorder } = setup();
    startBattle(session, ctx);
    const serialized = recorder.saves[0] ?? '';
    const peeked = peekSave(serialized);
    expect(peeked?.run.phase).toBe('BATTLE');
    expect(JSON.stringify(peeked)).toBe(serialized); // 読み取りはステートを進めない
    expect(peekSave(JSON.stringify({ ...JSON.parse(serialized), save_version: 2 }))).toBeNull();
  });

  it('時間停止にも決着にも到達しない進行は、際限なく回らず不整合として検出する', () => {
    const { session, ctx } = setup();
    // 決定主体が常にパスを返し、自軍にも実行可能手がない局面（[M-PIPE-PAUSE-TRIGGER] のいずれも成立しない）。
    const passing: GameContext = { ...ctx, foeDecision: () => ({ kind: 'PASS' }) };
    startBattle(session, passing, { maxSteps: 1 });
    for (const unit of session.data.run.battle_state?.units ?? []) {
      if (unit !== null) {
        unit.acts = [];
      }
    }
    expect(() => resumeBattle(session, passing)).toThrow(/ステップ進行した/);
  });
});

describe('[I-STATE-JSON] シリアライズ制約', () => {
  it('セーブデータ・HistoryStack の各項目は JSON 往復と構造化複製で一致する', () => {
    const { session, ctx, recorder } = setup();
    playBattle(session, ctx);
    confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'ACTION', class_id: 'ACT_MUSOU_AR3' });
    const values: unknown[] = [...recorder.saves.map((text) => JSON.parse(text)), ...session.data.run.history_stack];
    for (const value of values) {
      expect(JSON.parse(JSON.stringify(value))).toEqual(structuredClone(value));
    }
  });
});

// 巻き戻しを含まない操作列。
function playStraight(session: GameSession, ctx: GameContext): void {
  playBattle(session, ctx);
  confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
  settleIntermission(session, ctx);
  playBattle(session, ctx);
  confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'ACTION', class_id: 'ACT_RUSH_AR4' });
  confirmSacrifice(session, ctx, 'ATTENDANT_01');
  enterTransition(session, ctx);
  confirmRefill(session, ctx, 'ATTENDANT_02');
  confirmRefill(session, ctx, 'ATTENDANT_03');
  settleIntermission(session, ctx);
}

// 上と同じ実効操作に、アンドゥ・両ロールバック・ロードを差し挟んだ操作列。
function playWithRewinds(ctx: GameContext, recorder: { saves: string[] }): GameSession {
  const session = newGameSession(ctx);
  startBattle(session, ctx);
  for (let i = 0; i < 3; i += 1) {
    playOneOperation(session, ctx);
  }
  undo(session);
  let result = playOneOperation(session, ctx);
  while (result === 'PAUSED') {
    result = playOneOperation(session, ctx);
  }
  confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'ACTION', class_id: 'ACT_SLASH_AR3' });
  undo(session);
  confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
  settleIntermission(session, ctx);
  undo(session);
  confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
  settleIntermission(session, ctx);

  startBattle(session, ctx);
  for (let i = 0; i < 4; i += 1) {
    playOneOperation(session, ctx);
  }
  rollbackBattle(session, ctx);
  resumeTime(session, ctx);
  undo(session);
  result = 'PAUSED';
  while (result === 'PAUSED') {
    result = playOneOperation(session, ctx);
  }
  rollbackIntermission(session, 1);
  confirmInherit(session, ctx, 'ATTENDANT_01', { kind: 'MAX_HP' });
  settleIntermission(session, ctx);
  expect(playBattle(session, ctx)).toBe('WIN');

  // バトルクリア決済完了時のセーブからロードして続行する。
  const loaded = loadGame(recorder.saves.at(-1) ?? '', ctx);
  if (!loaded.ok) {
    throw new Error('ロードに失敗した');
  }
  const resumed = loaded.session;
  confirmInherit(resumed, ctx, 'ATTENDANT_01', { kind: 'ACTION', class_id: 'ACT_RUSH_AR4' });
  confirmSacrifice(resumed, ctx, 'ATTENDANT_01');
  enterTransition(resumed, ctx);
  confirmRefill(resumed, ctx, 'ATTENDANT_02');
  confirmRefill(resumed, ctx, 'ATTENDANT_03');
  settleIntermission(resumed, ctx);
  return resumed;
}

describe('[I-PLAN-MILESTONE] M3 受け入れ線：同一操作列の再走で全ステートが一致', () => {
  it('同一操作列を2回走らせると、セーブデータ全体と保存列が一致する', () => {
    const a = setup();
    const b = setup();
    const sessionA = playWithRewinds(a.ctx, a.recorder);
    const sessionB = playWithRewinds(b.ctx, b.recorder);
    expect(JSON.stringify(sessionA.data)).toBe(JSON.stringify(sessionB.data));
    expect(a.recorder.saves).toEqual(b.recorder.saves);
    expect(sessionA.data.meta.total_rewind_count).toBeGreaterThan(0);
  });

  it('アンドゥ・ロールバック・ロードを経た再走は、巻き戻しのない操作列とラン進行ステートが一致する', () => {
    const straight = setup();
    playStraight(straight.session, straight.ctx);
    const rewound = setup();
    const session = playWithRewinds(rewound.ctx, rewound.recorder);
    expect(runJson(session)).toBe(runJson(straight.session));
    expect(session.data.run.hero_acts.map((action) => action.instance_id)).toEqual(
      straight.session.data.run.hero_acts.map((action) => action.instance_id),
    );
  });
});
