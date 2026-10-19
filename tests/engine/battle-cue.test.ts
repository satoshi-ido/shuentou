// [S-SCRIPT-TRIGGER]【バトル中の契機】《処理8》の先頭で表示側の判定を呼び、成立したら時間を止めて CUE を返す。
// 再生中はバトル時間を進めず、BattleState を変更しない。

import { describe, expect, it } from 'vitest';
import { resumeBattle, startBattle } from '../../src/engine/game/battle.js';
import { newGameSession } from '../../src/engine/game/save.js';
import { createContext, playBattle } from './game-fixtures.js';

describe('[S-SCRIPT-TRIGGER] バトル中の契機による停止', () => {
  it('契機で止めても、止めずに進めた場合と同じ時間停止に至る', () => {
    const plainCtx = createContext({ saves: [] });
    const plain = newGameSession(plainCtx);
    const plainResult = startBattle(plain, plainCtx);

    const cueCtx = createContext({ saves: [] });
    const cued = newGameSession(cueCtx);
    let calls = 0;
    const cueAt = (): boolean => {
      calls += 1;
      return calls === 1; // ステップ0の《処理8》の先頭で1度だけ成立させる
    };
    expect(startBattle(cued, cueCtx, { cueAt })).toBe('CUE');
    const before = JSON.stringify(cued.data.run.battle_state);
    expect(cued.data.run.battle_state?.pause_reason).toBeNull();
    // 再生の間は BattleState を変更しない。
    expect(JSON.stringify(cued.data.run.battle_state)).toBe(before);
    expect(resumeBattle(cued, cueCtx, { cueAt })).toBe(plainResult);
    expect(JSON.stringify(cued.data.run.battle_state)).toBe(JSON.stringify(plain.data.run.battle_state));
  });

  it('勝利で決着したとき、決着時の BattleState を表示側へ渡す', () => {
    const ctx = createContext({ saves: [] });
    const session = newGameSession(ctx);
    expect(playBattle(session, ctx)).toBe('WIN');
    const won = session.won_battle_state ?? null;
    expect(won).not.toBeNull();
    const enemy = won?.units.find((unit) => unit !== null && unit.side === 'FOE' && unit.unit_kind === 'MASTER');
    expect(enemy === undefined || enemy === null || enemy.hp <= 0).toBe(true);
    expect(session.data.run.battle_state).toBeNull();
  });
});
