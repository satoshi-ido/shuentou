// [M-INHERIT-POOL] [M-INHERIT-MERGE]［UI要件］継承の段の提示内容。
// 継承プールの各項目について、受け継ぐ前後の見込みを組む。純関数とし、描画層から独立させる。

import { formatUses } from '../format.js';
import { canInherit, inheritPool, previewInherit, type InheritPreview } from '../../engine/progress/inherit.js';
import type { GameMasters } from '../../engine/run/masters.js';
import type { RunState } from '../../engine/run/state.js';
import type { ActionParams } from '../../data/types.js';
import {
  HERO_MAX_HP_CHANGE,
  NEW_SLOT_INSTANCE_ID,
  type HeroActionView,
  type HeroView,
  type InheritOptionView,
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
      const common = { target, label, heroAfter: after.hero, changedInstanceId: after.changedInstanceId };
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
      };
    });
}
