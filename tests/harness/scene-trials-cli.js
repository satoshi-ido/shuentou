#!/usr/bin/env node
// [V-TEST-REFAI]［シーン単位の勝率測定］のCLI。到達局面の集合の収集・シーン単体の試行・集計を行う。
// いずれも子プロセスで並列に実行し、中断しても同じコマンドで続きから再開できる（済んだ分は飛ばす）。
//
//   node tests/harness/scene-trials-cli.js collect <bankDir> [--jobs N] [--only ref_BALANCE_BASE,...]
//   node tests/harness/scene-trials-cli.js measure <bankDir> <outDir> [--jobs N] [--scenes 3_06,4_08] [--hp 100,75,50] [--scene-mult 2_01=200,...]
//   node tests/harness/scene-trials-cli.js summary <outDir> [--bank <bankDir>]（出所ごとに分ける）
//   node tests/harness/scene-trials-cli.js playthrough <outDir> [--jobs N] [--scene-mult ...]
//   node tests/harness/scene-trials-cli.js playthrough-summary <outDir>
//
// 生成物（到達局面・試行結果）はリポジトリに置かない。Node 22 では --experimental-strip-types を付けて起動する。
// --scene-mult は実験用で、シーンごとに敵マスターの最大HPと expected_length をメモリ上だけ差し替える。

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// src のモジュールは相互参照を `.js` 拡張子で書くため、`.ts` へ読み替える解決フックを登録する
// （tools/audit/index.js と同じ。registerHooks を持たない Node 22.14 では register へ切り替える）。
if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
        const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
        if (existsSync(candidate)) {
          return { url: candidate.href, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
  });
} else {
  const hooks = `import { existsSync } from 'node:fs';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
    if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
  nodeModule.register(`data:text/javascript,${encodeURIComponent(hooks)}`);
}

const SELF = fileURLToPath(import.meta.url);
const [command, ...rest] = process.argv.slice(2);

function option(name, fallback) {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : fallback;
}

function positional() {
  const values = [];
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index].startsWith('--')) {
      index += 1;
    } else {
      values.push(rest[index]);
    }
  }
  return values;
}

function readJsonl(file) {
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

// jobs（引数配列の列）を子プロセスで並列に実行する。子の失敗は errors.log に残して続ける。
function runPool(jobs, concurrency, errorLog, env = {}) {
  return new Promise((resolve) => {
    let next = 0;
    let running = 0;
    let done = 0;
    const started = Date.now();
    if (jobs.length === 0) {
      resolve();
      return;
    }
    const launch = () => {
      while (running < concurrency && next < jobs.length) {
        const args = jobs[next];
        next += 1;
        running += 1;
        let stderr = '';
        const child = spawn(process.execPath, [...process.execArgv, SELF, ...args], {
          stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...process.env, ...env },
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('close', (code) => {
          running -= 1;
          done += 1;
          if (code !== 0) {
            appendFileSync(errorLog, `${JSON.stringify({ args, code, stderr: stderr.slice(-2000) })}\n`);
          }
          const minutes = Math.round((Date.now() - started) / 60000);
          console.log(`[${done}/${jobs.length}] ${code === 0 ? 'ok' : `exit ${code}`} ${args.slice(1).join(' ')} (${minutes}分)`);
          if (done === jobs.length) {
            resolve();
          } else {
            launch();
          }
        });
      }
    };
    launch();
  });
}

// 到達局面の索引：<bank>/sources/<出所>.jsonl の各行 {scene, key} を集め、局面ごとに出所の方針をまとめる。
async function loadIndex(bankDir) {
  const { allSources, sourceName, sourcePolicy } = await import('./scene-trials.js');
  const policyOf = Object.fromEntries(allSources().map((source) => [sourceName(source), sourcePolicy(source)]));
  const index = {};
  const sourcesDir = join(bankDir, 'sources');
  for (const file of existsSync(sourcesDir) ? readdirSync(sourcesDir).filter((name) => name.endsWith('.jsonl')) : []) {
    const name = file.replace(/\.jsonl$/, '');
    for (const { scene, key } of readJsonl(join(sourcesDir, file))) {
      const entry = ((index[scene] ??= {})[key] ??= { policies: [] });
      if (!entry.policies.includes(policyOf[name])) {
        entry.policies.push(policyOf[name]);
        entry.policies.sort();
      }
    }
  }
  return index;
}

async function collect() {
  const [bankDir] = positional();
  const jobs = Number(option('jobs', '8'));
  const { allSources, sourceName } = await import('./scene-trials.js');
  mkdirSync(join(bankDir, 'sources'), { recursive: true });
  // --only は出所名（ref_BALANCE_BASE 等）のカンマ区切り。確認用に一部だけ収集する。
  const only = option('only', '')
    .split(',')
    .filter((value) => value !== '');
  const pending = allSources()
    .map(sourceName)
    .filter((name) => only.length === 0 || only.includes(name))
    .filter((name) => !existsSync(join(bankDir, 'sources', `${name}.done`)));
  console.log(`出所 ${pending.length} 件を収集する`);
  await runPool(
    pending.map((name) => ['worker-collect', bankDir, name]),
    jobs,
    join(bankDir, 'errors.log'),
  );
  const index = await loadIndex(bankDir);
  let total = 0;
  for (const scene of Object.keys(index).sort()) {
    const count = Object.keys(index[scene]).length;
    total += count;
    console.log(`${scene}\t${count}`);
  }
  console.log(`到達局面 ${total} 件`);
}

async function workerCollect() {
  const [bankDir, name] = positional();
  const { allSources, sourceName, collectArrivals, arrivalKey } = await import('./scene-trials.js');
  const source = allSources().find((candidate) => sourceName(candidate) === name);
  if (source === undefined) {
    throw new Error(`未知の出所: ${name}`);
  }
  const lines = [];
  collectArrivals(source, (scene, serialized) => {
    const key = arrivalKey(serialized);
    const dir = join(bankDir, 'states', scene);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${key}.json`);
    if (!existsSync(file)) {
      try {
        writeFileSync(file, serialized, { flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    lines.push(JSON.stringify({ scene, key }));
  });
  // 出所の記録は完了時にまとめて書き、.done で完了を示す（途中で止まった出所は再開時にやり直す）。
  writeFileSync(join(bankDir, 'sources', `${name}.jsonl`), `${lines.join('\n')}\n`);
  writeFileSync(join(bankDir, 'sources', `${name}.done`), '');
}

async function measure() {
  const [bankDir, outDir] = positional();
  const jobs = Number(option('jobs', '8'));
  const scenes = option('scenes', '')
    .split(',')
    .filter((value) => value !== '')
    .map((value) => `SCENE_${value}`);
  const levels = option('hp', '100,75,50').split(',').map(Number);
  const mult = option('scene-mult', '');
  mkdirSync(outDir, { recursive: true });
  const index = await loadIndex(bankDir);
  const done = {};
  for (const file of readdirSync(outDir).filter((name) => name.endsWith('.jsonl'))) {
    for (const trial of readJsonl(join(outDir, file))) {
      done[`${trial.scene}|${trial.state}|${trial.policy}|${trial.hpPct}`] = true;
    }
  }
  const pending = [];
  for (const scene of Object.keys(index).sort()) {
    if (scenes.length > 0 && !scenes.includes(scene)) continue;
    for (const [key, entry] of Object.entries(index[scene])) {
      for (const policy of entry.policies) {
        for (const level of levels) {
          if (!done[`${scene}|${key}|${policy}|${level}`]) {
            pending.push(['worker-trial', bankDir, outDir, scene, key, policy, String(level)]);
          }
        }
      }
    }
  }
  console.log(`試行 ${pending.length} 件を実行する${mult === '' ? '' : `（倍率 ${mult}）`}`);
  await runPool(pending, jobs, join(outDir, 'errors.log'), mult === '' ? {} : { SCENE_TRIALS_MULT: mult });
}

async function workerTrial() {
  const [bankDir, outDir, scene, key, policy, level] = positional();
  if (process.env.SCENE_TRIALS_MULT) {
    const { applySceneMultipliers } = await import('./scene-trials.js');
    const { ENEMY_MASTERS } = await import('../../src/data/generated/enemy-masters.js');
    applySceneMultipliers(process.env.SCENE_TRIALS_MULT, ENEMY_MASTERS);
  }
  const { playSceneTrial } = await import('./scene-trials.js');
  const serialized = readFileSync(join(bankDir, 'states', scene, `${key}.json`), 'utf8');
  const trial = playSceneTrial(serialized, policy, Number(level));
  appendFileSync(join(outDir, `${scene}.jsonl`), `${JSON.stringify(trial)}\n`);
}

async function summary() {
  const [outDir] = positional();
  const { summarizeTrials, isLowerBound, NORMAL_WIN_RATE_CHECK, NORMAL_CONSUMPTION_RANGE, BOSS_CONSUMPTION_RANGE } =
    await import('./scene-trials.js');
  const trials = readdirSync(outDir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) => readJsonl(join(outDir, name)));
  const pad = (value, width) => String(value ?? '-').padStart(width);
  const outside = (value, [low, high]) => value !== null && (value < low || value > high);
  // --bank を与えると、到達局面の出所の区分（ref_<方針>・BP-xx）ごとに分けて集計する。
  const bankDir = option('bank', '');
  let groupOf;
  if (bankDir !== '') {
    const labels = {};
    for (const file of readdirSync(join(bankDir, 'sources')).filter((name) => name.endsWith('.jsonl'))) {
      const name = file.replace(/\.jsonl$/, '');
      const label = name.startsWith('ref_') ? name.split('_').slice(0, 2).join('_') : name.split('_')[1];
      for (const { scene, key } of readJsonl(join(bankDir, 'sources', file))) {
        const entry = (labels[`${scene}|${key}`] ??= []);
        if (!entry.includes(label)) entry.push(label);
      }
    }
    groupOf = (trial) => (labels[`${trial.scene}|${trial.state}`] ?? ['?']).sort().join('+');
  }
  console.log(
    `scene       policy   ${groupOf === undefined ? '' : 'source            '}band       n  win%  target  margin  consume | 100%  75%  50% | over unmeas`,
  );
  for (const row of summarizeTrials(trials, groupOf)) {
    // 勝率：! は下限の目標を下回るもの、? は通常シーンの確認（90%）を下回るもの。
    let winMark = ' ';
    if (isLowerBound(row.band) && row.winRate < row.target) winMark = '!';
    if (row.band === 'NORMAL' && row.winRate < NORMAL_WIN_RATE_CHECK) winMark = '?';
    // 消耗：! は通常シーンの目標の帯を外れるもの、? はボスの参照の帯を外れるもの。出所で分けた場合は、
    // 参照プレイヤーAIを出所とする行に限って判定する（［目標勝率］「通常シーンの消耗」）。
    let consumeMark = ' ';
    const judged = row.group === null || row.group.split('+').some((label) => label.startsWith('ref_'));
    if (judged && row.band === 'NORMAL' && outside(row.consumptionMean, NORMAL_CONSUMPTION_RANGE)) consumeMark = '!';
    if (judged && row.band === 'BOSS' && outside(row.consumptionMean, BOSS_CONSUMPTION_RANGE)) consumeMark = '?';
    console.log(
      `${row.scene.padEnd(11)} ${row.policy.padEnd(8)} ${row.group === null ? '' : `${row.group.padEnd(17)} `}${row.band.padEnd(8)} ${pad(row.trials, 4)}  ${pad(row.winRate, 4)}${winMark} ${pad(row.target, 5)}${isLowerBound(row.band) ? '+' : ' '}  ${pad(row.marginMean, 6)}  ${pad(row.consumptionMean, 6)}${consumeMark} | ${['100', '75', '50'].map((level) => pad(row.winRateByHp[level], 4)).join(' ')} | ${pad(row.overLimit, 4)} ${pad(row.unmeasured, 5)}`,
    );
  }
  console.log(
    `試行 ${trials.length} 件（! は目標を外れたもの、? は確かめる対象の基準・参照の帯を外れたもの。+ は「以上」の目標）`,
  );
}

// 通しプレイによる確認（［シーン単位の勝率測定］の「通しプレイとの役割分担」）：参照プレイヤーAIの3方針 × 摂動21件
// （再挑戦なし、[V-TEST-NONFUNC] D-02）と、ビルドプロファイル7件の再挑戦込みの通しプレイ（D-10）。
async function playthrough() {
  const [outDir] = positional();
  const jobs = Number(option('jobs', '8'));
  const mult = option('scene-mult', '');
  const { REF_POLICIES, BUILD_PROFILE_IDS } = await import('./scene-trials.js');
  const { perturbationSet } = await import('./perturb.js');
  mkdirSync(outDir, { recursive: true });
  const runs = [
    ...REF_POLICIES.flatMap((policy) => perturbationSet().map((entry) => ['ref', policy, entry.id])),
    ...BUILD_PROFILE_IDS.map((profile) => ['build', profile]),
  ];
  const pending = runs.filter((run) => !existsSync(join(outDir, `${run.join('_')}.json`)));
  console.log(`通しプレイ ${pending.length} 件を実行する${mult === '' ? '' : `（倍率 ${mult}）`}`);
  await runPool(
    pending.map((run) => ['worker-run', outDir, ...run]),
    jobs,
    join(outDir, 'errors.log'),
    mult === '' ? {} : { SCENE_TRIALS_MULT: mult },
  );
}

async function workerRun() {
  const [outDir, kind, ...args] = positional();
  if (process.env.SCENE_TRIALS_MULT) {
    const { applySceneMultipliers } = await import('./scene-trials.js');
    const { ENEMY_MASTERS } = await import('../../src/data/generated/enemy-masters.js');
    applySceneMultipliers(process.env.SCENE_TRIALS_MULT, ENEMY_MASTERS);
  }
  let record;
  if (kind === 'ref') {
    const [policy, pid] = args;
    const { playRun } = await import('./runner.js');
    const { perturbationSet } = await import('./perturb.js');
    const weights = perturbationSet().find((entry) => entry.id === pid).profile;
    const run = playRun(policy, 30, undefined, weights);
    record = { kind, policy, pid, completed: run.completed, scenes: run.scenes };
  } else {
    const [profileId] = args;
    const { buildProfileOf, playBuildRunWithRetry } = await import('./build-profiles.js');
    const run = playBuildRunWithRetry(buildProfileOf(profileId));
    record = {
      kind,
      profile: profileId,
      completed: run.completed,
      scenes: run.scenes.map((attempt) => ({ ...attempt.outcome, attempts: attempt.attempts })),
    };
  }
  writeFileSync(join(outDir, `${[kind, ...args].join('_')}.json`), JSON.stringify(record));
}

async function playthroughSummary() {
  const [outDir] = positional();
  const records = readdirSync(outDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(outDir, name), 'utf8')));
  const stopOf = (record) => {
    const last = record.scenes[record.scenes.length - 1];
    return record.completed ? '完走' : `${last.scene_id.slice(6)}${last.measured === false ? '(測定不能)' : ''}`;
  };
  for (const policy of ['BALANCE', 'ATTACK', 'DEFENSE']) {
    const group = records.filter((record) => record.kind === 'ref' && record.policy === policy);
    const stops = {};
    for (const record of group) {
      stops[stopOf(record)] = (stops[stopOf(record)] ?? 0) + 1;
    }
    const over = group.flatMap((record) => record.scenes).filter((scene) => scene.measured && !scene.within).length;
    const listed = Object.entries(stops)
      .sort((left, right) => right[1] - left[1])
      .map(([stop, count]) => `${stop} ${count}`)
      .join('、');
    console.log(`${policy.padEnd(8)} ${group.length}件：${listed}（決着上限の超過 ${over}）`);
  }
  for (const record of records.filter((entry) => entry.kind === 'build').sort((left, right) => left.profile.localeCompare(right.profile))) {
    const retries = record.scenes
      .filter((scene) => scene.attempts > 1)
      .map((scene) => `${scene.scene_id.slice(6)}×${scene.attempts}`)
      .join(' ');
    console.log(`${record.profile} ${record.completed ? '完走' : `${stopOf(record)} で詰む`}${retries === '' ? '' : `（再挑戦 ${retries}）`}`);
  }
}

const COMMANDS = {
  collect,
  measure,
  summary,
  playthrough,
  'playthrough-summary': playthroughSummary,
  'worker-collect': workerCollect,
  'worker-trial': workerTrial,
  'worker-run': workerRun,
};

if (!(command in COMMANDS)) {
  console.error(
    'usage: scene-trials-cli.js collect <bankDir> | measure <bankDir> <outDir> | summary <outDir> | playthrough <outDir> | playthrough-summary <outDir>',
  );
  process.exit(2);
}
await COMMANDS[command]();
