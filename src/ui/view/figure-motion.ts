// [M-UI-HUD]［立ち絵の動き］盤面の立ち絵の姿勢。発生中・硬直中の進捗を、位置と明るさと輪郭の光に写す。
// 立ち絵は1件の画のまま動かし、位置の変化は立ち絵の実体の1画素（論理解像度の2px）を単位とする。
// 「足元を地面から離さない」立ち絵全体の位置の変化は左右に限り、上下には動かさない（思考中の呼吸は上の側だけを動かす）。
// 表示に限る値であり、BattleState に含まれず、[M-CORE-DETERMINISM] の対象外である（同項［更新と決定論］）。

import type { AssetPose } from '../../data/types.js';
import { effectiveStepStartup } from '../../engine/effective.js';
import { hasFlag } from '../../engine/flags.js';
import type { Side, SysFlags, Unit } from '../../engine/types.js';
import type { StancePose } from '../assets/resolve.js';
import type { RunningCardView } from './battle-view.js';

export const FIGURE_PIXEL = 2; // 立ち絵の実体の1画素（論理解像度の px）
export const LEAN_MAX = 3; // 発生中に身を引く最大の画素数（暫定値）
export const RECOVERY_BRIGHTNESS = 0.8; // 硬直の始めの明るさ（暫定値）
export const BREATH = 1; // 思考中の呼吸で上の側を持ち上げる画素数
export const BREATH_PERIOD_MIN_MS = 2400; // 思考中の呼吸の周期の幅（暫定値）。分ける高さは style.css の --breath-cut
export const BREATH_PERIOD_MAX_MS = 3200;
export const LUNGE = 4; // 発動の踏み込みの画素数（暫定値）
export const LUNGE_MS = 200;
export const PUSH = 2; // 被弾で押される画素数（暫定値）
export const HIT_MS = 250;
export const FADE_MS = 500; // 消滅猶予の薄れ（暫定値）

export interface FigurePose {
  readonly dx: number; // 画素。正は右
  readonly glow: number; // 輪郭の光（0〜1）
  readonly brightness: number;
}

export const NEUTRAL_POSE: FigurePose = { dx: 0, glow: 0, brightness: 1 };

// 「向き」自軍は右、敵軍は左を向く。前へ踏み込む向きの符号。
export function facingOf(side: Side): 1 | -1 {
  return side === 'MINE' ? 1 : -1;
}

// 系統フラグを武技・体勢・心気（召喚を含む）の順に当てはめる。隊列交代のみ・系統なしは構えを持たない（Null）。
export function poseOfFlags(flags: SysFlags): AssetPose | null {
  if (hasFlag(flags, 'FLAG_MARTIAL')) return 'MARTIAL';
  if (hasFlag(flags, 'FLAG_STANCE')) return 'STANCE';
  if (hasFlag(flags, 'FLAG_MIND') || hasFlag(flags, 'FLAG_SUMMON')) return 'MIND';
  return null;
}

// [M-DATA-ASSETMASTER]［構えの選択］ユニットが示す構えと構えの段。発生中は構え（STARTUP）、発動した後の硬直は
// 終わりまで振り抜き（FOLLOW）、スタン中断による硬直は系統によらずやられ（STAGGER）とし、思考中は構えを示さない（Null）。
// 「スタン中断による硬直の見分け」経過発生ステップ数が必要発生ステップ数の実効値に満たない硬直を中断とみなす。
export function stancePoseOf(unit: Unit): StancePose | null {
  if (unit.last_act === null || (unit.state !== 'STARTUP' && unit.state !== 'RECOVERY')) {
    return null;
  }
  const action = unit.acts.find((candidate) => candidate.instance_id === unit.last_act?.instance_id);
  if (unit.state === 'RECOVERY' && action !== undefined && unit.elapsed_startup < effectiveStepStartup(unit, action)) {
    return { pose: 'STAGGER', phase: null };
  }
  const pose = poseOfFlags(unit.last_act.sys_flags);
  if (pose === null) {
    return null;
  }
  return { pose, phase: unit.state === 'STARTUP' ? 'STARTUP' : 'FOLLOW' };
}

// 「画の最短の表示」発動の後、振り抜きの画を実時間で示す最短の長さと、構えの画が描かれなかったときに先に示す構えの長さ（暫定値）。
export const FOLLOW_MIN_MS = 300;
export const STANCE_FLASH_MS = 100;

// 契機の時点で記録する画の表示。後に起きた契機が先の表示を置き換える。
// FOLLOW は発動の「画の最短の表示」で、flash は発動の前に構えの画が描かれなかったこと。
// HIT は「被弾のやられ」で、untilRecoveryEnds は硬直中に被弾したこと（硬直の終わりまでやられを示す）。
export type PoseHold =
  | { readonly kind: 'FOLLOW'; readonly pose: AssetPose; readonly start: number; readonly flash: boolean }
  | { readonly kind: 'HIT'; readonly start: number; readonly untilRecoveryEnds: boolean };

// 実時刻で定まる表示の終わり（硬直の終わりまでの分は含まない）。
export function holdEndOf(hold: PoseHold): number {
  return hold.kind === 'HIT' ? hold.start + HIT_MS : hold.start + (hold.flash ? STANCE_FLASH_MS : 0) + FOLLOW_MIN_MS;
}

// ステートから定めた構えが硬直中のものか（振り抜き、またはスタン中断のやられ）。
export function isRecoveryPose(pose: StancePose | null): boolean {
  return pose?.phase === 'FOLLOW' || pose?.pose === 'STAGGER';
}

const STAGGER_POSE: StancePose = { pose: 'STAGGER', phase: null };

// ステートから定めた画（current）に、契機の表示を重ねる。
// 「画の最短の表示」発生中・やられへ移ったときは直ちに移った先の画とする（ステートより古い姿を示し続けない）。
// 表示の間は、思考中や硬直中でも、構え（flash のとき）・振り抜きの順に示す。
// 「被弾のやられ」被弾の動きの間はステートによらずやられを示し、硬直中の被弾は硬直の終わりまで示す。
export function heldPoseOf(current: StancePose | null, hold: PoseHold | null, now: number): StancePose | null {
  if (hold === null) {
    return current;
  }
  if (hold.kind === 'HIT') {
    return now < holdEndOf(hold) || (hold.untilRecoveryEnds && isRecoveryPose(current)) ? STAGGER_POSE : current;
  }
  if (current?.phase === 'STARTUP' || current?.pose === 'STAGGER' || now >= holdEndOf(hold)) {
    return current;
  }
  const flashing = hold.flash && now < hold.start + STANCE_FLASH_MS;
  return { pose: hold.pose, phase: flashing ? 'STARTUP' : 'FOLLOW' };
}

export interface Breath {
  readonly periodMs: number;
  readonly offsetMs: number; // 位相（0〜周期）
}

// 「呼吸のずれ」周期と位相をユニットIDから定める（FNV-1a に、連番のIDも散るよう murmur3 の仕上げを重ねる）。
// 乱数を用いず、同じユニットは同じ拍子を保つ。
export function breathOf(unitId: string): Breath {
  let hash = 0x811c9dc5;
  for (let i = 0; i < unitId.length; i += 1) {
    hash = Math.imul(hash ^ unitId.charCodeAt(i), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const periodMs = BREATH_PERIOD_MIN_MS + ((hash & 0xffff) / 0xffff) * (BREATH_PERIOD_MAX_MS - BREATH_PERIOD_MIN_MS);
  return { periodMs, offsetMs: ((hash >>> 16) / 0xffff) * periodMs };
}

// 「進捗」経過 ÷ 基準を 0〜1 に収める。基準が0の区間は姿勢を作らない（Null）。
export function progressOf(elapsed: number, required: number): number | null {
  if (required <= 0) {
    return null;
  }
  return Math.min(Math.max(elapsed / required, 0), 1);
}

// 発生中・硬直中の姿勢。演出の簡略化では位置を変えず、光と明るさだけで進捗を示す。
export function poseOf(running: RunningCardView | null, side: Side, simplify: boolean): FigurePose {
  if (running === null) {
    return NEUTRAL_POSE;
  }
  const progress = progressOf(running.elapsed, running.required);
  if (progress === null) {
    return NEUTRAL_POSE;
  }
  if (running.phase === 'STARTUP') {
    const lean = simplify ? 0 : Math.round(progress * LEAN_MAX); // 「画素に揃える」
    return { dx: lean === 0 ? 0 : -facingOf(side) * lean, glow: progress, brightness: 1 };
  }
  return { dx: 0, glow: 0, brightness: RECOVERY_BRIGHTNESS + (1 - RECOVERY_BRIGHTNESS) * progress };
}
