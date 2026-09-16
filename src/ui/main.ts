import { createCreatureFactory } from '../engine/creature.js';
// UI のエントリ。論理解像度のステージを表示領域へ合わせ、入力はマウスのみを扱う（[M-UI-VIEWPORT]）。
// 画面は [M-UI-SCREENS] に従い phase から定まり、バトルは探索ワーカー（[I-ENV-WORKER]）と
// 再生ループ（[M-UI-PLAYBACK]）の上で進行する。

import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { ASSET_MASTERS } from '../data/generated/asset-masters.js';
import { ATTENDANT_MASTERS } from '../data/generated/attendant-masters.js';
import { BOOK_MASTERS } from '../data/generated/book-masters.js';
import { CREATURE_MASTERS } from '../data/generated/creature-masters.js';
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
import { inheritPool, previewInherit, type InheritTarget } from '../engine/progress/inherit.js';
import { canEnterTransition, canSettleIntermission } from '../engine/progress/refill.js';
import { canSacrifice } from '../engine/progress/sacrifice.js';
import type { GameMasters } from '../engine/run/masters.js';
import type { BattleCue } from '../engine/cue.js';
import type { ActionInstance, Unit, WatchKind } from '../engine/types.js';
import { AiDecisionClient } from './ai-client.js';
import { createAiWorkerPort } from './ai-worker-port.js';
import { loadConfig, saveConfig, type DisplayConfig } from './config.js';
import { renderBattleScreen, type BattleScreenHandlers } from './dom/battle-screen.js';
import { EffectLayer } from './dom/effects.js';
import { RecordingAudioDriver, type AudioCue, type AudioDriver } from './audio/driver.js';
import { bgmAssetOf, globalAssetOf, seAssetOf } from './audio/cues.js';
import {
  renderConfigOverlay,
  renderConfirmOverlay,
  renderDictionaryOverlay,
  renderEnding,
  renderFirstSightOverlay,
  renderIntermission,
  renderPreBattle,
  renderRefill,
  renderRollbackOverlay,
  renderTitle,
  type ConfirmDialog,
  type RollbackTarget,
  type ScreenHandlers,
} from './dom/screens.js';
import { PARAM_LABEL } from './format.js';
import { PlaybackLoop, stepsPerFrame } from './playback.js';
import { heroView, inheritOptions, refillView } from './view/intermission-view.js';
import { createStringTable, resolveHelp, type BundleValues } from './text.js';
import { buildBattleView, focusPreview, type UnitNaming } from './view/battle-view.js';
import { pauseReasonText, unitBundleOf } from './view/pause-text.js';
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
  creatures: CREATURE_MASTERS,
  attendants: ATTENDANT_MASTERS,
  heroInitActions: HERO_INIT_ACTIONS,
  crossIds: [],
  echoIds: [],
  helpIds: Object.keys(HELP_MASTERS),
};

// [M-RESOLVE-SUMMON] 召喚が要求するクリーチャーの実体化。採番は解決時のステートが持つ連番を用いる。
const stepDeps = {
  createCreature: createCreatureFactory({ creatures: CREATURE_MASTERS, actions: ACTION_MASTERS }),
};

// 画面の再描画で消えない演出層。ステージ直下に常置し、画面本体とは別に差し替える。
const screenRoot = document.createElement('div');
screenRoot.className = 'screen-root';
const effects = new EffectLayer(document.createElement('div'));
stageElement.append(screenRoot, effects.root);

// [M-DATA-AUDIO-CUE] 発火契機の受け口。実バトルの進行にのみ与える（未来予測・探索には与えない）。
// [M-DATA-AUDIO-CUE] 発火契機は演出と音響の双方へ配る（探索・未来予測では受け口を与えない）。
// [I-PLAN-ASSETS] 音源を持たない空実装。音量設定の適用と cue の発火契機を本番と同じ経路で通す。
const audio: AudioDriver = new RecordingAudioDriver();

const battleDeps = {
  ...stepDeps,
  onCue: (cue: BattleCue): void => {
    effects.play(cue);
    const assetId = seAssetOf(cue, ASSET_MASTERS);
    if (assetId !== null) {
      audio.playSe(cue.kind, assetId);
    }
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
let notice = ''; // 一度だけ提示するシステム文言（履歴が空である旨など）
let resultText = ''; // [M-PIPE-P5-DISCARD] 決着の提示。バトルを離れるまで残す。
let firstSightHelpId: string | null = null; // [M-DATA-HELPMASTER] 初出自動提示の対象

let currentBgm = ''; // 再生中の BGM 資産ID（同じ資産を鳴らし直さない）

// SE を1件鳴らす。対応する資産がなければ何もしない。
function playSe(cue: AudioCue): void {
  const assetId = globalAssetOf(cue, ASSET_MASTERS);
  if (assetId !== null) {
    audio.playSe(cue, assetId);
  }
}

// [M-DATA-AUDIO-CUE] BGM：バトル中は当該シーン、インターミッション中は共通の資産を鳴らす。
function syncBgm(): void {
  if (session === null) {
    return;
  }
  const { run } = session.data;
  const cue: AudioCue | null = run.phase === 'BATTLE' ? 'BATTLE' : run.phase === 'INTERMISSION' ? 'INTERMISSION' : null;
  const assetId = cue === null ? null : bgmAssetOf(cue, run.current_scene_id, ASSET_MASTERS);
  if (cue === null || assetId === null || assetId === currentBgm) {
    return;
  }
  currentBgm = assetId;
  audio.playBgm(cue, assetId);
}
let selectedAttendantId: string | null = null; // インターミッションの壇で選択中の従者

const ctx: GameContext = {
  masters,
  foeDecision: (state, unit) => (client === null ? { kind: 'PASS' } : client.decisionFor(state, unit)),
  stepDeps: battleDeps,
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
  if (session === null) {
    return {}; // 進行の開始前（タイトル）はランが存在しない。文言の確認ダイアログは共通キーを用いない。
  }
  const { run, meta } = session.data;
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

// [M-DATA-STRINGS] 継承の結果。見込み（[M-INHERIT-POOL]［継承・統合パイプライン］）の種別で文言を選ぶ。
function inheritDoneText(attendantId: string, target: InheritTarget): string {
  const { run } = requireSession().data;
  const preview = previewInherit(run, masters, attendantId, target);
  const common = commonKeys();
  if (preview.kind === 'MAX_HP') {
    return strings.resolve('STR_INHERIT_HP_ADD', { common, bundles: { ATTENDANT: attendantBundle(attendantId, preview.add) } });
  }
  if (preview.kind === 'VANISH') {
    return resolveString('STR_INHERIT_VANISH');
  }
  const label = actionName(preview.classId);
  if (preview.kind === 'NEW_SLOT') {
    return strings.resolve('STR_INHERIT_NEW_SLOT', { common, bundles: { ACTION: { ActionName: label } } });
  }
  // ［複数対象の提示］改善項目は1件の文言の中で読点で連ねる。
  const improved = preview.improved.map((key) => PARAM_LABEL[key] ?? (key === 'uses' ? '使用回数' : key)).join('・');
  return strings.resolve('STR_INHERIT_MERGED', {
    common,
    bundles: {
      ACTION: { ActionName: label, ImprovedList: improved },
      ATTENDANT: attendantBundle(attendantId),
    },
  });
}

// [M-DATA-INTERP] 従者1名分の文脈束。HpAdd は継承結果の提示でのみ意味を持つ。
function attendantBundle(attendantId: string, hpAdd = 0): BundleValues {
  return {
    AttendantName: attendantName(ATTENDANT_MASTERS, attendantId),
    AttendantEpithet: attendantEpithet(ATTENDANT_MASTERS, attendantId),
    HpAdd: hpAdd,
  };
}
const actionName = (classId: string): string => actions[classId]?.display_name ?? classId;

const naming: UnitNaming = {
  displayName: (unit: Unit) => (unit.side === 'MINE' ? HERO_INIT_UNIT.display_name : (enemies[currentScene().enemy_id]?.display_name ?? '─')),
  roleName: (unit: Unit) => (unit.side === 'MINE' ? HERO_INIT_UNIT.role_name : (enemies[currentScene().enemy_id]?.role_name ?? null)),
  actionName: (action: ActionInstance) => actionName(action.master_ref),
  actionDescription: (action: ActionInstance) => actions[action.master_ref]?.description ?? null,
};

function openConfirm(
  baseId: string,
  rows: readonly string[],
  onConfirm: () => void,
  bundles: Readonly<Record<string, BundleValues>> = {},
): void {
  dialog = {
    headText: resolveString(`${baseId}_HEAD`),
    bodyText: strings.resolve(baseId, { common: commonKeys(), bundles }),
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
  resultText = '';
  runAdvance(() =>
    startBattle(requireSession(), ctx, {
      watchDefault: config.watchDefault,
      maxSteps: Math.max(stepsPerFrame(config.defaultPlaybackSpeed), 1),
    }),
  );
  loop.speed = config.defaultPlaybackSpeed;
  loop.start();
  render();
}

// [M-DATA-HELPMASTER]［初出キー］未読の初出解説が残っていれば、次の1件を重ねて提示する。
function presentFirstSight(): void {
  if (session === null || session.data.run.phase !== 'PRE_BATTLE' || overlay !== 'NONE') {
    return;
  }
  const { run, meta } = session.data;
  const next = firstSightHelps(scenes[run.current_scene_id], helps, meta.help_seen)[0] ?? null;
  firstSightHelpId = next;
  overlay = next === null ? 'NONE' : 'FIRST_SIGHT';
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
    const loaded = loadGame(serialized, ctx, {
      maxSteps: Math.max(stepsPerFrame(config.defaultPlaybackSpeed), 1),
      watchDefault: config.watchDefault,
    });
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
    // ［既読の管理］初出の自動提示を読み終えた時点で既読とする。
    if (overlay === 'FIRST_SIGHT' && firstSightHelpId !== null) {
      requireSession().data.meta.help_seen[firstSightHelpId] = true;
      firstSightHelpId = null;
      overlay = 'NONE';
      presentFirstSight();
      render();
      return;
    }
    overlay = 'NONE';
    dialog = null;
    render();
  },
  onConfigChange: (next) => {
    audio.setVolumes(next.bgmVolume, next.seVolume); // [M-UI-CONFIG] 音量設定の適用
    config = next;
    saveConfig(window.localStorage, config);
    render();
  },
  onShowHelp: () => {
    // [M-DATA-HELPMASTER]［随時参照］閲覧は既読状態を書き換えない。既読は初出の自動提示で立てる。
    overlay = 'DICTIONARY';
    render();
  },
  onStartBattle: () => startScene(),
  onInherit: (attendantId, target: InheritTarget) => {
    // 結果の提示は継承の見込み（適用前）から組む（[M-DATA-STRINGS]）。
    notice = inheritDoneText(attendantId, target);
    confirmInherit(requireSession(), ctx, attendantId, target);
    render();
  },
  onSelectAttendant: (attendantId) => {
    selectedAttendantId = attendantId;
    render();
  },
  onSacrifice: (attendantId) => {
    const bundles = {
      ATTENDANT: attendantBundle(attendantId),
      SACRIFICE: { PartyCountAfter: requireSession().data.run.party.length - 1 },
    };
    openConfirm(
      'STR_CONFIRM_SACRIFICE',
      [],
      () => {
        confirmSacrifice(requireSession(), ctx, attendantId);
        notice = strings.resolve('STR_SACRIFICE_DONE', { common: commonKeys(), bundles: { ATTENDANT: attendantBundle(attendantId) } });
        render();
      },
      bundles,
    );
  },
  onSettleIntermission: () => {
    const current = requireSession();
    if (canEnterTransition(current.data.run, masters)) {
      enterTransition(current, ctx); // アクト移行の段（[M-PROG-REFILL]）へ進む
      render();
      return;
    }
    // [M-INHERIT-POOL]［継承枠の失効］どの従者の枠が失効するかを明示した確認を1度だけ行う。
    const forfeited = current.data.run.party.filter((slot) => slot.inherit_state === 'UNUSED');
    const rows = forfeited.map((slot) =>
      strings.resolve('STR_CONFIRM_FORFEIT_ROW', { common: commonKeys(), bundles: { ATTENDANT: attendantBundle(slot.attendant_id) } }),
    );
    openConfirm(forfeited.length === 0 ? 'STR_CONFIRM_IM_COMMIT' : 'STR_CONFIRM_FORFEIT', rows, () => {
      settleIntermission(requireSession(), ctx);
      notice = resolveString('STR_IM_COMMIT_DONE');
      render();
    });
  },
  // [M-PROG-REFILL] 補充の確定確認。対象は行として並べる（[M-DATA-STRINGS]［複数対象の提示］）。
  onRefill: (attendantId) => {
    const row = strings.resolve('STR_CONFIRM_REFILL_ROW', {
      common: commonKeys(),
      bundles: { ATTENDANT: attendantBundle(attendantId) },
    });
    openConfirm('STR_CONFIRM_REFILL', [row], () => {
      confirmRefill(requireSession(), ctx, attendantId);
      notice = resolveString('STR_REFILL_DONE');
      render();
    });
  },
  // [M-REWIND-UNDO]［確認を挟まない］1クリックで即時に適用する。
  // 履歴が空の場合は適用せず、その旨を提示する（[M-STATE-HISTORY]）。
  onUndo: () => {
    if (!canUndo(requireSession())) {
      notice = resolveString('STR_UNDO_UNAVAILABLE');
      render();
      return;
    }
    notice = '';
    playSe('UI_CANCEL'); // [M-DATA-AUDIO-CUE] UI_CANCEL：アンドゥ実行時
    undo(requireSession());
    client?.invalidate();
    focusedInstanceId = null;
    selectedInstanceId = null;
    // 復元先は確定操作の直前、すなわち《処理8》の時間停止中である。巻き戻した局面を
    // 見直せるよう、再生を続けずその場で静止させる（[M-REWIND-UNDO]・[M-UI-PLAYBACK]）。
    loop.speed = 'PAUSE';
    battleResult = 'PAUSED';
    render();
  },
  onRollbackBattle: () => {
    openConfirm('STR_CONFIRM_ROLLBACK_BATTLE', [], () => {
      client?.invalidate();
      // 再開は再生速度に従う（1回の呼び出しで時間停止まで進めきらない）。
      runAdvance(() => rollbackBattle(requireSession(), ctx, { maxSteps: Math.max(stepsPerFrame(loop.speed), 1) }));
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

// 一度だけ提示するシステム文言を取り出す（取り出したら消える）。
function takeNotice(): string {
  const text = notice;
  notice = '';
  return text;
}

// 時間を進める。自動時間停止中は確定操作2（ステップ進行確定・[M-STATE-HISTORY]）として
// 停止を解いてから進め、停止していない場合はそのまま続きを進める。
function stepForward(maxSteps: number): void {
  const session = requireSession();
  const state = session.data.run.battle_state;
  const steps = Math.max(maxSteps, 1);
  runAdvance(() =>
    state !== null && state.pause_reason !== null
      ? resumeTime(session, ctx, { maxSteps: steps })
      : resumeBattle(session, ctx, { maxSteps: steps }),
  );
}

// バトルの進行を1回行う。決着した場合は勝敗を提示する（[M-PIPE-P5-DISCARD]・[M-DATA-STRINGS]）。
// 勝利の決済では current_scene_id が次のシーンへ進むため、敵の名は進行の前に控える。
function runAdvance(advance: () => BattleResult): BattleResult {
  const enemy = session === null ? undefined : enemies[scenes[session.data.run.current_scene_id]?.enemy_id ?? ''];
  const result = advance();
  battleResult = result;
  // [M-DATA-AUDIO-CUE] WATCH_PAUSE：監視条件の立ち上がりエッジによる自動時間停止時。
  if (session?.data.run.battle_state?.pause_reason?.code === 'WATCH_MET') {
    playSe('WATCH_PAUSE');
  }
  if (result === 'WIN' || result === 'LOSS') {
    const text = strings.resolve(result === 'WIN' ? 'STR_RESULT_WIN' : 'STR_RESULT_LOSE', {
      common: commonKeys(),
      bundles: { ENEMY: { EnemyName: enemy?.display_name ?? '─', EnemyRoleName: enemy?.role_name ?? '─' } },
    });
    // 勝利は画面がインターミッションへ移るため一度だけの提示とし、敗北は盤面に残す。
    if (result === 'WIN') {
      notice = text;
    } else {
      resultText = text;
    }
  }
  return result;
}

// 進行中のバトルから離れる：再生ループと探索ワーカーを止める。
function leaveBattle(): void {
  loop.stop();
  client?.dispose();
  client = null;
  battleResult = 'PAUSED';
  resultText = '';
  selectedInstanceId = null;
  focusedInstanceId = null;
  effects.clear();
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
    playSe('UI_CONFIRM'); // [M-DATA-AUDIO-CUE] UI_CONFIRM：指示確定時
    // 指示後の進行も再生速度に従う（確定だけで時間停止まで進めきらない）。
    runAdvance(() =>
      instruct(requireSession(), ctx, unit.unit_id, instanceId, { maxSteps: Math.max(stepsPerFrame(loop.speed), 1) }),
    );
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
      noticeText: takeNotice(),
      resultText,
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
      // [M-UI-HUD]［判定語彙］相方に関する理由は文言マスタの完結した文。対象ユニットの束を供給する。
      lockText: (stringId, unitId) => {
        const unit = state.units.find((candidate): candidate is Unit => candidate !== null && candidate.unit_id === unitId);
        return strings.resolve(stringId, {
          common: commonKeys(),
          bundles: unit === undefined ? {} : { UNIT: unitBundleOf(unit, { unitName: naming.displayName, unitRoleName: naming.roleName }) },
        });
      },
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
      const selected =
        run.party.find((slot) => slot.attendant_id === selectedAttendantId)?.attendant_id ?? run.party[0]?.attendant_id ?? null;
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
          // [M-PROG-SACRIFICE] 供犠により消滅した従者。
          fallen: run.sacrificed.map((attendantId) => ({
            attendantId,
            name: attendantName(ATTENDANT_MASTERS, attendantId),
            epithet: attendantEpithet(ATTENDANT_MASTERS, attendantId),
          })),
          // 選択が失われた場合（供犠・決済）は先頭の従者へ戻す。
          selectedAttendantId: selected,
          hero: heroView(run, HERO_INIT_UNIT.display_name, actionName),
          // 継承権を使い切った（または継承できる資質がない）時点で供犠を選べるようにする。
          inheritDone: run.party.every((slot) => slot.inherit_state !== 'UNUSED') || inheritPool(run, masters).length === 0,
          pool: inheritOptions(run, masters, selected, HERO_INIT_UNIT.display_name, actionName, (label) =>
            strings.resolve('STR_INHERIT_NO_IMPROVE', { common: commonKeys(), bundles: { ACTION: { ActionName: label } } }),
          ),
          canSettle: canSettleIntermission(run, masters) || canEnterTransition(run, masters),
          isActTransition: canEnterTransition(run, masters),
          noAttendant: run.party.length === 0,
          noticeText: takeNotice(),
        },
        resolveString,
        actionName,
        screenHandlers,
      );
    }
    case 'REFILL':
      return renderRefill(
        refillView(
          run,
          masters,
          HERO_INIT_UNIT.display_name,
          (attendantId) => attendantName(ATTENDANT_MASTERS, attendantId),
          (attendantId) => attendantEpithet(ATTENDANT_MASTERS, attendantId),
          (slotCount, remainCount) =>
            strings.resolve('STR_REFILL_SHORT', { common: commonKeys(), bundles: { REFILL: { SlotCount: slotCount, RemainCount: remainCount } } }),
          takeNotice(),
        ),
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
    case 'FIRST_SIGHT': {
      if (firstSightHelpId === null) {
        return null;
      }
      const help = resolveHelp(helps[firstSightHelpId], commonKeys());
      return renderFirstSightOverlay(
        {
          ...help,
          leadText: strings.resolve('STR_HELP_FIRST_SIGHT', {
            common: commonKeys(),
            bundles: { HELP: { HelpTitle: help.title, HelpBody: help.body } },
          }),
        },
        screenHandlers,
      );
    }
    default:
      return null;
  }
}

function render(): void {
  syncBgm(); // [M-DATA-AUDIO-CUE] BGM は段に従う
  presentFirstSight(); // [M-DATA-HELPMASTER] 初出の自動提示はバトル開始前演出の提示に先んじる。
  screenRoot.replaceChildren();
  screenRoot.append(renderScreen());
  const overlayNode = renderOverlay();
  if (overlayNode !== null) {
    screenRoot.append(overlayNode); // 画面を遷移させず重ねて提示する。同時に開くのは1件に限る。
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
      runAdvance(() => resumeBattle(requireSession(), ctx, { maxSteps: stepsPerFrame(speed) }));
      render();
    }
    return true;
  },
);

render();
