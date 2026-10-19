// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { StringMasterRecord } from '../types.js';

export const STRING_MASTERS = {
  "STR_CONFIRM_FORFEIT": {
    "string_id": "STR_CONFIRM_FORFEIT",
    "text": "まだ継承していない従者がいる。このまま進むと、次の継承枠は失われる。",
    "context": []
  },
  "STR_CONFIRM_FORFEIT_BTN": {
    "string_id": "STR_CONFIRM_FORFEIT_BTN",
    "text": "失効させて進む",
    "context": []
  },
  "STR_CONFIRM_FORFEIT_HEAD": {
    "string_id": "STR_CONFIRM_FORFEIT_HEAD",
    "text": "継承枠の失効",
    "context": []
  },
  "STR_CONFIRM_FORFEIT_ROW": {
    "string_id": "STR_CONFIRM_FORFEIT_ROW",
    "text": "{AttendantName}〈{AttendantEpithet}〉の継承枠",
    "context": [
      "ATTENDANT"
    ]
  },
  "STR_CONFIRM_IM_COMMIT": {
    "string_id": "STR_CONFIRM_IM_COMMIT",
    "text": "この編成で、次の戦いへ向かう。",
    "context": []
  },
  "STR_CONFIRM_IM_COMMIT_BTN": {
    "string_id": "STR_CONFIRM_IM_COMMIT_BTN",
    "text": "向かう",
    "context": []
  },
  "STR_CONFIRM_IM_COMMIT_HEAD": {
    "string_id": "STR_CONFIRM_IM_COMMIT_HEAD",
    "text": "編成の確定",
    "context": []
  },
  "STR_CONFIRM_NEWGAME": {
    "string_id": "STR_CONFIRM_NEWGAME",
    "text": "いまの記録を消して、最初から始める。",
    "context": []
  },
  "STR_CONFIRM_NEWGAME_BTN": {
    "string_id": "STR_CONFIRM_NEWGAME_BTN",
    "text": "最初から始める",
    "context": []
  },
  "STR_CONFIRM_NEWGAME_HEAD": {
    "string_id": "STR_CONFIRM_NEWGAME_HEAD",
    "text": "ニューゲーム",
    "context": []
  },
  "STR_CONFIRM_QUIT_BATTLE": {
    "string_id": "STR_CONFIRM_QUIT_BATTLE",
    "text": "戦いを中断して、タイトルへ戻る。再開すると、この戦いの始まりからになる。",
    "context": []
  },
  "STR_CONFIRM_QUIT_BATTLE_BTN": {
    "string_id": "STR_CONFIRM_QUIT_BATTLE_BTN",
    "text": "中断する",
    "context": []
  },
  "STR_CONFIRM_QUIT_BATTLE_HEAD": {
    "string_id": "STR_CONFIRM_QUIT_BATTLE_HEAD",
    "text": "中断",
    "context": []
  },
  "STR_CONFIRM_REFILL": {
    "string_id": "STR_CONFIRM_REFILL",
    "text": "次の者を同行させる。",
    "context": []
  },
  "STR_CONFIRM_REFILL_BTN": {
    "string_id": "STR_CONFIRM_REFILL_BTN",
    "text": "同行させる",
    "context": []
  },
  "STR_CONFIRM_REFILL_HEAD": {
    "string_id": "STR_CONFIRM_REFILL_HEAD",
    "text": "従者の補充",
    "context": []
  },
  "STR_CONFIRM_REFILL_ROW": {
    "string_id": "STR_CONFIRM_REFILL_ROW",
    "text": "{AttendantName}〈{AttendantEpithet}〉",
    "context": [
      "ATTENDANT"
    ]
  },
  "STR_CONFIRM_ROLLBACK_BATTLE": {
    "string_id": "STR_CONFIRM_ROLLBACK_BATTLE",
    "text": "この戦いを、始まりからやり直す。",
    "context": []
  },
  "STR_CONFIRM_ROLLBACK_BATTLE_BTN": {
    "string_id": "STR_CONFIRM_ROLLBACK_BATTLE_BTN",
    "text": "やり直す",
    "context": []
  },
  "STR_CONFIRM_ROLLBACK_BATTLE_HEAD": {
    "string_id": "STR_CONFIRM_ROLLBACK_BATTLE_HEAD",
    "text": "戦いの再走",
    "context": []
  },
  "STR_CONFIRM_ROLLBACK_IM": {
    "string_id": "STR_CONFIRM_ROLLBACK_IM",
    "text": "選んだインターミッションまで戻り、継承と編成をやり直す。それより後の記録は失われる。",
    "context": []
  },
  "STR_CONFIRM_ROLLBACK_IM_BTN": {
    "string_id": "STR_CONFIRM_ROLLBACK_IM_BTN",
    "text": "戻る",
    "context": []
  },
  "STR_CONFIRM_ROLLBACK_IM_HEAD": {
    "string_id": "STR_CONFIRM_ROLLBACK_IM_HEAD",
    "text": "編成の再走",
    "context": []
  },
  "STR_CONFIRM_ROLLBACK_IM_ROW": {
    "string_id": "STR_CONFIRM_ROLLBACK_IM_ROW",
    "text": "失われるインターミッション",
    "context": []
  },
  "STR_CONFIRM_SACRIFICE": {
    "string_id": "STR_CONFIRM_SACRIFICE",
    "text": "{AttendantName}の魂を焚き、{HeroName}の傷を癒す。焚かれた魂は、二度と戻らない。同行する従者は{PartyCountAfter}名になる。",
    "context": [
      "ATTENDANT",
      "SACRIFICE"
    ]
  },
  "STR_CONFIRM_SACRIFICE_BTN": {
    "string_id": "STR_CONFIRM_SACRIFICE_BTN",
    "text": "捧げる",
    "context": []
  },
  "STR_CONFIRM_SACRIFICE_HEAD": {
    "string_id": "STR_CONFIRM_SACRIFICE_HEAD",
    "text": "供犠",
    "context": []
  },
  "STR_HELP_FIRST_SIGHT": {
    "string_id": "STR_HELP_FIRST_SIGHT",
    "text": "この戦いでは〈{HelpTitle}〉が現れる。",
    "context": [
      "HELP"
    ]
  },
  "STR_IM_COMMIT_DONE": {
    "string_id": "STR_IM_COMMIT_DONE",
    "text": "次の戦いへ向かう。",
    "context": []
  },
  "STR_INHERIT_HP_ADD": {
    "string_id": "STR_INHERIT_HP_ADD",
    "text": "{AttendantName}を介して、{HeroName}の最大HPが{HpAdd}増えた。",
    "context": [
      "ATTENDANT"
    ]
  },
  "STR_INHERIT_MERGED": {
    "string_id": "STR_INHERIT_MERGED",
    "text": "{AttendantName}の資質が{ActionName}に重なった。改善：{ImprovedList}",
    "context": [
      "ACTION",
      "ATTENDANT"
    ]
  },
  "STR_INHERIT_NEW_SLOT": {
    "string_id": "STR_INHERIT_NEW_SLOT",
    "text": "{ActionName}を新たに得た。",
    "context": [
      "ACTION"
    ]
  },
  "STR_INHERIT_NO_IMPROVE": {
    "string_id": "STR_INHERIT_NO_IMPROVE",
    "text": "この継承では、{ActionName}の性能は何も変わらない。",
    "context": [
      "ACTION"
    ]
  },
  "STR_INHERIT_VANISH": {
    "string_id": "STR_INHERIT_VANISH",
    "text": "使用回数が残らず、受け継いだ技は形にならなかった。",
    "context": []
  },
  "STR_LOCK_NO_ATTENDANT": {
    "string_id": "STR_LOCK_NO_ATTENDANT",
    "text": "同行する従者がいないため、継承も供犠も行えない。",
    "context": []
  },
  "STR_LOCK_NO_PARTNER": {
    "string_id": "STR_LOCK_NO_PARTNER",
    "text": "入れ替わる相方がいない",
    "context": []
  },
  "STR_LOCK_PARTNER_RECOVERY": {
    "string_id": "STR_LOCK_PARTNER_RECOVERY",
    "text": "{UnitName}が硬直中",
    "context": [
      "UNIT"
    ]
  },
  "STR_LOCK_PARTNER_STARTUP": {
    "string_id": "STR_LOCK_PARTNER_STARTUP",
    "text": "{UnitName}が発生中",
    "context": [
      "UNIT"
    ]
  },
  "STR_OBJECTIVE_KALDEN": {
    "string_id": "STR_OBJECTIVE_KALDEN",
    "text": "王都カルデンで、討伐隊の裁可を得る",
    "context": []
  },
  "STR_OBJECTIVE_VEIN": {
    "string_id": "STR_OBJECTIVE_VEIN",
    "text": "天の座の主を討つ",
    "context": []
  },
  "STR_OBJECTIVE_VOID_LORD": {
    "string_id": "STR_OBJECTIVE_VOID_LORD",
    "text": "天疵の底に棲む主を討つ",
    "context": []
  },
  "STR_PAUSE_ENEMY_IMMEDIATE": {
    "string_id": "STR_PAUSE_ENEMY_IMMEDIATE",
    "text": "{UnitName}が{ActionName}を即座に放った。",
    "context": [
      "ACTION",
      "UNIT"
    ]
  },
  "STR_PAUSE_ENEMY_START": {
    "string_id": "STR_PAUSE_ENEMY_START",
    "text": "{UnitName}が{ActionName}の構えに入った。発動まで{RemainingSteps}ステップ。",
    "context": [
      "ACTION",
      "PAUSE",
      "UNIT"
    ]
  },
  "STR_PAUSE_MANUAL": {
    "string_id": "STR_PAUSE_MANUAL",
    "text": "時を止めた。",
    "context": []
  },
  "STR_PAUSE_STEP0_READY": {
    "string_id": "STR_PAUSE_STEP0_READY",
    "text": "戦いが始まった。最初の指示を選ぶ。",
    "context": []
  },
  "STR_PAUSE_WATCH_MET": {
    "string_id": "STR_PAUSE_WATCH_MET",
    "text": "{UnitName}の{ActionName}が『{WatchLabel}』になった。",
    "context": [
      "ACTION",
      "PAUSE",
      "UNIT"
    ]
  },
  "STR_REFILL_DONE": {
    "string_id": "STR_REFILL_DONE",
    "text": "新たな魂が芯に結ばれた。{HeroName}の傷が癒えた。",
    "context": []
  },
  "STR_REFILL_SHORT": {
    "string_id": "STR_REFILL_SHORT",
    "text": "同行枠{SlotCount}のうち、{RemainCount}枠が空いている。空いた枠は、このアクトのあいだ埋まらない。",
    "context": [
      "REFILL"
    ]
  },
  "STR_RESULT_LOSE": {
    "string_id": "STR_RESULT_LOSE",
    "text": "{EnemyName}に敗れた。戦いの始まりか、過去のインターミッションからやり直せる。",
    "context": [
      "ENEMY"
    ]
  },
  "STR_RESULT_LOSE_SUICIDE": {
    "string_id": "STR_RESULT_LOSE_SUICIDE",
    "text": "自らの消耗に耐えきれず、倒れた。",
    "context": []
  },
  "STR_RESULT_WIN": {
    "string_id": "STR_RESULT_WIN",
    "text": "{EnemyName}を討った。",
    "context": [
      "ENEMY"
    ]
  },
  "STR_REWIND_PENDING": {
    "string_id": "STR_REWIND_PENDING",
    "text": "燈火が揺らいでいる。次の操作を確定したとき、この巻き戻しは燈に刻まれる。",
    "context": []
  },
  "STR_SACRAMENT_AWAKEN": {
    "string_id": "STR_SACRAMENT_AWAKEN",
    "text": "燈の底で、〈復輪の秘蹟〉が目を覚ました。",
    "context": []
  },
  "STR_SACRIFICE_DONE": {
    "string_id": "STR_SACRIFICE_DONE",
    "text": "{AttendantName}を焚いた。{HeroName}の傷が癒えた。",
    "context": [
      "ATTENDANT"
    ]
  },
  "STR_TITLE_RUN_CLOSED": {
    "string_id": "STR_TITLE_RUN_CLOSED",
    "text": "この周回は終わっている。続きからは始められない。",
    "context": []
  },
  "STR_UNDO_UNAVAILABLE": {
    "string_id": "STR_UNDO_UNAVAILABLE",
    "text": "取り消せる操作がない。",
    "context": []
  },
  "STR_WATCH_EVADE": {
    "string_id": "STR_WATCH_EVADE",
    "text": "回避",
    "context": []
  },
  "STR_WATCH_HIT_BACK": {
    "string_id": "STR_WATCH_HIT_BACK",
    "text": "後列命中",
    "context": []
  },
  "STR_WATCH_HIT_FRONT": {
    "string_id": "STR_WATCH_HIT_FRONT",
    "text": "前列命中",
    "context": []
  },
  "STR_WATCH_IDLE": {
    "string_id": "STR_WATCH_IDLE",
    "text": "待機",
    "context": []
  },
  "STR_WATCH_NA": {
    "string_id": "STR_WATCH_NA",
    "text": "対象外",
    "context": []
  },
  "STR_WATCH_READY": {
    "string_id": "STR_WATCH_READY",
    "text": "実行可能",
    "context": []
  },
  "STR_WATCH_STUN": {
    "string_id": "STR_WATCH_STUN",
    "text": "拍断ち",
    "context": []
  },
} as const satisfies Record<string, StringMasterRecord>;
