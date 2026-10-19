// [V-TEST-REFAI]［シーン単位の勝率測定］到達局面の集合の収集、到達局面からのシーン単体の試行、目標勝率との集計。
// 長時間の実行と並列化は CLI（scene-trials-cli.js）が担い、本モジュールは1件ずつの処理と集計を提供する。

import { signedRoundDiv } from '../../src/ai/fixed.js';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.js';
import type { SaveData } from '../../src/engine/meta/types.js';
import type { BattleState } from '../../src/engine/types.js';
import { floorDiv, roundDiv } from '../../src/num/helpers.js';
import { buildProfileOf, playBuildIntermission } from './build-profiles.js';
import { perturbationSet } from './perturb.js';
import { createRun, playIntermission, playScene, type RefPolicy } from './runner.js';

export type TrialPolicy = Exclude<RefPolicy, 'PASSIVE'>;

// ［到達局面の集合］の出所。参照プレイヤーAIの3方針 × 摂動21件、ビルドプロファイル7件 × 摂動21件。
export type ArrivalSource =
  | { readonly kind: 'ref'; readonly policy: TrialPolicy; readonly pid: string }
  | { readonly kind: 'build'; readonly profile: string; readonly pid: string };

export const REF_POLICIES: readonly TrialPolicy[] = ['BALANCE', 'ATTACK', 'DEFENSE'];
export const BUILD_PROFILE_IDS: readonly string[] = ['BP-01', 'BP-02', 'BP-03', 'BP-04', 'BP-05', 'BP-06', 'BP-07'];

export function allSources(): ArrivalSource[] {
  const pids = perturbationSet().map((entry) => entry.id);
  const sources: ArrivalSource[] = [];
  for (const policy of REF_POLICIES) {
    for (const pid of pids) {
      sources.push({ kind: 'ref', policy, pid });
    }
  }
  for (const profile of BUILD_PROFILE_IDS) {
    for (const pid of pids) {
      sources.push({ kind: 'build', profile, pid });
    }
  }
  return sources;
}

export function sourceName(source: ArrivalSource): string {
  return source.kind === 'ref' ? `ref_${source.policy}_${source.pid}` : `build_${source.profile}_${source.pid}`;
}

// ［戦闘方針と重み］出所の試行の戦闘方針。ビルドプロファイルは [V-TEST-BUILD-PROFILES] の戦闘方針。
export function sourcePolicy(source: ArrivalSource): TrialPolicy {
  if (source.kind === 'ref') {
    return source.policy;
  }
  const policy = buildProfileOf(source.profile).policy;
  if (policy === 'PASSIVE') {
    throw new Error(`無操作型のビルドプロファイルは測定の対象外: ${source.profile}`);
  }
  return policy;
}

function weightsOf(pid: string) {
  const entry = perturbationSet().find((candidate) => candidate.id === pid);
  if (entry === undefined) {
    throw new Error(`未知の摂動プロファイル: ${pid}`);
  }
  return entry.profile;
}

// FNV-1a（64ビット）。到達局面のキーに用いる（暗号学的な強度は要しない）。
function fnv1a64(text: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

// 到達局面の同一性。HistoryStack とインターミッションスナップショットは戦闘に影響しないため除く。
export function arrivalKey(serialized: string): string {
  const data = JSON.parse(serialized) as SaveData;
  return fnv1a64(JSON.stringify({ ...data.run, history_stack: [], im_snapshots: [] }));
}

// 出所の通しプレイ（再挑戦なし）を行い、各シーンの開始時点の周回データを onArrival へ渡す。
// 敗北または測定不能で打ち切る（[V-TEST-NONFUNC]［測定の打ち切り］）。
export function collectArrivals(source: ArrivalSource, onArrival: (sceneId: string, serialized: string) => void): void {
  const weights = weightsOf(source.pid);
  const policy = sourcePolicy(source);
  const profile = source.kind === 'build' ? buildProfileOf(source.profile) : null;
  const { session, ctx } = createRun();
  const lastOrder = Object.keys(SCENE_MASTERS).length - 1; // 5-11 は対象外（[M-TMPL-VESSEL]）
  for (let turn = 0; turn < lastOrder; turn += 1) {
    onArrival(session.data.run.current_scene_id, JSON.stringify(session.data));
    const outcome = playScene(session, ctx, policy, undefined, weights);
    if (!outcome.measured || outcome.result !== 'WIN' || turn + 1 >= lastOrder) {
      return;
    }
    if (profile === null) {
      playIntermission(session, ctx, policy, turn);
    } else {
      playBuildIntermission(session, ctx, profile, turn);
    }
  }
}

// ［到達時HPの水準］
export const HP_LEVELS: readonly number[] = [100, 75, 50];

export interface SceneTrial {
  readonly scene: string; // 'SCENE_x_yy'
  readonly state: string; // arrivalKey
  readonly policy: TrialPolicy;
  readonly hpPct: number;
  readonly hpIn: readonly [number, number];
  readonly result: string;
  readonly steps: number;
  readonly within: boolean;
  readonly measured: boolean;
  // ［余裕］勝利時は主人公の残りHP%、敗北時は敵マスターの残りHP%に負号。決着しなかった場合は null。
  readonly margin: number | null;
  // 決着の型の分析用。勝った側のマスターが最後に実行したアクション（決着しなかった場合は null）と、
  // 決着の直前の観測での負けた側のマスターの残りHP%。
  readonly finisher?: string | null;
  readonly loserHpBefore?: number | null;
}

// 到達局面から当該シーンのみを無摂動の重みで1回戦う。現在HPは最大HPの hpPct%（切り捨て、最低1）に置き換える。
export function playSceneTrial(serialized: string, policy: TrialPolicy, hpPct: number): SceneTrial {
  const data = JSON.parse(serialized) as SaveData;
  const { session, ctx } = createRun(data);
  const run = session.data.run;
  run.hero_hp = Math.max(1, floorDiv(run.hero_max_hp * hpPct, 100));
  const scene = run.current_scene_id;
  const hpIn = [run.hero_hp, run.hero_max_hp] as const;
  // 観測の有無で決着は変わらない（[V-TEST-NONFUNC]［D-09 の実測］）。各ステップで両マスターの残りHP%と
  // 最後に実行したアクションだけを控える。
  const last: Record<'MINE' | 'FOE', { hpPct: number; act: string | null }> = {
    MINE: { hpPct: 100, act: null },
    FOE: { hpPct: 100, act: null },
  };
  const observe = (state: BattleState) => {
    for (const unit of state.units) {
      if (unit !== null && unit.unit_kind === 'MASTER') {
        last[unit.side] = { hpPct: roundDiv(unit.hp * 100, unit.max_hp), act: unit.last_act?.class_id ?? null };
      }
    }
  };
  const outcome = playScene(session, ctx, policy, observe, weightsOf('BASE'));
  const winner = outcome.result === 'WIN' ? 'MINE' : outcome.result === 'LOSS' ? 'FOE' : null;
  let margin: number | null = null;
  if (outcome.result === 'WIN') {
    margin = roundDiv(session.data.run.hero_hp * 100, session.data.run.hero_max_hp);
  } else if (outcome.result === 'LOSS') {
    const foe = session.data.run.battle_state?.units.find((unit) => unit !== null && unit.side === 'FOE' && unit.unit_kind === 'MASTER');
    margin = foe === undefined || foe === null ? null : -roundDiv(foe.hp * 100, foe.max_hp);
  }
  return {
    scene,
    state: arrivalKey(serialized),
    policy,
    hpPct,
    hpIn,
    result: outcome.result,
    steps: outcome.steps,
    within: outcome.within,
    measured: outcome.measured,
    margin,
    finisher: winner === null ? null : last[winner].act,
    loserHpBefore: winner === null ? null : last[winner === 'MINE' ? 'FOE' : 'MINE'].hpPct,
  };
}

// ［目標勝率］の区分と目標（centi）。通常シーンの消耗の目標は最大HPの 10〜30%。
export type SceneBand = 'TUTORIAL' | 'NORMAL' | 'BOSS' | 'FINAL';

export function bandOf(sceneId: string): SceneBand {
  if (!(sceneId in SCENE_MASTERS) || sceneId === 'SCENE_5_11') {
    throw new Error(`目標勝率の対象外のシーン: ${sceneId}`); // 5-11 は [M-TMPL-VESSEL] により対象外
  }
  if (sceneId === 'SCENE_1_01') return 'TUTORIAL';
  if (['SCENE_1_02', 'SCENE_2_04', 'SCENE_3_06', 'SCENE_4_08'].includes(sceneId)) return 'BOSS';
  if (sceneId === 'SCENE_5_10') return 'FINAL';
  return 'NORMAL';
}

// 勝率の目標はチュートリアル（下限）と最終ボスに限る。通常シーンは消耗を目標とし、勝率は確かめる対象とする
// （［目標勝率］「通常シーンの勝率の確認」）。ボスは勝率・消耗とも確かめる対象とする（同「ボスの扱い」）。
export const TARGET_WIN_RATE: Readonly<Record<SceneBand, Readonly<Record<TrialPolicy, number>> | null>> = {
  TUTORIAL: { BALANCE: 95, ATTACK: 95, DEFENSE: 95 },
  NORMAL: null,
  BOSS: null,
  FINAL: { BALANCE: 25, ATTACK: 30, DEFENSE: 20 },
};

// チュートリアルの目標は下限（以上）、最終ボスは目標値そのもの。
export function isLowerBound(band: SceneBand): boolean {
  return band === 'TUTORIAL';
}

// 通常シーンの勝率の確認：これを下回るシーンは壁となっていないかを調べる。
export const NORMAL_WIN_RATE_CHECK = 90;
// 通常シーンの消耗の目標の帯。
export const NORMAL_CONSUMPTION_RANGE: readonly [number, number] = [10, 30];
// ボスの消耗の参照の帯（暫定、調整の目標ではない）。
export const BOSS_CONSUMPTION_RANGE: readonly [number, number] = [30, 70];

export interface SceneSummary {
  readonly scene: string;
  readonly policy: TrialPolicy;
  // 到達局面の出所の区分（weightsOf が区分名を返した場合のみ。例：'ref_DEFENSE'・'BP-02'）。
  readonly group: string | null;
  readonly band: SceneBand;
  // 件数はいずれも重み付き（［集計の重み］）。
  readonly trials: number; // 測定できた試行（測定不能を除く）
  readonly wins: number;
  readonly winRate: number; // centi
  readonly target: number | null; // ボスは null
  readonly marginMean: number | null;
  // ［消耗］到達時HP100%の水準で勝利した試行の、失ったHPの最大HPに対する百分率（100 − 余裕）の平均。
  readonly consumptionMean: number | null;
  readonly winRateByHp: Readonly<Record<string, number | null>>;
  readonly overLimit: number;
  readonly unmeasured: number;
}

interface WeightedTrial {
  readonly trial: SceneTrial;
  readonly weight: number;
}

const weightOf = (entries: readonly WeightedTrial[]) => entries.reduce((sum, entry) => sum + entry.weight, 0);

// 重み付きの平均。余裕は敗北時に負となるため、符号付きの丸め除算で平均する。
function mean(entries: readonly WeightedTrial[], valueOf: (trial: SceneTrial) => number): number | null {
  const total = weightOf(entries);
  return total === 0 ? null : signedRoundDiv(entries.reduce((sum, entry) => sum + entry.weight * valueOf(entry.trial), 0), total);
}

// シーン × 方針ごとの集計。シーンは order 順、方針は REF_POLICIES の順に並べる。
// weightsOf は試行ごとに {出所の区分: 重み} を返す（［集計の重み］：当該の局面に到達した出所のうち、
// 戦闘方針が一致するものの件数）。区分名を '' とすれば区分に分けず、空でなければ区分ごとに分ける
// （最大HPの異なる出所が1行に混ざると消耗の平均が歪むため）。省くと各試行を重み1で数える。
export function summarizeTrials(
  trials: readonly SceneTrial[],
  weightsOf: (trial: SceneTrial) => Readonly<Record<string, number>> = () => ({ '': 1 }),
): SceneSummary[] {
  const groups: Record<string, WeightedTrial[]> = {};
  for (const trial of trials) {
    for (const [groupName, weight] of Object.entries(weightsOf(trial))) {
      if (weight > 0) (groups[`${trial.scene}|${trial.policy}|${groupName}`] ??= []).push({ trial, weight });
    }
  }
  const orderOf = (scene: string) => SCENE_MASTERS[scene as keyof typeof SCENE_MASTERS]?.order ?? 0;
  const keys = Object.keys(groups).sort((left, right) => {
    const [ls, lp, lg] = left.split('|');
    const [rs, rp, rg] = right.split('|');
    return (
      orderOf(ls) - orderOf(rs) ||
      REF_POLICIES.indexOf(lp as TrialPolicy) - REF_POLICIES.indexOf(rp as TrialPolicy) ||
      lg.localeCompare(rg)
    );
  });
  return keys.map((key) => {
    const group = groups[key];
    const [scene, policy, groupName] = key.split('|') as [string, TrialPolicy, string];
    const band = bandOf(scene);
    const measured = group.filter(({ trial }) => trial.measured);
    const isWin = ({ trial }: WeightedTrial) => trial.result === 'WIN';
    const total = weightOf(measured);
    const wins = weightOf(measured.filter(isWin));
    const winRateByHp: Record<string, number | null> = {};
    for (const level of HP_LEVELS) {
      const atLevel = measured.filter(({ trial }) => trial.hpPct === level);
      const atLevelTotal = weightOf(atLevel);
      winRateByHp[String(level)] = atLevelTotal === 0 ? null : roundDiv(weightOf(atLevel.filter(isWin)) * 100, atLevelTotal);
    }
    return {
      scene,
      policy,
      group: groupName === '' ? null : groupName,
      band,
      trials: total,
      wins,
      winRate: total === 0 ? 0 : roundDiv(wins * 100, total),
      target: TARGET_WIN_RATE[band]?.[policy] ?? null,
      marginMean: mean(
        measured.filter(({ trial }) => trial.margin !== null),
        (trial) => trial.margin as number,
      ),
      consumptionMean: mean(
        measured.filter(({ trial }) => trial.hpPct === 100 && trial.result === 'WIN' && trial.margin !== null),
        (trial) => 100 - (trial.margin as number),
      ),
      winRateByHp,
      overLimit: weightOf(measured.filter(({ trial }) => !trial.within)),
      unmeasured: weightOf(group) - total,
    };
  });
}

// 実験用：シーンごとに敵マスターの最大HPと expected_length を centi 倍率でメモリ上だけ差し替える
// （生成マスタは変更しない）。spec は "2_01=200,2_02=150" の形。プロセスごとに1度だけ呼ぶ。
export function applySceneMultipliers(spec: string, enemyMasters: Record<string, { max_hp: number }>): void {
  for (const pair of spec.split(',').filter((entry) => entry !== '')) {
    const [scene, multText] = pair.split('=');
    const mult = Number(multText);
    const master = SCENE_MASTERS[`SCENE_${scene}` as keyof typeof SCENE_MASTERS] as { enemy_id: string; expected_length: number | null } | undefined;
    if (master === undefined || !Number.isInteger(mult) || mult <= 0) {
      throw new Error(`倍率の指定が不正: ${pair}`);
    }
    const enemy = enemyMasters[master.enemy_id];
    enemy.max_hp = roundDiv(enemy.max_hp * mult, 100);
    if (master.expected_length !== null) {
      master.expected_length = roundDiv(master.expected_length * mult, 100);
    }
  }
}
