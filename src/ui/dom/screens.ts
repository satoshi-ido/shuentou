// [M-UI-SCREENS] タイトル・バトル開始前演出・インターミッション・従者補充・エンディングの描画と、
// 重畳する要素（設定・辞典・確認ダイアログ）。同時に開く重畳は1件に限る。

import type { HelpMasterRecord } from '../../data/types.js';
import type { InheritTarget } from '../../engine/progress/inherit.js';
import { WATCH_DEFAULT_MODES, type DisplayConfig, type PlaybackSpeed, type TextSpeed } from '../config.js';
import { PARAM_LABEL, STEP_ARROW, SYMBOL } from '../format.js';
import type {
  DictionaryEntry,
  InheritOptionView,
  IntermissionView,
  PartySlotView,
  PreBattleView,
  RefillView,
  TitleView,
} from '../view/screen-view.js';

export interface ScreenHandlers {
  readonly onNewGame: () => void;
  readonly onContinue: () => void;
  readonly onOpenConfig: () => void;
  readonly onOpenDictionary: () => void;
  readonly onCloseOverlay: () => void;
  readonly onConfigChange: (config: DisplayConfig) => void;
  readonly onShowHelp: (helpId: string) => void;
  readonly onStartBattle: () => void;
  readonly onInherit: (attendantId: string, target: InheritTarget) => void;
  readonly onSacrifice: (attendantId: string) => void;
  readonly onSelectAttendant: (attendantId: string) => void;
  readonly onSettleIntermission: () => void;
  readonly onRefill: (attendantId: string) => void;
  readonly onUndo: () => void;
  readonly onRollbackBattle: () => void;
  readonly onRollbackIntermission: (order: number) => void;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(className: string, text: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}

function screenRoot(kind: string, title: string): HTMLElement {
  const root = element('div', `screen screen-${kind.toLowerCase()}`);
  root.append(element('h1', 'screen-title', title));
  return root;
}

// 共通の導線：設定・辞典はタイトル・バトル・インターミッション・従者補充のいずれからも開く。
function overlayBar(handlers: ScreenHandlers): HTMLElement {
  const bar = element('div', 'overlay-bar');
  bar.append(button('menu', '設定', handlers.onOpenConfig));
  bar.append(button('menu', '辞典', handlers.onOpenDictionary));
  return bar;
}

export function renderTitle(view: TitleView, strings: (id: string) => string, handlers: ScreenHandlers): HTMLElement {
  const root = screenRoot('title', '終焉燈');
  root.append(button('primary', 'ニューゲーム', handlers.onNewGame));
  root.append(button('primary', 'つづきから', handlers.onContinue, !view.hasSave || view.runClosed));
  if (view.runClosed) {
    root.append(element('p', 'notice', strings('STR_TITLE_RUN_CLOSED')));
  }
  root.append(overlayBar(handlers));
  return root;
}

// [S-SCRIPT-TRIGGER] SCENE_INTRO の脚本再生は脚本マスタの投入後に接続する。
export function renderPreBattle(view: PreBattleView, helpTitle: (helpId: string) => string, handlers: ScreenHandlers): HTMLElement {
  const root = screenRoot('pre-battle', `${view.sceneNumber} ${view.sceneName}`);
  root.append(element('p', 'enemy', view.enemyName));
  if (view.firstSightHelpIds.length > 0) {
    const helps = element('div', 'first-sight');
    for (const helpId of view.firstSightHelpIds) {
      helps.append(button('help', helpTitle(helpId), () => handlers.onShowHelp(helpId)));
    }
    root.append(helps);
  }
  root.append(button('primary', 'バトル開始', handlers.onStartBattle));
  root.append(overlayBar(handlers));
  return root;
}

// [M-INHERIT-MERGE]［UI要件］確定前のプレビュー。統合後の実効値と改善項目を示す。
// カード上に値として現れる改善項目。これ以外は名称を添えて示す。
const VISIBLE_IMPROVE_KEYS: readonly string[] = [
  'step_thought',
  'step_startup',
  'step_recovery',
  'cost_hp',
  'cost_vp',
  'cost_pp',
  'cost_ap',
  'range',
  'atk',
  'uses',
];

const INHERIT_KIND_LABEL: Readonly<Record<InheritOptionView['kind'], string>> = {
  MAX_HP: '最大HPに加算',
  NEW_SLOT: '新しいアクションとして加わる',
  MERGE: '既存のアクションへ統合',
  VANISH: '実効初期使用回数0により消滅',
};

function inheritOption(
  option: InheritOptionView,
  enabled: boolean,
  strings: (id: string) => string,
  onPick: () => void,
): HTMLElement {
  // 従者特性係数で基礎値から改善した値は、その値自体を強調して示す（[M-DATA-INSTANTIATE]・[M-INHERIT-MERGE]［UI要件］）。
  const improved = (key: string): string => (option.boosted.includes(key) ? ' boost' : '');
  const card = element('div', `inherit-card${enabled ? '' : ' disabled'}`);
  const head = element('div', 'inherit-head');
  head.append(element('b', 'nm', option.label));
  if (option.uses !== null) {
    head.append(element('span', `uses num${improved('uses')}`, `${SYMBOL.remaining} ${option.uses}`));
  }
  card.append(head);

  const metrics = element('div', 'inherit-metrics num');
  if (option.steps !== null) {
    const flow = element('span', 'st-flow');
    flow.append(element('span', improved('step_thought').trim(), `${SYMBOL.stepThought}${option.steps.thought}`));
    flow.append(element('i', 'arrow', STEP_ARROW));
    flow.append(element('span', improved('step_startup').trim(), `${SYMBOL.stepStartup}${option.steps.startup}`));
    flow.append(element('i', 'arrow', STEP_ARROW));
    flow.append(element('span', improved('step_recovery').trim(), `${SYMBOL.stepRecovery}${option.steps.recovery}`));
    metrics.append(flow);
  }
  for (const cost of option.costs) {
    metrics.append(
      element('span', `cst cst-${cost.label.toLowerCase()}${improved(`cost_${cost.label.toLowerCase()}`)}`, `${cost.label} ${cost.value}`),
    );
  }
  if (option.range !== null) {
    const range = element('span', 'rng');
    range.append(element('span', improved('range').trim(), `${SYMBOL.range} ${option.range}`));
    range.append(document.createTextNode(' / '));
    range.append(element('span', improved('atk').trim(), `${SYMBOL.atk} ${option.atk ?? 0}`));
    metrics.append(range);
  }
  if (option.hpAdd !== null) {
    metrics.append(element('span', `hp-add${improved('hp_add')}`, `最大HP +${option.hpAdd}`));
  }
  card.append(metrics);

  const outcome = element('div', 'inherit-outcome');
  outcome.append(element('span', 'kind', INHERIT_KIND_LABEL[option.kind]));
  if (option.kind === 'MERGE') {
    // [M-INHERIT-MERGE]［UI要件］統合で何項目が改善するかを示す。0件はその旨を明示する。
    outcome.append(
      element(
        'span',
        option.improved.length === 0 ? 'improve none' : 'improve',
        option.improved.length === 0
          ? strings('STR_INHERIT_NO_IMPROVE')
          : `（改善：${option.improved.map((key) => PARAM_LABEL[key] ?? (key === 'uses' ? '使用回数' : key)).join(' / ')}）`,
      ),
    );
  }
  // 係数の改善のうち、カードに値として現れない項目は名称を添えて示す。
  const hidden = option.boosted.filter((key) => !VISIBLE_IMPROVE_KEYS.includes(key));
  if (hidden.length > 0) {
    outcome.append(element('span', 'improve', `（他：${hidden.map((key) => PARAM_LABEL[key] ?? key).join(' / ')}）`));
  }
  card.append(outcome);

  if (enabled) {
    card.addEventListener('click', onPick);
  }
  return card;
}

// [M-INHERIT-POOL] 継承の段。UIプロトタイプに倣い、見出し・目的表示・従者の壇・2欄の順に並べる。
const INHERIT_STATE_LABEL: Readonly<Record<PartySlotView['inheritState'], string>> = {
  UNUSED: '継承枠あり',
  SPENT: '継承済み',
  FORFEITED: '枠を失効',
};

function figure(className: string): HTMLElement {
  const node = element('div', className);
  node.append(element('div', 'head'));
  node.append(element('div', 'body'));
  return node;
}

// 壇に並ぶ従者1名。クリックで選択し、継承先・供犠の対象とする。
function partyMember(slot: PartySlotView, selected: boolean, handlers: ScreenHandlers): HTMLElement {
  const node = element('div', `pm${selected ? ' sel' : ''}`);
  node.append(figure('figure'));
  const plate = element('div', 'pmp');
  plate.append(element('div', 'pmn', slot.name));
  plate.append(element('div', 'pmt', `〈${slot.epithet}〉`));
  plate.append(element('div', 'pms', INHERIT_STATE_LABEL[slot.inheritState]));
  node.append(plate);
  node.addEventListener('click', () => handlers.onSelectAttendant(slot.attendantId));
  return node;
}

export function renderIntermission(
  view: IntermissionView,
  strings: (id: string) => string,
  actionName: (classId: string) => string,
  handlers: ScreenHandlers,
): HTMLElement {
  const root = element('div', 'screen screen-intermission im');

  const head = element('div', 'imhead');
  head.append(element('h2', 'im-title', '継承・編成'));
  head.append(element('span', 'sub', `次は ${view.sceneNumber} ${view.sceneName}`));
  head.append(element('span', 'spacer'));
  head.append(button('rbtn util', '辞典', handlers.onOpenDictionary));
  head.append(button('rbtn util', '設定', handlers.onOpenConfig));
  head.append(button('rbtn btn-undo', '⟲ 取消', handlers.onUndo));
  head.append(button('primary', '確定して進む', handlers.onSettleIntermission, !view.canSettle));
  root.append(head);

  // [M-UI-OBJECTIVE] 目的表示。提示しない段でも行の高さを保つ。
  const objective = element('div', `objbar${view.objectiveStringId === null ? ' objbar-idle' : ''}`);
  objective.setAttribute('role', 'status');
  objective.textContent = view.objectiveStringId === null ? '' : strings(view.objectiveStringId);
  root.append(objective);

  const field = element('div', 'imfield');
  const stage = element('div', 'imstage');
  const party = element('div', 'party');
  for (const slot of view.slots) {
    party.append(partyMember(slot, slot.attendantId === view.selectedAttendantId, handlers));
  }
  if (view.noAttendant) {
    // [M-PROG-NOATTENDANT] 同行従者0人では継承・供犠を行えない。
    party.append(element('div', 'pm-empty', strings('STR_LOCK_NO_ATTENDANT')));
  }
  stage.append(party);
  stage.append(element('div', 'imdiv'));
  const fallen = element('div', 'fallenwrap');
  for (const lost of view.fallen) {
    const node = element('div', 'pm fallen');
    node.append(figure('figure'));
    const plate = element('div', 'pmp');
    plate.append(element('div', 'pmn', lost.name));
    plate.append(element('div', 'pmt', `〈${lost.epithet}〉`));
    node.append(plate);
    fallen.append(node);
  }
  stage.append(fallen);
  field.append(stage);
  root.append(field);

  const grid = element('div', 'imgrid');
  const selected = view.slots.find((slot) => slot.attendantId === view.selectedAttendantId);

  const poolColumn = element('div', 'imcol');
  poolColumn.append(
    element('h3', '', selected === undefined ? '継承できる資質' : `継承できる資質 ─ ${selected.name}を介して受け継ぐ場合`),
  );
  const pool = element('div', 'pool');
  const canInheritNow = selected !== undefined && selected.inheritState === 'UNUSED';
  for (const option of view.pool) {
    pool.append(
      inheritOption(option, canInheritNow, strings, () =>
        selected === undefined ? undefined : handlers.onInherit(selected.attendantId, option.target),
      ),
    );
  }
  if (view.pool.length === 0) {
    pool.append(element('p', 'notice', '継承できる資質がない'));
  }
  poolColumn.append(pool);
  grid.append(poolColumn);

  const heroColumn = element('div', 'imcol');
  heroColumn.append(element('h3', '', `${view.hero.name}の現状`));
  const heroRows = element('div', 'imrows');
  const heroHp = element('div', 'imrow');
  heroHp.append(element('span', 'k', SYMBOL.hp));
  heroHp.append(element('span', 'v num', `${view.hero.hp} / ${view.hero.maxHp}`));
  heroRows.append(heroHp);
  const heroCount = element('div', 'imrow');
  heroCount.append(element('span', 'k', '所持アクション'));
  heroCount.append(element('span', 'v num', String(view.hero.acts.length)));
  heroRows.append(heroCount);
  heroColumn.append(heroRows);

  const heroActs = element('div', 'hero-acts');
  for (const act of view.hero.acts) {
    const card = element('div', 'hero-act');
    const head = element('div', 'hero-act-head');
    head.append(element('b', 'nm', act.name));
    head.append(element('span', 'uses num', `${SYMBOL.remaining} ${act.uses}`));
    card.append(head);
    const metrics = element('div', 'hero-act-metrics num');
    metrics.append(
      element(
        'span',
        'st-flow',
        `${SYMBOL.stepThought}${act.steps.thought} ${STEP_ARROW} ${SYMBOL.stepStartup}${act.steps.startup} ${STEP_ARROW} ${SYMBOL.stepRecovery}${act.steps.recovery}`,
      ),
    );
    for (const cost of act.costs) {
      metrics.append(element('span', 'cst', `${cost.label} ${cost.value}`));
    }
    if (act.range !== null) {
      metrics.append(element('span', 'rng', `${SYMBOL.range} ${act.range} / ${SYMBOL.atk} ${act.atk ?? 0}`));
    }
    card.append(metrics);
    heroActs.append(card);
  }
  heroColumn.append(heroActs);

  // [M-PROG-SACRIFICE] 供犠は継承を終えてから選ぶ。1回のインターミッションにつき1回まで。
  if (view.inheritDone) {
    const sac = element('div', 'sac');
    sac.append(element('h3', '', '⚠ 供犠'));
    sac.append(element('p', '', '同行従者1名を消滅させ、主人公の現在HPを最大HPまで回復する。'));
    sac.append(
      button(
        'sacbtn',
        selected === undefined ? '壇の従者を選ぶ' : `${selected.name}を捧げる`,
        () => (selected === undefined ? undefined : handlers.onSacrifice(selected.attendantId)),
        selected === undefined || !selected.canSacrifice,
      ),
    );
    heroColumn.append(sac);
  }
  if (view.noticeText !== '') {
    heroColumn.append(element('p', 'notice', view.noticeText));
  }
  grid.append(heroColumn);
  root.append(grid);
  return root;
}

export function renderRefill(view: RefillView, strings: (id: string) => string, handlers: ScreenHandlers): HTMLElement {
  const root = screenRoot('refill', '従者補充');
  root.append(element('p', 'refill-count num', `定員 ${view.slotCount} / 残り ${view.remainCount}`));
  if (view.remainCount > 0 && view.pool.length === 0) {
    root.append(element('p', 'notice', strings('STR_REFILL_SHORT')));
  }
  const pool = element('div', 'refill-pool');
  for (const candidate of view.pool) {
    pool.append(
      button('refill', `${candidate.name}〈${candidate.epithet}〉`, () => handlers.onRefill(candidate.attendantId), view.remainCount <= 0),
    );
  }
  root.append(pool);
  root.append(button('primary', '決済を確定', handlers.onSettleIntermission, !view.canSettle));
  root.append(overlayBar(handlers));
  return root;
}

export function renderEnding(handlers: ScreenHandlers): HTMLElement {
  // [M-END-SEQUENCE]・[S-EPILOGUE] の演出は脚本マスタの投入後に接続する。
  const root = screenRoot('ending', 'エンディング');
  root.append(element('p', 'notice', '［エンディング演出は脚本マスタの投入後に接続する］'));
  root.append(overlayBar(handlers));
  return root;
}

// ── 重畳する要素 ──

const TEXT_SPEEDS: readonly TextSpeed[] = ['SLOW', 'NORMAL', 'FAST', 'INSTANT'];
const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = ['PAUSE', 'X1', 'X2', 'X3'];

// [M-UI-CONFIG] 表示・音響設定。端末ローカル設定であり、セーブデータに含めない。
export function renderConfigOverlay(config: DisplayConfig, handlers: ScreenHandlers): HTMLElement {
  const root = element('div', 'overlay overlay-config');
  root.append(element('h2', 'overlay-title', '設定'));

  const volume = (label: string, value: number, apply: (next: number) => DisplayConfig): HTMLElement => {
    const row = element('div', 'config-row');
    row.append(element('span', 'config-label', label));
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(value);
    input.addEventListener('input', () => handlers.onConfigChange(apply(Number(input.value))));
    row.append(input);
    row.append(element('span', 'config-value num', String(value)));
    return row;
  };
  root.append(volume('BGM音量', config.bgmVolume, (next) => ({ ...config, bgmVolume: next })));
  root.append(volume('SE音量', config.seVolume, (next) => ({ ...config, seVolume: next })));

  const choice = <T extends string>(label: string, values: readonly T[], current: T, apply: (next: T) => DisplayConfig): HTMLElement => {
    const row = element('div', 'config-row');
    row.append(element('span', 'config-label', label));
    for (const value of values) {
      row.append(button(`config-choice${value === current ? ' config-on' : ''}`, value, () => handlers.onConfigChange(apply(value))));
    }
    return row;
  };
  root.append(choice('バトル再生速度の既定', PLAYBACK_SPEEDS, config.defaultPlaybackSpeed, (next) => ({ ...config, defaultPlaybackSpeed: next })));
  root.append(choice('テキスト送り速度', TEXT_SPEEDS, config.textSpeed, (next) => ({ ...config, textSpeed: next })));

  const simplify = element('div', 'config-row');
  simplify.append(element('span', 'config-label', '演出の簡略化'));
  simplify.append(
    button('config-choice', config.simplifyEffects ? 'ON' : 'OFF', () =>
      handlers.onConfigChange({ ...config, simplifyEffects: !config.simplifyEffects }),
    ),
  );
  root.append(simplify);

  // [M-UI-CONFIG]「監視トグルの既定」BY_SYSTEM は系統別の既定（[M-UI-WATCH]［既定の監視条件］）。
  root.append(
    choice('監視トグルの既定', WATCH_DEFAULT_MODES, config.watchDefault, (next) => ({ ...config, watchDefault: next })),
  );

  root.append(button('primary', '閉じる', handlers.onCloseOverlay));
  return root;
}

// [M-DATA-HELPMASTER]［随時参照］辞典。随時参照は既読状態を書き換えない。
export function renderDictionaryOverlay(
  entries: readonly DictionaryEntry[],
  resolve: (helpId: string) => { readonly title: string; readonly body: string },
  categoryLabel: (category: HelpMasterRecord['category']) => string,
  handlers: ScreenHandlers,
): HTMLElement {
  const root = element('div', 'overlay overlay-dictionary');
  root.append(element('h2', 'overlay-title', '辞典'));
  let current: HelpMasterRecord['category'] | null = null;
  for (const entry of entries) {
    if (entry.category !== current) {
      current = entry.category;
      root.append(element('h3', 'dict-category', categoryLabel(entry.category)));
    }
    const resolved = resolve(entry.helpId);
    const item = element('div', 'dict-entry');
    item.append(element('div', 'dict-title', resolved.title));
    item.append(element('div', 'dict-body', resolved.body));
    root.append(item);
  }
  root.append(button('primary', '閉じる', handlers.onCloseOverlay));
  return root;
}

// [M-REWIND-ROLLBACK]［過去インターミッションへのロールバック］復帰先の選択。
// 復帰先より後のインターミッションのスナップショットは破棄される（[M-STATE-IMSNAPSHOT]）。
export interface RollbackTarget {
  readonly order: number;
  readonly sceneNumber: string;
  readonly sceneName: string;
}

export function renderRollbackOverlay(targets: readonly RollbackTarget[], strings: (id: string) => string, handlers: ScreenHandlers): HTMLElement {
  const root = element('div', 'overlay overlay-rollback');
  root.append(element('h2', 'overlay-title', '再走（編成・継承）'));
  if (targets.length === 0) {
    root.append(element('p', 'notice', strings('STR_UNDO_UNAVAILABLE')));
  }
  for (const target of targets) {
    root.append(
      button('rollback-target', `${target.sceneNumber} ${target.sceneName} の前のインターミッションへ`, () =>
        handlers.onRollbackIntermission(target.order),
      ),
    );
  }
  root.append(button('menu', '閉じる', handlers.onCloseOverlay));
  return root;
}

export interface ConfirmDialog {
  readonly headText: string;
  readonly bodyText: string;
  readonly rows: readonly string[]; // ［複数対象の提示］見出し＋行の反復
  readonly buttonText: string;
  readonly onConfirm: () => void;
}

export function renderConfirmOverlay(dialog: ConfirmDialog, handlers: ScreenHandlers): HTMLElement {
  const root = element('div', 'overlay overlay-confirm');
  root.append(element('h2', 'overlay-title', dialog.headText));
  root.append(element('p', 'confirm-body', dialog.bodyText));
  for (const row of dialog.rows) {
    root.append(element('p', 'confirm-row', row));
  }
  const actions = element('div', 'confirm-actions');
  actions.append(button('primary', dialog.buttonText, dialog.onConfirm));
  actions.append(button('menu', '取り消し', handlers.onCloseOverlay));
  root.append(actions);
  return root;
}
