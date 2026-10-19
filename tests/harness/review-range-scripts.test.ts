// [I-PLAN-SUBMISSION]【審査範囲】1-01〜2-04 を参照プレイヤーAI（[V-TEST-REFAI]）とビルドプロファイル BP-03 で通し、
// 各発火点で選ばれる脚本を確かめる（[S-SCRIPT-TRIGGER]・[S-SCRIPT-CONDITION]・[M-META-ECHO]）。
// 表示側の再生処理は発火点ごとに同じ選択関数を用いるため、ここではレコードの選択と残響の発火を検査する。
// 2-04 を初めてクリアした後に 2-04 の前のインターミッションへ戻り、既知版への切り替えも確かめる。

import { describe, expect, it } from 'vitest';
import { SCRIPT_MASTERS } from '../../src/data/generated/script-masters.js';
import type { ScriptMasterRecord } from '../../src/data/types.js';
import { rollbackIntermission } from '../../src/engine/game/rewind.js';
import type { GameContext, GameSession } from '../../src/engine/game/session.js';
import { isActTransition } from '../../src/engine/progress/refill.js';
import { sceneOf } from '../../src/engine/run/masters.js';
import { conditionReader } from '../../src/engine/script/condition.js';
import { scriptById, scriptsAt } from '../../src/engine/script/select.js';
import { BattleCueTracker } from '../../src/ui/script-cues.js';
import { buildProfileOf, playBuildIntermission } from './build-profiles.js';
import { playSceneWithRetry } from './perturb.js';
import { createRun, MASTERS } from './runner.js';

// [V-TEST-BUILD-PROFILES] BP-03：バランス型。最終編成にガルドを含む（2-02 の残響の対象）。予定の供犠はアクト3以降だが、
// 現在HPが最大HPの半分を下回ると供犠する規則により、審査範囲でも供犠が起きうる。
const PROFILE = buildProfileOf('BP-03');

const scripts: Readonly<Record<string, ScriptMasterRecord>> = SCRIPT_MASTERS;
const RINA = 'ATTENDANT_01';
const GARUD = 'ATTENDANT_02';

interface Trace {
  readonly intro: Record<string, string[][]>; // シーンID → 開幕ごとのレコード列
  readonly clear: Record<string, string[][]>; // シーンID → 撃破後ごとのレコード列（残響を含む）
  readonly cues: Record<string, string[]>; // シーンID → 決着時までに成立した契機
  readonly transition: string[][];
  readonly wakes: { readonly attendantId: string; readonly scripts: string[] }[]; // 供犠ごとの〈目覚め〉
  readonly partyAtClear: Record<string, string[]>; // シーンID → クリア時の同行従者
}

const ids = (records: readonly ScriptMasterRecord[]): string[] => records.map((record) => record.script_id);

function recordIntro(trace: Trace, session: GameSession): void {
  const sceneId = session.data.run.current_scene_id;
  (trace.intro[sceneId] ??= []).push(ids(scriptsAt(scripts, 'SCENE_INTRO', sceneId, conditionReader(session, MASTERS))));
}

function playAndRecord(trace: Trace, session: GameSession, ctx: GameContext): void {
  const sceneId = session.data.run.current_scene_id;
  trace.partyAtClear[sceneId] = session.data.run.party.map((slot) => slot.attendant_id);
  const attempt = playSceneWithRetry(session, ctx, PROFILE.policy);
  expect(attempt.outcome.result, sceneId).toBe('WIN');
  // 勝利の決着：勝敗の確定の直前の契機 → 撃破後 → 種別Aの残響（表示側の playClearScripts と同じ順）。
  const won = session.won_battle_state ?? null;
  expect(won).not.toBeNull();
  if (won !== null) {
    trace.cues[sceneId] = new BattleCueTracker().take(won, sceneId, scripts);
  }
  const read = conditionReader(session, MASTERS);
  const echoes = (session.cleared_echoes ?? [])
    .map((echoId) => MASTERS.echoes[echoId]?.script_id ?? null)
    .filter((scriptId): scriptId is string => scriptId !== null)
    .map((scriptId) => scriptById(scripts, scriptId, read)?.script_id ?? '');
  (trace.clear[sceneId] ??= []).push([...ids(scriptsAt(scripts, 'SCENE_CLEAR', sceneId, read)), ...echoes]);
}

// インターミッションは BP-03 の規則で行う。アクト移行の表題は移行元アクト番号で選ぶ。
function intermission(trace: Trace, session: GameSession, ctx: GameContext, turn: number): void {
  const { run } = session.data;
  if (isActTransition(run, MASTERS)) {
    const fromAct = String(sceneOf(MASTERS, run.current_scene_id).act - 1);
    trace.transition.push(ids(scriptsAt(scripts, 'ACT_TRANSITION', fromAct, conditionReader(session, MASTERS))));
  }
  const result = playBuildIntermission(session, ctx, PROFILE, turn);
  if (result.sacrificed !== null) {
    // 〈目覚め〉の版は残響の解放状態で選ぶ。解放状態はインターミッションの中で変わらない。
    trace.wakes.push({
      attendantId: result.sacrificed,
      scripts: ids(scriptsAt(scripts, 'SACRIFICE_EXECUTE', result.sacrificed, conditionReader(session, MASTERS))),
    });
  }
}

describe('[I-PLAN-SUBMISSION] 審査範囲の通しプレイにおける脚本の選択', () => {
  it('1-01〜2-04 を通し、2-04 の前へ戻って既知版を確かめる', () => {
    const { session, ctx } = createRun();
    const trace: Trace = { intro: {}, clear: {}, cues: {}, transition: [], wakes: [], partyAtClear: {} };
    const order = (): number => sceneOf(MASTERS, session.data.run.current_scene_id).order;

    recordIntro(trace, session);
    for (let turn = 0; order() <= 6; turn += 1) {
      playAndRecord(trace, session, ctx);
      if (order() === 7) {
        break; // 2-04 をクリアし、次は 3-01
      }
      intermission(trace, session, ctx, turn);
      recordIntro(trace, session);
    }
    // 2-04 の前のインターミッション（2-03 クリア後、order 5）へ戻り、2-04 をもう一度通す。
    rollbackIntermission(session, ctx, 5);
    intermission(trace, session, ctx, 5);
    recordIntro(trace, session);
    playAndRecord(trace, session, ctx);

    // 1-01：1周目は表題・前段・点火・開幕の順。
    expect(trace.intro.SCENE_1_01).toEqual([
      ['SCRIPT_ACT_TITLE_1', 'SCRIPT_SCENE_1_01_PRE', 'SCRIPT_SCENE_1_01_IGNITE', 'SCRIPT_SCENE_1_01_INTRO'],
    ]);
    expect(trace.clear.SCENE_1_01).toEqual([['SCRIPT_SCENE_1_01_CLEAR']]);
    // 1-02：巻き戻しのない道行きでは初見版。戦闘中の契機（HPの半分）が成立している。
    expect(trace.intro.SCENE_1_02).toEqual([['SCRIPT_SCENE_1_02_DECLARE', 'SCRIPT_SCENE_1_02_MEET_UNKNOWN', 'SCRIPT_SCENE_1_02_INTRO']]);
    expect(trace.cues.SCENE_1_02).toEqual(['SCENE_1_02:ENEMY_HP_HALF']);
    expect(trace.clear.SCENE_1_02).toEqual([['SCRIPT_SCENE_1_02_CLEAR']]);
    // アクト1→2 の移行で表題を示す。
    expect(trace.transition).toEqual([['SCRIPT_ACT_TITLE_2']]);
    // アクト2 の各シーン。2-02 のクリア後にガルドの残響が発火する。
    expect(trace.intro.SCENE_2_01).toEqual([['SCRIPT_SCENE_2_01_INTRO']]);
    expect(trace.intro.SCENE_2_02).toEqual([['SCRIPT_SCENE_2_02_INTRO']]);
    expect(trace.cues.SCENE_2_02).toEqual(['SCENE_2_02:ENEMY_FIRST_ACT']);
    // 種別A：2-02 のクリア時にガルドが同行していれば、ガルドの残響が発火する。
    const garudAt202 = trace.partyAtClear.SCENE_2_02?.includes(GARUD) === true;
    expect(trace.clear.SCENE_2_02).toEqual([garudAt202 ? ['SCRIPT_ECHO_02'] : []]);
    expect(session.data.meta.echo_unlocked.ECHO_02).toBe(garudAt202);
    // 〈目覚め〉は対象の従者に応じた版を1件選ぶ。ガルドは残響を聞いていれば既聴版。
    for (const wake of trace.wakes) {
      expect(wake.scripts).toHaveLength(1);
      if (wake.attendantId === GARUD) {
        expect(wake.scripts[0]).toBe(garudAt202 ? 'SCRIPT_WAKE_02_HEARD' : 'SCRIPT_WAKE_02_UNHEARD');
      }
    }
    console.log(`供犠：${JSON.stringify(trace.wakes)} / 2-02 クリア時の同行：${trace.partyAtClear.SCENE_2_02?.join(',')}`);
    expect(trace.intro.SCENE_2_03).toEqual([['SCRIPT_SCENE_2_03_INTRO']]);
    // 2-04：初回は初見版で開幕し、撃破後に塞がれた路地と第七棚を見る。戻った後は既知版で、撃破後の初見版を再生しない。
    expect(trace.intro.SCENE_2_04).toEqual([
      ['SCRIPT_SCENE_2_04_OPEN_UNKNOWN', 'SCRIPT_SCENE_2_04_INTRO'],
      ['SCRIPT_SCENE_2_04_OPEN_KNOWN', 'SCRIPT_SCENE_2_04_INTRO'],
    ]);
    expect(trace.cues.SCENE_2_04).toEqual(['SCENE_2_04:ENEMY_FIRST_ACT']);
    expect(trace.clear.SCENE_2_04).toEqual([
      ['SCRIPT_SCENE_2_04_CLEAR', 'SCRIPT_SCENE_2_04_CLEAR_UNKNOWN'],
      ['SCRIPT_SCENE_2_04_CLEAR'],
    ]);
    // アクト移行でガルドを迎えている（供犠した場合は同行枠を離れても編成履歴に残る）。
    expect(session.data.run.recruited).toContain(GARUD);
    expect(RINA).toBe('ATTENDANT_01');
  });
});
