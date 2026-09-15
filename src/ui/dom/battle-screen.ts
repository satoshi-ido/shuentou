// [M-UI-SCREENS]「バトル」画面の描画。入力はマウスのみ（[M-UI-VIEWPORT]）。
// 左クリックは選択および確定、右クリックは取り消し、ホイールはアクション一覧の縦スクロール（[M-UI-SCROLL]）。

import { SYSTEM_ICON_GLYPH } from '../assets/placeholder.js';
import type { PlaybackSpeed } from '../config.js';
import { INFINITY_MARK, STEP_ARROW, SYMBOL } from '../format.js';
import type { ActionCardView, BattleView, PlateView, WatchToggleView } from '../view/battle-view.js';
import type { ActionPreview } from '../view/preview.js';
import type { WatchKind } from '../../engine/types.js';
import type { Timeline } from '../../engine/timeline.js';

export interface BattleScreenHandlers {
  readonly onSelect: (instanceId: string) => void;
  readonly onInstruct: (instanceId: string) => void;
  readonly onCancel: () => void;
  readonly onToggleWatch: (instanceId: string, kind: WatchKind) => void;
  readonly onResume: () => void;
  readonly onSpeed: (speed: PlaybackSpeed) => void;
}

const SPEEDS: readonly PlaybackSpeed[] = ['PAUSE', 'X1', 'X2', 'X3'];
const POS_LABEL: Readonly<Record<number, string>> = { 0: '自後', 1: '自前', 2: '敵前', 3: '敵後' };

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function buttonElement(className: string, text: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
}

function renderPlate(plate: PlateView): HTMLElement {
  const box = element('div', `plate plate-${plate.side.toLowerCase()}`);
  box.dataset.unitId = plate.unitId;
  const head = element('div', 'plate-head');
  head.append(element('span', 'plate-pos', POS_LABEL[plate.posIdx] ?? ''));
  head.append(element('span', 'plate-name', plate.roleName === null ? plate.name : `${plate.name} / ${plate.roleName}`));
  box.append(head);
  const resources = element('div', 'plate-resources num');
  resources.append(element('span', 'res', `${SYMBOL.hp} ${plate.hp}`));
  resources.append(element('span', 'res', `${SYMBOL.vp} ${plate.vp}`));
  resources.append(element('span', 'res', `${SYMBOL.pp} ${plate.pp}`));
  resources.append(element('span', 'res', `${SYMBOL.ap} ${plate.ap}`));
  box.append(resources);
  if (plate.chips.length > 0) {
    const chips = element('div', 'plate-chips');
    for (const chip of plate.chips) {
      chips.append(element('span', `chip chip-${chip.kind.toLowerCase()} num`, `${chip.label} ${chip.sign}${chip.value}`));
    }
    box.append(chips);
  }
  if (plate.running !== null) {
    const running = element('div', 'plate-running num');
    running.append(element('span', 'running-name', `${plate.running.name}（${plate.running.stateLabel}）`));
    running.append(element('span', 'running-steps', plate.running.steps));
    running.append(element('span', 'running-values', `${SYMBOL.atk}${plate.running.atk} ${SYMBOL.defense}${plate.running.defense}`));
    box.append(running);
  }
  return box;
}

function renderWatchToggle(card: ActionCardView, toggle: WatchToggleView, handlers: BattleScreenHandlers): HTMLElement {
  const node = buttonElement(`watch watch-${toggle.status.toLowerCase()}${toggle.on ? ' watch-on' : ''}`, toggle.symbol);
  node.title = `${toggle.symbol}：${toggle.on ? '監視ON' : '監視OFF'} / ${toggle.status}`;
  node.addEventListener('click', (event) => {
    event.stopPropagation(); // ドラッグを用いず、カード上の5要素を直接クリックして切り替える（[M-UI-VIEWPORT]）
    handlers.onToggleWatch(card.instanceId, toggle.kind);
  });
  return node;
}

function renderCard(card: ActionCardView, selected: boolean, handlers: BattleScreenHandlers): HTMLElement {
  const box = element('div', `card card-rank${card.rank}${selected ? ' card-selected' : ''}`);
  box.dataset.instanceId = card.instanceId;
  const head = element('div', 'card-head');
  head.append(element('span', 'card-icon', card.icon === null ? '·' : SYSTEM_ICON_GLYPH[card.icon]));
  head.append(element('span', 'card-name', card.name));
  head.append(element('span', 'card-uses num', card.uses === INFINITY_MARK ? INFINITY_MARK : card.uses));
  box.append(head);
  const steps = element('div', 'card-steps num');
  steps.textContent = `${SYMBOL.stepThought}${card.stepThought} ${STEP_ARROW} ${SYMBOL.stepStartup}${card.stepStartup} ${STEP_ARROW} ${SYMBOL.stepRecovery}${card.stepRecovery}`;
  box.append(steps);
  const values = element('div', 'card-values num');
  for (const cost of card.costs) {
    values.append(element('span', 'cost', `${cost.label}${cost.value}`));
  }
  if (card.range !== null) {
    values.append(element('span', 'val', `${SYMBOL.range}${card.range}`));
  }
  if (card.atk !== null) {
    values.append(element('span', 'val', `${SYMBOL.atk}${card.atk}`));
  }
  if (card.seal !== null) {
    values.append(element('span', 'seal', `封${card.seal}`));
  }
  box.append(values);
  const watch = element('div', 'card-watch');
  for (const toggle of card.watch) {
    watch.append(renderWatchToggle(card, toggle, handlers));
  }
  box.append(watch);
  box.addEventListener('click', () => {
    if (selected && card.executable) {
      handlers.onInstruct(card.instanceId); // 左クリックは選択および確定
      return;
    }
    handlers.onSelect(card.instanceId);
  });
  return box;
}

function previewText(preview: ActionPreview): string {
  switch (preview.kind) {
    case 'INTERRUPT':
      return `中断の見込み（${SYMBOL.remaining}${preview.steps}）`;
    case 'MARTIAL':
      return preview.targets
        .map((target) => `${POS_LABEL[target.posIdx]}：${target.hit ? `命中（${SYMBOL.hp}−${target.damage ?? 0}）` : '回避'}`)
        .join(' / ');
    case 'MARTIAL_NO_TARGET':
      return '射程内に対象が存在しない';
    case 'STANCE':
      return `展開AP ${preview.deployAp} → ${SYMBOL.defense}${preview.defenseAfter}`;
    case 'MIND':
      return preview.raises
        ? `加算VP ${preview.gainVp} → ${SYMBOL.pp}${preview.targetPp}`
        : `加算VP ${preview.gainVp}（充填後の目標値が現在PPを上回らない）`;
    case 'SWAP':
      return `交代後の位置：${POS_LABEL[preview.posIdxAfter]}`;
    case 'SUMMON':
      return `配置：${preview.creatureId}`;
    default:
      return '';
  }
}

function renderTimeline(timeline: Timeline): HTMLElement {
  const box = element('div', 'timeline');
  const ruler = element('div', 'tl-ruler num', `${timeline.start} 〜 ${timeline.start + timeline.span}`);
  box.append(ruler);
  for (const lane of timeline.lanes) {
    const row = element('div', `tl-lane tl-${lane.side.toLowerCase()}`);
    for (const segment of lane.segments) {
      const seg = element('div', `tl-seg tl-${segment.kind.toLowerCase()}`);
      const width = Math.max((segment.length * 100) / timeline.span, 0);
      seg.style.width = `${width}%`;
      seg.textContent =
        segment.kind === 'THOUGHT'
          ? `${SYMBOL.stepThought}${segment.elapsedAtStart}+`
          : `${segment.kind === 'STARTUP' ? SYMBOL.stepStartup : SYMBOL.stepRecovery}${segment.elapsedAtStart}/${segment.required ?? 0}`;
      row.append(seg);
    }
    box.append(row);
  }
  return box;
}

// [M-DATA-PAUSE-REASON] 事由文言は文言マスタに属する。文言マスタの投入まではプレースホルダ書式で示す（[I-PLAN-TEXT]）。
function pauseReasonText(view: BattleView): string {
  const reason = view.pauseReason;
  if (reason === null) {
    return '';
  }
  const parts = [`[STR_PAUSE_${reason.code}]`];
  if (reason.unit_id !== null) {
    parts.push(view.plates.find((plate) => plate.unitId === reason.unit_id)?.name ?? reason.unit_id);
  }
  if (reason.instance_id !== null) {
    parts.push(view.cards.find((card) => card.instanceId === reason.instance_id)?.name ?? reason.instance_id);
  }
  if (reason.watch_kind !== null) {
    parts.push(view.cards[0]?.watch.find((toggle) => toggle.kind === reason.watch_kind)?.symbol ?? reason.watch_kind);
  }
  if (reason.remaining_steps !== null) {
    parts.push(`${SYMBOL.remaining}${reason.remaining_steps}`);
  }
  return parts.join(' ');
}

export interface BattleScreenState {
  readonly view: BattleView;
  readonly selectedInstanceId: string | null;
  readonly speed: PlaybackSpeed;
}

export function renderBattleScreen(stage: HTMLElement, screen: BattleScreenState, handlers: BattleScreenHandlers): void {
  const { view } = screen;
  stage.replaceChildren();
  const root = element('div', 'battle');

  const field = element('div', 'field');
  for (const posIdx of [0, 1, 2, 3]) {
    const plate = view.plates.find((candidate) => candidate.posIdx === posIdx);
    field.append(plate === undefined ? element('div', 'plate plate-empty', '（空きマス）') : renderPlate(plate));
  }
  root.append(field);

  root.append(renderTimeline(view.timeline));

  const status = element('div', 'status num');
  status.append(element('span', 'status-step', `ステップ ${view.step}`));
  status.append(element('span', 'status-pause', pauseReasonText(view)));
  root.append(status);

  const dock = element('div', 'dock');
  for (const card of view.cards) {
    dock.append(renderCard(card, card.instanceId === screen.selectedInstanceId, handlers));
  }
  root.append(dock);

  const preview = element('div', 'preview', view.preview === null ? '' : previewText(view.preview));
  root.append(preview);

  const controls = element('div', 'controls');
  for (const speed of SPEEDS) {
    const speedButton = buttonElement(`speed${speed === screen.speed ? ' speed-on' : ''}`, speed);
    speedButton.addEventListener('click', () => handlers.onSpeed(speed));
    controls.append(speedButton);
  }
  const resume = buttonElement('resume', '進行');
  resume.addEventListener('click', () => handlers.onResume());
  controls.append(resume);
  root.append(controls);

  root.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    handlers.onCancel(); // 右クリックは取り消し・1階層の遡行
  });
  stage.append(root);

  // [M-UI-SCROLL] フォーカス時の中央自動スクロール補正。
  if (screen.selectedInstanceId !== null) {
    const selected = dock.querySelector(`[data-instance-id="${screen.selectedInstanceId}"]`);
    selected?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
