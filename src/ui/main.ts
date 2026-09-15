// UI のエントリ。論理解像度のステージを表示領域へ合わせ、入力はマウスのみを扱う（[M-UI-VIEWPORT]）。
// 画面は [M-UI-SCREENS] に従い phase から定まり、バトルは探索ワーカー（[I-ENV-WORKER]）と
// 再生ループ（[M-UI-PLAYBACK]）の上で進行する。

import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { ATTENDANT_MASTERS } from '../data/generated/attendant-masters.js';
import { BOOK_MASTERS } from '../data/generated/book-masters.js';
import { ENEMY_MASTERS } from '../data/generated/enemy-masters.js';
import { HELP_MASTERS } from '../data/generated/help-masters.js';
import { HERO_INIT_ACTIONS, HERO_INIT_UNIT } from '../data/generated/hero-init.js';
import { SCENE_MASTERS } from '../data/generated/scene-masters.js';
import { STRING_MASTERS } from '../data/generated/string-masters.js';
import type { ActionMasterRecord, EnemyMasterRecord, HelpMasterRecord, SceneMasterRecord } from '../data/types.js';
import { instruct, resumeBattle, resumeTime, setWatch, startBattle, type BattleResult } from '../engine/game/battle.js';
import { confirmInherit, confirmRefill, confirmSacrifice, enterTransition, settleIntermission } from '../engine/game/intermission.js';
import { canUndo, rollbackBattle, rollbackIntermission, rollbackOrders, undo } from '../engine/game/rewind.js';
import { loadGame, newGameSession, peekSave } from '../engine/game/save.js';
import type { GameContext, GameSession } from '../engine/game/session.js';
import { executableActions } from '../engine/decision.js';
import { canInherit, inheritPool, type InheritTarget } from '../engine/progress/inherit.js';
import { canEnterTransition, canRefill, canSettleIntermission, refillCapacity, refillPool } from '../engine/progress/refill.js';
import { canSacrifice } from '../engine/progress/sacrifice.js';
import type { GameMasters } from '../engine/run/masters.js';
import type { ActionInstance, Unit, WatchKind } from '../engine/types.js';
import { AiDecisionClient } from './ai-client.js';
import { createAiWorkerPort } from './ai-worker-port.js';
import { loadConfig, saveConfig, type DisplayConfig } from './config.js';
import { renderBattleScreen, type BattleScreenHandlers } from './dom/battle-screen.js';
import {
  renderConfigOverlay,
  renderConfirmOverlay,
  renderDictionaryOverlay,
  renderEnding,
  renderIntermission,
  renderPreBattle,
  renderRefill,
  renderRollbackOverlay,
  renderTitle,
  type ConfirmDialog,
  type RollbackTarget,
  type ScreenHandlers,
} from './dom/screens.js';
import { PlaybackLoop, stepsPerFrame } from './playback.js';
import { createStringTable, resolveHelp } from './text.js';
import { buildBattleView, focusPreview, type UnitNaming } from './view/battle-view.js';
import { pauseReasonText } from './view/pause-text.js';
import {
  attendantEpithet,
  attendantName,
  dictionaryEntries,
  firstSightHelps,
  objectiveStringId,
  sceneNumberOf,
  screenOf,
  titleView,
  type OverlayKind,
} from './view/screen-view.js';
import { applyViewport } from './viewport.js';

const SAVE_KEY = 'shuentou.save';
const CATEGORY_LABEL: Readonly<Record<HelpMasterRecord['category'], string>> = {
  RESOURCE: 'リソース',
  STEP: 'ステップ',
  ACTION: 'アクション',
  PROGRESS: '進行',
  UI: '操作',
};

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
if (viewport === null || stage === null) {
  throw new Error('ステージ要素が見つからない');
}
const stageElement = stage;

const fit = (): void => applyViewport(stageElement, viewport.clientWidth, viewport.clientHeight);
window.addEventListener('resize', fit);
fit();
// 右クリックは取り消し・1階層の遡行に割り当てるため、既定のコンテキストメニューを抑止する。
stageElement.addEventListener('contextmenu', (event) => event.preventDefault());

const actions: Readonly<Record<string, ActionMasterRecord>> = ACTION_MASTERS;
const enemies: Readonly<Record<string, EnemyMasterRecord>> = ENEMY_MASTERS;
const scenes: Readonly<Record<string, SceneMasterRecord>> = SCENE_MASTERS;
const helps: Readonly<Record<string, HelpMasterRecord>> = HELP_MASTERS;
const strings = createStringTable(STRING_MASTERS);

const masters: GameMasters = {
  actions: ACTION_MASTERS,
  enemies: ENEMY_MASTERS,
  scenes: SCENE_MASTERS,
  books: BOOK_MASTERS,
  attendants: ATTENDANT_MASTERS,
  heroInitActions: HERO_INIT_ACTIONS,
  crossIds: [],
  echoIds: [],
  helpIds: Object.keys(HELP_MASTERS),
};

const stepDeps = {
  createCreature: (): never => {
    throw new Error('クリーチャーマスタは未投入である');
  },
};

let config: DisplayConfig = loadConfig(window.localStorage);
let session: GameSession | null = null;
let client: AiDecisionClient | null = null;
let overlay: OverlayKind = 'NONE';
let dialog: ConfirmDialog | null = null;
let selectedInstanceId: string | null = null;
let focusedInstanceId: string | null = null; // 注目中のアクション（判定プレビューの対象）
let battleResult: BattleResult = 'PAUSED';

const ctx: GameContext = {
  masters,
  foeDecision: (state, unit) => (client === null ? { kind: 'PASS' } : client.decisionFor(state, unit)),
  stepDeps,
  persist: (serialized) => window.localStorage.setItem(SAVE_KEY, serialized),
};

function requireSession(): GameSession {
  if (session === null) {
    throw new Error('セッションが存在しない');
  }
  return session;
}

function currentScene(): SceneMasterRecord {
  return scenes[requireSession().data.run.current_scene_id];
}

// [M-DATA-INTERP]［キーの語彙］共通キー。
function commonKeys(): Record<string, string | number> {
  const { run, meta } = requireSession().data;
  const scene = scenes[run.current_scene_id];
  return {
    TotalRewindCount: meta.total_rewind_count,
    PlaythroughCount: meta.playthrough_count,
    SacrificeCount: run.sacrificed.length,
    EnshrinedCount: run.enshrined_count,
    UnenshrinedCount: 14 - run.enshrined_count,
    CoreCount: run.enshrined_count,
    ActNumber: scene.act,
    PartyCount: run.party.length,
    SceneName: scene.display_name,
    SceneNumber: sceneNumberOf(scene.scene_id),
    HeroName: HERO_INIT_UNIT.display_name,
    HeroHp: run.hero_hp,
    HeroHpMax: run.hero_max_hp,
  };
}

const resolveString = (stringId: string): string => strings.resolve(stringId, { common: commonKeys() });
const actionName = (classId: string): string => actions[classId]?.display_name ?? classId;

const naming: UnitNaming = {
  displayName: (unit: Unit) => (unit.side === 'MINE' ? HERO_INIT_UNIT.display_name : (enemies[currentScene().enemy_id]?.display_name ?? '─')),
  roleName: (unit: Unit) => (unit.side === 'MINE' ? HERO_INIT_UNIT.role_name : (enemies[currentScene().enemy_id]?.role_name ?? null)),
  actionName: (action: ActionInstance) => actionName(action.master_ref),
};

function openConfirm(baseId: string, rows: readonly string[], onConfirm: () => void): void {
  dialog = {
    headText: resolveString(`${baseId}_HEAD`),
    bodyText: resolveString(baseId),
    rows,
    buttonText: resolveString(`${baseId}_BTN`),
    onConfirm: () => {
      overlay = 'NONE';
      dialog = null;
      onConfirm();
    },
  };
  overlay = 'CONFIRM';
  render();
}

// [I-ENV-WORKER] 当該シーンの探索ワーカーを繋ぐ。バトルの進行より先に行う必要がある。
// 決定主体が不在のまま進行させると、敵軍が常にパスとなり時間停止事由が成立しない。
function attachClient(sceneId: string): void {
  client?.dispose();
  client = new AiDecisionClient(createAiWorkerPort(), sceneId, () => {
    // 応答後の再開も再生速度に従う（停止中は1ステップのみ進めて静止させる）。
    stepForward(stepsPerFrame(loop.speed));
    render();
  });
}

function startScene(): void {
  const scene = currentScene();
  attachClient(scene.scene_id);
  battleResult = startBattle(requireSession(), ctx, {
    watchDefault: config.watchDefault,
    maxSteps: Math.max(stepsPerFrame(config.defaultPlaybackSpeed), 1),
  });
  loop.speed = config.defaultPlaybackSpeed;
  loop.start();
  render();
}

const screenHandlers: ScreenHandlers = {
  onNewGame: () => {
    const existing = window.localStorage.getItem(SAVE_KEY);
    const begin = (): void => {
      session = newGameSession(ctx);
      render();
    };
    if (existing === null) {
      begin();
      return;
    }
    openConfirm('STR_CONFIRM_NEWGAME', [], begin); // セーブデータ破棄の確認（[M-META-SAVEDATA]）
  },
  onContinue: () => {
    const serialized = window.localStorage.getItem(SAVE_KEY);
    if (serialized === null) {
      return;
    }
    const saved = peekSave(serialized);
    if (saved === null) {
      return; // ［データバージョン］不一致はマイグレーションせず拒否する
    }
    // ［バトル中の保存を行わない］バトル中のセーブは再開処理を伴うため、先にワーカーを繋ぐ。
    const resumesBattle = saved.run.phase === 'BATTLE';
    if (resumesBattle) {
      attachClient(saved.run.current_scene_id);
      loop.speed = config.defaultPlaybackSpeed;
    }
    const loaded = loadGame(serialized, ctx, { maxSteps: Math.max(stepsPerFrame(config.defaultPlaybackSpeed), 1) });
    if (!loaded.ok) {
      return;
    }
    session = loaded.session;
    battleResult = loaded.battle ?? 'PAUSED';
    if (resumesBattle) {
      loop.start();
    }
    render();
  },
  onOpenConfig: () => {
    overlay = 'CONFIG';
    render();
  },
  onOpenDictionary: () => {
    overlay = 'DICTIONARY';
    render();
  },
  onCloseOverlay: () => {
    overlay = 'NONE';
    dialog = null;
    render();
  },
  onConfigChange: (next) => {
    config = next;
    saveConfig(window.localStorage, config);
    render();
  },
  onShowHelp: (helpId) => {
    // [M-DATA-HELPMASTER]［既読の管理］初出の自動提示で既読とする。辞典からの随時参照は書き換えない。
    requireSession().data.meta.help_seen[helpId] = true;
    overlay = 'DICTIONARY';
    render();
  },
  onStartBattle: () => startScene(),
  onInherit: (attendantId, target: InheritTarget) => {
    confirmInherit(requireSession(), ctx, attendantId, target);
    render();
  },
  onSacrifice: (attendantId) => {
    const rows = [
      strings.resolve('STR_CONFIRM_SACRIFICE', {
        common: commonKeys(),
        bundles: {
          ATTENDANT: {
            AttendantName: attendantName(ATTENDANT_MASTERS, attendantId),
            AttendantEpithet: attendantEpithet(ATTENDANT_MASTERS, attendantId),
            HpAdd: 0,
          },
          SACRIFICE: { PartyCountAfter: requireSession().data.run.party.length - 1 },
        },
      }),
    ];
    openConfirm('STR_CONFIRM_SACRIFICE', rows, () => {
      confirmSacrifice(requireSession(), ctx, attendantId);
      render();
    });
  },
  onSettleIntermission: () => {
    const current = requireSession();
    if (canEnterTransition(current.data.run, masters)) {
      enterTransition(current, ctx); // アクト移行の段（[M-PROG-REFILL]）へ進む
      render();
      return;
    }
    openConfirm('STR_CONFIRM_IM_COMMIT', [], () => {
      settleIntermission(requireSession(), ctx);
      render();
    });
  },
  onRefill: (attendantId) => {
    confirmRefill(requireSession(), ctx, attendantId);
    render();
  },
  onUndo: () => {
    if (!canUndo(requireSession())) {
      return;
    }
    openConfirm('STR_CONFIRM_UNDO', [], () => {
      undo(requireSession());
      client?.invalidate();
      render();
    });
  },
  onRollbackBattle: () => {
    openConfirm('STR_CONFIRM_ROLLBACK_BATTLE', [], () => {
      client?.invalidate();
      // 再開は再生速度に従う（1回の呼び出しで時間停止まで進めきらない）。
      battleResult = rollbackBattle(requireSession(), ctx, { maxSteps: Math.max(stepsPerFrame(loop.speed), 1) });
      render();
    });
  },
  // [M-REWIND-ROLLBACK] 過去インターミッションへの復帰。復帰先より後のスナップショットは破棄される。
  onRollbackIntermission: (order) => {
    // ［複数対象の提示］破棄されるインターミッション（復帰先より後の段）を行として並べる。
    const rows = rollbackOrders(requireSession())
      .filter((candidate) => candidate > order)
      .map(() => resolveString('STR_CONFIRM_ROLLBACK_IM_ROW'));
    openConfirm('STR_CONFIRM_ROLLBACK_IM', rows, () => {
      leaveBattle();
      rollbackIntermission(requireSession(), order);
      render();
    });
  },
};

// 時間を進める。自動時間停止中は確定操作2（ステップ進行確定・[M-STATE-HISTORY]）として
// 停止を解いてから進め、停止していない場合はそのまま続きを進める。
function stepForward(maxSteps: number): void {
  const session = requireSession();
  const state = session.data.run.battle_state;
  const steps = Math.max(maxSteps, 1);
  battleResult =
    state !== null && state.pause_reason !== null
      ? resumeTime(session, ctx, { maxSteps: steps })
      : resumeBattle(session, ctx, { maxSteps: steps });
}

// 進行中のバトルから離れる：再生ループと探索ワーカーを止める。
function leaveBattle(): void {
  loop.stop();
  client?.dispose();
  client = null;
  battleResult = 'PAUSED';
  selectedInstanceId = null;
  focusedInstanceId = null;
}


const battleHandlers: BattleScreenHandlers = {
  onSelect: (instanceId) => {
    selectedInstanceId = instanceId;
    render();
  },
  onInstruct: (instanceId) => {
    const state = requireSession().data.run.battle_state;
    const unit = state?.units.find(
      (candidate) => candidate !== null && candidate.side === 'MINE' && candidate.acts.some((action) => action.instance_id === instanceId),
    );
    if (state === null || unit === null || unit === undefined) {
      return;
    }
    // 時間が進んでいる間は、描画とクリックの間にステップが進み実行可能でなくなることがある。
    if (!executableActions(state, unit).some((action) => action.instance_id === instanceId)) {
      return;
    }
    selectedInstanceId = null;
    focusedInstanceId = null;
    // 指示後の進行も再生速度に従う（確定だけで時間停止まで進めきらない）。
    battleResult = instruct(requireSession(), ctx, unit.unit_id, instanceId, {
      maxSteps: Math.max(stepsPerFrame(loop.speed), 1),
    });
    render();
  },
  onCancel: () => {
    selectedInstanceId = null;
    focusedInstanceId = null; // 右クリックは注目も解く
    render();
  },
  onToggleWatch: (instanceId, kind: WatchKind) => {
    const state = requireSession().data.run.battle_state;
    setWatch(requireSession(), instanceId, kind, !(state?.watching[instanceId]?.[kind] ?? false));
    render();
  },
  // 1歩進める：時間停止を解いて1ステップだけ進め、再び静止させる。
  onResume: () => {
    loop.speed = 'PAUSE';
    stepForward(1);
    render();
  },
  // 再生速度の選択。時間停止中に再生を選んだ場合は、ステップ進行確定として停止を解く。
  onSpeed: (speed) => {
    loop.speed = speed;
    if (speed !== 'PAUSE' && battleResult === 'PAUSED') {
      stepForward(stepsPerFrame(speed));
    }
    render();
  },
  // 注目の記録のみ。提示は画面側がその場で描き替えるため再描画しない。
  onFocus: (instanceId) => {
    focusedInstanceId = instanceId;
  },
  // バトル画面からも共通の導線（取消・再走・中断・辞典・設定）を開く（[M-UI-SCREENS]［重畳する要素］）。
  onUndo: () => screenHandlers.onUndo(),
  onRollbackBattle: () => screenHandlers.onRollbackBattle(),
  onOpenRollback: () => {
    overlay = 'ROLLBACK';
    render();
  },
  // [M-META-SAVEDATA]［バトル中の保存を行わない］中断はタイトルへ戻るのみ。再開は直近の
  // バトル開始時セーブからのロードとなる。
  onQuitBattle: () => {
    openConfirm('STR_CONFIRM_QUIT_BATTLE', [], () => {
      leaveBattle();
      session = null;
      render();
    });
  },
  onOpenConfig: () => screenHandlers.onOpenConfig(),
  onOpenDictionary: () => screenHandlers.onOpenDictionary(),
};

function renderBattle(): HTMLElement | null {
  const state = requireSession().data.run.battle_state;
  if (state === null) {
    return null;
  }
  const view = buildBattleView({ state, deps: stepDeps, naming, selectedInstanceId });
  const pauseText =
    state.pause_reason === null
      ? ''
      : pauseReasonText(state, state.pause_reason, {
          strings,
          common: commonKeys(),
          unitName: naming.displayName,
          unitRoleName: naming.roleName,
          actionName,
        });
  const { meta, pending } = requireSession().data;
  const host = document.createElement('div');
  host.className = 'screen-host'; // 論理解像度の高さを画面まで伝える器（[M-UI-VIEWPORT]）
  renderBattleScreen(
    host,
    {
      view,
      pauseText,
      selectedInstanceId,
      focusedInstanceId,
      speed: loop.speed,
      stopped: battleResult === 'PAUSED',
      rewind: {
        count: meta.total_rewind_count,
        pending: pending.rewind_pending,
        pendingText: pending.rewind_pending ? resolveString('STR_REWIND_PENDING') : '',
      },
      focusFor: (id) => focusPreview(state, id, stepDeps, naming),
    },
    battleHandlers,
  );
  return host;
}

function renderScreen(): HTMLElement {
  if (session === null) {
    // タイトルの提示に必要なのはセーブの有無と周回の終了のみ。ロード（バトル中の再開処理）は行わない。
    const serialized = window.localStorage.getItem(SAVE_KEY);
    return renderTitle(titleView(serialized === null ? null : peekSave(serialized)), (id) => strings.resolve(id), screenHandlers);
  }
  const { run, meta } = requireSession().data;
  const scene = scenes[run.current_scene_id];
  switch (screenOf(run)) {
    case 'PRE_BATTLE':
      return renderPreBattle(
        {
          sceneName: scene.display_name,
          sceneNumber: sceneNumberOf(scene.scene_id),
          enemyName: enemies[scene.enemy_id]?.display_name ?? '─',
          firstSightHelpIds: firstSightHelps(scene, helps, meta.help_seen),
        },
        (helpId) => resolveHelp(helps[helpId], commonKeys()).title,
        screenHandlers,
      );
    case 'BATTLE':
      return renderBattle() ?? renderEnding(screenHandlers);
    case 'INTERMISSION': {
      const pool = inheritPool(run, masters);
      return renderIntermission(
        {
          objectiveStringId: objectiveStringId(scene.order),
          sceneName: scene.display_name,
          sceneNumber: sceneNumberOf(scene.scene_id),
          slots: run.party.map((slot) => ({
            attendantId: slot.attendant_id,
            name: attendantName(ATTENDANT_MASTERS, slot.attendant_id),
            epithet: attendantEpithet(ATTENDANT_MASTERS, slot.attendant_id),
            inheritState: slot.inherit_state,
            canSacrifice: canSacrifice(run, slot.attendant_id),
          })),
          pool: pool.filter((target) => run.party.some((slot) => canInherit(run, masters, slot.attendant_id, target))),
          canSettle: canSettleIntermission(run, masters) || canEnterTransition(run, masters),
          isActTransition: canEnterTransition(run, masters),
          noAttendant: run.party.length === 0,
        },
        resolveString,
        actionName,
        screenHandlers,
      );
    }
    case 'REFILL':
      return renderRefill(
        {
          slotCount: scene.attendant_capacity,
          remainCount: refillCapacity(run, masters),
          pool: refillPool(run, masters)
            .filter((attendantId) => canRefill(run, masters, attendantId))
            .map((attendantId) => ({
              attendantId,
              name: attendantName(ATTENDANT_MASTERS, attendantId),
              epithet: attendantEpithet(ATTENDANT_MASTERS, attendantId),
            })),
          canSettle: canSettleIntermission(run, masters),
        },
        resolveString,
        screenHandlers,
      );
    default:
      return renderEnding(screenHandlers);
  }
}

// 復帰先の候補：記録済みインターミッションの各段（[M-STATE-IMSNAPSHOT]）。
function rollbackTargets(): RollbackTarget[] {
  if (session === null) {
    return [];
  }
  return rollbackOrders(session).map((order) => {
    const scene = Object.values(scenes).find((candidate) => candidate.order === order);
    return {
      order,
      sceneNumber: scene === undefined ? String(order) : sceneNumberOf(scene.scene_id),
      sceneName: scene?.display_name ?? '',
    };
  });
}

function renderOverlay(): HTMLElement | null {
  switch (overlay) {
    case 'CONFIG':
      return renderConfigOverlay(config, screenHandlers);
    case 'DICTIONARY':
      return renderDictionaryOverlay(
        dictionaryEntries(helps, session?.data.meta.help_seen ?? {}),
        (helpId) => resolveHelp(helps[helpId], session === null ? {} : commonKeys()),
        (category) => CATEGORY_LABEL[category],
        screenHandlers,
      );
    case 'ROLLBACK':
      return renderRollbackOverlay(rollbackTargets(), resolveString, screenHandlers);
    case 'CONFIRM':
      return dialog === null ? null : renderConfirmOverlay(dialog, screenHandlers);
    default:
      return null;
  }
}

function render(): void {
  stageElement.replaceChildren();
  stageElement.append(renderScreen());
  const overlayNode = renderOverlay();
  if (overlayNode !== null) {
    stageElement.append(overlayNode); // 画面を遷移させず重ねて提示する。同時に開くのは1件に限る。
  }
}

// [M-UI-PLAYBACK] 歩進は描画フレーム同期。時間停止中・応答待ちの間はステップを進めない。
const loop = new PlaybackLoop(
  { request: (callback) => window.requestAnimationFrame(callback), cancel: (handle) => window.cancelAnimationFrame(handle) },
  (speed) => {
    if (session === null || session.data.run.phase !== 'BATTLE') {
      return false;
    }
    if (stepsPerFrame(speed) > 0 && battleResult === 'RUNNING') {
      battleResult = resumeBattle(session, ctx, { maxSteps: stepsPerFrame(speed) });
      render();
    }
    return true;
  },
);

render();
