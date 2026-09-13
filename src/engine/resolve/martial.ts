// [M-RESOLVE-MARTIAL] 武技コンポーネント解決アルゴリズム（[M-RESOLVE-ORDER] Step 4）。
// [M-RESOLVE-STRIP]（弱体減衰）・封印付与・コピー獲得を含む。位置干渉（[M-RESOLVE-INTERFERE]）は
// 発火判定のみをここで行い、実際の適用は呼び出し側（[M-PIPE-P2-APPLY]#3-4 / [M-PIPE-INSTANT]#2）に委ねる。
// スタンによる中断も同様に、命中イベントを呼び出し側へ返し、バッチ処理のタイミングは
// 通常アクション（処理2一斉）と即時型アクション（即時）とで呼び出し側が使い分ける。

import { decayCenti, levelApDamage, levelHpDamage, levelPpDamage, levelVpDamage, maxOverwrite } from '../calc.js';
import {
  effectiveAtk,
  effectiveDmgApCenti,
  effectiveDmgHpCenti,
  effectiveDmgPpCenti,
  effectiveDmgVpCenti,
  effectiveRange,
} from '../effective.js';
import type { InterferePos } from '../../data/types.js';
import { hasFlag } from '../flags.js';
import type { ActionInstance, Side, Unit } from '../types.js';

function opposingUnits(units: readonly (Unit | null)[], side: Side): Unit[] {
  const opposing = side === 'MINE' ? [2, 3] : [0, 1];
  return opposing
    .map((idx) => units[idx])
    .filter((unit): unit is Unit => unit !== null);
}

function distance(a: number, b: number): number {
  return Math.abs(a - b);
}

export interface InterferenceRequest {
  readonly side: Side; // 入れ替えが成立する対象陣営（＝発動者から見た敵陣）
  readonly pos: InterferePos;
}

export interface MartialOutcome {
  readonly interferenceRequest: InterferenceRequest | null;
  readonly hitUnitIds: readonly string[]; // 命中した対象すべて（位置干渉の発火判定に用いる）
  readonly stunHitUnitIds: readonly string[]; // うち stun 付き技が命中した対象（[M-PIPE-P2-APPLY]#4）
}

function findActiveInstance(unit: Unit, instanceId: string): ActionInstance | undefined {
  return unit.acts.find((instance) => instance.instance_id === instanceId);
}

// [M-RESOLVE-STRIP]
function applyStrip(target: Unit, stripRateCenti: number): void {
  if (stripRateCenti === 0) {
    return;
  }
  for (const id of Object.keys(target.buff) as (keyof typeof target.buff)[]) {
    target.buff[id] = decayCenti(target.buff[id], stripRateCenti);
  }
  for (const instance of target.acts) {
    instance.copy_fixation = decayCenti(instance.copy_fixation, stripRateCenti);
  }
}

// [M-RESOLVE-MARTIAL]#4 封印付与。
function applySeal(target: Unit, giveSeal: number): void {
  if (giveSeal === 0 || target.last_act === null) {
    return;
  }
  const slot = findActiveInstance(target, target.last_act.instance_id);
  if (slot === undefined) {
    return;
  }
  slot.seal_accum = maxOverwrite(slot.seal_accum, giveSeal);
}

function deepEqualParams(a: ActionInstance['base_params'], b: ActionInstance['base_params']): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let nextCopyInstanceIdSeq = 0;
export function resetCopyInstanceIdSeqForTest(startAt = 0): void {
  nextCopyInstanceIdSeq = startAt;
}

// [M-RESOLVE-MARTIAL]#5 コピー獲得。命中した対象1体分の直前アクション記憶からコピー枠を獲得する。
function acquireCopyFrom(actor: Unit, action: ActionInstance, target: Unit): void {
  if (action.base_params.initial_copy_val === 0) {
    return;
  }
  const memory = target.last_act;
  if (memory === null || memory.is_copy) {
    return;
  }
  const existing = actor.acts.find(
    (instance) => instance.is_copy && instance.master_ref === memory.class_id && deepEqualParams(instance.base_params, memory.params),
  );
  if (existing !== undefined) {
    existing.copy_fixation = action.base_params.initial_copy_val;
    existing.uses_left =
      memory.uses_left_before === -1 || existing.uses_left === -1
        ? -1
        : Math.max(existing.uses_left, memory.uses_left_before);
    return;
  }
  const instanceId = `IIDC${String(nextCopyInstanceIdSeq).padStart(4, '0')}`;
  nextCopyInstanceIdSeq += 1;
  actor.acts.push({
    instance_id: instanceId,
    master_ref: memory.class_id,
    sys_flags: memory.sys_flags,
    base_params: { ...memory.params },
    uses_left: memory.uses_left_before,
    seal_accum: 0,
    is_copy: true,
    copy_fixation: action.base_params.initial_copy_val,
  });
}

export interface MartialContext {
  readonly units: readonly (Unit | null)[];
  readonly level: number;
  readonly defenseOf: (unit: Unit) => number;
}

// [M-RESOLVE-MARTIAL] Step 4 本体。
export function resolveMartial(ctx: MartialContext, actor: Unit, action: ActionInstance): MartialOutcome {
  if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
    return { interferenceRequest: null, hitUnitIds: [], stunHitUnitIds: [] };
  }
  const effRange = effectiveRange(actor, action);
  const effAtk = effectiveAtk(actor, action);
  const targets = opposingUnits(ctx.units, actor.side)
    .filter((target) => distance(actor.pos_idx, target.pos_idx) <= effRange)
    .sort((a, b) => distance(actor.pos_idx, a.pos_idx) - distance(actor.pos_idx, b.pos_idx));

  const hitUnitIds: string[] = [];
  const stunHitUnitIds: string[] = [];
  for (const target of targets) {
    const targetDefense = ctx.defenseOf(target);
    if (effAtk < targetDefense) {
      continue; // 回避
    }
    hitUnitIds.push(target.unit_id);
    if (action.base_params.stun) {
      stunHitUnitIds.push(target.unit_id);
    }

    const dmgHp = levelHpDamage(effectiveDmgHpCenti(actor, action), ctx.level);
    const dmgVp = levelVpDamage(effectiveDmgVpCenti(actor, action));
    const dmgPp = levelPpDamage(effectiveDmgPpCenti(actor, action), ctx.level);
    const dmgAp = levelApDamage(effectiveDmgApCenti(actor, action));
    target.hp = target.hp - dmgHp;
    target.vp = Math.max(target.vp - dmgVp, 0);
    target.pp = Math.max(target.pp - dmgPp, 0);
    target.ap = Math.max(target.ap - dmgAp, 0);

    applySeal(target, action.base_params.give_seal);
    for (const [id, value] of Object.entries(action.base_params.give_debuff)) {
      const paramId = id as keyof typeof target.debuff;
      target.debuff[paramId] = maxOverwrite(target.debuff[paramId], value);
    }
    if (action.base_params.give_slip > 0) {
      target.slip = maxOverwrite(target.slip, action.base_params.give_slip);
    }
    applyStrip(target, action.base_params.strip_rate);
    acquireCopyFrom(actor, action, target);
  }

  const interferenceRequest = resolveInterferenceRequest(action, targets, hitUnitIds, actor.side);
  return { interferenceRequest, hitUnitIds, stunHitUnitIds };
}

function resolveInterferenceRequest(
  action: ActionInstance,
  targets: readonly Unit[],
  hitUnitIds: readonly string[],
  actorSide: Side,
): InterferenceRequest | null {
  const pos = action.base_params.interfere_pos;
  if (pos === 'NONE') {
    return null;
  }
  const targetSide: Side = actorSide === 'MINE' ? 'FOE' : 'MINE';
  const frontIdx = targetSide === 'FOE' ? 2 : 1;
  const backIdx = targetSide === 'FOE' ? 3 : 0;
  const frontHit = hitUnitIds.includes(targets.find((t) => t.pos_idx === frontIdx)?.unit_id ?? '');
  const backHit = hitUnitIds.includes(targets.find((t) => t.pos_idx === backIdx)?.unit_id ?? '');
  const fires =
    (pos === 'PUSH' && frontHit) || (pos === 'PULL' && backHit) || (pos === 'BOTH' && (frontHit || backHit));
  return fires ? { side: targetSide, pos } : null;
}
