// [M-UI-HUD]［立ち絵の動き］盤面の立ち絵を動かす。画面は歩進のたびに組み直されるため、思考中の呼吸と
// 一回の動き（発動・被弾・消滅猶予）の進み具合をここに持ち、組み直した要素へ同じ時点から掛け直す。
// 一回の動きは実時間で再生し、ステップの歩進を待たせない。静止中も最後まで再生する。
// 演出は BattleState に含まれず、[M-CORE-DETERMINISM] の対象外である（[M-UI-HUD]［更新と決定論］）。

import type { BattleCue } from '../../engine/cue.js';
import type { Side } from '../../engine/types.js';
import type { PlateView } from '../view/battle-view.js';
import {
  BREATH,
  BREATH_PERIOD_MS,
  FADE_MS,
  FIGURE_PIXEL,
  facingOf,
  HIT_MS,
  LUNGE,
  LUNGE_MS,
  poseOf,
  PUSH,
} from '../view/figure-motion.js';

type ShotKind = 'LUNGE' | 'HIT';

interface Shot {
  readonly kind: ShotKind;
  readonly start: number; // 実時刻（ms）
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
  private clock = 0; // 世界が動いていた時間の累計（ms）。思考中の呼吸の位相に用いる
  private resumedAt: number | null = null; // 動き始めた実時刻。静止中は Null

  constructor(
    private readonly ghostLayer: HTMLElement,
    private readonly simplify: () => boolean,
    private readonly now: () => number = () => performance.now(),
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

  // 「思考中」の呼吸。立ち絵を腰の高さで上下に分け、上の側の写しだけを持ち上げる。下の側は境の1行上まで
  // 描いておき、持ち上げで空く行を境の行の続きで埋める（分ける高さは style.css の --breath-cut）。
  private breathe(shot: HTMLElement): void {
    const body = shot.firstElementChild;
    if (!(body instanceof HTMLElement) || !canAnimate(body)) {
      return;
    }
    const upper = body.cloneNode(true) as HTMLElement;
    body.classList.add('breath-lower');
    upper.classList.add('breath-upper');
    shot.classList.add('breathing');
    shot.append(upper);
    const animation = upper.animate(
      [
        { transform: 'translateY(0px)', easing: STEP_EASING(1) },
        { transform: `translateY(${px(-BREATH)})`, offset: 0.5, easing: STEP_EASING(1) },
        { transform: 'translateY(0px)' },
      ],
      { duration: BREATH_PERIOD_MS, iterations: Infinity },
    );
    animation.currentTime = this.phase();
    if (this.resumedAt === null) {
      animation.pause();
    }
  }

  // [M-DATA-AUDIO-CUE] 発火契機。発動は踏み込み、命中は被弾、消滅猶予への遷移は薄れて消える残像とする。
  // スタン中断は発動の契機を伴わないため、踏み込みを行わない（「スタン中断」）。
  cue(cue: BattleCue): void {
    if (cue.kind === 'UNIT_DESTROY') {
      this.fadeOut(cue.unitId);
      return;
    }
    if (cue.kind === 'MISS') {
      return;
    }
    if (cue.kind === 'ACTION_TRIGGER' && this.simplify()) {
      return; // 演出の簡略化では踏み込まない
    }
    const kind: ShotKind = cue.kind === 'ACTION_TRIGGER' ? 'LUNGE' : 'HIT';
    const now = this.now();
    const live = (this.shots[cue.unitId] ?? []).filter((shot) => now - shot.start < SHOT_MS[shot.kind]);
    this.shots[cue.unitId] = [...live, { kind, start: now }];
  }

  // バトルを離れるときに、残った動きを捨てる。
  clear(): void {
    this.shots = {};
  }

  // 組み直した立ち絵の器へ、姿勢と動きを掛ける。器は .pose > .shot > 立ち絵 の入れ子とする。
  attach(pose: HTMLElement, plate: PlateView): void {
    const simplify = this.simplify();
    const target = poseOf(plate.running, plate.side, simplify);
    pose.dataset.unitId = plate.unitId;
    pose.style.setProperty('--pose-x', px(target.dx));
    pose.style.setProperty('--pose-glow', String(target.glow));
    pose.style.setProperty('--pose-bright', String(target.brightness));

    const shot = pose.querySelector<HTMLElement>('.shot');
    if (shot === null || !canAnimate(shot)) {
      return;
    }
    if (plate.running === null && !simplify) {
      this.breathe(shot);
    }
    const now = this.now();
    for (const entry of this.shots[plate.unitId] ?? []) {
      const elapsed = now - entry.start;
      if (elapsed >= SHOT_MS[entry.kind]) {
        continue;
      }
      const animation = shot.animate(shotKeyframes(entry.kind, plate.side, simplify), {
        duration: SHOT_MS[entry.kind],
        composite: 'add',
      });
      animation.currentTime = elapsed;
    }
  }

  // 「消滅猶予」盤面からの撤去は同じステップのうちに済むため、撤去前の姿を残像として写し、薄れさせる。
  private fadeOut(unitId: string): void {
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
