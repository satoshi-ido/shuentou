/* 終焉燈 ─ マスタからインスタンスへの実体化（[M-DATA-INSTANTIATE]）
   UIプロトタイプ.html から分離。masters.js の後、presets.js の前に読み込む。
   [M-DATA-INSTANTIATE] の6手順のうち、現に実装しているのは 1.（複製）と 5.（採番）のみ。
   文言解決（str）と呼称の遡及置換（applyNaming）を含むのは、PRESETS が読込時に
   str() を呼ぶため。表示側のヘルパーではなく、プリセット評価の前提である。 */

/** オブジェクト・配列のディープコピー用ユーティリティ */
const clone = (data) => JSON.parse(JSON.stringify(data));

/* ── アクションインスタンスID（[M-DATA-ACTION]） ───────────────────
   個体識別用の一意なID。以下の3仕様が本IDを前提とする。
     ・[M-DATA-BATTLESTATE]／[M-UI-WATCH]：UI監視トグルはインスタンスID単位で管理する
     ・[M-INHERIT-MERGE]：資質統合時、統合先スロットのIDを維持する（監視ロックの保護）
     ・[M-RESOLVE-MARTIAL]#5：コピー枠はオリジナルと同一クラスIDでも別枠として管理する
   採番順序はプリセット読込順・配列インデックス昇順で確定し、
   採番カウンタはスナップショットで復元されるため決定論的である（[M-CORE-DETERMINISM]）。 */
let __instance_id_seq = 0;
function resetInstanceIdSeq(n = 0) { __instance_id_seq = n; }
function currentInstanceIdSeq() { return __instance_id_seq; }
function issueInstanceId() { return "IID" + String(++__instance_id_seq).padStart(4, "0"); }

function buildCreatureUnit(side, slotIdx, summonId, overrides = {}) {
  const master = CREATURE_MASTER[summonId];
  if (!master) {
    console.error(`[buildCreatureUnit] 未登録のsummonId: ${summonId}`);
    return null;
  }

  const acts = master.acts.map(a => ({
    ...clone(a),
    iid: overrides.assignIid ? issueInstanceId() : a.iid,
    running: false,
    sealVal: 0.00
  }));

  return createUnit(
    side,
    slotIdx,
    overrides.name || master.name,
    overrides.role || (side === "mine" ? "クリーチャー" : "敵クリーチャー"),
    {
      maxHp: master.maxHp,
      hp: overrides.hp !== undefined ? overrides.hp : master.maxHp,
      acts: acts,
      ...overrides
    }
  );
}

function createAttendant(numId) {
  const master = ATTENDANT_MASTER[numId];
  if (!master) {
    console.error(`[createAttendant] 未登録の従者ID: ${numId}`);
    return null;
  }
  return {
    ...master,
    done: false,
    lapsed: false
  };
}

/* ── 同行枠（[M-DATA-RUNSTATE]［同行枠］）と従者オブジェクトの相互変換 ──
 * 検証台は従者をマスタ展開済みのオブジェクトで持つが、スナップショットへは
 * 同行枠のかたち（attendant_id と inherit_state）で記録する。 */

/** attendant_id から ATTENDANT_MASTER のキー（従者番号）を得る */
const attendantNumOf = (attendantId) => Number(String(attendantId).slice(-2));

/** 従者オブジェクト → 同行枠1件 */
function partySlotOf(at) {
  return {
    attendant_id:  at.id,
    inherit_state: at.lapsed ? "FORFEITED" : at.done ? "SPENT" : "UNUSED"
  };
}

/** 同行枠1件 → 従者オブジェクト（ロールバック復元時の再実体化） */
function attendantFromSlot(slot) {
  const at = createAttendant(attendantNumOf(slot.attendant_id));
  if (!at) return null;
  at.done   = slot.inherit_state !== "UNUSED";
  at.lapsed = slot.inherit_state === "FORFEITED";
  return at;
}

/* ── プリセット共通ヘルパー ── */
function createUnit(side, slotIdx, name = "（不在）", role = "空きマス", overrides = {}) {
  const isEmpty = overrides.isEmpty ?? (role === "空きマス");
  return {
    i: slotIdx,
    side: side,
    name: name,
    role: role,
    hp: overrides.hp || 0,
    maxHp: overrides.maxHp || overrides.hp || 0,
    vp: overrides.vp || 0,
    pp: overrides.pp || 0,
    ap: overrides.ap || 0,
    thought: overrides.thought || 0,
    acting: overrides.acting || null,
    chips: overrides.chips || [],
    buffMap: overrides.buffMap || {},
    debuffMap: overrides.debuffMap || {},
    slip: overrides.slip || 0.00,
    lastAct: overrides.lastAct || null,
    acts: overrides.acts || [],
    isEmpty: isEmpty,
    ...overrides
  };
}

const createHpBoost = (hpAddBase) => ({
  classId: "ACT_HP_BOOST",
  n: "最大HP加算",
  k: "─",
  sys: [],
  cost: [],
  st: [0, 0, 0],
  eff: "最大HP加算",
  hpAddBase
});

/**
 * 文言の解決（[M-DATA-INTERP]）
 * 未定義キー・未供給キーは空文字で埋めず、オーサリングエラーとして棄却する。
 * @param {string} id STRINGS のキー
 * @param {Object} values 呼び出し側が供給する文脈束の値
 * @returns {{head: string|null, text: string, btn: string|null}}
 */
/* ── 呼称の遡及置換（[S-NAMING-RULE]／[S-NAMING-SCHEMA]）────────
   UI表示名（シーン名・敵マスター名・目的表示・アクトタイトル）のみを対象とする。
   脚本の台詞は対象外であり、本関数を通さない。
   obsolete_name_revealed（シーン3-06のクリア決済で True）は既存のメタステート宣言を用いる。 */
let NamingRevealed = false;         // 表示側の実効フラグ（obsolete_name_revealed または2周目以降）

const applyNaming = (s) =>
  (s === null || !NamingRevealed) ? s : s.replace(/天疵/g, "虚穴");

function str(id, values = {}) {
  const rec = STRINGS[id];
  if (!rec) throw new Error("未定義の文言ID: " + id);
  const fill = (s) => s === null ? null : s.replace(/\{(\w+)\}/g, (_, k) => {
    if (!(k in values)) throw new Error(`未解決の補間キー: {${k}} in ${id}`);
    return values[k];
  });
  return {
    head: applyNaming(fill(rec.head)),
    text: applyNaming(fill(rec.text)),
    btn:  applyNaming(fill(rec.btn))
  };
}
