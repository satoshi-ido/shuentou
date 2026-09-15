// [M-UI-SCREENS]「バトル」画面の描画。入力はマウスのみ（[M-UI-VIEWPORT]）。
// 左クリックは選択および確定、右クリックは取り消し、ホイールはアクション一覧の縦スクロール（[M-UI-SCROLL]）。
// 配置は 予兆線（上段）／戦域・行動統合盤（中段）／判定プレビューと再生操作（下段）の3段構成とする。

import { SYSTEM_ICON_GLYPH, type SystemIcon } from '../assets/placeholder.js';
import type { PlaybackSpeed } from '../config.js';
import { INFINITY_MARK, STEP_ARROW, SYMBOL } from '../format.js';
import type {
  ActionCardView,
  BattleView,
  BoardColumnView,
  FocusPreview,
  ForecastStamp,
  PlateDelta,
  PlateView,
  WatchToggleView,
} from '../view/battle-view.js';
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
  // 注目したアクション（ホバー）。再描画をまたいで提示を保つために記録する。
  readonly onFocus: (instanceId: string | null) => void;
  readonly onUndo: () => void;
  readonly onRollbackBattle: () => void;
  readonly onOpenRollback: () => void;
  readonly onQuitBattle: () => void;
  readonly onOpenConfig: () => void;
  readonly onOpenDictionary: () => void;
}

// [M-META-COUNTERS]・[M-META-PENDING] 因果再走の累積回数と、巻き戻し保留の有無。
export interface RewindIndicator {
  readonly count: number;
  readonly pending: boolean;
  readonly pendingText: string; // 保留中に示す文言（文言マスタ由来）。保留がなければ空文字。
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

// 再生中は毎フレーム画面を組み直すため、押下と解放の間に要素が入れ替わると click が成立しない。
// バトル画面の操作はいずれも左ボタンの押下時点で受け取る。
function onPrimary(node: HTMLElement, handler: () => void): void {
  node.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    handler();
  });
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

// 表示枠の幅は目盛の反復回数そのものであるため、描画側でも整数・正数へ丸めて用いる
// （[M-UI-TIMELINE] の SPAN は 20〜60 にクランプされるが、描画は与えられた値を信用しない）。
const SPAN_DRAW_MIN = 1;
const SPAN_DRAW_MAX = 240;

function drawSpan(span: number): number {
  const truncated = Math.trunc(span);
  return Number.isFinite(truncated) ? Math.min(Math.max(truncated, SPAN_DRAW_MIN), SPAN_DRAW_MAX) : SPAN_DRAW_MIN;
}

function renderRuler(start: number, span: number): HTMLElement {
  const ruler = element('div', 'ruler num');
  ruler.style.gridTemplateColumns = `repeat(${span}, 1fr)`;
  const interval = span > 40 ? 5 : span > 22 ? 2 : 1;
  for (let offset = 0; offset < span; offset += 1) {
    const step = start + offset;
    const cell = element('span', offset === 0 ? 'now' : '');
    cell.textContent = offset === 0 || offset === span - 1 || step % interval === 0 ? String(step) : '·';
    ruler.append(cell);
  }
  return ruler;
}

function renderTimeline(timeline: Timeline, columns: readonly BoardColumnView[]): HTMLElement {
  const box = element('div', 'timeline');
  const lanes = element('div', 'lanes');

  const span = drawSpan(timeline.span);
  const labels = element('div', 'lane-labels');
  labels.append(element('div', 'hd', 'ユニット'));
  const grid = element('div', 'grid');
  grid.append(renderRuler(timeline.start, span));

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
        segment.start + segment.length >= timeline.start + span &&
        (segment.required === null || segment.elapsedAtStart + segment.length < segment.required);
      const seg = element('div', `seg seg-${segment.kind.toLowerCase()}${overflow ? ' overflow-right' : ''}`, segmentLabel(segment));
      seg.style.left = `${((segment.start - timeline.start) * 100) / span}%`;
      seg.style.width = `${(segment.length * 100) / span}%`;
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

// ［判定プレビュー］見込み値を持つ項目は `現在 → 見込み` の形に差し替える。
function previewValue(className: string, label: string, current: number, after: number | null, tone: string): HTMLElement {
  const node = element('span', className);
  node.append(document.createTextNode(`${label} `));
  if (after === null) {
    node.append(element('b', 'num', String(current)));
    return node;
  }
  node.append(element('span', 'num was', String(current)));
  node.append(element('span', 'arrow', '→'));
  node.append(element('b', `num chg ${tone}`, String(after)));
  return node;
}

function renderPlate(plate: PlateView, delta: PlateDelta | null): HTMLElement {
  const box = element('div', 'plate');
  box.dataset.unitId = plate.unitId;
  const tone = delta?.tone === 'DAMAGE' ? 'chg-damage' : 'chg-self';
  const name = element('div', 'pname');
  name.append(element('b', '', plate.name));
  name.append(element('span', `role-tag${plate.side === 'FOE' ? ' foe' : ''}`, plate.roleName ?? POS_LABEL[plate.posIdx] ?? ''));
  const hp = element('span', 'hp num');
  if (delta?.hp === null || delta?.hp === undefined) {
    hp.textContent = `${SYMBOL.hp} ${plate.hp}`;
  } else {
    hp.append(document.createTextNode(`${SYMBOL.hp} ${plate.hpValue} `));
    hp.append(element('span', 'arrow', '→'));
    hp.append(element('b', `chg ${tone}`, ` ${delta.hp}`));
  }
  name.append(hp);
  box.append(name);

  const info = element('div', 'pinfo');
  const chips = element('div', 'chips');
  for (const chip of plate.chips) {
    chips.append(element('span', `chip ${CHIP_CLASS[chip.kind]} num`, `${chip.label} ${chip.sign}${chip.value}`));
  }
  info.append(chips);
  const res = element('div', 'res num');
  res.append(previewValue('vp', SYMBOL.vp, plate.vp, delta?.vp ?? null, tone));
  res.append(previewValue('pp', SYMBOL.pp, plate.pp, delta?.pp ?? null, tone));
  res.append(previewValue('ap', SYMBOL.ap, plate.ap, delta?.ap ?? null, tone));
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
function dockContent(plate: PlateView | null): HTMLElement {
  if (plate === null) {
    return element('div', 'think-slot', 'ユニット不在');
  }
  const running = plate.running;
  if (running === null) {
    return renderThinkSlot(plate);
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
  return card;
}

// 注目中（ホバーまたは選択中）のアクションを実行した場合の姿を、実行中カードの位置に仮に示す。
function dockPreviewContent(plate: PlateView, card: ActionCardView, preview: ActionPreview | null): HTMLElement {
  const startup = card.stepStartup > 0;
  const cut = preview !== null && preview.kind === 'INTERRUPT';
  const box = element('div', `acting-card-dock preview phase-${startup ? 'startup' : 'recovery'}${cut ? ' cut' : ''}`);
  const main = element('div', 'dock-inline-main');
  main.append(element('span', 'phase-tag', cut ? '中断' : startup ? '発生' : '硬直'));
  main.append(element('span', 'dock-nm', card.name));
  box.append(main);
  const right = element('div', 'dock-inline-right num');
  right.append(
    cut && preview !== null && preview.kind === 'INTERRUPT'
      ? valueSpan('', SYMBOL.remaining, String(preview.steps))
      : valueSpan('', SYMBOL.remaining, String(startup ? card.stepStartup : card.stepRecovery)),
  );
  if (card.atk !== null) {
    right.append(valueSpan('atk-val', SYMBOL.atk, String(card.atk)));
  }
  right.append(valueSpan('def-val', SYMBOL.defense, String(plate.defense)));
  box.append(right);
  return box;
}

// ［判定プレビュー］戦域の対象マスへ重ねる着弾の見込み。
// 自軍のアクションは命中・回避を、敵軍のアクションは被弾・回避として示す。
function stampNode(stamp: ForecastStamp): HTMLElement {
  const incoming = stamp.side === 'FOE';
  const box = element('div', `stamp${incoming ? ' stamp-foe' : ''}${stamp.kind === 'HIT' ? '' : ' stamp-no'}`);
  if (stamp.kind === 'INTERRUPT') {
    box.append(element('div', 's', '中断'));
    box.append(element('div', 'n', '不発'));
    box.append(element('div', 'sub num', `ステップ ${stamp.fireStep} に中断（〈${stamp.actionName}〉）`));
    return box;
  }
  if (stamp.kind === 'MISS') {
    box.append(element('div', 's', '回避'));
    box.append(element('div', 'n', incoming ? '無傷' : '防衛'));
    box.append(element('div', 'sub num', `${SYMBOL.atk} ${stamp.atk} ＜ ${SYMBOL.defense} ${stamp.defense}`));
    return box;
  }
  box.append(element('div', 's', incoming ? '被弾' : stamp.running ? '命中（発生中）' : '命中'));
  box.append(element('div', 'n num', String(stamp.damage)));
  box.append(
    element('div', 'sub num', `ステップ ${stamp.fireStep} 発動（${SYMBOL.hp} ${stamp.hpBefore} → ${stamp.hpAfter}）`),
  );
  return box;
}

// ── 中段：アクションカード（[M-UI-SORT]・[M-UI-WATCH]） ──

function renderWatchToggle(card: ActionCardView, toggle: WatchToggleView, handlers: BattleScreenHandlers): HTMLElement {
  const node = buttonElement(`watch-toggle watch-${toggle.status.toLowerCase()}${toggle.on ? ' watching' : ''}`, toggle.symbol);
  node.title = `${toggle.symbol}：${toggle.on ? '監視ON' : '監視OFF'} / ${toggle.status}`;
  node.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
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

function renderCard(card: ActionCardView, selected: boolean, handlers: BattleScreenHandlers, focus: CardFocus): HTMLElement {
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

  // ［判定プレビュー］実行できないアクション（コスト不足・思考蓄積待ち・封印・敵軍の手札）は
  // 選択も注目もできない。提示するのは実行可能な自軍アクションと実行中アクションに限る。
  if (!card.previewable) {
    box.classList.add('inert');
    return box;
  }
  // [M-UI-VIEWPORT] ホバーが判定プレビューを担い、左クリックが選択および確定を担う。
  // 実行可能なアクションは1回のクリックで実行を開始する（時間が進んでいる間も同じ）。
  onPrimary(box, () => {
    if (card.executable) {
      handlers.onInstruct(card.instanceId);
      return;
    }
    handlers.onSelect(card.instanceId); // 実行中カードなど確定できないものは選択のみ
  });
  // ホバーは注目のみを移し、判定プレビューと実行中カードの位置を当該アクションの見込みへ切り替える。
  // 注目はカーソルが離れても解けず、次の注目または確定まで提示を保つ（ステップ進行で消えない）。
  box.addEventListener('mouseenter', () => focus.enter(card));
  return box;
}

// 注目（ホバー）の移動。選択・確定とは独立に、提示だけを切り替える。
interface CardFocus {
  readonly enter: (card: ActionCardView) => void;
}

interface ColumnNodes {
  readonly root: HTMLElement;
  readonly dock: HTMLElement;
  readonly stamps: HTMLElement; // 戦域のマスへ重ねる着弾予測の器
  readonly plate: HTMLElement | null; // 見込み値の反映で差し替えるユニットプレート
}

function renderColumn(
  column: BoardColumnView,
  selectedInstanceId: string | null,
  handlers: BattleScreenHandlers,
  focus: CardFocus,
): ColumnNodes {
  const plate = column.plate;
  const side = plate === null ? 'empty' : plate.side.toLowerCase();
  const box = element('div', `bcol bcol-${side}${plate?.isMaster === true ? ' master' : ''}`);

  const cell = element('div', 'cell');
  const stamps = element('div', 'stamps');
  cell.append(stamps);
  const figure = element('div', 'figure');
  figure.append(element('div', 'head'));
  figure.append(element('div', 'body'));
  cell.append(figure);
  cell.append(element('div', 'ground'));
  const plateNode = plate === null ? element('div', 'plate plate-empty', '（空きマス）') : renderPlate(plate, null);
  cell.append(plateNode);
  box.append(cell);

  const dock = element('div', 'dock-slot');
  dock.append(dockContent(plate));
  box.append(dock);

  const list = element('div', 'blist');
  if (column.cards.length === 0) {
    list.append(element('div', 'blist-empty', plate === null ? '' : '（アクションなし）'));
  }
  for (const card of column.cards) {
    list.append(renderCard(card, card.instanceId === selectedInstanceId, handlers, focus));
  }
  box.append(list);
  return { root: box, dock, stamps, plate: plate === null ? null : plateNode };
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

interface Inspector {
  readonly root: HTMLElement;
  readonly name: HTMLElement; // 注目中のアクション名
  readonly prev: HTMLElement; // 判定プレビューの本体（注目の移動に応じて描き替える）
}

function renderInspector(view: BattleView): Inspector {
  const strip = element('div', 'inspstrip');
  const box = element('div', 'ibox');
  const title = element('div', 'ttl');
  title.append(document.createTextNode('判定プレビュー'));
  const name = element('b', '');
  title.append(name);
  title.append(element('span', 'ttl-step num', `ステップ ${view.step}`));
  box.append(title);
  const prev = element('div', 'prev');
  box.append(prev);
  strip.append(box);
  return { root: strip, name, prev };
}

function fillPreview(prev: HTMLElement, preview: ActionPreview | null): void {
  prev.replaceChildren();
  for (const group of preview === null ? [] : previewGroups(preview)) {
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
}

// [M-META-COUNTERS] 終焉燈による因果再走の累積回数。巻き戻し保留が立っている間はその旨を併せて示す。
function renderRewindCore(rewind: RewindIndicator): HTMLElement {
  const core = element('div', `rewind-core${rewind.pending ? ' pending' : ''}`);
  core.title = rewind.pendingText === '' ? '因果再走の累積回数' : rewind.pendingText;
  core.append(element('span', 'lamp', '🜂'));
  core.append(element('b', 'rewind-count num', String(rewind.count)));
  return core;
}

function renderTimebar(screen: BattleScreenState, handlers: BattleScreenHandlers): HTMLElement {
  const bar = element('div', 'timebar');

  const top = element('div', 'timebar-row-top');
  const transport = element('div', 'transport');
  // 自動時間停止中は、設定した速度ではなく停止していることを点灯で示す（[M-UI-PLAYBACK]）。
  const lit: PlaybackSpeed = screen.stopped ? 'PAUSE' : screen.speed;
  const undo = buttonElement('btn-undo', '⟲ 取消');
  undo.title = '直前の指示を取り消す';
  onPrimary(undo, () => handlers.onUndo());
  transport.append(undo);
  for (const speed of SPEEDS) {
    const node = buttonElement(speed === lit ? 'on' : '', SPEED_GLYPH[speed]);
    node.title = `再生速度 ${speed}`;
    onPrimary(node, () => handlers.onSpeed(speed));
    transport.append(node);
  }
  const stepOnce = buttonElement('step-once', '1歩進める');
  stepOnce.title = '1ステップだけ進める';
  onPrimary(stepOnce, () => handlers.onResume());
  transport.append(stepOnce);
  top.append(transport);
  top.append(element('span', 'spacer'));
  top.append(renderRewindCore(screen.rewind));
  bar.append(top);

  // [M-DATA-PAUSE-REASON] 自動時間停止の事由。停止していない間も行の高さは保ち、
  // 停止の成立で盤面の表示枠が縮まないようにする（固定レイアウト・[M-UI-VIEWPORT]）。
  const message = screen.pauseText !== '' ? screen.pauseText : screen.noticeText;
  const whyClass = message === '' ? 'why why-idle' : screen.pauseText !== '' ? 'why' : 'why why-notice';
  const why = element('div', whyClass);
  why.setAttribute('role', 'status');
  why.append(element('span', 'dot'));
  why.append(element('span', 't', message));
  bar.append(why);

  const bottom = element('div', 'timebar-row-bottom');
  const buttons: readonly { readonly className: string; readonly label: string; readonly title: string; readonly onClick: () => void }[] = [
    // [M-META-SAVEDATA]［バトル中の保存を行わない］中断は直近のバトル開始時セーブからの再開とする。
    { className: 'rbtn util', label: '⏸ 中断', title: '戦闘を中断してタイトルへ戻る', onClick: handlers.onQuitBattle },
    { className: 'rbtn util', label: '辞典', title: '辞典を開く', onClick: handlers.onOpenDictionary },
    { className: 'rbtn util', label: '設定', title: '表示・音響設定を開く', onClick: handlers.onOpenConfig },
    { className: 'rbtn', label: '再走（戦闘初期状態）', title: 'ステップ0へ巻き戻す', onClick: handlers.onRollbackBattle },
    { className: 'rbtn', label: '再走（編成・継承）', title: '過去のインターミッションへ戻る', onClick: handlers.onOpenRollback },
  ];
  for (const entry of buttons) {
    const node = buttonElement(entry.className, entry.label);
    node.title = entry.title;
    onPrimary(node, () => entry.onClick());
    bottom.append(node);
  }
  bar.append(bottom);
  return bar;
}

export interface BattleScreenState {
  readonly view: BattleView;
  // [M-DATA-PAUSE-REASON] 解決済みの事由文言（文言マスタ由来）。停止していないときは空文字。
  readonly pauseText: string;
  // 一度だけ提示するシステム文言（アンドゥ履歴が空である旨など）。提示がなければ空文字。
  readonly noticeText: string;
  readonly selectedInstanceId: string | null;
  readonly focusedInstanceId: string | null;
  readonly speed: PlaybackSpeed;
  // 自動時間停止により静止しているか（[M-PIPE-PAUSE-TRIGGER]）。再生操作の点灯に用いる。
  readonly stopped: boolean;
  readonly rewind: RewindIndicator;
  // 注目中のアクションに対する提示（判定プレビューと着弾予測）の問い合わせ。
  // ホバーのたびに画面全体を組み直さない。
  readonly focusFor: (instanceId: string) => FocusPreview;
}

export function renderBattleScreen(stage: HTMLElement, screen: BattleScreenState, handlers: BattleScreenHandlers): void {
  const { view } = screen;
  stage.replaceChildren();
  const root = element('div', 'battle');

  root.append(renderTimeline(view.timeline, view.columns));

  const inspector = renderInspector(view);
  const docks: (HTMLElement | null)[] = [null, null, null, null];
  const stampBoxes: (HTMLElement | null)[] = [null, null, null, null];
  const plateNodes: (HTMLElement | null)[] = [null, null, null, null];
  const selectedCard = view.columns.flatMap((column) => column.cards).find((card) => card.instanceId === screen.selectedInstanceId);
  const selectedFocus = selectedCard === undefined ? null : screen.focusFor(selectedCard.instanceId);

  // 戦域の着弾予測：発生中アクションの見込みを常に示し、注目中のアクションがあれば
  // 当該ユニットの分をその仮定で置き換える（1ユニットが同時に持つ実行は1件に限るため）。
  const paintStamps = (focused: { readonly unitId: string; readonly stamps: readonly ForecastStamp[] } | null): void => {
    const stamps = [
      ...view.stamps.filter((stamp) => focused === null || stamp.unitId !== focused.unitId),
      ...(focused?.stamps ?? []),
    ];
    for (const column of view.columns) {
      const box = stampBoxes[column.posIdx];
      if (box === undefined || box === null) {
        continue;
      }
      box.replaceChildren(...stamps.filter((stamp) => stamp.posIdx === column.posIdx).map(stampNode));
    }
  };

  // ユニットプレートへ見込み値（実行側の消費・対象側のHP推移）を映す。
  const paintPlates = (deltas: readonly PlateDelta[]): void => {
    for (const column of view.columns) {
      const current = plateNodes[column.posIdx];
      const plate = column.plate;
      if (current === undefined || current === null || plate === null) {
        continue;
      }
      const next = renderPlate(plate, deltas.find((delta) => delta.unitId === plate.unitId) ?? null);
      current.replaceWith(next);
      plateNodes[column.posIdx] = next;
    }
  };

  // 注目を解いたときの姿：選択中のアクションがあればその見込み、なければ実行中カードそのもの。
  const restore = (): void => {
    inspector.name.textContent = selectedCard === undefined ? '' : selectedCard.name;
    fillPreview(inspector.prev, view.preview);
    for (const column of view.columns) {
      const dock = docks[column.posIdx];
      const plate = column.plate;
      if (dock === undefined || dock === null) {
        continue;
      }
      const previewing = selectedCard !== undefined && plate !== null && plate.running === null && selectedCard.unitId === plate.unitId;
      dock.replaceChildren(previewing && plate !== null ? dockPreviewContent(plate, selectedCard, view.preview) : dockContent(plate));
    }
    paintStamps(selectedCard === undefined || selectedFocus === null ? null : { unitId: selectedCard.unitId, stamps: selectedFocus.stamps });
    paintPlates(view.previewDeltas);
  };

  const focusOn = (column: BoardColumnView, card: ActionCardView, notify: boolean): void => {
    const focus = screen.focusFor(card.instanceId);
    inspector.name.textContent = card.name;
    fillPreview(inspector.prev, focus.preview);
    for (const other of view.columns) {
      const dock = docks[other.posIdx];
      const plate = other.plate;
      if (dock === undefined || dock === null) {
        continue;
      }
      const target = other.posIdx === column.posIdx && plate !== null && plate.running === null;
      dock.replaceChildren(target && plate !== null ? dockPreviewContent(plate, card, focus.preview) : dockContent(plate));
    }
    paintStamps({ unitId: card.unitId, stamps: focus.stamps });
    paintPlates(focus.deltas);
    if (notify) {
      handlers.onFocus(card.instanceId); // 再描画をまたいで注目を保つ（歩進で提示が消えない）
    }
  };

  const boardWrap = element('div', 'battle-board-wrap');
  const background = element('div', 'field-bg');
  background.append(element('div', 'ash'));
  background.append(element('div', 'horizon'));
  background.append(element('div', 'border-mark'));
  boardWrap.append(background);
  const board = element('div', 'board');
  for (const column of view.columns) {
    const nodes = renderColumn(column, screen.selectedInstanceId, handlers, {
      enter: (card) => focusOn(column, card, true),
    });
    docks[column.posIdx] = nodes.dock;
    stampBoxes[column.posIdx] = nodes.stamps;
    plateNodes[column.posIdx] = nodes.plate;
    board.append(nodes.root);
  }
  boardWrap.append(board);
  root.append(boardWrap);

  const footer = element('div', 'footer-strip');
  footer.append(inspector.root);
  footer.append(renderTimebar(screen, handlers));
  root.append(footer);

  // 歩進や巻き戻しで画面を組み直しても、直前の注目を引き継いで提示を保つ。
  // 対象が失われた場合（実行・消費など）に限り、選択中または実行中の提示へ戻す。
  const focusedColumn = view.columns.find((column) =>
    column.cards.some((card) => card.instanceId === screen.focusedInstanceId && card.previewable),
  );
  const focusedCard = focusedColumn?.cards.find((card) => card.instanceId === screen.focusedInstanceId);
  if (focusedColumn !== undefined && focusedCard !== undefined) {
    focusOn(focusedColumn, focusedCard, false);
  } else {
    restore();
  }

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
