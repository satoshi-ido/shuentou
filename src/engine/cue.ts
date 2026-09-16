// [M-DATA-AUDIO-CUE] 発火契機。音響（SE）と演出の共通の発火点であり、BattleState に含まれない。
// 呼び出し側（UI）が受け口を与えたときにのみ通知し、ステートの遷移には一切関与しない
// （[M-CORE-DETERMINISM] の対象外）。探索・未来予測の展開では受け口を与えない。

import type { SysFlags } from './types.js';

// 本実装が通知する契機。語彙は [M-DATA-AUDIO-CUE] の表に従う。
export type CueKind = 'ACTION_TRIGGER' | 'HIT' | 'MISS' | 'UNIT_DESTROY';

// アクションを伴う契機。ACTION_TRIGGER は発動したユニット、HIT / MISS は判定を受けた対象。
export interface ActionCue {
  readonly kind: 'ACTION_TRIGGER' | 'HIT' | 'MISS';
  readonly unitId: string;
  readonly posIdx: number;
  readonly classId: string; // 発動したアクション（HIT / MISS も発動元の武技）
  readonly sysFlags: SysFlags; // 系統（演出の選択に用いる）
}

// 消滅猶予状態（[M-CORE-GLOSSARY-TIME]）への遷移。発動元のアクションを伴わない。
export interface DestroyCue {
  readonly kind: 'UNIT_DESTROY';
  readonly unitId: string;
  readonly posIdx: number;
}

export type BattleCue = ActionCue | DestroyCue;

export type CueSink = (cue: BattleCue) => void;
