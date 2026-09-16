// [M-INHERIT-POOL] [M-INHERIT-MERGE]［UI要件］継承の段の提示内容。
// 継承プールの各項目について、受け継ぐ前後の見込みを組む。純関数とし、描画層から独立させる。

import { COEFF_LABEL, formatCenti, formatUses, isCoeffGain } from '../format.js';
import { canInherit, inheritPool, previewInherit, type InheritPreview } from '../../engine/progress/inherit.js';
import { attendantOf, sceneByOrder, sceneOf, type GameMasters } from '../../engine/run/masters.js';
import { canSettleIntermission, refillCapacity, refillPool } from '../../engine/progress/refill.js';
import type { RunState } from '../../engine/run/state.js';
import type { ActionParams } from '../../data/types.js';
import {
  HERO_MAX_HP_CHANGE,
  NEW_SLOT_INSTANCE_ID,
  type HeroActionView,
  type HeroView,
  type InheritOptionView,
  type RefillCandidateView,
  type RefillView,
} from './screen-view.js';

// 資質の名を解決する手段（アクションのクラスID → 表示名）。
export type ActionNaming = (classId: string) => string;

const COST_KEYS = ['HP', 'VP', 'PP', 'AP'] as const;

function costsOf(params: ActionParams): { readonly label: string; readonly value: number }[] {
  return COST_KEYS.map((key) => ({
    label: key,
    value: params[`cost_${key.toLowerCase()}` as 'cost_hp' | 'cost_vp' | 'cost_pp' | 'cost_ap'],
  })).filter((entry) => entry.value !== 0); // ［数値書式］8 既定値の非描画
}

// インターミッションでは補正が存在しないため、所持アクションは基礎値をそのまま示す。
export function heroView(run: RunState, heroName: string, actionName: ActionNaming): HeroView {
  return {
    name: heroName,
    hp: run.hero_hp,
    maxHp: run.hero_max_hp,
    acts: run.hero_acts.map((action) => {
      const params = action.base_params;
      return {
        instanceId: action.instance_id,
        name: actionName(action.master_ref),
        steps: { thought: params.step_thought, startup: params.step_startup, recovery: params.step_recovery },
        costs: costsOf(params),
        range: params.range > 0 ? params.range : null,
        atk: params.range > 0 ? params.atk : null,
        uses: formatUses(action.uses_left, action.uses_initial),
      };
    }),
  };
}

// 受け継いだ後の主人公。最大HP加算・新規スロット・統合のいずれも、確定前の見込みとして組む。
export function heroAfterOf(
  base: HeroView,
  preview: InheritPreview,
  label: string,
): { readonly hero: HeroView; readonly changedInstanceId: string | null } {
  if (preview.kind === 'MAX_HP') {
    return { hero: { ...base, maxHp: preview.maxHpAfter }, changedInstanceId: HERO_MAX_HP_CHANGE };
  }
  if (preview.kind === 'VANISH') {
    return { hero: base, changedInstanceId: null };
  }
  const params = preview.params;
  const view: HeroActionView = {
    instanceId: preview.kind === 'MERGE' ? preview.existingInstanceId : NEW_SLOT_INSTANCE_ID,
    name: label,
    steps: { thought: params.step_thought, startup: params.step_startup, recovery: params.step_recovery },
    costs: costsOf(params),
    range: params.range > 0 ? params.range : null,
    atk: params.range > 0 ? params.atk : null,
    // 統合後も残り回数は初期値まで戻らないが、見込みでは実効初期使用回数を示す。
    uses: `${preview.usesInitial} / ${preview.usesInitial}`,
  };
  if (preview.kind === 'NEW_SLOT') {
    return { hero: { ...base, acts: [...base.acts, view] }, changedInstanceId: view.instanceId };
  }
  return {
    hero: { ...base, acts: base.acts.map((act) => (act.instanceId === preview.existingInstanceId ? view : act)) },
    changedInstanceId: preview.existingInstanceId,
  };
}

// 継承プールの各項目を、選択中の従者を介して受け継ぐ場合の見込みとして組む。
export function inheritOptions(
  run: RunState,
  masters: GameMasters,
  attendantId: string | null,
  heroName: string,
  actionName: ActionNaming,
  noImproveText: (label: string) => string,
): InheritOptionView[] {
  if (attendantId === null) {
    return [];
  }
  const base = heroView(run, heroName, actionName);
  return inheritPool(run, masters)
    .filter((target) => canInherit(run, masters, attendantId, target))
    .map((target) => {
      const preview = previewInherit(run, masters, attendantId, target);
      const label = target.kind === 'MAX_HP' ? '最大HP加算' : actionName(target.class_id);
      const after = heroAfterOf(base, preview, label);
      const common = { target, label, heroAfter: after.hero, changedInstanceId: after.changedInstanceId, noImproveText: '' };
      if (preview.kind === 'MAX_HP') {
        return {
          ...common,
          kind: 'MAX_HP',
          steps: null,
          costs: [],
          range: null,
          atk: null,
          uses: null,
          hpAdd: preview.add,
          boosted: preview.boosted,
          improved: [],
        };
      }
      if (preview.kind === 'VANISH') {
        return {
          ...common,
          kind: 'VANISH',
          steps: null,
          costs: [],
          range: null,
          atk: null,
          uses: 0,
          hpAdd: null,
          boosted: [],
          improved: [],
          changedInstanceId: null,
        };
      }
      const params = preview.params;
      return {
        ...common,
        kind: preview.kind,
        steps: { thought: params.step_thought, startup: params.step_startup, recovery: params.step_recovery },
        costs: costsOf(params),
        range: params.range > 0 ? params.range : null,
        atk: params.range > 0 ? params.atk : null,
        uses: preview.usesInitial,
        hpAdd: null,
        // 係数による改善は当該の値を強調し、統合による改善は別に示す。値はパラメータIDのまま渡す。
        boosted: preview.boosted,
        improved: preview.kind === 'MERGE' ? preview.improved : [],
        noImproveText: preview.kind === 'MERGE' && preview.improved.length === 0 ? noImproveText(label) : '',
      };
    });
}

// [M-PROG-REFILL] アクト移行の段（intermission_stage == TRANSITION）の提示内容。
// 補充は確定操作であるため、迎え入れた従者は候補から外れる。移行の決済に示す前後の値は、
// インターミッション開始時のスナップショット（[M-STATE-IMSNAPSHOT]）を「前」とする。
export function refillView(
  run: RunState,
  masters: GameMasters,
  heroName: string,
  attendantName: (attendantId: string) => string,
  attendantEpithet: (attendantId: string) => string,
  shortText: (slotCount: number, remainCount: number) => string,
  noticeText: string,
): RefillView {
  const next = sceneOf(masters, run.current_scene_id);
  const previous = sceneByOrder(masters, next.order - 1);
  const start = run.im_snapshots[run.im_snapshots.length - 1]?.state;
  const startParty = (start?.party ?? run.party).map((slot) => slot.attendant_id);
  const named = (attendantId: string): { attendantId: string; name: string; epithet: string } => ({
    attendantId,
    name: attendantName(attendantId),
    epithet: attendantEpithet(attendantId),
  });
  const survivors = run.party.filter((slot) => startParty.includes(slot.attendant_id)).map((slot) => named(slot.attendant_id));
  const remain = refillCapacity(run, masters);
  const joined = run.party.filter((slot) => !startParty.includes(slot.attendant_id)).map((slot) => slot.attendant_id);
  const candidate = (attendantId: string, isJoined: boolean): RefillCandidateView => {
    const record = attendantOf(masters, attendantId);
    const coeffs = Object.entries(record.coeffs).map(([key, centi]) => ({
      label: COEFF_LABEL[key] ?? key,
      text: `×${formatCenti(centi)}`,
      gain: isCoeffGain(key, centi),
    }));
    return { ...named(attendantId), coeffs, joined: isJoined };
  };
  return {
    fromAct: previous.act,
    toAct: next.act,
    capacityBefore: previous.attendant_capacity,
    capacityAfter: next.attendant_capacity,
    survivors,
    slotCount: next.attendant_capacity - survivors.length,
    filledCount: joined.length,
    remainCount: remain,
    heroName,
    heroHpBefore: start?.hero_hp ?? run.hero_hp,
    heroHpAfter: run.hero_max_hp,
    enshrinedBefore: start?.enshrined_count ?? run.enshrined_count,
    enshrinedAfter: run.enshrined_count,
    // 迎え入れた従者を先に置き、残る候補を続ける。
    pool: [...joined.map((id) => candidate(id, true)), ...refillPool(run, masters).map((id) => candidate(id, false))],
    shortText: remain > 0 ? shortText(next.attendant_capacity - survivors.length, remain) : '',
    noticeText,
    canSettle: canSettleIntermission(run, masters),
  };
}
