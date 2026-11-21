// [M-UI-HUD]［立ち絵の動き］発生中・硬直中の進捗を写した立ち絵の姿勢。

import { describe, expect, it } from 'vitest';
import type { RunningCardView } from '../../src/ui/view/battle-view.js';
import {
  BREATH_PERIOD_MAX_MS,
  BREATH_PERIOD_MIN_MS,
  breathOf,
  FOLLOW_MIN_MS,
  heldPoseOf,
  HIT_MS,
  LEAN_MAX,
  NEUTRAL_POSE,
  poseOf,
  progressOf,
  RECOVERY_BRIGHTNESS,
  STANCE_FLASH_MS,
} from '../../src/ui/view/figure-motion.js';

function running(phase: RunningCardView['phase'], elapsed: number, required: number): RunningCardView {
  return {
    instanceId: 'I0001',
    name: '試し',
    phase,
    stateLabel: phase === 'STARTUP' ? '発生中' : '硬直中',
    steps: '',
    elapsed,
    required,
    atk: 0,
    defense: 0,
  };
}

describe('[M-UI-HUD]［立ち絵の動き］', () => {
  it('進捗は 経過 ÷ 基準 を 0〜1 に収め、基準が0の区間は姿勢を作らない', () => {
    expect(progressOf(0, 170)).toBe(0);
    expect(progressOf(85, 170)).toBe(0.5);
    expect(progressOf(200, 170)).toBe(1);
    expect(progressOf(0, 0)).toBeNull();
    expect(poseOf(running('STARTUP', 0, 0), 'MINE', false)).toEqual(NEUTRAL_POSE);
  });

  it('思考中は動かさない', () => {
    expect(poseOf(null, 'MINE', false)).toEqual(NEUTRAL_POSE);
  });

  it('発生中は進捗に従い、向きと反対の側へ画素単位で身を引き、輪郭の光を強める', () => {
    expect(poseOf(running('STARTUP', 0, 170), 'MINE', false)).toEqual({ dx: 0, glow: 0, brightness: 1 });
    const half = poseOf(running('STARTUP', 85, 170), 'MINE', false);
    expect(half.dx).toBe(-2); // 自軍は右を向くため左へ引く（3 × 0.5 を画素に揃える）
    expect(half.glow).toBe(0.5);
    expect(poseOf(running('STARTUP', 170, 170), 'MINE', false).dx).toBe(-LEAN_MAX);
    expect(poseOf(running('STARTUP', 170, 170), 'FOE', false).dx).toBe(LEAN_MAX); // 敵軍は左を向くため右へ引く
    for (let elapsed = 0; elapsed <= 170; elapsed += 1) {
      expect(Number.isInteger(poseOf(running('STARTUP', elapsed, 170), 'FOE', false).dx)).toBe(true);
    }
  });

  it('硬直中は位置を変えず、始めに暗く、進捗に従って元の明るさへ戻る', () => {
    expect(poseOf(running('RECOVERY', 0, 40), 'FOE', false)).toEqual({ dx: 0, glow: 0, brightness: RECOVERY_BRIGHTNESS });
    expect(poseOf(running('RECOVERY', 40, 40), 'FOE', false)).toEqual({ dx: 0, glow: 0, brightness: 1 });
    expect(poseOf(running('RECOVERY', 10, 40), 'MINE', false).brightness).toBeLessThan(
      poseOf(running('RECOVERY', 30, 40), 'MINE', false).brightness,
    );
  });

  it('呼吸の周期と位相はユニットごとにずれ、同じユニットは同じ拍子を保つ', () => {
    const ids = ['U0001', 'U0002', 'U0003', 'U0004', 'U0005', 'U0006'];
    const breaths = ids.map(breathOf);
    for (const breath of breaths) {
      expect(breath.periodMs).toBeGreaterThanOrEqual(BREATH_PERIOD_MIN_MS);
      expect(breath.periodMs).toBeLessThanOrEqual(BREATH_PERIOD_MAX_MS);
      expect(breath.offsetMs).toBeGreaterThanOrEqual(0);
      expect(breath.offsetMs).toBeLessThanOrEqual(breath.periodMs);
    }
    expect(new Set(breaths.map((breath) => Math.round(breath.periodMs))).size).toBe(ids.length);
    expect(breathOf('U0001')).toEqual(breaths[0]);
  });

  it('画の最短の表示：発動の後は、思考中へ戻っても振り抜きの画を実時間で最短の長さだけ示す', () => {
    const hold = { kind: 'FOLLOW', pose: 'MARTIAL', start: 1000, flash: false } as const;
    expect(heldPoseOf(null, hold, 1000)).toEqual({ pose: 'MARTIAL', phase: 'FOLLOW' });
    expect(heldPoseOf(null, hold, 1000 + FOLLOW_MIN_MS - 1)).toEqual({ pose: 'MARTIAL', phase: 'FOLLOW' });
    expect(heldPoseOf(null, hold, 1000 + FOLLOW_MIN_MS)).toBeNull();
    expect(heldPoseOf(null, null, 1000)).toBeNull();
  });

  it('画の最短の表示：構えの画が描かれなかった発動は、振り抜きの前に構えの画を短く示す', () => {
    const hold = { kind: 'FOLLOW', pose: 'MIND', start: 0, flash: true } as const;
    expect(heldPoseOf(null, hold, 0)).toEqual({ pose: 'MIND', phase: 'STARTUP' });
    expect(heldPoseOf({ pose: 'MIND', phase: 'FOLLOW' }, hold, STANCE_FLASH_MS - 1)).toEqual({ pose: 'MIND', phase: 'STARTUP' });
    expect(heldPoseOf(null, hold, STANCE_FLASH_MS)).toEqual({ pose: 'MIND', phase: 'FOLLOW' });
    expect(heldPoseOf(null, hold, STANCE_FLASH_MS + FOLLOW_MIN_MS)).toBeNull();
  });

  it('画の最短の表示：発生中・やられへ移ったときは、移った先の画に直ちに替える', () => {
    const hold = { kind: 'FOLLOW', pose: 'MARTIAL', start: 0, flash: true } as const;
    expect(heldPoseOf({ pose: 'STANCE', phase: 'STARTUP' }, hold, 50)).toEqual({ pose: 'STANCE', phase: 'STARTUP' });
    expect(heldPoseOf({ pose: 'STAGGER', phase: null }, hold, 200)).toEqual({ pose: 'STAGGER', phase: null });
  });

  it('被弾のやられ：思考中・発生中の被弾は、被弾の動きの間だけやられを示して戻る', () => {
    const hold = { kind: 'HIT', start: 0, untilRecoveryEnds: false } as const;
    const stance = { pose: 'STANCE', phase: 'STARTUP' } as const;
    expect(heldPoseOf(null, hold, 0)).toEqual({ pose: 'STAGGER', phase: null });
    expect(heldPoseOf(stance, hold, HIT_MS - 1)).toEqual({ pose: 'STAGGER', phase: null });
    expect(heldPoseOf(stance, hold, HIT_MS)).toEqual(stance);
    expect(heldPoseOf(null, hold, HIT_MS)).toBeNull();
  });

  it('被弾のやられ：硬直中の被弾は、硬直の終わりまでやられを示す', () => {
    const hold = { kind: 'HIT', start: 0, untilRecoveryEnds: true } as const;
    expect(heldPoseOf({ pose: 'MARTIAL', phase: 'FOLLOW' }, hold, 10_000)).toEqual({ pose: 'STAGGER', phase: null });
    expect(heldPoseOf(null, hold, 10_000)).toBeNull(); // 硬直が明けて思考中
  });

  it('演出の簡略化では位置を変えず、光と明るさだけで進捗を示す', () => {
    expect(poseOf(running('STARTUP', 170, 170), 'MINE', true)).toEqual({ dx: 0, glow: 1, brightness: 1 });
    expect(poseOf(running('RECOVERY', 0, 40), 'MINE', true)).toEqual({ dx: 0, glow: 0, brightness: RECOVERY_BRIGHTNESS });
  });
});
