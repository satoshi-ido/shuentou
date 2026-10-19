// [I-PLAN-DOCINDEX]
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const ID_DEFINITION_LINE = /^`([A-Z]+(?:-[A-Z0-9]+)+)`\s*$/;
const HEADING_LINE = /^(#{1,6})\s+(\S.*)$/;
const STRUCTURE_ID = /-CH-/;
const ONLY_UPPER_HYPHEN = /^[A-Z]+(?:-[A-Z]+)*$/;
const SERIAL_ID = /^[A-Z]-[0-9]+[a-z]?$/;
const DIGITS_AND_DOTS = /^[0-9]+(?:\.[0-9]+)*$/;
const HAS_LETTER = /[A-Za-z]/;

function splitLines(text) {
  return text.split(/\r\n|\n/);
}

// 00#1.2 の定義記法（行全体がIDのみの1行）に基づき、合本から
// id / heading / level / start_line / end_line のレコード列を生成する。
export function buildIndex(docText) {
  const lines = splitLines(docText);
  const total = lines.length;
  const headingLines = [];
  const defs = [];
  let currentHeadingText = '';
  let currentHeadingLevel = 0;

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const headingMatch = HEADING_LINE.exec(line);
    if (headingMatch) {
      currentHeadingText = headingMatch[2].trim();
      currentHeadingLevel = headingMatch[1].length;
      headingLines.push(i + 1);
    }
    const defMatch = ID_DEFINITION_LINE.exec(line.replace(/\s+$/, ''));
    if (defMatch) {
      defs.push({
        id: defMatch[1],
        heading: currentHeadingText,
        level: currentHeadingLevel,
        start_line: i + 1,
      });
    }
  }

  const defLines = defs.map((d) => d.start_line);
  const seen = {};
  for (const record of defs) {
    let nextBoundary = total + 1;
    for (const l of defLines) {
      if (l > record.start_line && l < nextBoundary) nextBoundary = l;
    }
    for (const l of headingLines) {
      if (l > record.start_line && l < nextBoundary) nextBoundary = l;
    }
    record.end_line = nextBoundary > total ? total : nextBoundary - 1;

    if (seen[record.id]) {
      throw new Error(
        `IDの重複定義: ${record.id}（${seen[record.id]}行目と${record.start_line}行目）`,
      );
    }
    seen[record.id] = record.start_line;
  }

  return defs;
}

// 合本の更新時刻が索引より新しい場合に再生成する（索引はコミットしない生成物）。
export function loadIndex(docPath, indexPath) {
  const docStat = statSync(docPath);
  const stale = !existsSync(indexPath) || statSync(indexPath).mtimeMs < docStat.mtimeMs;
  if (!stale) {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  const docText = readFileSync(docPath, 'utf8');
  const index = buildIndex(docText);
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  return index;
}

function findHeadingLineAtOrAbove(lines, startLine) {
  for (let i = startLine; i >= 1; i--) {
    if (HEADING_LINE.test(lines[i - 1])) return i;
  }
  return startLine;
}

// 指定IDの本文（見出しから end_line まで）を切り出す。
export function extractSection(docText, record) {
  const lines = splitLines(docText);
  const headingLine = findHeadingLineAtOrAbove(lines, record.start_line);
  return lines.slice(headingLine - 1, record.end_line).join('\n');
}

// 00#1.1（大文字ASCIIとハイフンのみ）・00#1.6（連番シリーズ）・
// 00内自己言及（数字とピリオドのみ）のいずれに合致するかを判別する。
export function classifyBracketReference(content) {
  const hashIndex = content.indexOf('#');
  const head = hashIndex === -1 ? content : content.slice(0, hashIndex);
  if (DIGITS_AND_DOTS.test(head)) {
    return { kind: 'self-reference', head };
  }
  if (SERIAL_ID.test(head)) {
    return { kind: 'serial-in-brackets', head };
  }
  if (ONLY_UPPER_HYPHEN.test(head)) {
    return { kind: 'id-reference', head };
  }
  if (HAS_LETTER.test(head)) {
    return { kind: 'suspicious', head };
  }
  return { kind: 'ignored', head };
}

function stripBacktickSpans(text) {
  return text.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
}

// 合本は ASCII 角括弧をバックスラッシュでエスケープして表記する（`\[ID\]`）。
// 参照検出は角括弧そのものを対象とするため、エスケープを解除してから走査する。
function unescapeBrackets(text) {
  return text.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
}

// 参照の検査：存在しないIDへの参照、構造ID（*-CH-*）への参照、
// 連番記号を角括弧で囲んだ参照を違反として検出する。
export function checkReferences(docText, index) {
  const known = {};
  for (const record of index) known[record.id] = record;

  const stripped = unescapeBrackets(stripBacktickSpans(docText));
  const violations = [];
  const suspicious = [];
  const bracketPattern = /\[([^[\]]+)\]/g;
  let match = bracketPattern.exec(stripped);
  while (match !== null) {
    const content = match[1];
    const classification = classifyBracketReference(content);
    if (classification.kind === 'id-reference') {
      if (!known[classification.head]) {
        violations.push({ type: 'unknown-id', reference: content });
      } else if (STRUCTURE_ID.test(classification.head)) {
        violations.push({ type: 'structure-id-reference', reference: content });
      }
    } else if (classification.kind === 'serial-in-brackets') {
      violations.push({ type: 'bracketed-serial', reference: content });
    } else if (classification.kind === 'suspicious') {
      suspicious.push(content);
    }
    match = bracketPattern.exec(stripped);
  }
  return { violations, suspicious };
}

// [I-PLAN-DOCINDEX]【脚本IDの収集】の手順1：合本全体から脚本IDの言及を集める。
// 末尾が `_` の並びは系列の表記または接頭辞への言及として除く。
const SCRIPT_ID_MENTION = /SCRIPT_[A-Z0-9_]+/g;

function sourceIdAt(index, lineNumber) {
  let found = null;
  for (const record of index) {
    if (record.start_line <= lineNumber && (found === null || record.start_line > found.start_line)) {
      found = record;
    }
  }
  return found === null ? null : found.id;
}

function collectMentions(docText, index) {
  const lines = splitLines(docText);
  const result = {};
  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(SCRIPT_ID_MENTION)) {
      const scriptId = match[0];
      if (scriptId.endsWith('_')) continue;
      const source = sourceIdAt(index, i + 1);
      result[scriptId] ??= [];
      if (source !== null && !result[scriptId].includes(source)) result[scriptId].push(source);
    }
  }
  return result;
}

// 手順2：[S-SCRIPT-RECORDS]【系列】の各行を【展開の記法】に従って展開する。
// シーン番号の範囲（`1-01〜5-11`）は、索引に並ぶ S-SCENE-<シーン番号> の順に展開する。
const SERIES_SOURCE_ID = 'S-SCRIPT-RECORDS';
const SCENE_SECTION_ID = /^S-SCENE-(\d-\d\d)$/;

function expandRangeItem(item, sceneNumbers) {
  const [from, to] = item.split('〜');
  if (to === undefined) return [from];
  if (SCENE_SECTION_ID.test(`S-SCENE-${from}`)) {
    const start = sceneNumbers.indexOf(from);
    const end = sceneNumbers.indexOf(to);
    if (start === -1 || end === -1 || end < start) throw new Error(`シーン番号の範囲を展開できない: ${item}`);
    return sceneNumbers.slice(start, end + 1);
  }
  const first = Number.parseInt(from, 10);
  const last = Number.parseInt(to, 10);
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
    throw new Error(`従者番号の範囲を展開できない: ${item}`);
  }
  const items = [];
  for (let n = first; n <= last; n++) items.push(String(n).padStart(from.length, '0'));
  return items;
}

export function expandScriptSeries(docText, index) {
  const record = index.find((entry) => entry.id === SERIES_SOURCE_ID);
  if (record === undefined) throw new Error(`${SERIES_SOURCE_ID} が索引にない`);
  const sceneNumbers = index.map((entry) => SCENE_SECTION_ID.exec(entry.id)?.[1]).filter((n) => n !== undefined);
  const section = extractSection(docText, record);
  const ids = [];
  for (const line of splitLines(section)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const templates = [...cells[1].matchAll(/`(SCRIPT_[^`]*<[^`]*>[^`]*)`/g)].map((m) => m[1]);
    if (templates.length === 0) continue;
    const range = cells[2].split(/\s/)[0];
    const items = range.split('・').flatMap((item) => expandRangeItem(item, sceneNumbers));
    for (const template of templates) {
      const head = template.slice(0, template.indexOf('<'));
      const tail = template.slice(template.lastIndexOf('>') + 1);
      for (const item of items) ids.push(`${head}${item.replace(/-/g, '_')}${tail}`);
    }
  }
  return ids;
}

// 手順3：1と2の和。各IDに、名が現れた項のIDを添える。
export function collectScriptIds(docText, index) {
  const result = collectMentions(docText, index);
  for (const scriptId of expandScriptSeries(docText, index)) {
    result[scriptId] ??= [];
    if (!result[scriptId].includes(SERIES_SOURCE_ID)) result[scriptId].push(SERIES_SOURCE_ID);
  }
  const sorted = {};
  for (const scriptId of Object.keys(result).sort()) sorted[scriptId] = [...result[scriptId]].sort();
  return sorted;
}
