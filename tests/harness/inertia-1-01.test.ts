// [A-SEARCH-REUSE]「相手の行動開始による解除」「相手の発生中の不適用」の実地確認。再探索抑制は実バトルの進行経路
// （[M-UI-PLAYBACK]）でのみ働くため、ハーネスの通しプレイの経路で 1-01 を戦う。

import { describe, expect, it } from 'vitest';
import { executableActions } from '../../src/engine/decision.js';
import type { BattleState, Unit } from '../../src/engine/types.js';
import { createRun, playerDecisionOverride, playScene } from './runner.js';

function master(state: BattleState, side: 'MINE' | 'FOE'): Unit {
  return state.units.find((unit): unit is Unit => unit !== null && unit.side === side && unit.unit_kind === 'MASTER')!;
}

describe('[A-SEARCH-REUSE] 1-01 の再探索と中断', () => {
  it('主人公が心気の後に撃つ武技（基本）AR3 の着弾より前に、レフは武技AR6 で中断する', { timeout: 600_000 }, () => {
    const started: string[] = [];
    let slashed = false;
    playerDecisionOverride.provider = (state, unit) => {
      const want = unit.last_act === null ? 'ACT_MIND_AR3' : slashed ? null : 'ACT_SLASH_AR3';
      const action = want === null ? undefined : executableActions(state, unit).find((a) => a.master_ref === want);
      if (action === undefined) {
        return { kind: 'PASS' };
      }
      slashed = slashed || want === 'ACT_SLASH_AR3';
      started.push(`${state.step}:MINE:${action.master_ref}`);
      return { kind: 'ACT', instanceId: action.instance_id };
    };
    try {
      const { session, ctx } = createRun();
      const foeHp: Record<number, number> = {};
      let foeStart = '';
      playScene(
        session,
        ctx,
        'BALANCE',
        (state) => {
          const foe = master(state, 'FOE');
          foeHp[state.step] = foe.hp;
          if (foe.state === 'STARTUP' && foe.last_act !== null) {
            // 発生の開始ステップ = 現在のステップ − 経過発生ステップ数。
            const entry = `${state.step - foe.elapsed_startup}:FOE:${foe.last_act.class_id}`;
            if (entry !== foeStart && !started.includes(entry)) {
              foeStart = entry;
              started.push(entry);
            }
          }
        },
        undefined,
        300,
      );
      // 武技（基本）AR3（発生20）は 216 に発生し 236 に着弾する。レフは 221 に武技AR6（発生14）を撃ち 235 に着弾させる
      // （返し刃と評価が同点となり、[A-TIE-BREAK] により所持アクション配列インデックスの小さい武技AR6 を選ぶ）。
      expect(started.filter((entry) => Number(entry.split(':')[0]) <= 240)).toEqual([
        '147:FOE:ACT_MIND_AR3',
        '147:MINE:ACT_MIND_AR3',
        '216:MINE:ACT_SLASH_AR3',
        '221:FOE:ACT_SLASH_AR6',
      ]);
      expect(foeHp[240]).toBe(8); // 中断された武技（基本）は着弾しない
    } finally {
      playerDecisionOverride.provider = null;
    }
  });
});
