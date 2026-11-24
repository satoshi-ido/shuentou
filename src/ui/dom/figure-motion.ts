// [M-UI-HUD]［立ち絵の動き］盤面の立ち絵を動かす。画面は歩進のたびに組み直されるため、思考中の呼吸と
// 一回の動き（発動・被弾・消滅猶予）の進み具合と、マスターの倒れの画をここに持ち、組み直した要素へ同じ時点から掛け直す。
// 「画の最短の表示」発動の後に示す構え・振り抜きの画も、実時刻とともにここに持つ。
// 一回の動きは実時間で再生し、ステップの歩進を待たせない。静止中も最後まで再生する。
// 演出は BattleState に含まれず、[M-CORE-DETERMINISM] の対象外である（[M-UI-HUD]［更新と決定論］）。

import type { AssetPose } from '../../data/types.js';
import type { BattleCue } from '../../engine/cue.js';
import type { Side } from '../../engine/types.js';
import type { StancePose } from '../assets/resolve.js';
import { figureNode, setFigureSource } from './art.js';
import type { PlateView } from '../view/battle-view.js';
import {
  BREATH,
  breathOf,
  FADE_MS,
  FIGURE_PIXEL,
  facingOf,
  heldPoseOf,
  HIT_MS,
  holdEndOf,
  isRecoveryPose,
  isStartupPose,
  LUNGE,
  LUNGE_MS,
  poseOf,
  poseOfFlags,
  type PoseHold,
  PUSH,
  swingStartOf,
  SWING_FRAME_MS,
  STRIKE_DIP,
  type Thrust,
  THRUST_LIFT,
  thrustOf,
  thrustsForward,
} from '../view/figure-motion.js';

type ShotKind = 'LUNGE' | 'HIT';

// [M-UI-HUD]【立ち絵の動き】「倒れの画」撤去されたマスターのマスに置く倒れの画。
export interface DownedFigure {
  readonly url: string;
  readonly side: Side;
}

// [M-UI-HUD]【立ち絵の動き】「決着の一打」発動の時点に定めた、最短の表示の各段の画（at は実時刻）。
// 勝利の決着では盤面を組み直さないため、止めた盤面の立ち絵をこの画で替えていく。
interface ReelFrame {
  readonly at: number;
  readonly url: string;
}

interface Shot {
  readonly kind: ShotKind;
  readonly start: number; // 実時刻（ms）
  readonly thrust: Thrust; // 発動の動きの向き（「系統の向き」）。被弾は FORWARD とする
}

const SHOT_MS: Readonly<Record<ShotKind, number>> = { LUNGE: LUNGE_MS, HIT: HIT_MS };
const HIT_TINT = 'sepia(0.9) saturate(4) hue-rotate(-35deg)'; // 被弾の赤み
const STEP_EASING = (steps: number): string => `steps(${steps}, end)`; // 「画素に揃える」

// 描画環境が Web Animations を持たない場合（検査環境など）は動かさない。
function canAnimate(node: HTMLElement): boolean {
  return typeof node.animate === 'function';
}

function px(pixels: number): string {
  return `${pixels * FIGURE_PIXEL}px`;
}

// 「系統の向き」発動の上下の動き。腰で分けた上の側の写しだけを dy 画素（正は下）動かして戻す。
// 武技は踏み込みと同じ拍子で沈め、体勢は沈め、心気は持ち上げる。
function thrustKeyframes(dy: number): Keyframe[] {
  const steps = Math.abs(dy);
  const moved = `translateY(${px(dy)})`;
  return [
    { transform: 'translateY(0px)', easing: STEP_EASING(steps) },
    { transform: moved, offset: 0.4 },
    { transform: moved, offset: 0.6, easing: STEP_EASING(steps) },
    { transform: 'translateY(0px)' },
  ];
}

// 発動の上の側の動き（画素。正は下）。系統なしは動かさない。
function thrustDy(thrust: Thrust): number {
  if (thrust === 'DIAGONAL') return STRIKE_DIP;
  if (thrust === 'DOWN') return THRUST_LIFT;
  if (thrust === 'UP') return -THRUST_LIFT;
  return 0;
}

// 立ち絵を腰の高さで上下に分け、上の側の写しを返す（「足元を地面から離さない」上下の動きは上の側だけに掛ける）。
// 下の側は境から seam 画素上まで描き、上の側を持ち上げて空く行を埋める（分ける高さは style.css の --breath-cut）。
// 分けてあれば同じ写しを返し、埋める幅だけを広げる。
function splitUpper(shot: HTMLElement, seam: number): HTMLElement | null {
  const width = Math.max(seam, Number(shot.dataset.seam ?? 0));
  if (shot.querySelector(':scope > .breath-upper') === null) {
    const body = shot.firstElementChild;
    if (!(body instanceof HTMLElement) || !canAnimate(body)) {
      return null;
    }
    const upper = body.cloneNode(true) as HTMLElement;
    body.classList.add('breath-lower');
    upper.classList.add('breath-upper');
    shot.classList.add('breathing');
    shot.append(upper);
  }
  shot.dataset.seam = String(width);
  shot.style.setProperty('--seam', px(width));
  return shot.querySelector<HTMLElement>(':scope > .breath-upper');
}

// 一回の動きを、その経過の時点から掛ける。前への踏み込みと被弾は立ち絵の器へ、上下の動きは上の側の写しへ掛ける。
// 武技は両方を同じ拍子で掛け、後ろ上から前下へ打ち込む動きとする。
function playShot(shot: HTMLElement, side: Side, entry: Shot, elapsed: number, simplify: boolean): void {
  const dy = entry.kind === 'LUNGE' ? thrustDy(entry.thrust) : 0;
  if (dy !== 0) {
    const upper = splitUpper(shot, Math.max(-dy, 1));
    if (upper !== null) {
      upper.animate(thrustKeyframes(dy), { duration: LUNGE_MS, composite: 'add' }).currentTime = elapsed;
    }
  }
  if (entry.kind === 'LUNGE' && !thrustsForward(entry.thrust)) {
    return;
  }
  const animation = shot.animate(shotKeyframes(entry.kind, side, simplify), {
    duration: SHOT_MS[entry.kind],
    composite: 'add',
  });
  animation.currentTime = elapsed;
}

function shotKeyframes(kind: ShotKind, side: Side, simplify: boolean): Keyframe[] {
  const facing = facingOf(side);
  if (kind === 'LUNGE') {
    const forward = `translateX(${px(LUNGE * facing)})`;
    return [
      { transform: 'translateX(0px)', easing: STEP_EASING(LUNGE) },
      { transform: forward, offset: 0.4 },
      { transform: forward, offset: 0.6, easing: STEP_EASING(LUNGE) },
      { transform: 'translateX(0px)' },
    ];
  }
  const pushed = `translateX(${simplify ? '0px' : px(-PUSH * facing)})`;
  return [
    { transform: pushed, filter: HIT_TINT },
    { transform: pushed, filter: HIT_TINT, offset: 0.5, easing: STEP_EASING(PUSH) },
    { transform: 'translateX(0px)', filter: 'none' },
  ];
}

export class FigureMotion {
  private shots: Record<string, Shot[]> = {};
  private holds: Record<string, PoseHold> = {};
  private shown: Record<string, StancePose | null> = {}; // 直前に描いた構え（「構えの画が描かれなかった」の判定に用いる）
  private states: Record<string, StancePose | null> = {}; // 直前の描画でステートから定めた構え（硬直中の被弾の判定に用いる）
  private downed: Record<number, DownedFigure> = {}; // 配置位置ごとの倒れの画（撤去の後も示す）
  private reels: Record<string, ReelFrame[]> = {}; // ユニットごとの最短の表示の各段の画（「決着の一打」）
  private frozenTimers: number[] = []; // 止めた盤面で画を替える予約
  private clock = 0; // 世界が動いていた時間の累計（ms）。思考中の呼吸の位相に用いる
  private resumedAt: number | null = null; // 動き始めた実時刻。静止中は Null

  // onPoseChange は最短の表示の段が替わる時刻に呼ぶ。静止中は画面が組み直されないため、入口が描き直す。
  // swingFramesOf は、ユニットがその構えで示す中割りのコマの数（[M-DATA-ASSETMASTER]［構えの選択］「中割り」）。
  // downFigureOf は、消滅猶予状態へ移ったユニットが示す倒れの画（同「倒れの画」）。マスターでない、または実体が無ければ Null。
  // figureUrlOf は、ユニットがその構えで示す立ち絵の参照先（「決着の一打」で、止めた盤面の画を替えるのに用いる）。
  constructor(
    private readonly ghostLayer: HTMLElement,
    private readonly simplify: () => boolean,
    private readonly onPoseChange: () => void = () => undefined,
    private readonly now: () => number = () => performance.now(),
    private readonly swingFramesOf: (unitId: string, pose: AssetPose) => number = () => 0,
    private readonly downFigureOf: (unitId: string) => DownedFigure | null = () => null,
    private readonly figureUrlOf: (unitId: string, pose: StancePose) => string | null = () => null,
  ) {}

  // 「静止中」思考中の呼吸を止め、動き始めたら同じ位相から続ける。
  setStopped(stopped: boolean): void {
    const now = this.now();
    if (stopped && this.resumedAt !== null) {
      this.clock += now - this.resumedAt;
      this.resumedAt = null;
    } else if (!stopped && this.resumedAt === null) {
      this.resumedAt = now;
    }
  }

  private phase(): number {
    return this.clock + (this.resumedAt === null ? 0 : this.now() - this.resumedAt);
  }

  // 「思考中」の呼吸。立ち絵を腰の高さで上下に分け、上の側の写しだけを持ち上げる（splitUpper）。
  private breathe(shot: HTMLElement, unitId: string): void {
    const upper = splitUpper(shot, BREATH);
    if (upper === null) {
      return;
    }
    const breath = breathOf(unitId); // 「呼吸のずれ」
    const animation = upper.animate(
      [
        { transform: 'translateY(0px)', easing: STEP_EASING(1) },
        { transform: `translateY(${px(-BREATH)})`, offset: 0.5, easing: STEP_EASING(1) },
        { transform: 'translateY(0px)' },
      ],
      { duration: breath.periodMs, iterations: Infinity },
    );
    animation.currentTime = this.phase() + breath.offsetMs;
    if (this.resumedAt === null) {
      animation.pause();
    }
  }

  // [M-DATA-AUDIO-CUE] 発火契機。発動は系統の向きの動き（武技は踏み込みと上の側の沈み、体勢は沈み、心気は持ち上げ）、命中は被弾、消滅猶予への遷移は薄れて消える残像とする。
  // スタン中断は発動の契機を伴わないため、踏み込みを行わない（「スタン中断」）。
  // 倒れの画を持つマスターは、薄れさせずに倒れの画へ替える（「倒れの画」。演出の簡略化でも行う）。
  cue(cue: BattleCue): void {
    if (cue.kind === 'UNIT_DESTROY') {
      const down = this.downFigureOf(cue.unitId);
      if (down === null) {
        this.fadeOut(cue.unitId);
      } else {
        this.fall(cue.unitId, cue.posIdx, down);
      }
      return;
    }
    if (cue.kind === 'MISS') {
      return;
    }
    // 構え・やられの画への替えは系統と被弾の提示であり、簡略化でも行う
    if (cue.kind === 'ACTION_TRIGGER') {
      this.holdFollow(cue.unitId, poseOfFlags(cue.sysFlags));
    } else {
      this.holdHit(cue.unitId);
    }
    if (cue.kind === 'ACTION_TRIGGER' && this.simplify()) {
      return; // 演出の簡略化では踏み込まない
    }
    const kind: ShotKind = cue.kind === 'ACTION_TRIGGER' ? 'LUNGE' : 'HIT';
    const now = this.now();
    const live = (this.shots[cue.unitId] ?? []).filter((shot) => now - shot.start < SHOT_MS[shot.kind]);
    const thrust: Thrust = cue.kind === 'ACTION_TRIGGER' ? thrustOf(poseOfFlags(cue.sysFlags)) : 'FORWARD';
    this.shots[cue.unitId] = [...live, { kind, start: now, thrust }];
  }

  // 「画の最短の表示」発動の時点を記録し、段が替わる時刻に描き直しを求める。系統の無い発動は先の表示を除く。
  // 中割りは動きであるため、演出の簡略化では示さない。
  private holdFollow(unitId: string, pose: AssetPose | null): void {
    if (pose === null) {
      delete this.holds[unitId];
      delete this.reels[unitId];
      return;
    }
    const start = this.now();
    const flash = !isStartupPose(this.shown[unitId] ?? null);
    const swing = this.simplify() ? 0 : this.swingFramesOf(unitId, pose);
    const hold: PoseHold = { kind: 'FOLLOW', pose, start, flash, swing };
    this.holds[unitId] = hold;
    const swingStart = swingStartOf(hold);
    for (let frame = 0; frame <= swing; frame += 1) {
      const at = swingStart + frame * SWING_FRAME_MS - start;
      if (at > 0) {
        setTimeout(this.onPoseChange, at);
      }
    }
    setTimeout(this.onPoseChange, holdEndOf(hold) - start);
    this.reels[unitId] = this.reelOf(unitId, hold);
  }

  // 「決着の一打」最短の表示の各段（構えの画の先の表示・中割り・振り抜き）の画を、発動の時点のステートで定める。
  private reelOf(unitId: string, hold: PoseHold & { kind: 'FOLLOW' }): ReelFrame[] {
    const swingStart = swingStartOf(hold);
    const stages: [number, StancePose][] = [
      ...(hold.flash ? [[hold.start, { pose: hold.pose, phase: 'STARTUP' }] as [number, StancePose]] : []),
      ...Array.from({ length: hold.swing }, (_, index): [number, StancePose] => [
        swingStart + index * SWING_FRAME_MS,
        { pose: hold.pose, phase: 'SWING', frame: index + 1 },
      ]),
      [swingStart + hold.swing * SWING_FRAME_MS, { pose: hold.pose, phase: 'FOLLOW' }],
    ];
    return stages.flatMap(([at, stance]) => {
      const url = this.figureUrlOf(unitId, stance);
      return url === null ? [] : [{ at, url }];
    });
  }

  // 「決着の一打」勝利の決着で止めた盤面（決着の直前に描いた盤面）に、決着のステップの発動の動きを決着の時点から再生する。
  // 立ち絵は発動の時点に定めた画で替え、系統の向きの動きを掛ける。返すのは、動きが終わるまでの残りの実時間（ms）。
  playFrozen(): number {
    const now = this.now();
    let remaining = 0;
    for (const [unitId, hold] of Object.entries(this.holds)) {
      const reel = this.reels[unitId];
      if (hold.kind !== 'FOLLOW' || reel === undefined || now >= holdEndOf(hold)) {
        continue;
      }
      remaining = Math.max(remaining, holdEndOf(hold) - now);
      if (typeof document === 'undefined') {
        continue; // 描画環境を持たない場合（検査環境など）は残りの時間だけを返す
      }
      const pose = document.querySelector<HTMLElement>(`.pose[data-unit-id="${unitId}"]`);
      const shot = pose?.querySelector<HTMLElement>('.shot') ?? null;
      if (pose === null || shot === null) {
        continue;
      }
      // 呼吸の写しを除き、溜めの光と明るさを解いて、一枚の立ち絵を替えていく
      for (const node of [pose, shot, ...shot.querySelectorAll<HTMLElement>('*')]) {
        if (typeof node.getAnimations === 'function') {
          node.getAnimations().forEach((animation) => animation.cancel());
        }
      }
      shot.querySelectorAll('.breath-upper').forEach((node) => node.remove());
      shot.querySelectorAll('.breath-lower').forEach((node) => node.classList.remove('breath-lower'));
      shot.classList.remove('breathing', 'previewing');
      applyStill(pose);
      shot.style.removeProperty('--seam');
      delete shot.dataset.seam;
      // 体勢・心気の動きで上下に分けた写しも同じ画へ替えるため、替える時点の画をすべて替える
      const swap = (url: string): void =>
        shot.querySelectorAll<HTMLImageElement>('img.figure-img').forEach((image) => setFigureSource(image, url));
      const past = reel.filter((frame) => frame.at <= now).at(-1);
      if (past !== undefined) {
        swap(past.url);
      }
      for (const frame of reel.filter((candidate) => candidate.at > now)) {
        this.frozenTimers.push(window.setTimeout(() => swap(frame.url), frame.at - now));
      }
      if (canAnimate(shot)) {
        for (const entry of this.shots[unitId] ?? []) {
          const elapsed = now - entry.start;
          if (entry.kind === 'LUNGE' && elapsed < LUNGE_MS) {
            playShot(shot, pose.dataset.side === 'MINE' ? 'MINE' : 'FOE', entry, elapsed, false);
          }
        }
      }
    }
    return remaining;
  }

  // 「被弾のやられ」被弾の時点を記録する。硬直中の被弾は、硬直の終わりまでやられを示す。
  private holdHit(unitId: string): void {
    const start = this.now();
    const hold: PoseHold = { kind: 'HIT', start, untilRecoveryEnds: isRecoveryPose(this.states[unitId] ?? null) };
    this.holds[unitId] = hold;
    delete this.reels[unitId];
    setTimeout(this.onPoseChange, holdEndOf(hold) - start);
  }

  // ステートから定めた構え（current）に契機の表示を重ねた、いま描く構え。描いた構えを覚える。
  figurePose(unitId: string, current: StancePose | null): StancePose | null {
    const pose = heldPoseOf(current, this.holds[unitId] ?? null, this.now());
    this.states[unitId] = current;
    this.shown[unitId] = pose;
    return pose;
  }

  // 「倒れの画」撤去されたマスターのマスに置く倒れの画。無ければ Null。
  downedAt(posIdx: number): DownedFigure | null {
    return this.downed[posIdx] ?? null;
  }

  // その陣営に倒れの画を示しているマスターがいるか（勝利の決着で倒れた姿を示す間を置くかに用いる）。
  hasDowned(side: Side): boolean {
    return Object.values(this.downed).some((down) => down.side === side);
  }

  // バトルを離れるとき、およびアンドゥ・ロールバックで、残った動きと倒れの画を捨てる。
  clear(): void {
    this.frozenTimers.forEach((timer) => clearTimeout(timer));
    this.frozenTimers = [];
    this.reels = {};
    this.downed = {};
    this.shots = {};
    this.holds = {};
    this.shown = {};
    this.states = {};
  }

  // 組み直した立ち絵の器へ、姿勢と動きを掛ける。器は .pose > .shot > 立ち絵 の入れ子とする。
  attach(pose: HTMLElement, plate: PlateView): void {
    const simplify = this.simplify();
    const target = poseOf(plate.running, plate.side, simplify);
    pose.dataset.unitId = plate.unitId;
    pose.dataset.side = plate.side;
    pose.style.setProperty('--pose-x', px(target.dx));
    pose.style.setProperty('--pose-glow', String(target.glow));
    pose.style.setProperty('--pose-bright', String(target.brightness));

    const shot = pose.querySelector<HTMLElement>('.shot');
    if (shot === null || !canAnimate(shot)) {
      return;
    }
    if (plate.running === null && !simplify) {
      this.breathe(shot, plate.unitId);
    }
    // 「系統の向き」発生中の身構えの上下（武技・体勢は持ち上げ、心気は沈め）は、腰で分けた上の側だけに掛ける
    if (target.lift !== 0) {
      splitUpper(shot, Math.max(target.lift, 1))?.style.setProperty('translate', `0 ${px(-target.lift)}`);
    }
    const now = this.now();
    for (const entry of this.shots[plate.unitId] ?? []) {
      const elapsed = now - entry.start;
      if (elapsed < SHOT_MS[entry.kind]) {
        playShot(shot, plate.side, entry, elapsed, simplify);
      }
    }
  }

  // 「倒れの画」倒れの画を覚え、描かれている立ち絵をその場で替える。撤去の後の描画は、空いたマスに覚えた画を置く
  // （battle-screen.ts）。勝利の決着では画面を組み直さずに止めるため、その場の替えがそのまま残る。
  private fall(unitId: string, posIdx: number, down: DownedFigure): void {
    this.downed[posIdx] = down;
    delete this.holds[unitId];
    delete this.shots[unitId];
    delete this.reels[unitId];
    if (typeof document === 'undefined') {
      return; // 描画環境を持たない場合（検査環境など）は覚えるだけとする
    }
    const pose = document.querySelector<HTMLElement>(`.pose[data-unit-id="${unitId}"]`);
    const shot = pose?.querySelector<HTMLElement>('.shot') ?? null;
    if (pose === null || shot === null) {
      return;
    }
    for (const node of [pose, shot, ...shot.querySelectorAll<HTMLElement>('*')]) {
      if (typeof node.getAnimations === 'function') {
        node.getAnimations().forEach((animation) => animation.cancel());
      }
    }
    applyStill(pose);
    shot.classList.remove('breathing', 'previewing');
    shot.replaceChildren(downedNode(down));
  }

  // 「消滅猶予」盤面からの撤去は同じステップのうちに済むため、撤去前の姿を残像として写し、薄れさせる。
  private fadeOut(unitId: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    const source = document.querySelector<HTMLElement>(`.pose[data-unit-id="${unitId}"] .shot`);
    if (source === null || !canAnimate(source)) {
      return;
    }
    const layer = this.ghostLayer.getBoundingClientRect();
    const scale = this.ghostLayer.offsetWidth > 0 ? layer.width / this.ghostLayer.offsetWidth : 1;
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add('figure-ghost');
    ghost.style.left = `${(rect.left - layer.left) / scale}px`;
    ghost.style.top = `${(rect.top - layer.top) / scale}px`;
    ghost.style.width = `${rect.width / scale}px`;
    ghost.style.height = `${rect.height / scale}px`;
    this.ghostLayer.append(ghost);
    const animation = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' });
    animation.addEventListener('finish', () => ghost.remove());
  }
}

// 「倒れの画」位置・明るさ・輪郭の光を進捗0の姿勢（元の位置、元の明るさ、光なし）とする。
function applyStill(pose: HTMLElement): void {
  pose.style.setProperty('--pose-x', '0px');
  pose.style.setProperty('--pose-glow', '0');
  pose.style.setProperty('--pose-bright', '1');
}

// 倒れの画の立ち絵。空いたマスにも置くため、陣営の縁の光と大きさは器によらず画に持たせる（style.css）。
export function downedNode(down: DownedFigure): HTMLElement {
  return figureNode(`figure figure-downed ${down.side === 'MINE' ? 'mine' : 'foe'}`, down.url);
}
