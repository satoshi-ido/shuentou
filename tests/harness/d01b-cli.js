#!/usr/bin/env node
// [V-TEST-NONFUNC] D-01b（1決定あたりの応答時間）の計測CLI。[I-PLAN-SUBMISSION]【基準機】の測定に用いる。
//
//   node --experimental-strip-types tests/harness/d01b-cli.js collect <outDir> [--jobs N] [--top K] [--last L]
//     バランス型21件と BP-03 の21件の通しプレイを子プロセスで並列に走らせ、敵軍AIの決定を計時して、
//     試行ごとに時間の長い上位 K 局面（既定 24）を <outDir>/<試行>.json に残す。済んだ試行は飛ばす。
//     L を与えると順序 L のシーンまでで通しプレイを止める（審査範囲 1-01〜2-04 は 6）。
//   node --experimental-strip-types tests/harness/d01b-cli.js retime <outDir> --label <群> [--top 24] [--save 5] [--runs 3]
//     全試行の上位局面を集め、時間の長い順に top 件を単独実行で計時し直す。最も遅い save 件を
//     tests/ai/fixtures/d01b-<群>-*.json に保存する（リポジトリに置く最悪局面）。群は全シーンの通しが full、
//     審査範囲が review。
//   node --experimental-strip-types tests/harness/d01b-cli.js bench [--runs 3]
//     保存した最悪局面（tests/ai/fixtures/d01b-*.json）を runs 回ずつ計時し、局面ごとの最も遅い値と、
//     群ごとに1決定あたり2秒以内の合否を出力する。基準機ではこのコマンドだけを実行する。
//
// 生成物（collect の出力）はリポジトリに置かない。Node 22 では --experimental-strip-types を付けて起動する。

/* global structuredClone */
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// src のモジュールは相互参照を `.js` 拡張子で書くため、`.ts` へ読み替える解決フックを登録する
// （scene-trials-cli.js と同じ）。
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
const FIXTURE_DIR = fileURLToPath(new URL('../ai/fixtures/', import.meta.url));
const LIMIT_MS = 2000; // [V-TEST-NONFUNC] D-01b「1決定あたりの応答時間が測定環境で2秒以内」
const [command, ...rest] = process.argv.slice(2);

function option(name, fallback) {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : fallback;
}

function positional() {
  return rest.filter((value, index) => !value.startsWith('--') && !rest[index - 1]?.startsWith('--'));
}

// jobs（引数配列の列）を子プロセスで並列に実行する。子の失敗は errors.log に残して続ける。
function runPool(jobs, concurrency, errorLog) {
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
        const child = spawn(process.execPath, [...process.execArgv, SELF, ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
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
          console.log(`[${done}/${jobs.length}] ${code === 0 ? 'ok' : `exit ${code}`} ${args.slice(1, 3).join(' ')} (${minutes}分)`);
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

// 試行の列。M6 の D-01b の測定と同じく、バランス型と BP-03 のそれぞれに重み摂動21件を充てる。
async function trials() {
  const { perturbationSet } = await import('./perturb.ts');
  const ladder = perturbationSet();
  return [
    ...ladder.map((entry, index) => ({ name: `BALANCE_${entry.id}`, kind: 'BALANCE', index })),
    ...ladder.map((entry, index) => ({ name: `BP-03_${entry.id}`, kind: 'BP-03', index })),
  ];
}

// 子プロセス：1試行を通しプレイし、敵軍AIの決定のうち時間の長い上位 top 局面を残す。
async function runTrial(kind, index, outFile, top, lastOrder) {
  const { foeDecisionTiming, playRun } = await import('./runner.ts');
  const { perturbationSet } = await import('./perturb.ts');
  const { buildProfileOf, playBuildRun } = await import('./build-profiles.ts');
  const profile = perturbationSet()[index].profile;
  const kept = [];
  let count = 0;
  foeDecisionTiming.observer = (sceneId, state, unit, ms) => {
    count += 1;
    if (kept.length >= top && ms <= kept[kept.length - 1].ms) {
      return;
    }
    kept.push({ sceneId, unitId: unit.unit_id, step: state.step, ms, state: structuredClone(state) });
    kept.sort((a, b) => b.ms - a.ms);
    kept.length = Math.min(kept.length, top);
  };
  if (kind === 'BALANCE') {
    playRun('BALANCE', lastOrder, undefined, profile);
  } else {
    playBuildRun(buildProfileOf(kind), profile, lastOrder);
  }
  writeFileSync(outFile, JSON.stringify({ kind, index, decisions: count, kept }));
}

// 保存した局面の敵軍AIの決定を1回計時する。実効プロファイルは [A-PROFILE-RESOLVE] に従いシーンから構築する。
async function timer() {
  const { STEP_DEPS } = await import('./runner.ts');
  const { createAiDecisionProvider } = await import('../../src/ai/decision.ts');
  const { buildEffectiveProfile } = await import('../../src/ai/profile.ts');
  const { SCENE_MASTERS } = await import('../../src/data/generated/scene-masters.ts');
  const { ENEMY_MASTERS } = await import('../../src/data/generated/enemy-masters.ts');
  const { AI_PROFILE_MASTERS } = await import('../../src/data/generated/ai-profile-masters.ts');
  return (entry) => {
    const scene = SCENE_MASTERS[entry.sceneId];
    const enemy = ENEMY_MASTERS[scene.enemy_id];
    const provider = createAiDecisionProvider(
      buildEffectiveProfile({
        scene,
        enemy,
        profile: AI_PROFILE_MASTERS[enemy.ai_profile_id],
        mirrorStats: entry.state.mirror_snapshot,
      }),
      STEP_DEPS,
    );
    const state = structuredClone(entry.state);
    const unit = state.units.find((candidate) => candidate !== null && candidate.unit_id === entry.unitId);
    const started = performance.now();
    provider(state, unit);
    return performance.now() - started;
  };
}

function environment() {
  return `${os.cpus()[0]?.model ?? '不明'} / ${Math.round(os.totalmem() / 1024 ** 3)}GB / ${os.type()} ${os.release()} / Node ${process.version}`;
}

async function main() {
  if (command === 'trial') {
    const [kind, index, outFile, top, lastOrder] = rest;
    await runTrial(kind, Number(index), outFile, Number(top), Number(lastOrder));
    return;
  }
  if (command === 'collect') {
    const [outDir] = positional();
    mkdirSync(outDir, { recursive: true });
    const jobs = Number(option('jobs', Math.max(1, os.cpus().length - 2)));
    const top = option('top', '24');
    const lastOrder = option('last', '30');
    const pending = (await trials()).filter((trial) => !existsSync(join(outDir, `${trial.name}.json`)));
    await runPool(
      pending.map((trial) => ['trial', trial.kind, String(trial.index), join(outDir, `${trial.name}.json`), top, lastOrder]),
      jobs,
      join(outDir, 'errors.log'),
    );
    return;
  }
  if (command === 'retime') {
    const [outDir] = positional();
    const top = Number(option('top', '24'));
    const save = Number(option('save', '5'));
    const runs = Number(option('runs', '3'));
    const label = option('label', null);
    if (save > 0 && label === null) {
      throw new Error('保存には --label で群を与える');
    }
    const all = readdirSync(outDir)
      .filter((name) => name.endsWith('.json'))
      .flatMap((name) => JSON.parse(readFileSync(join(outDir, name), 'utf8')).kept.map((entry) => ({ ...entry, trial: name })));
    all.sort((a, b) => b.ms - a.ms);
    const time = await timer();
    const retimed = all.slice(0, top).map((entry) => {
      const samples = Array.from({ length: runs }, () => time(entry));
      return { ...entry, single: Math.max(...samples) };
    });
    retimed.sort((a, b) => b.single - a.single);
    console.log(`環境：${environment()}`);
    for (const entry of retimed) {
      console.log(`${entry.single.toFixed(0)}ms（並列 ${entry.ms.toFixed(0)}ms） ${entry.sceneId} 歩${entry.step} ${entry.unitId} ${entry.trial}`);
    }
    for (const [rank, entry] of retimed.slice(0, save).entries()) {
      const file = join(FIXTURE_DIR, `d01b-${label}-${rank + 1}-${entry.sceneId.replace('SCENE_', '').replace('_', '-')}-${entry.step}.json`);
      writeFileSync(file, `${JSON.stringify({ sceneId: entry.sceneId, unitId: entry.unitId, step: entry.step, state: entry.state })}\n`);
      console.log(`保存：${file}`);
    }
    return;
  }
  if (command === 'bench') {
    const runs = Number(option('runs', '3'));
    const files = readdirSync(FIXTURE_DIR).filter((name) => /^d01b-.*\.json$/.test(name)).sort();
    if (files.length === 0) {
      throw new Error('最悪局面がない。先に retime で保存する');
    }
    const time = await timer();
    console.log(`環境：${environment()}`);
    const worst = {};
    for (const name of files) {
      const entry = JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
      const samples = Array.from({ length: runs }, () => time(entry));
      const slowest = Math.max(...samples);
      const group = name.split('-')[1];
      worst[group] = Math.max(worst[group] ?? 0, slowest);
      console.log(`${name}：${samples.map((ms) => ms.toFixed(0)).join(' / ')} ms（最遅 ${slowest.toFixed(0)}ms）`);
    }
    for (const [group, ms] of Object.entries(worst)) {
      console.log(`[${group}] 最も遅い決定：${ms.toFixed(0)}ms ／ D-01b（${LIMIT_MS}ms以内）：${ms <= LIMIT_MS ? '成立' : '不成立'}`);
    }
    return;
  }
  throw new Error('使用法: d01b-cli.js collect <outDir> | retime <outDir> | bench');
}

await main();
