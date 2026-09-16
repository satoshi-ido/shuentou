// [V-AUDIT-SCRIPT] 静的監査。アクションマスタの実データを走査し、D-03・D-04a・D-04b・D-06 と、
// 別系の走査単位を持つ D-07（[M-GUARD-REACH]【監査式】）を判定する。
// 記号の定義は [V-AUDIT-SYMBOLS]、実装上の解釈は [V-AUDIT-IMPL] に従う。
// 決定論層につき浮動小数演算・除算演算子を用いない（[I-ENV-TOOLING]［禁止事項の検査規則］）。

import { ACTION_MASTERS } from '../../src/data/generated/action-masters.ts';
import { ENEMY_MASTERS } from '../../src/data/generated/enemy-masters.ts';
import { SCENE_MASTERS } from '../../src/data/generated/scene-masters.ts';
import { HERO_INIT_ACTIONS, HERO_INIT_UNIT } from '../../src/data/generated/hero-init.ts';
import { deriveSysFlags } from '../../src/engine/flags.ts';
import { instantiateAction } from '../../src/engine/instantiate.ts';
import { createZeroParamMap } from '../../src/engine/params.ts';
import { buildAttackPlan } from '../../src/ai/ttk.ts';
import { TTK_MAX } from '../../src/ai/constants.ts';
import { floorDiv, roundDiv } from '../../src/num/helpers.ts';

// [V-AUDIT-SYMBOLS] ROOT_THOUGHT：マスター根源武技の step_thought（[M-BASE-AR-SYSTEM] の定義値 550 の転記）。
export const ROOT_THOUGHT = ACTION_MASTERS.ACT_ROOT_MARTIAL.params.step_thought;

// [M-CALC-EFFECTIVE]（増加型）の被バフ量。[M-STATE-PARAMIDS]「標準付与量」増加型 0.50。
const DEPLOY_AP_BUFF_CENTI = 50;

function hasFlagOf(record, flag) {
  const flags = record.manual_sys_flag === null ? deriveSysFlags(record.params) : [record.manual_sys_flag];
  return flags.includes(flag);
}

// [V-AUDIT-SCRIPT]［入力データ形式］`action` の必須キー。
export function auditAction(record) {
  const params = record.params;
  return {
    id: record.class_id,
    // [V-AUDIT-IMPL]「has_guard はコンポーネント構成から導出する」：FLAG_STANCE の有無で判定する。
    has_guard: hasFlagOf(record, 'FLAG_STANCE'),
    has_martial: hasFlagOf(record, 'FLAG_MARTIAL'),
    has_summon: hasFlagOf(record, 'FLAG_SUMMON'),
    inheritable: record.inheritable,
    is_root: record.is_root,
    deploy_ap: params.deploy_ap,
    decay_ap: params.decay_ap,
    atk: params.atk,
    range: params.range,
    interfere_pos: params.interfere_pos,
    is_swap: params.is_swap,
    cost_pp: params.cost_pp,
    step_thought: params.step_thought,
    step_startup: params.step_startup,
    step_recovery: params.step_recovery,
    gain_vp: params.gain_vp,
    charge_pp: params.charge_pp,
  };
}

// [M-GUARD-WALL]「硬直終了時防御力」：floor( 実効展開AP * (1.0 - 実効AP減衰率) )。
export function holdEndDefense(deployAp, decayApCenti) {
  return floorDiv(deployAp * (100 - decayApCenti), 100);
}

// [V-AUDIT-SCRIPT]［入力データ形式］`scene` の必須キーを、シーンマスタと敵マスタから組み立てる
// （[M-DATA-SCENEMASTER]・[M-DATA-ENEMYMASTER]［監査入力との対応］）。
export function buildAuditInput(masters = { actions: ACTION_MASTERS, enemies: ENEMY_MASTERS, scenes: SCENE_MASTERS }) {
  const ordered = Object.values(masters.scenes).sort((left, right) => left.order - right.order);
  const scenes = [];
  // hero_has_atk_buff / hero_has_summon は、当該シーンより前の unlock に該当キーが現れたかで判定する。
  let heroHasAtkBuff = false;
  let heroHasSummon = false;

  for (const scene of ordered) {
    const enemy = masters.enemies[scene.enemy_id];
    const records = enemy.acts.map((classId) => masters.actions[classId]);
    const actions = records.map((record) => auditAction(record));
    scenes.push({
      scene_id: scene.scene_id,
      order: scene.order,
      name: scene.display_name,
      level: scene.level,
      expected_length: scene.expected_length,
      enemy_actions: actions,
      enemy_has_creature: actions.some((action) => action.has_summon),
      enemy_interfere: actions.some((action) => action.interfere_pos === 'PUSH' || action.interfere_pos === 'BOTH'),
      enemy_has_deploy_ap_buff: records.some((record) => 'deploy_ap' in record.params.give_buff),
      hero_has_atk_buff: heroHasAtkBuff,
      hero_has_summon: heroHasSummon,
      // [M-TMPL-VESSEL] 依代は静的監査および非機能テストから除外する。
      audit_exempt: enemy.audit_exempt,
      // プールの累積は [M-GUARD-WALL]「継承可能」（継承プール対象のみ）に従う。
      inheritable_records: records.filter((record) => record.inheritable && !record.is_root),
      enemy_records: records,
    });
    heroHasAtkBuff = heroHasAtkBuff || scene.unlock.includes('BUFF_ATK');
    heroHasSummon = heroHasSummon || scene.unlock.includes('SUMMON');
  }
  return scenes;
}

// [V-AUDIT-SYMBOLS] pool(N)：1-01 からシーン N−1 までの累積継承可能プール。
// 1-01 は [M-DATA-HERO-INIT] の初期キットを初期プールとする（主人公は以降も保持し続ける）。
export function poolOf(scenes, index, masters = { actions: ACTION_MASTERS }) {
  const pool = HERO_INIT_ACTIONS.map((classId) => masters.actions[classId]).filter((record) => !record.is_root);
  for (let i = 0; i < index; i += 1) {
    if (scenes[i].audit_exempt) {
      continue;
    }
    pool.push(...scenes[i].inheritable_records);
  }
  return pool;
}

// [V-AUDIT-SYMBOLS] wall(N)：体勢を内包する全アクションの硬直終了時防御力の最大値。
export function wallOf(scene) {
  let wall = 0;
  for (const action of scene.enemy_actions) {
    if (!action.has_guard) {
      continue;
    }
    const value = holdEndDefense(action.deploy_ap, action.decay_ap);
    if (value > wall) {
      wall = value;
    }
  }
  return wall;
}

// [V-AUDIT-SYMBOLS] pool_max_atk(N)：has_martial かつ is_root == False の atk 基礎値の最大値。
export function poolMaxAtk(pool) {
  let best = 0;
  for (const record of pool) {
    if (hasFlagOf(record, 'FLAG_MARTIAL') && !record.is_root && record.params.atk > best) {
      best = record.params.atk;
    }
  }
  return best;
}

// [V-AUDIT-SYMBOLS] max_range(N)：has_martial な range 基礎値の最大値。
// [V-AUDIT-IMPL]「is_root は max_range に限り算入する」。
export function maxRange(pool, masters = { actions: ACTION_MASTERS }) {
  let best = 0;
  for (const record of [...pool, masters.actions.ACT_ROOT_MARTIAL]) {
    if (hasFlagOf(record, 'FLAG_MARTIAL') && record.params.range > best) {
      best = record.params.range;
    }
  }
  return best;
}

// 監査用の攻撃側ユニット。[V-AUDIT-SYMBOLS]「全ユニット思考中・経過ステップ数0・全リソース0」。
function auditAttacker(pool) {
  const counter = { instance_id_seq: 0 };
  return {
    unit_id: 'U0000',
    side: 'MINE',
    unit_kind: 'MASTER',
    pos_idx: 1,
    hp: HERO_INIT_UNIT.max_hp,
    max_hp: HERO_INIT_UNIT.max_hp,
    vp: 0,
    pp: 0,
    ap: 0,
    state: 'THOUGHT',
    elapsed_thought: 0,
    elapsed_startup: 0,
    elapsed_recovery: 0,
    acts: pool.map((record) => instantiateAction(record, counter)),
    slip: 0,
    buff: createZeroParamMap(),
    debuff: createZeroParamMap(),
    last_act: null,
    applied_recovery: 0,
  };
}

// [V-AUDIT-SYMBOLS]［first_hit の算出］[A-EVAL-TTK] の攻撃計画を、必要ヒット数1・妨害補正なしで
// 構成したときの初弾着弾ステップの最小値。別実装を作らない。
export function firstHit(pool, wall) {
  const attacker = auditAttacker(pool);
  let best = TTK_MAX;
  for (let i = 0; i < attacker.acts.length; i += 1) {
    const action = attacker.acts[i];
    if (!action.sys_flags.includes('FLAG_MARTIAL') || action.base_params.atk < wall) {
      continue; // A = { a ∈ pool | has_martial(a) かつ atk(a) >= wall }
    }
    const plan = buildAttackPlan(attacker, action, 1, TTK_MAX);
    if (plan !== null && plan.firstLanding < best) {
      best = plan.firstLanding; // 初回補充時間(a) + step_thought(a) + step_startup(a)
    }
  }
  return best;
}

// [M-GUARD-REACH]【監査式】worst_distance(N) = 1 + hero_retreatable(N) + enemy_retreatable(N)。
export function worstDistance(scene, pool) {
  const heroRetreatable = scene.hero_has_summon && scene.enemy_interfere;
  const poolInterferes = pool.some(
    (record) => record.params.interfere_pos === 'PUSH' || record.params.interfere_pos === 'BOTH',
  );
  const enemySwaps = scene.enemy_actions.some((action) => action.is_swap);
  const enemyRetreatable = scene.enemy_has_creature && (enemySwaps || poolInterferes);
  return 1 + (heroRetreatable ? 1 : 0) + (enemyRetreatable ? 1 : 0);
}

// [M-GUARD-ASYM] 実効上限検査の対象区間。敵側の展開APバフ解放（4-03）と
// 主人公側の攻撃力バフ解放（4-05）の間だけが非対称な窓となる。
function effectiveWall(scene, wall) {
  if (scene.hero_has_atk_buff || !scene.enemy_has_deploy_ap_buff) {
    return wall;
  }
  return roundDiv(wall * (100 + DEPLOY_AP_BUFF_CENTI), 100);
}

// [M-TMPL-ENEMY-FINAL]「プレイヤーが到達しうる実効防壁の上限」。
// 継承プールの体勢の硬直終了時防御力に、従者特性係数 deployRate（[M-DATA-COEFFKEYS]）と、
// プールが持つ最大の展開APバフ（[M-CALC-EFFECTIVE] 増加型・giveBuffRate 適用後）を重ねた値である。
// [M-INHERIT-MERGE] は増加型を最大値で統合するため、同一係数が積み重なることはない。
export function maxEffectiveWall(pool, attendants) {
  const rateOf = (key) => {
    let best = 100;
    for (const attendant of Object.values(attendants)) {
      const value = attendant.coeffs[key];
      if (value !== undefined && value > best) {
        best = value;
      }
    }
    return best;
  };
  const deployRate = rateOf('deployRate');
  const giveBuffRate = rateOf('giveBuffRate');

  let buffCenti = 0;
  let wall = 0;
  for (const record of pool) {
    const amount = record.params.give_buff.deploy_ap;
    if (amount !== undefined) {
      const scaled = roundDiv(amount * giveBuffRate, 100);
      if (scaled > buffCenti) {
        buffCenti = scaled;
      }
    }
    if (record.params.deploy_ap > 0) {
      const scaled = holdEndDefense(roundDiv(record.params.deploy_ap * deployRate, 100), record.params.decay_ap);
      if (scaled > wall) {
        wall = scaled;
      }
    }
  }
  return roundDiv(wall * (100 + buffCenti), 100);
}

// [V-AUDIT-SCRIPT]【判定基準】。fails は不合格、warns は警告である。
export function audit(masters = { actions: ACTION_MASTERS, enemies: ENEMY_MASTERS, scenes: SCENE_MASTERS }) {
  const scenes = buildAuditInput(masters);
  const fails = [];
  const warns = [];
  const rows = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (scene.audit_exempt) {
      continue;
    }
    const pool = poolOf(scenes, index, masters);
    const wall = wallOf(scene);
    const best = poolMaxAtk(pool);
    const row = {
      scene_id: scene.scene_id,
      wall,
      pool_max_atk: best,
      max_range: maxRange(pool, masters),
      worst_distance: worstDistance(scene, pool),
      first_hit_open: firstHit(pool, 0),
      first_hit_wall: firstHit(pool, wall),
      effective_wall: effectiveWall(scene, wall),
    };
    rows.push(row);

    // D-03：[M-GUARD-WALL] の不等式。[V-AUDIT-IMPL]「等号は貫通側に倒す」。
    if (row.wall > row.pool_max_atk) {
      fails.push(`D-03 ${scene.scene_id}: wall ${row.wall} > pool_max_atk ${row.pool_max_atk}`);
    }
    // D-04a：first_hit(プール, wall=0) < ROOT_THOUGHT。
    if (row.first_hit_open >= ROOT_THOUGHT) {
      fails.push(`D-04a ${scene.scene_id}: first_hit(wall=0) ${row.first_hit_open} >= ROOT_THOUGHT ${ROOT_THOUGHT}`);
    }
    // D-04b：first_hit(プール, wall) <= scene.expected_length。
    if (row.first_hit_wall > scene.expected_length) {
      warns.push(`D-04b ${scene.scene_id}: first_hit(wall) ${row.first_hit_wall} > expected_length ${scene.expected_length}`);
    }
    // D-06：[M-GUARD-ASYM] の実効値比較。
    if (row.effective_wall > row.pool_max_atk) {
      warns.push(`D-06 ${scene.scene_id}: 実効壁 ${row.effective_wall} > pool_max_atk ${row.pool_max_atk}`);
    }
    // D-07：[M-GUARD-REACH]【監査式】。位置干渉の初出 3-02 以降を対象とする。
    if (scene.enemy_interfere || index > 0) {
      if (row.worst_distance > row.max_range) {
        fails.push(`D-07 ${scene.scene_id}: worst_distance ${row.worst_distance} > max_range ${row.max_range}`);
      }
    }
  }

  return { fails, warns, rows };
}
