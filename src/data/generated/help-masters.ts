// このファイルは tools/genmaster により生成される（[I-PLAN-MASTERGEN]）。
// 生成後のファイルを人が編集しない。
import type { HelpMasterRecord } from '../types.js';

export const HELP_MASTERS = {
  "HELP_BUFF": {
    "help_id": "HELP_BUFF",
    "title": "付与",
    "body": "心気の中には、自らの性能を高める付与を持つものがある。付与はその戦いのあいだ残り、同じ性能への付与は大きい方が採られる。剥奪を受けると弱まる。",
    "unlock_key": "BUFF_COST_HP",
    "category": "ACTION",
    "order": 4
  },
  "HELP_COPY": {
    "help_id": "HELP_COPY",
    "title": "写し取り",
    "body": "命中した相手が直前に使った技を、写しとして自分のアクションに加える武技。写しは剥奪を受けて定着が薄れると失われる。",
    "unlock_key": "COPY",
    "category": "ACTION",
    "order": 7
  },
  "HELP_DEBUFF": {
    "help_id": "HELP_DEBUFF",
    "title": "減衰",
    "body": "命中した相手の性能を下げる武技。減衰はその戦いのあいだ残り、浄化を持つ心気で取り払うまで消えない。",
    "unlock_key": "DEBUFF_STEP_RECOVERY",
    "category": "ACTION",
    "order": 5
  },
  "HELP_DEFENSE": {
    "help_id": "HELP_DEFENSE",
    "title": "防御と命中",
    "body": "武技は、攻撃力（攻）が相手の防御力（防）以上であれば命中し、下回れば回避される。回避された武技は、ダメージも拍断ちも、どの効果も及ぼさない。防御力はAPとアクションの防御効率から決まる。",
    "unlock_key": null,
    "category": "STEP",
    "order": 4
  },
  "HELP_FIELD": {
    "help_id": "HELP_FIELD",
    "title": "隊列と射程",
    "body": "戦場は横一列の4マス。左から自陣の後列・前列、敵陣の前列・後列と並ぶ。2体の距離は、隣り合えば1、ひとつ離れるごとに1ずつ増える。武技は、射程（射）以内の距離にいる敵すべてに届く。",
    "unlock_key": null,
    "category": "ACTION",
    "order": 9
  },
  "HELP_INHERIT": {
    "help_id": "HELP_INHERIT",
    "title": "継承",
    "body": "戦いに勝つと、同行する従者は一人につき一度、倒した敵の技か最大HPのいずれかを受け継がせる。従者ごとの資質が、受け継ぐ技の性能を変える。同じ技を複数の従者が選ぶと一つにまとまり、各項目は最も良い値が採られる。",
    "unlock_key": null,
    "category": "PROGRESS",
    "order": 1
  },
  "HELP_INTERFERE": {
    "help_id": "HELP_INTERFERE",
    "title": "斥け・招き",
    "body": "命中した相手の陣の前列と後列を入れ替える武技。前列に当てて押しやるのが斥け、後列に当てて引き出すのが招き。構え中の技は、入れ替わった位置から届かなければ空を切る。",
    "unlock_key": "INTERFERE",
    "category": "ACTION",
    "order": 3
  },
  "HELP_PURIFY_STRIP": {
    "help_id": "HELP_PURIFY_STRIP",
    "title": "浄化と剥奪",
    "body": "浄化を持つ心気は、自らが負った減衰・灼け・封印を弱める。剥奪を持つ武技は、命中した相手の付与と写しを弱める。",
    "unlock_key": null,
    "category": "ACTION",
    "order": 11
  },
  "HELP_RESOURCE_AP": {
    "help_id": "HELP_RESOURCE_AP",
    "title": "AP",
    "body": "身を守る壁。体勢で張り直す。思考中はAPがそのまま防御力となり、構え中や硬直中はアクションの防御効率を掛けた値が防御力となる。アクションを終えるたびに減ることがある。",
    "unlock_key": null,
    "category": "RESOURCE",
    "order": 7
  },
  "HELP_RESOURCE_HP": {
    "help_id": "HELP_RESOURCE_HP",
    "title": "HP",
    "body": "生命力。0になると倒れる。マスターが倒れた側の負けとなる。戦いの後も減ったまま持ち越し、供犠やアクトの移り目で癒える。",
    "unlock_key": null,
    "category": "RESOURCE",
    "order": 4
  },
  "HELP_RESOURCE_PP": {
    "help_id": "HELP_RESOURCE_PP",
    "title": "PP",
    "body": "技を放つ力。心気で、VPに応じた量まで引き上げる。武技や体勢の多くはPPを消費する。",
    "unlock_key": null,
    "category": "RESOURCE",
    "order": 6
  },
  "HELP_RESOURCE_VP": {
    "help_id": "HELP_RESOURCE_VP",
    "title": "VP",
    "body": "気の昂り。心気を使うたびに積み上がり、上限はない。積み上げたVPが多いほど、心気で充填できるPPが多くなる。",
    "unlock_key": null,
    "category": "RESOURCE",
    "order": 5
  },
  "HELP_REWIND": {
    "help_id": "HELP_REWIND",
    "title": "取消と再走",
    "body": "取消は、直前の指示や継承をひとつ取り消す。再走は、戦いの始まりか、過去のインターミッションまで戻る。戻った後に次の操作を確定すると、燈の数字がひとつ増える。",
    "unlock_key": null,
    "category": "UI",
    "order": 3
  },
  "HELP_ROOT_MARTIAL": {
    "help_id": "HELP_ROOT_MARTIAL",
    "title": "終焉の太刀",
    "body": "マスターが初めから持つ、尽きることのない武技。長い思考を要するが、放てば射程の内の敵を一刀で断つ。",
    "unlock_key": null,
    "category": "ACTION",
    "order": 12
  },
  "HELP_RUSH": {
    "help_id": "HELP_RUSH",
    "title": "急襲",
    "body": "思考を待たずに打ち込める武技。構えのあいだも防御を保つため、相手の隙に差し込める。",
    "unlock_key": "RUSH",
    "category": "ACTION",
    "order": 1
  },
  "HELP_SACRIFICE": {
    "help_id": "HELP_SACRIFICE",
    "title": "供犠と補充",
    "body": "インターミッションで一度だけ、従者を一人焚いて、{HeroName}のHPを最大まで癒せる。焚いた従者は二度と戻らず、その枠はアクトが移るまで空く。アクトが移るとき、そのアクトの終わりに命を落とした者から、新たな従者を選んで加えられる。",
    "unlock_key": null,
    "category": "PROGRESS",
    "order": 2
  },
  "HELP_SEAL": {
    "help_id": "HELP_SEAL",
    "title": "封印",
    "body": "命中した相手が直前に使った技に、封を重ねる武技。封が満ちた技は使えず、構えの途中であれば中断される。浄化で解ける。",
    "unlock_key": "SEAL",
    "category": "ACTION",
    "order": 8
  },
  "HELP_SLIP": {
    "help_id": "HELP_SLIP",
    "title": "灼け",
    "body": "命中した相手に灼けを残す武技。灼けを負った者は、アクションの硬直が明けるたびにHPを失う。浄化で弱められる。",
    "unlock_key": "SLIP",
    "category": "ACTION",
    "order": 6
  },
  "HELP_STEP_RECOVERY": {
    "help_id": "HELP_STEP_RECOVERY",
    "title": "硬直",
    "body": "発動の後、必要な硬直（硬）のステップを経て思考中へ戻る。硬直のあいだは拍断ちを受けない。灼けを負っていれば、硬直が明けたときにHPを失う。",
    "unlock_key": null,
    "category": "STEP",
    "order": 3
  },
  "HELP_STEP_STARTUP": {
    "help_id": "HELP_STEP_STARTUP",
    "title": "発生",
    "body": "指示したアクションは、必要な発生（発）のステップを経て発動する。発生のあいだに拍断ちや封印を受けると、アクションは中断され、消費したものは戻らない。発生が0のアクションは、指示したその場で発動する。",
    "unlock_key": null,
    "category": "STEP",
    "order": 2
  },
  "HELP_STEP_THOUGHT": {
    "help_id": "HELP_STEP_THOUGHT",
    "title": "思考",
    "body": "思考中のユニットは、ステップごとに思考を蓄える。アクションごとに必要な思考（思）が決まっており、蓄えが届いたものから実行できる。拍断ちを受けると蓄えは0に戻る。",
    "unlock_key": null,
    "category": "STEP",
    "order": 1
  },
  "HELP_STRIP_AP": {
    "help_id": "HELP_STRIP_AP",
    "title": "壁を削る打撃",
    "body": "命中した相手のAPを削る武技。APは防御力の源であり、削られた壁は次の打撃を通しやすくなる。",
    "unlock_key": "STRIP_AP",
    "category": "RESOURCE",
    "order": 3
  },
  "HELP_STRIP_PP": {
    "help_id": "HELP_STRIP_PP",
    "title": "力を削る打撃",
    "body": "命中した相手のPPを削る武技。PPを失うと、PPを消費する武技を放てなくなる。",
    "unlock_key": "STRIP_PP",
    "category": "RESOURCE",
    "order": 2
  },
  "HELP_STRIP_VP": {
    "help_id": "HELP_STRIP_VP",
    "title": "気を削る打撃",
    "body": "命中した相手のVPを削る武技。VPが減ると、次の心気で充填できるPPが少なくなる。",
    "unlock_key": "STRIP_VP",
    "category": "RESOURCE",
    "order": 1
  },
  "HELP_STUN": {
    "help_id": "HELP_STUN",
    "title": "拍断ち",
    "body": "拍断ちを持つ武技が命中すると、構えている相手のアクションを中断させ、思考中の相手の蓄えを0に戻す。硬直中の相手には効かない。同じステップで発動した技どうしは、互いに断たれない。",
    "unlock_key": null,
    "category": "STEP",
    "order": 5
  },
  "HELP_SUMMON": {
    "help_id": "HELP_SUMMON",
    "title": "召喚と仮身",
    "body": "召喚は、マスターと同じ陣の空いたマスへ仮身（クリーチャー）を呼び出す。仮身は自ら考えて動く。新たに召喚すると、前の仮身は消える。仮身が倒れても勝敗は決まらない。",
    "unlock_key": "SUMMON",
    "category": "ACTION",
    "order": 2
  },
  "HELP_SYSTEM_FLAGS": {
    "help_id": "HELP_SYSTEM_FLAGS",
    "title": "五つの系統",
    "body": "アクションは心気・武技・体勢・召喚・隊列交代の五つの系統を組み合わせてできている。複数の系統を持つアクションは、召喚、隊列交代、心気、武技、体勢の順に効果を表す。",
    "unlock_key": null,
    "category": "ACTION",
    "order": 10
  },
  "HELP_TIMELINE": {
    "help_id": "HELP_TIMELINE",
    "title": "未来予測",
    "body": "盤面の上の帯は、いま構えている技がいつ発動し、いつ硬直が明けるかを示す。思考中の者はそのまま待つと仮定している。アクションに注目すると、それを指示した場合の先行きが重ねて描かれる。",
    "unlock_key": null,
    "category": "UI",
    "order": 2
  },
  "HELP_WATCH": {
    "help_id": "HELP_WATCH",
    "title": "監視と時間停止",
    "body": "戦いは自動で進み、敵が構えたときや、監視している条件が新たに成り立ったときに時間が止まる。アクションカードの可・止・中前・中後・避で監視を切り替える。可は実行可能、止は拍断ちを受けずに発動できること、中前・中後は前列・後列への命中、避は被弾を免れうることを表す。",
    "unlock_key": null,
    "category": "UI",
    "order": 1
  },
} as const satisfies Record<string, HelpMasterRecord>;
