// [M-DATA-AUDIO-CUE] の発火契機に対応する演出層。系統別の発動演出と、武技の命中・回避を短い動きで示す。
// 画面の再描画では消えないよう、ステージ直下の専用層に置き、再生の完了で自身を取り除く。
// 演出は BattleState に含まれず、[M-CORE-DETERMINISM] の対象外である（[M-UI-HUD]［更新と決定論］）。

import type { BattleCue } from '../../engine/cue.js';
import { hasFlag } from '../../engine/flags.js';
import type { SysFlags } from '../../engine/types.js';
import { SYSTEM_ICON_GLYPH, type SystemIcon } from '../assets/placeholder.js';

// 盤面は4マス等幅の固定レイアウト（[M-UI-VIEWPORT]）。マス中央の論理座標を算出する。
const STAGE_WIDTH = 1280;
const COLUMNS = 4;
const COLUMN_WIDTH = STAGE_WIDTH / COLUMNS;
const FIELD_CENTER_Y = 230; // 予兆線（上段）の下、立ち絵のあたり
const MAX_EFFECTS = 12; // 高速再生で積み上がらないよう上限を設ける

function systemOf(cue: BattleCue & { readonly sysFlags: SysFlags }): SystemIcon | null {
  if (hasFlag(cue.sysFlags, 'FLAG_MARTIAL')) return 'MARTIAL';
  if (hasFlag(cue.sysFlags, 'FLAG_STANCE')) return 'STANCE';
  if (hasFlag(cue.sysFlags, 'FLAG_MIND')) return 'MIND';
  if (hasFlag(cue.sysFlags, 'FLAG_SUMMON')) return 'SUMMON';
  if (hasFlag(cue.sysFlags, 'FLAG_SWAP')) return 'SWAP';
  return null;
}

const SYSTEM_CLASS: Readonly<Record<SystemIcon, string>> = {
  MIND: 'fx-mind',
  MARTIAL: 'fx-martial',
  STANCE: 'fx-stance',
  SUMMON: 'fx-summon',
  SWAP: 'fx-swap',
};

export interface EffectView {
  readonly className: string;
  readonly glyph: string;
  readonly posIdx: number;
}

// 契機1件に対応する演出。発動は系統別、武技の判定は命中・回避別に選ぶ。
export function effectOf(cue: BattleCue): EffectView | null {
  if (cue.kind === 'UNIT_DESTROY') {
    return null; // 消滅は盤面の撤去そのもので示す（演出を重ねない）
  }
  if (cue.kind === 'HIT') {
    return { className: 'fx fx-hit', glyph: '✹', posIdx: cue.posIdx };
  }
  if (cue.kind === 'MISS') {
    return { className: 'fx fx-miss', glyph: '✕', posIdx: cue.posIdx };
  }
  const system = systemOf(cue);
  if (system === null) {
    return null; // 系統を持たないアクション（パス等）は演出を持たない
  }
  return { className: `fx fx-trigger ${SYSTEM_CLASS[system]}`, glyph: SYSTEM_ICON_GLYPH[system], posIdx: cue.posIdx };
}

export class EffectLayer {
  constructor(readonly root: HTMLElement) {
    root.className = 'effect-layer';
  }

  play(cue: BattleCue): void {
    const view = effectOf(cue);
    if (view === null) {
      return;
    }
    while (this.root.childElementCount >= MAX_EFFECTS) {
      this.root.firstElementChild?.remove();
    }
    const node = document.createElement('div');
    node.className = view.className;
    node.textContent = view.glyph;
    node.style.left = `${COLUMN_WIDTH * view.posIdx + COLUMN_WIDTH / 2}px`;
    node.style.top = `${FIELD_CENTER_Y}px`;
    node.addEventListener('animationend', () => node.remove());
    this.root.append(node);
  }

  clear(): void {
    this.root.replaceChildren();
  }
}
