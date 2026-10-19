// [S-SCRIPT-CONDITION] 表示条件式の評価。
// condition := term ( "&&" term )* / term := variable comparator literal / literal := 整数 | True | False

import { sceneOf, type GameMasters } from '../run/masters.js';
import { readTotalRewindCount, type GameSession } from '../game/session.js';

type Value = number | boolean;

// 従者が戦死する4場面（[S-SCRIPT-CONDITION] ForeknownDeathScenes）。
const DEATH_SCENES = ['SCENE_1_02', 'SCENE_2_04', 'SCENE_3_06', 'SCENE_4_08'];
const SACRAMENT_CLASS_ID = 'ACT_SACRAMENT'; // [M-END-SACRAMENT-PARAMS]
const RINA = 'ATTENDANT_01';

const TERM = /^([A-Za-z0-9]+)(?:\[([A-Z0-9_]+)\])? (==|!=|>=|<=|>|<) (-?\d+|True|False)$/;

// 発火した時点のステートで変数を読む関数を作る。同じ発火の後続レコードの選択にも同じ値を用いる
// （［評価の時点］）ため、呼び出し側は1回の発火につき1つ作って使い回す。
export function conditionReader(session: GameSession, masters: GameMasters): (name: string, key: string | null) => Value {
  const { meta, run } = session.data;
  const totalRewindCount = readTotalRewindCount(session);
  const scene = sceneOf(masters, run.current_scene_id);
  const hero = run.battle_state?.units.find((unit) => unit !== null && unit.side === 'MINE' && unit.unit_kind === 'MASTER');
  const heroActs = run.phase === 'BATTLE' && hero !== undefined && hero !== null ? hero.acts : run.hero_acts;

  return (name, key) => {
    const requireKey = (): string => {
      if (key === null) {
        throw new Error(`添字を要する変数: ${name}`);
      }
      return key;
    };
    switch (name) {
      case 'TotalRewindCount':
        return totalRewindCount;
      case 'PlaythroughCount':
        return meta.playthrough_count;
      case 'EnshrinedCount':
        return run.enshrined_count;
      case 'ObsoleteNameRevealed':
        return meta.obsolete_name_revealed;
      case 'EchoUnlocked':
        return meta.echo_unlocked[requireKey()] === true;
      case 'AttendantPresent':
        return run.party.some((slot) => slot.attendant_id === requireKey());
      case 'SacrificeCount':
        return run.sacrificed.length;
      case 'SacrificedRetainerCount':
        return run.sacrificed.filter((attendantId) => attendantId !== RINA).length;
      case 'AttendantSacrificed':
        return run.sacrificed.includes(requireKey());
      case 'CrossUnlockedAny':
        return Object.values(run.cross_unlocked).some((unlocked) => unlocked);
      case 'PartyCount':
        return run.party.length;
      case 'FurthestOrder':
        return meta.furthest_order;
      case 'HeroHpMax':
        return run.phase === 'BATTLE' && hero !== undefined && hero !== null ? hero.max_hp : run.hero_max_hp;
      case 'SacramentHeld':
        return heroActs.some((act) => act.master_ref === SACRAMENT_CLASS_ID);
      case 'ForeknownAt':
        return run.foreknown_scenes.includes(requireKey());
      case 'ForeclearedAt':
        return run.forecleared_scenes.includes(requireKey());
      case 'ActNumber':
        return scene.act;
      case 'SceneOrder':
        return scene.order;
      case 'ForeknownDeathScenes':
        return DEATH_SCENES.filter((sceneId) => run.forecleared_scenes.includes(sceneId)).length;
      default:
        // Marks08・Close510Heard は審査範囲の外の記録であり、未実装。
        throw new Error(`評価できない条件式の変数: ${name}`);
    }
  };
}

function compare(left: Value, comparator: string, right: Value): boolean {
  switch (comparator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>=':
      return left >= right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    default:
      return left < right;
  }
}

export function evaluateCondition(condition: string | null, read: (name: string, key: string | null) => Value): boolean {
  if (condition === null) {
    return true;
  }
  return condition.split('&&').every((part) => {
    const match = TERM.exec(part.trim());
    if (match === null) {
      throw new Error(`条件式の文法に合わない: ${part}`);
    }
    const [, name, key, comparator, literal] = match;
    const right: Value = literal === 'True' ? true : literal === 'False' ? false : Number.parseInt(literal ?? '', 10);
    return compare(read(name ?? '', key ?? null), comparator ?? '', right);
  });
}
