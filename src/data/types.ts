// [M-STATE-ACTIONMASTER] [M-STATE-ACTION] [M-DATA-ENEMYMASTER]
// 内部表現は centi（[I-NUM-FIXEDPOINT]）。コメントの「centi」はその対象を示す。
// フィールド名は [V-AUDIT-SCRIPT]／[M-STATE-ACTIONMASTER] が参照するキー名に合わせる。

export type TargetScope = 'SELF' | 'PARTY';
export type InterferePos = 'NONE' | 'PUSH' | 'PULL' | 'BOTH';

// [M-STATE-ACTION]［静的パラメータ］。uses_initial は実体化時に base_uses から
// 確定する値であり（M-DATA-INSTANTIATE）、マスタ側の params には含めない。
export interface ActionParams {
  readonly def_efficiency: number; // centi。規定値 100
  readonly target_scope: TargetScope;
  readonly cost_hp: number;
  readonly cost_vp: number;
  readonly cost_pp: number;
  readonly cost_ap: number;
  readonly step_thought: number;
  readonly step_startup: number;
  readonly step_recovery: number;
  readonly decay_ap: number; // centi（0〜100）
  readonly is_swap: boolean;
  readonly summon_id: string | null;
  readonly deploy_ap: number;
  readonly gain_vp: number;
  readonly charge_pp: number; // centi
  readonly purify_rate: number; // centi（0〜100）
  readonly give_buff: Readonly<Record<string, number>>; // パラメータID -> centi
  readonly range: number;
  readonly atk: number;
  readonly dmg_hp: number; // centi
  readonly dmg_vp: number; // centi
  readonly dmg_pp: number; // centi
  readonly dmg_ap: number; // centi
  readonly stun: boolean;
  readonly give_seal: number; // centi
  readonly give_slip: number; // centi
  readonly give_debuff: Readonly<Record<string, number>>; // パラメータID -> centi
  readonly strip_rate: number; // centi（0〜100）
  readonly initial_copy_val: number; // centi
  readonly interfere_pos: InterferePos;
}

// [M-STATE-ACTIONMASTER]
export interface ActionMasterRecord {
  readonly class_id: string; // 体系は [M-DATA-CLASSID]
  readonly display_name: string;
  readonly description?: string;
  readonly base_uses: number; // centi。無限は -1（センチ換算しないセンチネル、[I-STATE-JSON]）
  readonly inheritable: boolean;
  readonly is_root: boolean;
  readonly manual_sys_flag: string | null;
  readonly params: ActionParams;
}

// [M-DATA-SCENEMASTER]
export interface SceneMasterRecord {
  readonly scene_id: string;
  readonly display_name: string;
  readonly act: number;
  readonly order: number;
  readonly attendant_capacity: number;
  readonly unlock: readonly string[]; // 語彙は [M-DATA-UNLOCKKEYS]
  readonly level: number;
  readonly enemy_id: string;
  readonly hp_bonus_base: number | null;
  readonly max_depth: number | null;
  readonly node_limit: number | null;
  readonly joint_action: boolean;
  readonly deferred_decision: boolean;
  readonly eval_mask: readonly string[] | null;
  readonly inertia_steps: number | null;
  readonly expected_length: number | null;
}

// [M-DATA-COEFFKEYS]
export type CoeffKey =
  | 'thRate'
  | 'stRate'
  | 'rcRate'
  | 'costRate'
  | 'decayApRate'
  | 'deployRate'
  | 'rangeRate'
  | 'atkRate'
  | 'dmgRate'
  | 'gainVpRate'
  | 'chargePpRate'
  | 'purifyRate'
  | 'stripRate'
  | 'giveBuffRate'
  | 'giveDebuffRate'
  | 'usesRate'
  | 'hpAddRate';

// [M-DATA-ATTENDANTMASTER] coeffs は centi。未記載のキーは ×1.00。
export interface AttendantMasterRecord {
  readonly attendant_id: string;
  readonly display_name: string;
  readonly epithet: string;
  readonly join_act: number;
  readonly is_fixed: boolean;
  readonly coeffs: Readonly<Partial<Record<CoeffKey, number>>>;
}

// [M-DATA-ENEMYMASTER]
export interface EnemyMasterRecord {
  readonly enemy_id: string; // 体系は [M-DATA-ENEMYID]
  readonly display_name: string;
  readonly role_name: string | null;
  readonly max_hp: number;
  readonly acts: readonly string[]; // アクションマスタの class_id。順序有意
  readonly ai_profile_id: string | null;
  readonly book_id: string | null; // `B-NN` 形式。省略時は定跡なし
  readonly fixed_cycle: readonly string[] | null; // ai_profile_id が null のときのみ非 null
  readonly audit_exempt: boolean;
}
