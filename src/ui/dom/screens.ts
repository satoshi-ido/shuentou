// [M-UI-SCREENS] タイトル・バトル開始前演出・インターミッション・従者補充・エンディングの描画と、
// 重畳する要素（設定・辞典・確認ダイアログ）。同時に開く重畳は1件に限る。

import type { HelpMasterRecord } from '../../data/types.js';
import type { InheritTarget } from '../../engine/progress/inherit.js';
import type { DisplayConfig, PlaybackSpeed, TextSpeed } from '../config.js';
import type { DictionaryEntry, IntermissionView, PreBattleView, RefillView, TitleView } from '../view/screen-view.js';

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

function inheritLabel(target: InheritTarget, actionName: (classId: string) => string): string {
  return target.kind === 'MAX_HP' ? '最大HP加算' : actionName(target.class_id);
}

export function renderIntermission(
  view: IntermissionView,
  strings: (id: string) => string,
  actionName: (classId: string) => string,
  handlers: ScreenHandlers,
): HTMLElement {
  const root = screenRoot('intermission', `インターミッション：次は ${view.sceneNumber} ${view.sceneName}`);
  if (view.objectiveStringId !== null) {
    root.append(element('p', 'objective', strings(view.objectiveStringId)));
  }
  if (view.noticeText !== '') {
    root.append(element('p', 'notice', view.noticeText));
  }
  if (view.noAttendant) {
    root.append(element('p', 'notice', strings('STR_LOCK_NO_ATTENDANT')));
  }
  const party = element('div', 'party');
  for (const slot of view.slots) {
    const row = element('div', 'party-slot');
    row.append(element('span', 'attendant-name', `${slot.name}〈${slot.epithet}〉`));
    row.append(element('span', 'inherit-state', slot.inheritState));
    if (slot.inheritState === 'UNUSED') {
      const pool = element('div', 'inherit-pool');
      for (const target of view.pool) {
        pool.append(button('inherit', inheritLabel(target, actionName), () => handlers.onInherit(slot.attendantId, target)));
      }
      row.append(pool);
    }
    row.append(button('sacrifice', '供犠', () => handlers.onSacrifice(slot.attendantId), !slot.canSacrifice));
    party.append(row);
  }
  root.append(party);
  const actions = element('div', 'im-actions');
  actions.append(button('primary', '決済を確定', handlers.onSettleIntermission, !view.canSettle));
  actions.append(button('menu', 'アンドゥ', handlers.onUndo));
  root.append(actions);
  root.append(overlayBar(handlers));
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

  const watch = element('div', 'config-row');
  watch.append(element('span', 'config-label', '監視トグルの既定'));
  for (const kind of ['READY', 'STUN', 'HIT_FRONT', 'HIT_BACK', 'EVADE'] as const) {
    watch.append(
      button(`config-choice${config.watchDefault[kind] ? ' config-on' : ''}`, kind, () =>
        handlers.onConfigChange({ ...config, watchDefault: { ...config.watchDefault, [kind]: !config.watchDefault[kind] } }),
      ),
    );
  }
  root.append(watch);

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
