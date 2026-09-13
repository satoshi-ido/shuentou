#!/usr/bin/env node
// [I-PLAN-DOCINDEX]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReferences, extractSection, loadIndex } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOC_PATH = path.join(REPO_ROOT, 'docs', '終焉燈.md');
const INDEX_PATH = path.join(REPO_ROOT, 'docs', 'id-index.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runCheckRefs() {
  const docText = readFileSync(DOC_PATH, 'utf8');
  const index = loadIndex(DOC_PATH, INDEX_PATH);
  const { violations, suspicious } = checkReferences(docText, index);

  for (const violation of violations) {
    console.log(`違反: ${violation.type} ${violation.reference}`);
  }
  if (suspicious.length > 0) {
    console.log('---綴り誤りの可能性（参照とは判定していません）---');
    for (const item of suspicious) console.log(item);
  }
  if (violations.length === 0) {
    console.log('参照の検査: 違反なし');
  }
  process.exit(violations.length > 0 ? 1 : 0);
}

function runExtract(id) {
  const index = loadIndex(DOC_PATH, INDEX_PATH);
  const record = index.find((entry) => entry.id === id);
  if (!record) {
    fail(`未知のID: ${id}`);
  }
  const docText = readFileSync(DOC_PATH, 'utf8');
  process.stdout.write(`${extractSection(docText, record)}\n`);
}

const [command] = process.argv.slice(2);

if (!command) {
  fail('使用法: pnpm id <ID> | pnpm id --check-refs');
} else if (command === '--check-refs') {
  runCheckRefs();
} else {
  runExtract(command);
}
