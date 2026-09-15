// [M-UI-SCREENS]「バトル」画面の描画。入力はマウスのみ（[M-UI-VIEWPORT]）。
// 左クリックは選択および確定、右クリックは取り消し、ホイールはアクション一覧の縦スクロール（[M-UI-SCROLL]）。
// 配置は 予兆線（上段）／戦域・行動統合盤（中段）／判定プレビューと再生操作（下段）の3段構成とする。

import { SYSTEM_ICON_GLYPH, type SystemIcon } from '../assets/placeholder.js';
import type { PlaybackSpeed } from '../config.js';
import { INFINITY_MARK, STEP_ARROW, SYMBOL } from '../format.js';
import type { ActionCardView, BattleView, BoardColumnView, PlateView, WatchToggleView } from '../view/battle-view.js';
import type { ActionPreview } from '../view/preview.js';
import type { WatchKind } from '../../engine/types.js';
import type { Timeline, TimelineSegment } from '../../engine/timeline.js';

export interface BattleScreenHandlers {
  readonly onSelect: (instanceId: string) => void;
  readonly onInstruct: (instanceId: string) => void;
  readonly onCancel: () => void;
  readonly onToggleWatch: (instanceId: string, kind: WatchKind) => void;
  readonly onResume: () => void;
  readonly onSpeed: (speed: PlaybackSpeed) => void;
  readonly onUndo: () => void;
  readonly onRollbackBattle: () => void;
  readonly onOpenConfig: () => void;
  readonly onOpenDictionary: () => void;
}

// 再生速度（[M-UI-PLAYBACK]）。
const SPEED_GLYPH: Readonly<Record<PlaybackSpeed, string>> = { PAUSE: '❙❙', X1: '▷', X2: '▷▷', X3: '▷▷▷' };
const SPEEDS: readonly PlaybackSpeed[] = ['PAUSE', 'X1', 'X2', 'X3'];
const POS_LABEL: Readonly<Record<number, string>> = { 0: '自後', 1: '自前', 2: '敵前', 3: '敵後' };
const SYSTEM_CLASS: Readonly<Record<SystemIcon, string>> = {
  MIND: 'mind',
  MARTIAL: 'martial',
  STANCE: 'stance',
  SUMMON: 'summon',
  SWAP: 'swap',
};

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

// 記号と値の組（`記号 値`）。値は等幅数字で描く。
function valueSpan(className: string, label: string, value: string): HTMLElement {
  const node = element('span', className);
  node.append(document.createTextNode(`${label} `));
  node.append(element('b', 'num', value));
  return node;
}

// ── 上段：未来予測タイムライン（[M-UI-TIMELINE]） ──

function segmentLabel(segment: TimelineSegment): string {
  if (segment.kind === 'THOUGHT') {
    if (segment.elapsedAtStart > 0) {
      return `${SYMBOL.stepThought} ${segment.elapsedAtStart}+`;
    }
    return segment.length <= 2 ? `${SYMBOL.stepThought}復帰` : `${SYMBOL.stepThought} 0→${segment.length}`;
  }
  const required = segment.required ?? 0;
  const symbol = segment.kind === 'STARTUP' ? SYMBOL.stepStartup : SYMBOL.stepRecovery;
  const rest = Math.max(required - segment.elapsedAtStart, 0);
  return segment.elapsedAtStart > 0
    ? `${symbol} ${segment.elapsedAtStart}/${required}（${SYMBOL.remaining}${rest}）`
    : `${symbol} 0/${required}`;
}

function renderRuler(timeline: Timeline): HTMLElement {
  const ruler = element('div', 'ruler num');
  ruler.style.gridTemplateColumns = `repeat(${timeline.span}, 1fr)`;
  const interval = timeline.span > 40 ? 5 : timeline.span > 22 ? 2 : 1;
  for (let offset = 0; offset < timeline.span; offset += 1) {
    const step = timeline.start + offset;
    const cell = element('span', offset === 0 ? 'now' : '');
    cell.textContent = offset === 0 || offset === timeline.span - 1 || step % interval === 0 ? String(step) : '·';
    ruler.append(cell);
  }
  return ruler;
}

function renderTimeline(timeline: Timeline, columns: readonly BoardColumnView[]): HTMLElement {
  const box = element('div', 'timeline');
  const lanes = element('div', 'lanes');

  const labels = element('div', 'lane-labels');
  labels.append(element('div', 'hd', 'ユニット'));
  const grid = element('div', 'grid');
  grid.append(renderRuler(timeline));

  for (const column of columns) {
    const plate = column.plate;
    const side = plate === null ? 'empty' : plate.side.toLowerCase();
    const label = element('div', `lane-label lane-label-${side}`);
    label.append(element('span', 'lane-dot'));
    label.append(document.createTextNode(plate === null ? '（空き枠）' : plate.name));
    labels.append(label);

    const lane = element('div', `lane lane-${side}`);
    const laneData = timeline.lanes.find((candidate) => candidate.posIdx === column.posIdx);
    for (const segment of laneData?.segments ?? []) {
      // 表示枠の末尾で切り詰めた区間は、右端を破線で示す（思考中区間は終端を持たないため常に切り詰め）。
      const overflow =
        segment.start + segment.length >= timeline.start + timeline.span &&
        (segment.required === null || segment.elapsedAtStart + segment.length < segment.required);
      const seg = element('div', `seg seg-${segment.kind.toLowerCase()}${overflow ? ' overflow-right' : ''}`, segmentLabel(segment));
      seg.style.left = `${((segment.start - timeline.start) * 100) / timeline.span}%`;
      seg.style.width = `${(segment.length * 100) / timeline.span}%`;
      lane.append(seg);
    }
    grid.append(lane);
  }

  grid.append(element('div', 'nowline'));
  lanes.append(labels);
  lanes.append(grid);
  box.append(lanes);
  return box;
}

// ── 中段：ユニットプレートと実行中カード（[M-UI-HUD]） ──

const CHIP_CLASS: Readonly<Record<'SLIP' | 'BUFF' | 'DEBUFF', string>> = { SLIP: 'slip', BUFF: 'up', DEBUFF: 'down' };

function renderPlate(plate: PlateView): HTMLElement {
  const box = element('div', 'plate');
  box.dataset.unitId = plate.unitId;
  const name = element('div', 'pname');
  name.append(element('b', '', plate.name));
  name.append(element('span', `role-tag${plate.side === 'FOE' ? ' foe' : ''}`, plate.roleName ?? POS_LABEL[plate.posIdx] ?? ''));
  name.append(element('span', 'hp num', `${SYMBOL.hp} ${plate.hp}`));
  box.append(name);

  const info = element('div', 'pinfo');
  const chips = element('div', 'chips');
  for (const chip of plate.chips) {
    chips.append(element('span', `chip ${CHIP_CLASS[chip.kind]} num`, `${chip.label} ${chip.sign}${chip.value}`));
  }
  info.append(chips);
  const res = element('div', 'res num');
  res.append(valueSpan('vp', SYMBOL.vp, String(plate.vp)));
  res.append(valueSpan('pp', SYMBOL.pp, String(plate.pp)));
  res.append(valueSpan('ap', SYMBOL.ap, String(plate.ap)));
  info.append(res);
  box.append(info);
  return box;
}

function renderThinkSlot(plate: PlateView): HTMLElement {
  const think = element('div', 'think-slot');
  const state = element('span', 'state-lbl');
  state.append(document.createTextNode(`${SYMBOL.stepThought}考中（蓄積 `));
  state.append(element('b', 'num', String(plate.thought)));
  state.append(document.createTextNode('）'));
  think.append(state);
  think.append(element('span', 'def-val num', `${SYMBOL.defense} ${plate.defense}`));
  return think;
}

// ［実行中カード］実行中アクションの表示名・現在ステート・経過／残ステップ数・実効攻撃力・実効防御力。
function renderDockSlot(plate: PlateView | null): HTMLElement {
  const dock = element('div', 'dock-slot');
  if (plate === null) {
    dock.append(element('div', 'think-slot', 'ユニット不在'));
    return dock;
  }
  const running = plate.running;
  if (running === null) {
    dock.append(renderThinkSlot(plate));
    return dock;
  }
  const card = element('div', `acting-card-dock phase-${running.phase.toLowerCase()}`);
  const gauge = element('div', 'gauge-bar-bg');
  const fill = element('i', '');
  fill.style.width = `${running.required === 0 ? 0 : Math.min((running.elapsed * 100) / running.required, 100)}%`;
  gauge.append(fill);
  card.append(gauge);
  const main = element('div', 'dock-inline-main');
  main.append(element('span', 'phase-tag', running.stateLabel));
  main.append(element('span', 'dock-nm', running.name));
  card.append(main);
  const right = element('div', 'dock-inline-right num');
  right.append(valueSpan('', SYMBOL.remaining, String(Math.max(running.required - running.elapsed, 0))));
  right.append(valueSpan('atk-val', SYMBOL.atk, String(running.atk)));
  right.append(valueSpan('def-val', SYMBOL.defense, String(running.defense)));
  card.append(right);
  dock.append(card);
  return dock;
}

// ── 中段：アクションカード（[M-UI-SORT]・[M-UI-WATCH]） ──

function renderWatchToggle(card: ActionCardView, toggle: WatchToggleView, handlers: BattleScreenHandlers): HTMLElement {
  const node = buttonElement(`watch-toggle watch-${toggle.status.toLowerCase()}${toggle.on ? ' watching' : ''}`, toggle.symbol);
  node.title = `${toggle.symbol}：${toggle.on ? '監視ON' : '監視OFF'} / ${toggle.status}`;
  node.addEventListener('click', (event) => {
    event.stopPropagation(); // ドラッグを用いず、カード上の5要素を直接クリックして切り替える（[M-UI-VIEWPORT]）
    handlers.onToggleWatch(card.instanceId, toggle.kind);
  });
  return node;
}

function renderCardHead(card: ActionCardView): HTMLElement {
  const head = element('div', 'action-header');
  const sys = element('span', 'sys');
  sys.append(
    element('b', card.icon === null ? '' : `on ${SYSTEM_CLASS[card.icon]}`, card.icon === null ? '·' : SYSTEM_ICON_GLYPH[card.icon]),
  );
  head.append(sys);
  head.append(element('span', 'nm', card.name));
  if (card.running) {
    head.append(element('span', 'tagline now', '実行中'));
  }
  if (card.isCopy) {
    head.append(element('span', 'tagline copy', '写し'));
  }
  if (card.sealed) {
    head.append(element('span', 'tagline seal', '封印'));
  }
  head.append(valueSpan(`uses${card.uses === INFINITY_MARK ? ' inf' : ''}`, SYMBOL.remaining, card.uses));
  return head;
}

function renderCardMetrics(card: ActionCardView): HTMLElement {
  const metrics = element('div', 'action-metrics num');
  const flow = element('span', 'st-flow');
  flow.append(valueSpan(card.rank <= 1 ? 'ok' : '', SYMBOL.stepThought, String(card.stepThought)));
  flow.append(element('i', 'arrow', STEP_ARROW));
  flow.append(valueSpan('', SYMBOL.stepStartup, String(card.stepStartup)));
  flow.append(element('i', 'arrow', STEP_ARROW));
  flow.append(valueSpan('', SYMBOL.stepRecovery, String(card.stepRecovery)));
  metrics.append(flow);
  for (const cost of card.costs) {
    metrics.append(element('span', `cst cst-${cost.label.toLowerCase()}`, `${cost.label} ${cost.value}`));
  }
  if (card.range !== null) {
    metrics.append(element('span', 'rng', `${SYMBOL.range} ${card.range}`));
  }
  if (card.atk !== null) {
    metrics.append(element('span', 'atk-val', `${SYMBOL.atk} ${card.atk}`));
  }
  if (card.seal !== null) {
    metrics.append(element('span', 'seal-val', `封 ${card.seal}`));
  }
  return metrics;
}

function renderCard(card: ActionCardView, selected: boolean, handlers: BattleScreenHandlers): HTMLElement {
  const dim = card.rank >= 2 || card.sealed;
  const classes = ['action-card', `card-rank${card.rank}`];
  if (selected) {
    classes.push('sel');
  }
  if (card.running) {
    classes.push('in-use');
  }
  if (dim) {
    classes.push('dim');
  }
  if (card.sealed) {
    classes.push('sealed');
  }
  const box = element('div', classes.join(' '));
  box.dataset.instanceId = card.instanceId;

  // 思考蓄積の充足率を背景で示す（発動を待つ自軍アクションに限る）。
  if (card.side === 'MINE' && !card.running && !card.sealed && card.rank <= 1) {
    const progress = element('div', `thought-progress-bg${card.thoughtProgress >= 100 ? ' full' : ''}`);
    progress.style.width = `${card.thoughtProgress}%`;
    box.append(progress);
  }

  box.append(renderCardHead(card));
  box.append(renderCardMetrics(card));

  if (card.watch.length > 0) {
    const watch = element('div', 'watch');
    for (const toggle of card.watch) {
      watch.append(renderWatchToggle(card, toggle, handlers));
    }
    box.append(watch);
  }

  box.addEventListener('click', () => {
    if (selected && card.executable) {
      handlers.onInstruct(card.instanceId); // 左クリックは選択および確定
      return;
    }
    handlers.onSelect(card.instanceId);
  });
  return box;
}

function renderColumn(column: BoardColumnView, selectedInstanceId: string | null, handlers: BattleScreenHandlers): HTMLElement {
  const plate = column.plate;
  const side = plate === null ? 'empty' : plate.side.toLowerCase();
  const box = element('div', `bcol bcol-${side}${plate?.isMaster === true ? ' master' : ''}`);

  const cell = element('div', 'cell');
  const figure = element('div', 'figure');
  figure.append(element('div', 'head'));
  figure.append(element('div', 'body'));
  cell.append(figure);
  cell.append(element('div', 'ground'));
  cell.append(plate === null ? element('div', 'plate plate-empty', '（空きマス）') : renderPlate(plate));
  box.append(cell);

  box.append(renderDockSlot(plate));

  const list = element('div', 'blist');
  if (column.cards.length === 0) {
    list.append(element('div', 'blist-empty', plate === null ? '' : '（アクションなし）'));
  }
  for (const card of column.cards) {
    list.append(renderCard(card, card.instanceId === selectedInstanceId, handlers));
  }
  box.append(list);
  return box;
}

// ── 下段：判定プレビューと再生操作 ──

interface PreviewRow {
  readonly key: string;
  readonly value: string;
  readonly tone?: 'hit' | 'no' | 'stop';
}

interface PreviewGroup {
  readonly cap: string;
  readonly rows: readonly PreviewRow[];
}

function previewGroups(preview: ActionPreview): PreviewGroup[] {
  switch (preview.kind) {
    case 'INTERRUPT':
      return [{ cap: '中断の見込み', rows: [{ key: '成立まで', value: `${SYMBOL.remaining}${preview.steps}`, tone: 'stop' }] }];
    case 'MARTIAL':
      return preview.targets.map((target) => ({
        cap: POS_LABEL[target.posIdx] ?? '',
        rows: target.hit
          ? [
              { key: '判定', value: '命中', tone: 'hit' as const },
              { key: SYMBOL.hp, value: `−${target.damage ?? 0}`, tone: 'hit' as const },
            ]
          : [{ key: '判定', value: '回避', tone: 'no' as const }],
      }));
    case 'MARTIAL_NO_TARGET':
      return [{ cap: '武技', rows: [{ key: '対象', value: '射程内に不在', tone: 'no' }] }];
    case 'STANCE':
      return [
        {
          cap: '体勢',
          rows: [
            { key: '展開AP', value: String(preview.deployAp) },
            { key: `発動後${SYMBOL.defense}`, value: String(preview.defenseAfter), tone: 'hit' },
          ],
        },
      ];
    case 'MIND':
      return [
        {
          cap: '心気',
          rows: [
            { key: '加算VP', value: String(preview.gainVp) },
            { key: '充填後PP', value: String(preview.targetPp), tone: preview.raises ? 'hit' : 'no' },
          ],
        },
      ];
    case 'SWAP':
      return [{ cap: '隊列交代', rows: [{ key: '交代後', value: POS_LABEL[preview.posIdxAfter] ?? '' }] }];
    case 'SUMMON':
      return [{ cap: '召喚', rows: [{ key: '配置', value: preview.creatureId }] }];
    default:
      return [];
  }
}

function renderInspector(view: BattleView): HTMLElement {
  const strip = element('div', 'inspstrip');
  const box = element('div', 'ibox');
  const title = element('div', 'ttl');
  title.append(document.createTextNode('判定プレビュー'));
  title.append(element('b', 'num', `ステップ ${view.step}`));
  box.append(title);
  const prev = element('div', 'prev');
  for (const group of view.preview === null ? [] : previewGroups(view.preview)) {
    const pg = element('div', 'pg');
    pg.append(element('div', 'cap', group.cap));
    for (const row of group.rows) {
      const line = element('div', `row num${row.tone === undefined ? '' : ` ${row.tone}`}`);
      line.append(element('span', 'k', row.key));
      line.append(element('span', 'v', row.value));
      pg.append(line);
    }
    prev.append(pg);
  }
  box.append(prev);
  strip.append(box);
  return strip;
}

function renderTimebar(screen: BattleScreenState, handlers: BattleScreenHandlers): HTMLElement {
  const bar = element('div', 'timebar');

  const top = element('div', 'timebar-row-top');
  const transport = element('div', 'transport');
  for (const speed of SPEEDS) {
    const node = buttonElement(speed === screen.speed ? 'on' : '', SPEED_GLYPH[speed]);
    node.title = `再生速度 ${speed}`;
    node.addEventListener('click', () => handlers.onSpeed(speed));
    transport.append(node);
  }
  const stepOnce = buttonElement('step-once', '1ステップ進める');
  stepOnce.addEventListener('click', () => handlers.onResume());
  transport.append(stepOnce);
  top.append(transport);

  // [M-DATA-PAUSE-REASON] 自動時間停止の事由。停止していないときは行そのものを描画しない。
  if (screen.pauseText !== '') {
    const why = element('div', 'why');
    why.setAttribute('role', 'status');
    why.append(element('span', 'dot'));
    why.append(element('span', 't', screen.pauseText));
    top.append(why);
  }
  bar.append(top);

  const bottom = element('div', 'timebar-row-bottom');
  const buttons: readonly { readonly className: string; readonly label: string; readonly onClick: () => void }[] = [
    { className: 'rbtn btn-undo', label: '⟲ 取消', onClick: handlers.onUndo },
    { className: 'rbtn', label: '再走（戦闘初期状態）', onClick: handlers.onRollbackBattle },
    { className: 'rbtn util', label: '辞典', onClick: handlers.onOpenDictionary },
    { className: 'rbtn util', label: '設定', onClick: handlers.onOpenConfig },
  ];
  for (const entry of buttons) {
    const node = buttonElement(entry.className, entry.label);
    node.addEventListener('click', () => entry.onClick());
    bottom.append(node);
  }
  bar.append(bottom);
  return bar;
}

export interface BattleScreenState {
  readonly view: BattleView;
  // [M-DATA-PAUSE-REASON] 解決済みの事由文言（文言マスタ由来）。停止していないときは空文字。
  readonly pauseText: string;
  readonly selectedInstanceId: string | null;
  readonly speed: PlaybackSpeed;
}

export function renderBattleScreen(stage: HTMLElement, screen: BattleScreenState, handlers: BattleScreenHandlers): void {
  const { view } = screen;
  stage.replaceChildren();
  const root = element('div', 'battle');

  root.append(renderTimeline(view.timeline, view.columns));

  const boardWrap = element('div', 'battle-board-wrap');
  const background = element('div', 'field-bg');
  background.append(element('div', 'ash'));
  background.append(element('div', 'horizon'));
  background.append(element('div', 'border-mark'));
  boardWrap.append(background);
  const board = element('div', 'board');
  for (const column of view.columns) {
    board.append(renderColumn(column, screen.selectedInstanceId, handlers));
  }
  boardWrap.append(board);
  root.append(boardWrap);

  const footer = element('div', 'footer-strip');
  footer.append(renderInspector(view));
  footer.append(renderTimebar(screen, handlers));
  root.append(footer);

  root.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    handlers.onCancel(); // 右クリックは取り消し・1階層の遡行
  });
  stage.append(root);

  // [M-UI-SCROLL] フォーカス時の中央自動スクロール補正。
  if (screen.selectedInstanceId !== null) {
    const selected = board.querySelector(`[data-instance-id="${screen.selectedInstanceId}"]`);
    selected?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
