// [M-META-ECHO] 遺芯の残響の発火判定。戦闘パラメータ・特性係数・アクション配列に影響しない演出レイヤーである。
// 種別B（継承非使用）・種別C（回帰閾値）の判定は審査範囲（[I-PLAN-SUBMISSION]【審査範囲】）の外であり、未実装。

import type { EchoMasterRecord } from '../../data/types.js';
import type { GameMasters } from '../run/masters.js';
import type { RunState } from '../run/state.js';
import type { MetaCounters } from './types.js';

function echoesOf(masters: GameMasters, kind: EchoMasterRecord['trigger_kind']): EchoMasterRecord[] {
  return Object.values(masters.echoes)
    .filter((record) => record.trigger_kind === kind)
    .sort((a, b) => (a.echo_id < b.echo_id ? -1 : 1));
}

// 種別A：指定シーンのバトルクリア共通決済の完了後、当該従者が同行枠に存在すれば発火する。
// echo_unlocked を参照して1度のみとし、発火した echo_id を返す。
export function fireSceneClearEchoes(
  meta: MetaCounters,
  run: RunState,
  masters: GameMasters,
  clearedSceneId: string,
): string[] {
  const fired: string[] = [];
  for (const record of echoesOf(masters, 'A')) {
    if (record.trigger_param !== clearedSceneId || meta.echo_unlocked[record.echo_id] === true) {
      continue;
    }
    if (!run.party.some((slot) => slot.attendant_id === record.attendant_id)) {
      continue;
    }
    meta.echo_unlocked[record.echo_id] = true;
    fired.push(record.echo_id);
  }
  return fired;
}

// 種別D：供犠の確定ダイアログの表示時、対象として当該従者が選択されていれば発火する。
// 取り消されても echo_unlocked は True のまま保持し、二度目以降は発火しない。
export function fireSacrificeConfirmEcho(meta: MetaCounters, masters: GameMasters, attendantId: string): string | null {
  const record = echoesOf(masters, 'D').find((candidate) => candidate.attendant_id === attendantId);
  if (record === undefined || meta.echo_unlocked[record.echo_id] === true) {
    return null;
  }
  meta.echo_unlocked[record.echo_id] = true;
  return record.echo_id;
}
