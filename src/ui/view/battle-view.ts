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
  readonly instanceId: string | null;
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
  readonly hp: string; // 現在HP / 最大HP
  readonly hpValue: number;
  readonly vp: number;
  readonly pp: number;
  readonly ap: number;
  readonly defense: number; // 実効防御力（[M-CALC-EFFECTIVE]）
  readonly thought: number; // 思考中ステートの蓄積ステップ数
  readonly chips: readonly ChipView[];
  readonly running: RunningCardView | null;
}

// ［実効消費コスト］払えないリソースは short で示し、一覧上で見分けられるようにする。
export interface CostView {
  readonly label: string;
  readonly value: number;
  readonly short: boolean;
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
  readonly previewable: boolean; // 判定プレビューの対象（実行可能な自軍アクション、または実行中）
  readonly sealed: boolean; // 封印蓄積値が 1.00 に達している
  readonly isCopy: boolean; // ［写し］コピーで得たインスタンス
  readonly thoughtProgress: number; // 思考蓄積の充足率（0〜100、必要思考0は100）
  readonly uses: string;
  readonly stepThought: number;
  readonly stepStartup: number;
  readonly stepRecovery: number;
  readonly costs: readonly CostView[];
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
  // 発生中アクションの着弾予測。戦域の対象マスへ重ねて示す。
  readonly stamps: readonly ForecastStamp[];
  readonly cards: readonly ActionCardView[];
  readonly cardsUnitId: string | null;
  readonly timeline: Timeline;
  readonly preview: ActionPreview | null;
  // 選択中・実行中の見込みをユニットプレートへ反映する値。
  readonly previewDeltas: readonly PlateDelta[];
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
    instanceId: unit.last_act?.instance_id ?? null,
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
    hpValue: Math.max(unit.hp, 0),
    vp: unit.vp,
    pp: unit.pp,
    ap: unit.ap,
    defense: currentDefense(unit),
    thought: unit.elapsed_thought,
    chips: chipsOf(unit),
    running: runningOf(unit, naming.actionName),
  };
}

// 実効消費コストと、そのリソースが現在値で払えるかどうか。
// HPのみ支払い後に残る必要があり（[M-PIPE-SUICIDE] 自滅の禁止）、他は同値まで払える。
function costsOf(unit: Unit, action: ActionInstance): CostView[] {
  const entries: CostView[] = [
    { label: 'HP', value: effectiveCostHp(unit, action), short: unit.hp <= effectiveCostHp(unit, action) },
    { label: 'VP', value: effectiveCostVp(unit, action), short: unit.vp < effectiveCostVp(unit, action) },
    { label: 'PP', value: effectiveCostPp(unit, action), short: unit.pp < effectiveCostPp(unit, action) },
    { label: 'AP', value: effectiveCostAp(unit, action), short: unit.ap < effectiveCostAp(unit, action) },
  ];
  return entries.filter((entry) => entry.value !== 0); // ［数値書式］8 既定値の非描画
}

const SEAL_LIMIT_CENTI = 100;

function cardOf(state: BattleState, unit: Unit, action: ActionInstance, deps: StepDeps, naming: UnitNaming): ActionCardView {
  const rank = activationRank(state, unit, action);
  const martial = hasFlag(action.sys_flags, 'FLAG_MARTIAL');
  const thought = effectiveStepThought(unit, action);
  const running = unit.state !== 'THOUGHT' && unit.last_act?.instance_id === action.instance_id;
  return {
    instanceId: action.instance_id,
    unitId: unit.unit_id,
    side: unit.side,
    name: naming.actionName(action),
    icon: iconOf(action),
    rank,
    executable: rank === 0 && unit.side === 'MINE',
    running,
    previewable: (unit.state === 'STARTUP' && running) || (unit.side === 'MINE' && rank === 0),
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

// ［判定プレビュー］任意のアクションインスタンスに対する見込み。カードのホバーなど、
// 画面側が随時に問い合わせるための入口であり、ビュー全体の再構築を伴わない。
function ownerOf(state: BattleState, instanceId: string): { unit: Unit; action: ActionInstance } | null {
  for (const unit of state.units) {
    if (unit === null) {
      continue;
    }
    const action = unit.acts.find((candidate) => candidate.instance_id === instanceId);
    if (action !== undefined) {
      return { unit, action };
    }
  }
  return null;
}

// ［判定プレビュー］戦域の各マスへ重ねる着弾の見込み。発生中アクションについては常に、
// 選択中・注目中のアクションについては仮定として示す。
export interface ForecastStamp {
  readonly unitId: string; // 攻撃側
  readonly side: Side; // 攻撃側の陣営
  readonly posIdx: number; // 提示するマス
  readonly kind: 'HIT' | 'MISS' | 'INTERRUPT';
  readonly running: boolean; // 発生中の実行アクション（仮定ではない）
  readonly actionName: string;
  readonly atk: number;
  readonly defense: number; // 対象の実効防御力（中断は自身の防御力）
  readonly damage: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly fireStep: number; // 発動（中断は成立）のステップ
}

function forecastOf(
  state: BattleState,
  unit: Unit,
  action: ActionInstance,
  preview: ActionPreview,
  naming: UnitNaming,
): ForecastStamp[] {
  if (!hasFlag(action.sys_flags, 'FLAG_MARTIAL')) {
    return [];
  }
  const running = unit.state === 'STARTUP' && unit.last_act?.instance_id === action.instance_id;
  const startup = effectiveStepStartup(unit, action);
  const base = {
    unitId: unit.unit_id,
    side: unit.side,
    running,
    actionName: naming.actionName(action),
    atk: effectiveAtk(unit, action),
    fireStep: state.step + Math.max(running ? startup - unit.elapsed_startup : startup, 0),
  };
  // 中断が予測される場合は着弾しない。成立位置は攻撃側のマスに示す（[M-UI-HUD]［判定プレビュー］）。
  if (preview.kind === 'INTERRUPT') {
    return [
      {
        ...base,
        posIdx: unit.pos_idx,
        kind: 'INTERRUPT',
        defense: currentDefense(unit),
        damage: 0,
        hpBefore: unit.hp,
        hpAfter: unit.hp,
        fireStep: state.step + preview.steps,
      },
    ];
  }
  if (preview.kind !== 'MARTIAL') {
    return [];
  }
  return preview.targets.flatMap((target) => {
    const victim = state.units[target.posIdx];
    if (victim === null || victim === undefined) {
      return [];
    }
    const damage = target.damage ?? 0;
    return [
      {
        ...base,
        posIdx: target.posIdx,
        kind: target.hit ? ('HIT' as const) : ('MISS' as const),
        defense: currentDefense(victim),
        damage,
        hpBefore: victim.hp,
        hpAfter: Math.max(victim.hp - damage, 0),
      },
    ];
  });
}

// ［判定プレビュー］提示の対象は「選択中または実行中のアクション」であり、選択できるのは
// その時点で実行可能な自軍アクションに限る。コスト不足・思考蓄積待ち・封印・敵軍の手札は対象にしない。
export function isPreviewTarget(state: BattleState, unit: Unit, action: ActionInstance): boolean {
  if (unit.state === 'STARTUP' && unit.last_act?.instance_id === action.instance_id) {
    return true; // 実行中（発生中）のアクション
  }
  return unit.side === 'MINE' && activationRank(state, unit, action) === 0;
}

// ［判定プレビュー］ユニットプレートへ反映する見込み値。現在値と異なる項目だけを持つ。
export interface PlateDelta {
  readonly unitId: string;
  readonly tone: 'SELF' | 'DAMAGE'; // 実行側の増減か、被弾側の減少か
  readonly hp: number | null;
  readonly vp: number | null;
  readonly pp: number | null;
  readonly ap: number | null;
}

function changed(before: number, after: number): number | null {
  return before === after ? null : after;
}

// 実行側は実効消費コストの支払い後、心気は加算VP・充填後PP目標値（[M-UI-HUD]［判定プレビュー］）。
// 実行中アクションのコストは実行開始時に支払い済みのため、重ねて差し引かない。
function actorDelta(unit: Unit, action: ActionInstance, preview: ActionPreview, running: boolean): PlateDelta | null {
  const hp = running ? unit.hp : unit.hp - effectiveCostHp(unit, action);
  let vp = running ? unit.vp : unit.vp - effectiveCostVp(unit, action);
  let pp = running ? unit.pp : unit.pp - effectiveCostPp(unit, action);
  const ap = running ? unit.ap : unit.ap - effectiveCostAp(unit, action);
  if (preview.kind === 'MIND') {
    vp += preview.gainVp;
    pp = preview.raises ? preview.targetPp : pp;
  }
  const delta: PlateDelta = {
    unitId: unit.unit_id,
    tone: 'SELF',
    hp: changed(unit.hp, hp),
    vp: changed(unit.vp, vp),
    pp: changed(unit.pp, pp),
    ap: changed(unit.ap, ap),
  };
  return delta.hp === null && delta.vp === null && delta.pp === null && delta.ap === null ? null : delta;
}

// 対象側は着弾の見込みによるHPの推移。
function targetDeltas(stamps: readonly ForecastStamp[], state: BattleState): PlateDelta[] {
  return stamps.flatMap((stamp) => {
    const victim = state.units[stamp.posIdx];
    if (stamp.kind !== 'HIT' || victim === null || victim === undefined) {
      return [];
    }
    return [{ unitId: victim.unit_id, tone: 'DAMAGE' as const, hp: stamp.hpAfter, vp: null, pp: null, ap: null }];
  });
}

function plateDeltasOf(
  state: BattleState,
  unit: Unit,
  action: ActionInstance,
  preview: ActionPreview,
  stamps: readonly ForecastStamp[],
): PlateDelta[] {
  if (preview.kind === 'INTERRUPT') {
    return []; // 中断が見込まれる場合、実行そのものが成立しない
  }
  const running = unit.state === 'STARTUP' && unit.last_act?.instance_id === action.instance_id;
  const actor = actorDelta(unit, action, preview, running);
  return [...(actor === null ? [] : [actor]), ...targetDeltas(stamps, state)];
}

export interface FocusPreview {
  readonly preview: ActionPreview | null;
  readonly stamps: readonly ForecastStamp[];
  // ユニットプレートへ反映する見込み値（実行側の消費・対象側のHP推移）。
  readonly deltas: readonly PlateDelta[];
  // [M-UI-TIMELINE]「注目中のアクションの仮定展開」。提示できない場合は Null。
  readonly timeline: Timeline | null;
}

// 注目中のアクション1件に対する提示（判定プレビューと戦域の着弾予測）。ホバーのたびに
// ビュー全体を組み直さないための入口であり、見込みの計算は1回に限る。
export function focusPreview(state: BattleState, instanceId: string, deps: StepDeps, naming: UnitNaming): FocusPreview {
  const owner = ownerOf(state, instanceId);
  if (owner === null) {
    return { preview: null, stamps: [], deltas: [], timeline: null };
  }
  if (!isPreviewTarget(state, owner.unit, owner.action)) {
    return { preview: null, stamps: [], deltas: [], timeline: null }; // 実行できないアクションの見込みは提示しない
  }
  const preview = previewOf(state, owner.unit, owner.action, deps);
  const stamps = forecastOf(state, owner.unit, owner.action, preview, naming);
  // 実行中アクションは既に展開へ現れているため、仮定展開を重ねない。
  const running = owner.unit.state !== 'THOUGHT' && owner.unit.last_act?.instance_id === owner.action.instance_id;
  const plan = running ? null : { unitId: owner.unit.unit_id, instanceId: owner.action.instance_id };
  return {
    preview,
    stamps,
    deltas: plateDeltasOf(state, owner.unit, owner.action, preview, stamps),
    timeline: plan === null ? null : simulateTimeline(state, timelineSpan(state), deps, plan),
  };
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
  const runningOf = (unit: Unit): ActionInstance | undefined =>
    unit.acts.find((action) => action.instance_id === unit.last_act?.instance_id && unit.state === 'STARTUP');
  const chosen = selectedUnit?.acts.find((action) => action.instance_id === options.selectedInstanceId);
  // ［判定プレビュー］提示するのは実行可能な自軍アクションと実行中アクションに限る。
  const selected =
    selectedUnit === undefined
      ? undefined
      : chosen !== undefined && isPreviewTarget(state, selectedUnit, chosen)
        ? chosen
        : runningOf(selectedUnit);
  // 発生中のユニットについては、選択・注目によらず常に着弾の見込みを戦域へ示す。
  const stamps = units.flatMap((unit) => {
    if (unit.state !== 'STARTUP') {
      return [];
    }
    const action = unit.acts.find((candidate) => candidate.instance_id === unit.last_act?.instance_id);
    return action === undefined ? [] : forecastOf(state, unit, action, previewOf(state, unit, action, deps), naming);
  });
  // 選択中または実行中のアクションの見込み。プレートへ反映する値も同じ見込みから導く。
  const preview = selectedUnit === undefined || selected === undefined ? null : previewOf(state, selectedUnit, selected, deps);
  const previewDeltas =
    preview === null || selectedUnit === undefined || selected === undefined
      ? []
      : plateDeltasOf(state, selectedUnit, selected, preview, forecastOf(state, selectedUnit, selected, preview, naming));
  return {
    step: state.step,
    plates,
    columns,
    stamps,
    cards: cardsUnit === undefined ? [] : (columns.find((column) => column.posIdx === cardsUnit.pos_idx)?.cards ?? []),
    cardsUnitId: cardsUnit?.unit_id ?? null,
    timeline: simulateTimeline(state, timelineSpan(state), deps),
    preview,
    previewDeltas,
    pauseReason: state.pause_reason,
    instructable: columns.some((column) => column.cards.some((card) => card.executable)),
  };
}
