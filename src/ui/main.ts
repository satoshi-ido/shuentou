// UI のエントリ。論理解像度のステージを表示領域へ合わせ、入力はマウスのみを扱う（[M-UI-VIEWPORT]）。
// バトル画面は、探索ワーカー（[I-ENV-WORKER]）と再生ループ（[M-UI-PLAYBACK]）の上で進行する。

import { ACTION_MASTERS } from '../data/generated/action-masters.js';
import { ATTENDANT_MASTERS } from '../data/generated/attendant-masters.js';
import { BOOK_MASTERS } from '../data/generated/book-masters.js';
import { ENEMY_MASTERS } from '../data/generated/enemy-masters.js';
import { HERO_INIT_ACTIONS, HERO_INIT_UNIT } from '../data/generated/hero-init.js';
import { SCENE_MASTERS } from '../data/generated/scene-masters.js';
import { STRING_MASTERS } from '../data/generated/string-masters.js';
import { instruct, resumeBattle, setWatch, startBattle, type BattleResult } from '../engine/game/battle.js';
import { newGameSession } from '../engine/game/save.js';
import type { GameContext } from '../engine/game/session.js';
import type { ActionMasterRecord, EnemyMasterRecord, SceneMasterRecord } from '../data/types.js';
import type { GameMasters } from '../engine/run/masters.js';
import type { ActionInstance, Unit, WatchKind } from '../engine/types.js';
import { AiDecisionClient } from './ai-client.js';
import { createAiWorkerPort } from './ai-worker-port.js';
import { loadConfig } from './config.js';
import { createStringTable } from './text.js';
import { pauseReasonText } from './view/pause-text.js';
import { renderBattleScreen } from './dom/battle-screen.js';
import { PlaybackLoop, stepsPerFrame } from './playback.js';
import { buildBattleView, type UnitNaming } from './view/battle-view.js';
import { applyViewport } from './viewport.js';

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage');
if (viewport === null || stage === null) {
  throw new Error('ステージ要素が見つからない');
}

const fit = (): void => applyViewport(stage, viewport.clientWidth, viewport.clientHeight);
window.addEventListener('resize', fit);
fit();

// 右クリックは取り消し・1階層の遡行に割り当てるため、既定のコンテキストメニューを抑止する。
stage.addEventListener('contextmenu', (event) => event.preventDefault());

const config = loadConfig(window.localStorage);
const SCENE_ID = 'SCENE_1_01';

const actions: Readonly<Record<string, ActionMasterRecord>> = ACTION_MASTERS;
const enemies: Readonly<Record<string, EnemyMasterRecord>> = ENEMY_MASTERS;
const scenes: Readonly<Record<string, SceneMasterRecord>> = SCENE_MASTERS;

const masters: GameMasters = {
  actions: ACTION_MASTERS,
  enemies: ENEMY_MASTERS,
  scenes: SCENE_MASTERS,
  books: BOOK_MASTERS,
  attendants: ATTENDANT_MASTERS,
  heroInitActions: HERO_INIT_ACTIONS,
  crossIds: [],
  echoIds: [],
  helpIds: [],
};

const naming: UnitNaming = {
  displayName: (unit: Unit) =>
    unit.side === 'MINE' ? HERO_INIT_UNIT.display_name : (enemies[scenes[SCENE_ID].enemy_id]?.display_name ?? '─'),
  roleName: (unit: Unit) =>
    unit.side === 'MINE' ? HERO_INIT_UNIT.role_name : (enemies[scenes[SCENE_ID].enemy_id]?.role_name ?? null),
  actionName: (action: ActionInstance) => actions[action.master_ref]?.display_name ?? action.master_ref,
};

const strings = createStringTable(STRING_MASTERS);

// [M-DATA-INTERP]［キーの語彙］共通キー。進行に応じて更新する値はここへ集約する。
function commonKeys(): Record<string, string | number> {
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
    SceneNumber: scene.scene_id.replace('SCENE_', '').replace('_', '-'),
    HeroName: HERO_INIT_UNIT.display_name,
    HeroHp: run.hero_hp,
    HeroHpMax: run.hero_max_hp,
  };
}

const stepDeps = {
  createCreature: (): never => {
    throw new Error('クリーチャーマスタは未投入である');
  },
};

const client = new AiDecisionClient(createAiWorkerPort(), SCENE_ID, () => {
  // 応答が届いた時点で中断地点から再開する（[I-ENV-WORKER]）。
  apply(resumeBattle(session, ctx));
});

const ctx: GameContext = {
  masters,
  foeDecision: client.decisionFor,
  stepDeps,
  persist: (serialized) => window.localStorage.setItem('shuentou.save', serialized),
};

const session = newGameSession(ctx);
let selectedInstanceId: string | null = null;
let result: BattleResult = 'RUNNING';

function render(): void {
  const state = session.data.run.battle_state;
  if (state === null) {
    return;
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
          actionName: (classId) => actions[classId]?.display_name ?? classId,
        });
  renderBattleScreen(stage as HTMLElement, { view, pauseText, selectedInstanceId, speed: loop.speed }, handlers);
}

function apply(next: BattleResult): void {
  result = next;
  render();
}

const handlers = {
  onSelect: (instanceId: string): void => {
    selectedInstanceId = instanceId;
    render();
  },
  onInstruct: (instanceId: string): void => {
    const state = session.data.run.battle_state;
    const unit = state?.units.find((candidate) => candidate !== null && candidate.side === 'MINE' && candidate.acts.some((a) => a.instance_id === instanceId));
    if (state === null || unit === null || unit === undefined) {
      return;
    }
    selectedInstanceId = null;
    apply(instruct(session, ctx, unit.unit_id, instanceId));
  },
  onCancel: (): void => {
    selectedInstanceId = null;
    render();
  },
  onToggleWatch: (instanceId: string, kind: WatchKind): void => {
    const state = session.data.run.battle_state;
    const on = state?.watching[instanceId]?.[kind] ?? false;
    setWatch(session, instanceId, kind, !on);
    render();
  },
  onResume: (): void => {
    apply(resumeBattle(session, ctx, { maxSteps: 1 }));
  },
  onSpeed: (speed: (typeof loop)['speed']): void => {
    loop.speed = speed;
    render();
  },
};

// [M-UI-PLAYBACK] 歩進は描画フレーム同期。時間停止中・応答待ちの間はステップを進めない。
const loop = new PlaybackLoop(
  { request: (callback) => window.requestAnimationFrame(callback), cancel: (handle) => window.cancelAnimationFrame(handle) },
  (speed) => {
    const budget = stepsPerFrame(speed);
    if (budget > 0 && result === 'RUNNING') {
      apply(resumeBattle(session, ctx, { maxSteps: budget }));
    }
    return result !== 'WIN' && result !== 'LOSS';
  },
);
loop.speed = config.defaultPlaybackSpeed;

apply(startBattle(session, ctx, { watchDefault: config.watchDefault, maxSteps: stepsPerFrame(config.defaultPlaybackSpeed) }));
loop.start();
