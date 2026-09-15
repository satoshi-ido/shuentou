// [M-UI-HUD] 盤面HUDのビューモデル。BattleState と表示専用の値（タイムライン・監視の充足状態）から
// 描画に必要な文字列・数値を組み立てる。HUD は BattleState に含まれず、[M-CORE-DETERMINISM] の対象外である。

import { currentDefense } from '../../engine/defense.js';
import {
  effectiveAtk,
  effectiveCostAp,
  effectiveCostHp,
  effectiveCostPp,
  effectiveCostVp,
  effectiveRange,
  effectiveStepRecovery,
  effectiveStepStartup,
  effectiveStepThought,
} from '../../engine/effective.js';
import { hasFlag } from '../../engine/flags.js';
import { PARAM_IDS, type ParamId } from '../../engine/params.js';
import type { StepDeps } from '../../engine/pipeline/step.js';
import { simulateTimeline, timelineSpan, type Timeline } from '../../engine/timeline.js';
import type { ActionInstance, BattleState, PauseReason, Side, Unit, WatchKind } from '../../engine/types.js';
import { WATCH_KINDS } from '../../engine/types.js';
import { evaluateActionWatch, type WatchStatus } from '../../engine/watch.js';
import { correctionSign, formatCenti, formatHp, formatSteps, formatUses, PARAM_LABEL, WATCH_SYMBOL } from '../format.js';
import type { SystemIcon } from '../assets/placeholder.js';
import { previewOf, type ActionPreview } from './preview.js';
import { activationRank, sortedActions } from './sort.js';

export interface ChipView {
  readonly kind: 'SLIP' | 'BUFF' | 'DEBUFF';
  readonly label: string;
  readonly value: string; // 小数第2位まで（[M-UI-HUD]［数値書式］2）
  readonly sign: '+' | '−' | '';
}

export interface RunningCardView {
  readonly name: string;
  readonly phase: 'STARTUP' | 'RECOVERY';
  readonly stateLabel: '発生中' | '硬直中';
  readonly steps: string; // 経過 / 基準（残N）
  readonly elapsed: number;
  readonly required: number;
  readonly atk: number;
  readonly defense: number;
}

export interface PlateView {
  readonly unitId: string;
  readonly side: Side;
  readonly posIdx: number;
  readonly name: string;
  readonly roleName: string | null;
  readonly isMaster: boolean;
  readonly hp: string;
  readonly vp: number;
  readonly pp: number;
  readonly ap: number;
  readonly defense: number; // 実効防御力（[M-CALC-EFFECTIVE]）
  readonly thought: number; // 思考中ステートの蓄積ステップ数
  readonly chips: readonly ChipView[];
  readonly running: RunningCardView | null;
}

export interface WatchToggleView {
  readonly kind: WatchKind;
  readonly symbol: string;
  readonly on: boolean;
  readonly status: WatchStatus;
}

export interface ActionCardView {
  readonly instanceId: string;
  readonly unitId: string;
  readonly side: Side;
  readonly name: string;
  readonly icon: SystemIcon | null;
  readonly rank: 0 | 1 | 2 | 3;
  readonly executable: boolean;
  readonly running: boolean; // 実行中（発生中・硬直中の実行対象）
  readonly sealed: boolean; // 封印蓄積値が 1.00 に達している
  readonly isCopy: boolean; // ［写し］コピーで得たインスタンス
  readonly thoughtProgress: number; // 思考蓄積の充足率（0〜100、必要思考0は100）
  readonly uses: string;
  readonly stepThought: number;
  readonly stepStartup: number;
  readonly stepRecovery: number;
  readonly costs: readonly { readonly label: string; readonly value: number }[];
  readonly range: number | null;
  readonly atk: number | null;
  readonly seal: string | null; // 封印蓄積値（0.00 は描画しない）
  readonly watch: readonly WatchToggleView[];
}

// [M-FIELD-GRID] 盤面の4マス。マスごとに、ユニットプレート・実行中カード・アクション一覧を縦に並べる。
export interface BoardColumnView {
  readonly posIdx: number;
  readonly plate: PlateView | null; // 空きマスは Null
  readonly cards: readonly ActionCardView[];
}

export interface BattleView {
  readonly step: number;
  readonly plates: readonly PlateView[];
  readonly columns: readonly BoardColumnView[];
  readonly cards: readonly ActionCardView[];
  readonly cardsUnitId: string | null;
  readonly timeline: Timeline;
  readonly preview: ActionPreview | null;
  readonly pauseReason: PauseReason | null;
  readonly instructable: boolean;
}

function iconOf(action: ActionInstance): SystemIcon | null {
  const flags = action.sys_flags;
  if (hasFlag(flags, 'FLAG_MARTIAL')) return 'MARTIAL';
  if (hasFlag(flags, 'FLAG_STANCE')) return 'STANCE';
  if (hasFlag(flags, 'FLAG_MIND')) return 'MIND';
  if (hasFlag(flags, 'FLAG_SUMMON')) return 'SUMMON';
  if (hasFlag(flags, 'FLAG_SWAP')) return 'SWAP';
  return null;
}

// ［補正チップ］被スリップ量 → 被バフ量 → 被デバフ量の順、各群は [M-STATE-PARAMIDS] の行順。
function chipsOf(unit: Unit): ChipView[] {
  const chips: ChipView[] = [];
  if (unit.slip !== 0) {
    chips.push({ kind: 'SLIP', label: '被スリップ', value: formatCenti(unit.slip), sign: '' });
  }
  for (const kind of ['BUFF', 'DEBUFF'] as const) {
    const source = kind === 'BUFF' ? unit.buff : unit.debuff;
    for (const id of PARAM_IDS) {
      const value = source[id as ParamId];
      if (value !== 0) {
        chips.push({ kind, label: PARAM_LABEL[id] ?? id, value: formatCenti(value), sign: correctionSign(id, kind) });
      }
    }
  }
  return chips;
}

function runningOf(unit: Unit, actionName: (action: ActionInstance) => string): RunningCardView | null {
  if (unit.state !== 'STARTUP' && unit.state !== 'RECOVERY') {
    return null;
  }
  const action = unit.acts.find((candidate) => candidate.instance_id === unit.last_act?.instance_id);
  const startup = unit.state === 'STARTUP';
  const elapsed = startup ? unit.elapsed_startup : unit.elapsed_recovery;
  const required = startup ? (action === undefined ? 0 : effectiveStepStartup(unit, action)) : unit.applied_recovery;
  return {
    name: action === undefined ? (unit.last_act?.class_id ?? '─') : actionName(action),
    phase: startup ? 'STARTUP' : 'RECOVERY',
    stateLabel: startup ? '発生中' : '硬直中',
    steps: formatSteps(elapsed, required),
    elapsed,
    required,
    atk: action === undefined ? 0 : effectiveAtk(unit, action),
    defense: currentDefense(unit),
  };
}

export interface UnitNaming {
  readonly displayName: (unit: Unit) => string;
  readonly roleName: (unit: Unit) => string | null;
  readonly actionName: (action: ActionInstance) => string;
}

function plateOf(unit: Unit, naming: UnitNaming): PlateView {
  return {
    unitId: unit.unit_id,
    side: unit.side,
    posIdx: unit.pos_idx,
    name: naming.displayName(unit),
    roleName: naming.roleName(unit),
    isMaster: unit.unit_kind === 'MASTER',
    hp: formatHp(unit.hp, unit.max_hp),
    vp: unit.vp,
    pp: unit.pp,
    ap: unit.ap,
    defense: currentDefense(unit),
    thought: unit.elapsed_thought,
    chips: chipsOf(unit),
    running: runningOf(unit, naming.actionName),
  };
}

function costsOf(unit: Unit, action: ActionInstance): { label: string; value: number }[] {
  const entries: { label: string; value: number }[] = [
    { label: 'HP', value: effectiveCostHp(unit, action) },
    { label: 'VP', value: effectiveCostVp(unit, action) },
    { label: 'PP', value: effectiveCostPp(unit, action) },
    { label: 'AP', value: effectiveCostAp(unit, action) },
  ];
  return entries.filter((entry) => entry.value !== 0); // ［数値書式］8 既定値の非描画
}

const SEAL_LIMIT_CENTI = 100;

function cardOf(state: BattleState, unit: Unit, action: ActionInstance, deps: StepDeps, naming: UnitNaming): ActionCardView {
  const rank = activationRank(state, unit, action);
  const martial = hasFlag(action.sys_flags, 'FLAG_MARTIAL');
  const thought = effectiveStepThought(unit, action);
  return {
    instanceId: action.instance_id,
    unitId: unit.unit_id,
    side: unit.side,
    name: naming.actionName(action),
    icon: iconOf(action),
    rank,
    executable: rank === 0 && unit.side === 'MINE',
    running: unit.state !== 'THOUGHT' && unit.last_act?.instance_id === action.instance_id,
    sealed: action.seal_accum >= SEAL_LIMIT_CENTI,
    isCopy: action.is_copy,
    thoughtProgress: thought === 0 ? 100 : Math.min(Math.round((unit.elapsed_thought * 100) / thought), 100),
    uses: formatUses(action.uses_left, action.uses_initial),
    stepThought: thought,
    stepStartup: effectiveStepStartup(unit, action),
    stepRecovery: effectiveStepRecovery(unit, action),
    costs: costsOf(unit, action),
    range: martial ? effectiveRange(unit, action) : null,
    atk: martial ? effectiveAtk(unit, action) : null,
    seal: action.seal_accum === 0 ? null : formatCenti(action.seal_accum),
    // [M-UI-WATCH] 監視トグルは自軍アクションに対して設ける。敵軍のカードは提示のみで切り替えを持たない。
    watch: unit.side === 'MINE' ? watchTogglesOf(state, unit, action, deps) : [],
  };
}

function watchTogglesOf(state: BattleState, unit: Unit, action: ActionInstance, deps: StepDeps): WatchToggleView[] {
  const evaluation = evaluateActionWatch(state, unit, action, deps);
  return WATCH_KINDS.map((kind) => ({
    kind,
    symbol: WATCH_SYMBOL[kind],
    on: state.watching[action.instance_id]?.[kind] ?? false,
    status: evaluation[kind].status,
  }));
}

export interface BattleViewOptions {
  readonly state: BattleState;
  readonly deps: StepDeps;
  readonly naming: UnitNaming;
  // アクション一覧を表示する自軍ユニット（既定は前列側の自軍ユニット）。
  readonly cardsUnitId?: string | null;
  // 判定プレビューの対象（選択中のアクション）。
  readonly selectedInstanceId?: string | null;
}

function mineUnits(state: BattleState): Unit[] {
  return state.units.filter((unit): unit is Unit => unit !== null && unit.side === 'MINE');
}

export function buildBattleView(options: BattleViewOptions): BattleView {
  const { state, deps, naming } = options;
  const units = state.units.filter((unit): unit is Unit => unit !== null);
  const columns: BoardColumnView[] = [0, 1, 2, 3].map((posIdx) => {
    const unit = units.find((candidate) => candidate.pos_idx === posIdx);
    return {
      posIdx,
      plate: unit === undefined ? null : plateOf(unit, naming),
      cards: unit === undefined ? [] : sortedActions(state, unit).map((action) => cardOf(state, unit, action, deps, naming)),
    };
  });
  const plates = columns.flatMap((column) => (column.plate === null ? [] : [column.plate]));
  const mine = mineUnits(state);
  const cardsUnit = mine.find((unit) => unit.unit_id === options.cardsUnitId) ?? [...mine].sort((a, b) => b.pos_idx - a.pos_idx)[0];
  // 判定プレビューの対象は選択中のアクションを所持するユニット。未選択のときは注目自軍ユニットの実行中アクション。
  const selectedUnit = units.find((unit) => unit.acts.some((action) => action.instance_id === options.selectedInstanceId)) ?? cardsUnit;
  const selected =
    selectedUnit === undefined
      ? undefined
      : (selectedUnit.acts.find((action) => action.instance_id === options.selectedInstanceId) ??
        selectedUnit.acts.find((action) => action.instance_id === selectedUnit.last_act?.instance_id && selectedUnit.state === 'STARTUP'));
  return {
    step: state.step,
    plates,
    columns,
    cards: cardsUnit === undefined ? [] : (columns.find((column) => column.posIdx === cardsUnit.pos_idx)?.cards ?? []),
    cardsUnitId: cardsUnit?.unit_id ?? null,
    timeline: simulateTimeline(state, timelineSpan(state), deps),
    preview: selectedUnit === undefined || selected === undefined ? null : previewOf(state, selectedUnit, selected, deps),
    pauseReason: state.pause_reason,
    instructable: columns.some((column) => column.cards.some((card) => card.executable)),
  };
}
