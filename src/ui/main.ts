import { createCreatureFactory } from '../engine/creature.js';
// UI のエントリ。論理解像度のステージを表示領域へ合わせ、入力はマウスのみを扱う（[M-UI-VIEWPORT]）。
// 画面は [M-UI-SCREENS] に従い phase から定まり、バトルは探索ワーカー（[I-ENV-WORKER]）と
// 再生ループ（[M-UI-PLAYBACK]）の上で進行する。

import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { ECHO_MASTERS } from '../data/generated/echo-masters.js';
import { ASSET_MASTERS } from '../data/generated/asset-masters.js';
import { ATTENDANT_MASTERS } from '../data/generated/attendant-masters.js';
import { BREAKERS } from '../data/generated/breaker-masters.js';
import { BOOK_MASTERS } from '../data/generated/book-masters.js';
import { CREATURE_MASTERS } from '../data/generated/creature-masters.js';
import { ENEMY_MASTERS } from '../data/generated/enemy-masters.js';
import { HELP_MASTERS } from '../data/generated/help-masters.js';
import { HERO_INIT_ACTIONS, HERO_INIT_UNIT } from '../data/generated/hero-init.js';
import { SCENE_MASTERS } from '../data/generated/scene-masters.js';
import { SCRIPT_MASTERS } from '../data/generated/script-masters.js';
import { STRING_MASTERS } from '../data/generated/string-masters.js';
import type {
  ActionMasterRecord,
  AssetMasterRecord,
  EnemyMasterRecord,
  HelpMasterRecord,
  SceneMasterRecord,
  ScriptDirective,
  ScriptMasterRecord,
} from '../data/types.js';
import { instruct, resumeBattle, resumeTime, setWatch, startBattle, type AdvanceOptions, type BattleResult } from '../engine/game/battle.js';
import {
  confirmInherit,
  confirmRefill,
  confirmSacrifice,
  enterTransition,
  openSacrificeConfirm,
  settleIntermission,
} from '../engine/game/intermission.js';
import { canUndo, rollbackBattle, rollbackIntermission, rollbackOrders, undo } from '../engine/game/rewind.js';
import { loadGame, newGameSession, peekSave } from '../engine/game/save.js';
import { autosave, type GameContext, type GameSession } from '../engine/game/session.js';
import { executableActions } from '../engine/decision.js';
import { inheritPool, previewInherit, type InheritTarget } from '../engine/progress/inherit.js';
import { canEnterTransition, canSettleIntermission } from '../engine/progress/refill.js';
import { canSacrifice } from '../engine/progress/sacrifice.js';
import type { GameMasters } from '../engine/run/masters.js';
import type { BattleCue } from '../engine/cue.js';
import { conditionReader, evaluateCondition } from '../engine/script/condition.js';
import { scriptById, scriptsAt } from '../engine/script/select.js';
import type { ActionInstance, BattleState, Unit, WatchKind } from '../engine/types.js';
import { placeholderHue } from './assets/placeholder.js';
import { assetUrl, assetUrlById, pickAsset, type AssetCondition, type StancePose } from './assets/resolve.js';
import { setFigureLookup } from './dom/art.js';
import { sceneEntries, sceneJumpData, sceneSelectEnabled } from './dev/scene-select.js';
import { lanternView } from './view/lantern-view.js';
import { AiDecisionClient } from './ai-client.js';
import { createAiWorkerPort } from './ai-worker-port.js';
import { loadConfig, saveConfig, type DisplayConfig } from './config.js';
import { renderBattleScreen, type BattleScreenHandlers } from './dom/battle-screen.js';
import type { UndoMotion } from './dom/undo-motion.js';
import { renderScriptScreen } from './dom/script-screen.js';
import { EffectLayer } from './dom/effects.js';
import { FigureMotion } from './dom/figure-motion.js';
import { stancePoseOf } from './view/figure-motion.js';
import { WebAudioDriver, type AudioCue, type AudioDriver, type BgmHush } from './audio/driver.js';
import { CHORDAL, readScore, SCENE_SCORES, VOICES, type Score } from './audio/ensemble.js';
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
  renderSceneSelectOverlay,
  renderTitle,
  type ConfirmDialog,
  type RollbackTarget,
  type ScreenHandlers,
} from './dom/screens.js';
import { PARAM_LABEL } from './format.js';
import { PlaybackLoop, stepsPerFrame } from './playback.js';
import { BattleCueTracker } from './script-cues.js';
import { ScriptPlayer, type ScriptSegment } from './script-player.js';
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
const scripts: Readonly<Record<string, ScriptMasterRecord>> = SCRIPT_MASTERS;
const strings = createStringTable(STRING_MASTERS);

const masters: GameMasters = {
  actions: ACTION_MASTERS,
  enemies: ENEMY_MASTERS,
  scenes: SCENE_MASTERS,
  books: BOOK_MASTERS,
  breakers: BREAKERS,
  creatures: CREATURE_MASTERS,
  attendants: ATTENDANT_MASTERS,
  heroInitActions: HERO_INIT_ACTIONS,
  crossIds: [],
  echoes: ECHO_MASTERS,
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
// [M-UI-SCRIPT] 脚本の提示の層。文字送りのたびに画面本体を描き直さないよう、別の層に置く。
const scriptRoot = document.createElement('div');
scriptRoot.className = 'script-root';
stageElement.append(screenRoot, effects.root, scriptRoot);
// [M-UI-HUD]［立ち絵の動き］消滅猶予の残像は演出層に置く。演出の簡略化は設定を都度引く。
const figureMotion = new FigureMotion(effects.root, () => config.simplifyEffects);

// [M-META-COMMIT]【提示】回帰回数が増えたとき、燈火が吹き消される瞬間として画面を暗転させてから戻す（暫定値）。
const BLACKOUT_FALL_MS = 60; // 暗転にかける時間（吹き消すように、ほぼ一瞬で落とす）
const BLACKOUT_HOLD_MS = 250; // 暗いまま保つ時間
const BLACKOUT_RISE_MS = 350; // 戻すのにかける時間
let seenRewindCount: number | null = null; // 最後に描画した回帰回数（セッションが無い間は Null）
let blackout: HTMLElement | null = null; // 提示中の暗転の層。提示の間は時間を進めず、操作を受け付けない
let afterBlackout: (() => void)[] = []; // 提示の間に届いた進行（敵軍の応答など）。戻した後に行う

// 回帰回数の増加を見て、暗転を始める。セッションの読み込み・終了による変化は増加とみなさない。
function watchRewindCount(): void {
  const count = session?.data.meta.total_rewind_count ?? null;
  if (seenRewindCount !== null && count !== null && count > seenRewindCount) {
    startBlackout();
  }
  seenRewindCount = count;
}

function startBlackout(): void {
  if (blackout !== null) {
    return;
  }
  const layer = document.createElement('div');
  layer.className = 'blackout';
  const total = BLACKOUT_FALL_MS + BLACKOUT_HOLD_MS + BLACKOUT_RISE_MS;
  layer.animate(
    [
      { opacity: 0, easing: 'linear' },
      { opacity: 1, offset: BLACKOUT_FALL_MS / total },
      { opacity: 1, offset: (BLACKOUT_FALL_MS + BLACKOUT_HOLD_MS) / total, easing: 'ease-out' },
      { opacity: 0 },
    ],
    { duration: total, fill: 'forwards' },
  );
  stageElement.append(layer);
  blackout = layer;
  window.setTimeout(endBlackout, total);
}

function endBlackout(): void {
  blackout?.remove();
  blackout = null;
  syncBgmSilence(); // 暗転の終了とともに BGM を戻す
  const pending = afterBlackout;
  afterBlackout = [];
  for (const run of pending) {
    run();
  }
}

// 巻き戻しの保留中（アンドゥ・ロールバックの実行から確定まで）は重低音だけをごく小さく残し、
// 暗転の提示の間は重低音を含めて途切れさせる。変わったときだけ伝える。
let bgmHush: BgmHush = 'NONE';
function syncBgmSilence(): void {
  const hush: BgmHush = blackout !== null ? 'SILENT' : (session?.data.pending.rewind_pending ?? false) ? 'FAINT' : 'NONE';
  if (hush !== bgmHush) {
    bgmHush = hush;
    audio.hushBgm(hush);
  }
}

// 暗転の提示の間は進行を待たせ、戻した後に行う。
function whenLit(run: () => void): void {
  if (blackout === null) {
    run();
  } else {
    afterBlackout.push(run);
  }
}

// [M-DATA-AUDIO-CUE] 発火契機の受け口。実バトルの進行にのみ与える（未来予測・探索には与えない）。
// [M-DATA-AUDIO-CUE] 発火契機は演出と音響の双方へ配る（探索・未来予測では受け口を与えない）。
// [I-PLAN-ASSETS] 音声の実体を鳴らす。実体の無い資産は鳴らさず、呼び出しの経路は空実装と同じに通す。
const audio: AudioDriver = new WebAudioDriver((assetId) => {
  const url = assetUrlById(ASSET_MASTERS, assetId);
  return url === null ? null : new URL(url, document.baseURI).href;
});

const battleDeps = {
  ...stepDeps,
  onCue: (cue: BattleCue): void => {
    effects.play(cue);
    figureMotion.cue(cue); // [M-UI-HUD]［立ち絵の動き］
    const assetId = seAssetOf(cue, ASSET_MASTERS);
    if (assetId !== null) {
      audio.playSe(cue.kind, assetId);
    }
  },
};

// [M-UI-SCREENS]［開発用のシーン選択］起動時の指定（?scene-select）があるときに限ってタイトルに出す。
const SCENE_SELECT = sceneSelectEnabled(window.location.search);

let config: DisplayConfig = loadConfig(window.localStorage);
audio.setVolumes(config.bgmVolume, config.seVolume); // [M-UI-CONFIG] 起動時の音量
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
// [M-UI-SCRIPT] 提示中の脚本。提示の間、背後の画面は操作を受け付けない。
let script: { readonly player: ScriptPlayer; readonly hue: number; readonly sceneId: string; readonly onDone: () => void } | null = null;
let introShown = false; // 現在の PRE_BATTLE で開幕の脚本を提示したか。PRE_BATTLE を離れると戻す。
const cueTracker = new BattleCueTracker();
let dueCues: string[] = []; // [S-SCRIPT-TRIGGER]【バトル中の契機】成立して再生を待つ契機の anchor

let currentBgm = ''; // 鳴らしている層の資産ID（同じ資産を鳴らし直さない）
let silencedLayer: string | null = null; // SILENCE で止めた層。状況が変わるまで再開しない
let pulseState = ''; // 重低音の資産と間隔（変わったときだけ伝える）
let ensembleScene: string | null = null; // 戦闘の合奏を鳴らしているシーン
let undoMotion: UndoMotion | null = null; // [M-REWIND-UNDO]【提示】アンドゥの直前の姿（次の描画で一度だけ用いる）
let timeStopped = false; // [M-UI-PLAYBACK]【静止中の演出】を掛けているか

// SE を1件鳴らす。対応する資産がなければ何もしない。
function playSe(cue: AudioCue): void {
  const assetId = globalAssetOf(cue, ASSET_MASTERS);
  if (assetId !== null) {
    audio.playSe(cue, assetId);
  }
}

// 【戦闘の合奏】譜を、声部（variant）ごとの資産IDと区切りごとの再生の速さへ写す。資産の無い声部は鳴らさない。
function ensembleOf(score: Score): Record<string, (number | null)[]> {
  const result: Record<string, (number | null)[]> = {};
  for (const voice of VOICES) {
    const record = Object.values(ASSET_MASTERS).find((candidate) => candidate.cue === 'ENSEMBLE' && candidate.variant === voice);
    if (record === undefined) {
      continue;
    }
    if (CHORDAL.includes(voice)) {
      // 和音は根音・3度・5度を、同じ資産を別々の高さで同時に鳴らす（声部の鍵に「#番号」を付ける）。
      for (const tone of [0, 1, 2]) {
        result[`${record.asset_id}#${tone}`] = readScore(voice, score[voice], tone);
      }
    } else {
      result[record.asset_id] = readScore(voice, score[voice]);
    }
  }
  return result;
}

// [M-DATA-AUDIO-CUE]【BGM の構成】重低音の間隔（暫定値）。燈の中の声の間は延ばす。
const PULSE_INTERVAL_MS = 1600;
const PULSE_SLOW_INTERVAL_MS = 3200;

// 状況に応じて重ねる層。Null は層を鳴らさない（タイトル・燈の中の声）。
function layerCue(): AudioCue | null {
  if (session === null) {
    return null;
  }
  const screen = screenOf(session.data.run);
  if (screen === 'ENDING') {
    return 'ENDING';
  }
  if (script !== null) {
    return script.player.view().lantern ? null : 'CALM';
  }
  switch (screen) {
    case 'BATTLE':
      return null; // バトルは層を重ねず、戦闘の合奏を鳴らす（【戦闘の合奏】）
    case 'INTERMISSION':
    case 'REFILL':
      return 'INTERMISSION';
    default:
      return 'CALM';
  }
}

// [M-DATA-AUDIO-CUE]【BGM の構成】重低音はエンディングまで一定の間隔で鳴らし続け、状況に応じた層を重ねる。
function syncBgm(): void {
  const ending = session !== null && screenOf(session.data.run) === 'ENDING';
  const lantern = script !== null && script.player.view().lantern;
  const pulseAsset = ending ? null : bgmAssetOf('PULSE', null, ASSET_MASTERS);
  const interval = lantern ? PULSE_SLOW_INTERVAL_MS : PULSE_INTERVAL_MS;
  if (pulseState !== `${pulseAsset}/${interval}`) {
    pulseState = `${pulseAsset}/${interval}`;
    audio.setPulse(pulseAsset, interval);
  }

  const cue = layerCue();
  const assetId = cue === null ? null : bgmAssetOf(cue, session?.data.run.current_scene_id ?? null, ASSET_MASTERS);
  const key = `${cue}/${assetId}`;
  if (silencedLayer !== null && silencedLayer !== key) {
    silencedLayer = null; // 状況が変わったので、止めた層を再開する
  }
  if (silencedLayer === null && (assetId ?? '') !== currentBgm) {
    if (cue === null || assetId === null) {
      audio.silence();
    } else {
      audio.playBgm(cue, assetId);
    }
    currentBgm = assetId ?? '';
  }

  // 【戦闘の合奏】バトルの間、シーンの譜を重低音の拍に合わせて鳴らす。時間停止中も止めない。
  const inBattle = session !== null && screenOf(session.data.run) === 'BATTLE' && script === null;
  const sceneId = session?.data.run.current_scene_id ?? '';
  const score = inBattle ? SCENE_SCORES[sceneId] : undefined;
  const nextEnsembleScene = score === undefined ? null : sceneId;
  if (nextEnsembleScene !== ensembleScene) {
    ensembleScene = nextEnsembleScene;
    audio.setEnsemble(score === undefined ? null : ensembleOf(score));
  }
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
    // [M-DATA-INTERP]［ランの開始前］タイトルではランが存在しない。導出元がランに依存しないキーのみを供給する
    // （タイトルから開く辞典の解説が用いる）。
    return { HeroName: HERO_INIT_UNIT.display_name };
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
  // [M-STATE-UNIT] 仮身はクリーチャーマスタの表示名で示し、役割名を持たない。
  displayName: (unit: Unit) =>
    unit.creature_id !== null
      ? (masters.creatures[unit.creature_id]?.display_name ?? '─')
      : unit.side === 'MINE'
        ? HERO_INIT_UNIT.display_name
        : (enemies[currentScene().enemy_id]?.display_name ?? '─'),
  roleName: (unit: Unit) =>
    unit.unit_kind === 'CREATURE'
      ? null
      : unit.side === 'MINE'
        ? HERO_INIT_UNIT.role_name
        : (enemies[currentScene().enemy_id]?.role_name ?? null),
  actionName: (action: ActionInstance) => actionName(action.master_ref),
  actionDescription: (action: ActionInstance) => actions[action.master_ref]?.description ?? null,
  // [S-LOOK-PRINCIPLE]「盤面に置く姿」主人公・敵マスター・仮身。セインの仮身は元の敵の仮身と同じ画を用いる。
  // [M-DATA-ASSETMASTER]［構えの選択］発生中は系統ごとの構えの画を示す。
  figure: (unit: Unit) =>
    unit.unit_kind === 'CREATURE'
      ? figureOf('CREATURE', unit.creature_id ?? null, stancePoseOf(unit))
      : unit.side === 'MINE'
        ? figureOf('HERO', null, stancePoseOf(unit))
        : figureOf('ENEMY', currentScene().enemy_id, stancePoseOf(unit)),
};

// ── [I-PLAN-ASSETS]【実体の投入】表示アセットの実体 ──

// 差分の条件式（[M-DATA-ASSETMASTER]【差分の選択】）。ランの開始前は基準の画を用いる。
function assetTest(): AssetCondition | null {
  return session === null ? null : (condition) => evaluateCondition(condition, conditionReader(session as GameSession, masters));
}

// 構えの画が無い、または実体が無いときは、構えを示さずに基準の側の画へ戻す（［構えの選択］「選び方」）。
function figureOf(ownerKind: AssetMasterRecord['owner_kind'], ownerId: string | null, pose: StancePose | null = null): string | null {
  const posed = pose === null ? null : assetUrl(pickAsset(ASSET_MASTERS, ownerKind, ownerId, 'STANDING', assetTest(), pose));
  return posed ?? assetUrl(pickAsset(ASSET_MASTERS, ownerKind, ownerId, 'STANDING', assetTest()));
}
setFigureLookup(figureOf);

// CSS の url() に渡す参照先。相対のままではスタイルシートの位置から解決されるため、文書の位置を基準に絶対化する。
function absoluteUrl(url: string | null): string | null {
  return url === null ? null : new URL(url, document.baseURI).href;
}

function cssUrl(url: string): string {
  return `url("${absoluteUrl(url)}")`;
}

// シーンの戦闘背景（variant が Null の画）。
function sceneBackgroundUrl(sceneId: string): string | null {
  return assetUrl(pickAsset(ASSET_MASTERS, 'SCENE', sceneId, 'BACKGROUND', null));
}

// 画面の背景。インターミッションと補充は直前にクリアしたシーンの戦闘背景を暗くして用いる（[S-BG-INTERMISSION]）。
function screenBackgroundUrl(): string | null {
  if (session === null) {
    return assetUrlById(ASSET_MASTERS, 'ASSET_BG_TITLE');
  }
  const { run } = session.data;
  const scene = scenes[run.current_scene_id];
  const screen = screenOf(run);
  if (screen === 'INTERMISSION' || screen === 'REFILL') {
    const previous = Object.values(scenes).find((candidate) => candidate.order === scene.order - 1);
    return previous === undefined ? null : sceneBackgroundUrl(previous.scene_id);
  }
  return sceneBackgroundUrl(scene.scene_id);
}

// ── [M-UI-SCRIPT] 脚本の提示 ──

// 発火した時点のステートで条件式を評価する読み取り（[S-SCRIPT-CONDITION]［評価の時点］）。
const readCondition = () => conditionReader(requireSession(), masters);

// 背景のプレースホルダの色相（[I-PLAN-ASSETS]）。シーンごとに定める。
const sceneHue = (sceneId: string): number => placeholderHue(`ASSET_BG_${sceneId}`);

// 発火点のレコード列。燈の中の声（[M-UI-SCRIPT]【燈の中の声】）は SACRIFICE_EXECUTE のレコードである。
function triggerSegment(trigger: ScriptMasterRecord['trigger'], anchor: string | null): ScriptSegment {
  return { records: scriptsAt(scripts, trigger, anchor, readCondition()), lantern: trigger === 'SACRIFICE_EXECUTE' };
}

// 残響マスタの script_id から再生するレコード（版を選んだ後のもの）。燈の中の声として示す。
function echoSegment(echoIds: readonly string[]): ScriptSegment {
  const read = readCondition();
  const records = echoIds
    .map((echoId) => masters.echoes[echoId]?.script_id ?? null)
    .filter((scriptId): scriptId is string => scriptId !== null)
    .map((scriptId) => scriptById(scripts, scriptId, read))
    .filter((record): record is ScriptMasterRecord => record !== null);
  return { records, lantern: true };
}

// 行の提示に伴って実行する演出指示のうち、音と進行に関わるもの。表示に関わるものは描画側が扱う。
function runDirectives(directives: readonly ScriptDirective[]): void {
  if (directives.includes('SILENCE')) {
    // [S-SCRIPT-DIRECTIVE] 層を止める。重低音は止めない。次に状況が変わったときに層を再開する。
    audio.silence();
    const cue = layerCue();
    silencedLayer = `${cue}/${cue === null ? null : bgmAssetOf(cue, session?.data.run.current_scene_id ?? null, ASSET_MASTERS)}`;
    currentBgm = '';
  }
}

function drawScript(): void {
  scriptRoot.replaceChildren();
  syncBgm(); // 脚本の提示（燈の中の声を含む）に応じて重低音と層を合わせる
  if (script === null) {
    return;
  }
  scriptRoot.append(
    renderScriptScreen(
      script.player.view(),
      {
        hue: script.hue,
        url: absoluteUrl(assetUrlById(ASSET_MASTERS, script.player.view().background) ?? sceneBackgroundUrl(script.sceneId)),
      },
      {
      onAdvance: () => {
        script?.player.click();
        afterScriptInput();
      },
      onSkip: () => {
        if (script !== null) {
          runDirectives(script.player.skip());
        }
        afterScriptInput();
      },
    }),
  );
}

function finishScript(): void {
  const finished = script;
  script = null;
  scriptRoot.replaceChildren();
  finished?.onDone();
}

function afterScriptInput(): void {
  if (script === null) {
    return;
  }
  if (script.player.done) {
    finishScript();
    return;
  }
  runDirectives(script.player.currentDirectives);
  drawScript();
}

// 描画フレームごとの文字送り。実時刻を用いない（[M-UI-PLAYBACK] と同じくフレーム同期）。
// 提示が終わった直後に次の提示が始まることがあるため、ループは1本に限る。
let scriptLoopRunning = false;

function scriptFrame(): void {
  if (script !== null) {
    const before = script.player.currentDirectives;
    script.player.tick(config.textSpeed);
    if (script.player.done) {
      finishScript();
    } else {
      if (script.player.currentDirectives !== before) {
        runDirectives(script.player.currentDirectives);
      }
      drawScript();
    }
  }
  if (script === null) {
    scriptLoopRunning = false;
    return;
  }
  window.requestAnimationFrame(scriptFrame);
}

function ensureScriptLoop(): void {
  if (!scriptLoopRunning) {
    scriptLoopRunning = true;
    window.requestAnimationFrame(scriptFrame);
  }
}

// レコード列を1回の提示として再生し、終えたら onDone を呼ぶ。再生するレコードがなければ直ちに呼ぶ。
function playScript(segments: readonly ScriptSegment[], sceneId: string, onDone: () => void): void {
  const player = new ScriptPlayer(segments.filter((segment) => segment.records.length > 0));
  if (player.done) {
    onDone();
    return;
  }
  script = { player, hue: sceneHue(sceneId), sceneId, onDone };
  runDirectives(player.currentDirectives);
  drawScript();
  ensureScriptLoop();
}

// [S-SCRIPT-TRIGGER] SCENE_INTRO：バトル開始前演出フェーズに入ったとき1度提示する。
function presentIntro(): void {
  if (session === null || session.data.run.phase !== 'PRE_BATTLE') {
    introShown = false;
    return;
  }
  if (introShown || script !== null) {
    return;
  }
  introShown = true;
  const sceneId = session.data.run.current_scene_id;
  playScript([triggerSegment('SCENE_INTRO', sceneId)], sceneId, () => render());
}

// [S-SCRIPT-TRIGGER]【バトル中の契機】表示側の契機判定。成立した契機は再生済みとして控え、再生を待たせる。
// バトル中のセーブからの再開ではセッションが作られる前に歩進するため、シーンはセーブから与える。
const cueAtFor =
  (sceneId: string) =>
  (state: BattleState): boolean => {
    const due = cueTracker.take(state, sceneId, scripts);
    dueCues = due;
    return due.length > 0;
  };

const advanceOptions = (maxSteps: number, sceneId: string = requireSession().data.run.current_scene_id): AdvanceOptions => ({
  maxSteps: Math.max(maxSteps, 1),
  cueAt: cueAtFor(sceneId),
});

function cueSegments(anchors: readonly string[]): ScriptSegment[] {
  return anchors.map((anchor) => triggerSegment('BATTLE_CUE', anchor));
}

// 契機で止まったバトルを、脚本の提示の後に続ける。
function playDueCues(): void {
  const sceneId = requireSession().data.run.current_scene_id;
  const anchors = dueCues;
  dueCues = [];
  playScript(cueSegments(anchors), sceneId, () => {
    battleResult = 'RUNNING';
    runAdvance(() => resumeBattle(requireSession(), ctx, advanceOptions(stepsPerFrame(loop.speed))));
    render();
  });
}

// 勝利の決着：勝敗の確定の直前の契機 → 撃破後（SCENE_CLEAR）→ 種別Aの残響 の順に1回の提示とする。
function playClearScripts(clearedSceneId: string): void {
  const current = requireSession();
  const won = current.won_battle_state ?? null;
  const finalCues = won === null ? [] : cueTracker.take(won, clearedSceneId, scripts);
  current.won_battle_state = null;
  const echoes = current.cleared_echoes ?? [];
  current.cleared_echoes = [];
  playScript(
    [...cueSegments(finalCues), triggerSegment('SCENE_CLEAR', clearedSceneId), echoSegment(echoes)],
    clearedSceneId,
    () => render(),
  );
}

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
    // 回帰の暗転の間に届いた応答は、戻した後に進める（[M-META-COMMIT]【提示】）。
    whenLit(() => {
      stepForward(stepsPerFrame(loop.speed));
      render();
    });
  });
}

function startScene(): void {
  const scene = currentScene();
  attachClient(scene.scene_id);
  resultText = '';
  cueTracker.reset(); // ステップ0の生成
  runAdvance(() =>
    startBattle(requireSession(), ctx, {
      ...advanceOptions(stepsPerFrame(config.defaultPlaybackSpeed)),
      watchDefault: config.watchDefault,
    }),
  );
  loop.speed = config.defaultPlaybackSpeed;
  loop.start();
  render();
}

// [M-DATA-HELPMASTER]［初出キー］未読の初出解説が残っていれば、次の1件を重ねて提示する。
function presentFirstSight(): void {
  if (session === null || session.data.run.phase !== 'PRE_BATTLE' || overlay !== 'NONE' || script !== null) {
    return;
  }
  const { run, meta } = session.data;
  const next = firstSightHelps(scenes[run.current_scene_id], helps, meta.help_seen)[0] ?? null;
  firstSightHelpId = next;
  overlay = next === null ? 'NONE' : 'FIRST_SIGHT';
}

const screenHandlers: ScreenHandlers = {
  onOpenSceneSelect: () => {
    overlay = 'SCENE_SELECT';
    render();
  },
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
    cueTracker.reset(); // バトル中のセーブからの再開はステップ0の生成直後から
    const loaded = loadGame(serialized, ctx, {
      ...advanceOptions(stepsPerFrame(config.defaultPlaybackSpeed), saved.run.current_scene_id),
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
    // ［既読の管理］初出の自動提示を読み終えた時点で既読とし、保存する（[M-META-SAVEDATA]［保存契機］）。
    if (overlay === 'FIRST_SIGHT' && firstSightHelpId !== null) {
      requireSession().data.meta.help_seen[firstSightHelpId] = true;
      autosave(requireSession(), ctx);
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
  // [M-PROG-SACRIFICE] 種別Dの残響 → 確定ダイアログ → 確定 → 〈目覚め〉 の順に提示する（[M-META-ECHO]・[S-WAKE-DESIGN]）。
  onSacrifice: (attendantId) => {
    const bundles = {
      ATTENDANT: attendantBundle(attendantId),
      SACRIFICE: { PartyCountAfter: requireSession().data.run.party.length - 1 },
    };
    const sceneId = requireSession().data.run.current_scene_id;
    const confirm = (): void =>
      openConfirm(
        'STR_CONFIRM_SACRIFICE',
        [],
        () => {
          confirmSacrifice(requireSession(), ctx, attendantId);
          notice = strings.resolve('STR_SACRIFICE_DONE', { common: commonKeys(), bundles: { ATTENDANT: attendantBundle(attendantId) } });
          playScript([triggerSegment('SACRIFICE_EXECUTE', attendantId)], sceneId, () => render());
          render();
        },
        bundles,
      );
    const echoId = openSacrificeConfirm(requireSession(), ctx, attendantId);
    if (echoId === null) {
      confirm();
      return;
    }
    playScript([echoSegment([echoId])], sceneId, confirm);
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
      const settle = (): void => {
        settleIntermission(requireSession(), ctx);
        notice = resolveString('STR_IM_COMMIT_DONE');
        render();
      };
      const { run } = requireSession().data;
      if (run.intermission_stage !== 'TRANSITION') {
        settle();
        return;
      }
      // [S-SCRIPT-TRIGGER] ACT_TRANSITION：アクト移行決済の直前。anchor は移行元アクト番号。
      const fromAct = String(scenes[run.current_scene_id].act - 1);
      playScript([triggerSegment('ACT_TRANSITION', fromAct)], run.current_scene_id, settle);
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
    const before = requireSession().data.run.battle_state;
    if (before !== null) {
      const view = buildBattleView({ state: before, deps: stepDeps, naming, selectedInstanceId: null });
      undoMotion = { timeline: view.timeline, plates: view.columns.flatMap((column) => (column.plate === null ? [] : [column.plate])) };
    }
    undo(requireSession(), ctx);
    const restored = requireSession().data.run.battle_state;
    if (restored === null) {
      undoMotion = null; // バトルの外へ戻った場合は示さない
    } else {
      cueTracker.rewindTo(restored.step); // 巻き戻した先より後に再生した契機は、再び通過すれば再生する
    }
    client?.invalidate();
    resultText = ''; // 決着の前へ戻った場合、決着の提示を残さない
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
      cueTracker.reset(); // ステップ0へ巻き戻す
      resultText = ''; // 決着の提示は、やり直したバトルには残さない
      runAdvance(() => rollbackBattle(requireSession(), ctx, advanceOptions(stepsPerFrame(loop.speed))));
      render();
    });
  },
  // [M-REWIND-ROLLBACK] 過去インターミッションへの復帰。復帰先より後のスナップショットは破棄される。
  onRollbackIntermission: (order) => {
    // ［複数対象の提示］破棄されるインターミッション（復帰先より後の段）を行として並べる。
    // 行の文言は束を持たないため、再走の行き先と同じ表示でどの段かを添える。
    const rows = rollbackTargets()
      .filter((candidate) => candidate.order > order)
      .map((candidate) => `${resolveString('STR_CONFIRM_ROLLBACK_IM_ROW')}：${candidate.sceneNumber} ${candidate.sceneName} の前`);
    openConfirm('STR_CONFIRM_ROLLBACK_IM', rows, () => {
      leaveBattle();
      rollbackIntermission(requireSession(), ctx, order);
      render();
    });
  },
};

// アンドゥの直前の姿を取り出す（取り出したら消える）。
function takeUndoMotion(): UndoMotion | null {
  const motion = undoMotion;
  undoMotion = null;
  return motion;
}

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
      ? resumeTime(session, ctx, advanceOptions(steps))
      : resumeBattle(session, ctx, advanceOptions(steps)),
  );
}

// バトルの進行を1回行う。決着した場合は勝敗を提示する（[M-PIPE-P5-DISCARD]・[M-DATA-STRINGS]）。
// 勝利の決済では current_scene_id が次のシーンへ進むため、敵の名は進行の前に控える。
function runAdvance(advance: () => BattleResult): BattleResult {
  const sceneId = session?.data.run.current_scene_id ?? '';
  const enemy = session === null ? undefined : enemies[scenes[sceneId]?.enemy_id ?? ''];
  const result = advance();
  battleResult = result;
  if (result === 'CUE') {
    playDueCues();
    return result;
  }
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
      playClearScripts(sceneId);
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
  figureMotion.clear();
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
      instruct(requireSession(), ctx, unit.unit_id, instanceId, advanceOptions(stepsPerFrame(loop.speed))),
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
      undoFrom: takeUndoMotion(),
      figureMotion,
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
    return renderTitle(
      { ...titleView(serialized === null ? null : peekSave(serialized)), sceneSelect: SCENE_SELECT },
      (id) => strings.resolve(id),
      screenHandlers,
    );
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
          lantern: lanternView(run, masters, meta.total_rewind_count),
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
  // [M-STATE-IMSNAPSHOT] order は直前にクリアしたシーンの進行順である。復帰先は次のシーンの前のインターミッションとして示す。
  return rollbackOrders(session).map((order) => {
    const scene = Object.values(scenes).find((candidate) => candidate.order === order + 1);
    return {
      order,
      sceneNumber: scene === undefined ? String(order) : sceneNumberOf(scene.scene_id),
      sceneName: scene?.display_name ?? '',
    };
  });
}

function renderOverlay(): HTMLElement | null {
  switch (overlay) {
    case 'SCENE_SELECT':
      return renderSceneSelectOverlay(
        sceneEntries(masters),
        (sceneId) => {
          session = { data: sceneJumpData(masters, sceneId), battle_start_run: null };
          overlay = 'NONE';
          introShown = false;
          autosave(session, ctx);
          render();
        },
        screenHandlers,
      );
    case 'CONFIG':
      return renderConfigOverlay(config, screenHandlers);
    case 'DICTIONARY':
      return renderDictionaryOverlay(
        dictionaryEntries(helps, session?.data.meta.help_seen ?? {}),
        (helpId) => resolveHelp(helps[helpId], commonKeys()),
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

// [M-UI-PLAYBACK]【静止中の演出】バトルの時間が進んでいない間（自動時間停止中・再生速度 PAUSE で静止中）か。
// 再生中の敵軍の応答待ちは一時的な待ちであり、含めない。
function isTimeStopped(): boolean {
  if (session === null || screenOf(session.data.run) !== 'BATTLE' || script !== null) {
    return false;
  }
  return battleResult === 'PAUSED' || (loop.speed === 'PAUSE' && (battleResult === 'RUNNING' || battleResult === 'AWAIT_FOE'));
}

// 静止中は世界（戦闘背景と立ち絵）の彩度と明るさを落とし、層と合奏をこもらせる。変わったときだけ伝える。
function syncTimeStop(): void {
  const stopped = isTimeStopped();
  screenRoot.classList.toggle('time-stopped', stopped);
  // 思考中の呼吸は世界が動く間（敵軍の応答待ちを含む）だけ進める。決着後は止める。
  figureMotion.setStopped(stopped || (battleResult !== 'RUNNING' && battleResult !== 'AWAIT_FOE'));
  if (stopped !== timeStopped) {
    timeStopped = stopped;
    audio.muffleLayers(stopped);
  }
}

function render(): void {
  syncBgm(); // [M-DATA-AUDIO-CUE] BGM は段に従う
  syncTimeStop();
  watchRewindCount(); // [M-META-COMMIT]【提示】
  syncBgmSilence();
  presentIntro(); // [S-SCRIPT-TRIGGER] SCENE_INTRO。初出の解説は開幕の脚本を終えてから提示する。
  presentFirstSight(); // [M-DATA-HELPMASTER] 初出の自動提示はバトル開始前演出の提示に先んじる。
  screenRoot.replaceChildren();
  const screenNode = renderScreen();
  const backgroundUrl = screenBackgroundUrl();
  if (backgroundUrl !== null) {
    screenNode.style.setProperty('--screen-image', cssUrl(backgroundUrl));
  }
  screenRoot.append(screenNode);
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
    if (stepsPerFrame(speed) > 0 && battleResult === 'RUNNING' && blackout === null) {
      runAdvance(() => resumeBattle(requireSession(), ctx, advanceOptions(stepsPerFrame(speed))));
      render();
    }
    return true;
  },
);

render();
