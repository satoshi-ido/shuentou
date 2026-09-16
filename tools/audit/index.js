#!/usr/bin/env node
// [V-AUDIT-SCRIPT] 監査スクリプトのCLI（[I-ENV-LAYOUT] tools/audit/）。
// `pnpm audit` で全30シーンを走査し、D-03・D-04a・D-04b・D-06・D-07 の判定結果を出力する。
//
// 監査は src/engine・src/ai の実装を再利用する（[V-AUDIT-SYMBOLS]「別実装を作らない」）。
// それらのモジュールは TypeScript の流儀に従い相互参照を `.js` 拡張子で書くため、
// Node の型除去実行（[I-ENV-TOOLING] Node 24）へ解決フックを1件登録して `.ts` へ読み替える。

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
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

const { audit, ROOT_THOUGHT } = await import('./lib.js');

const { fails, warns, rows } = audit();

console.log(['scene', 'wall', 'pool_atk', 'eff_wall', 'range', 'worst_d', 'fh(0)', 'fh(wall)'].join('\t'));
for (const row of rows) {
  console.log(
    [
      row.scene_id,
      row.wall,
      row.pool_max_atk,
      row.effective_wall,
      row.max_range,
      row.worst_distance,
      row.first_hit_open,
      row.first_hit_wall,
    ].join('\t'),
  );
}
console.log(`\nROOT_THOUGHT = ${ROOT_THOUGHT}`);

for (const warn of warns) {
  console.log(`警告: ${warn}`);
}
for (const fail of fails) {
  console.error(`違反: ${fail}`);
}
if (fails.length === 0 && warns.length === 0) {
  console.log('静的監査: 違反・警告なし');
}
process.exit(fails.length > 0 ? 1 : 0);
