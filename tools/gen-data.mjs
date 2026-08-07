/**
 * 밸런스 데이터 생성기.
 *
 * pets.json을 손으로 쓰면 24종 × 8필드를 눈으로 검산해야 하고, 성장률 상한
 * 위반을 놓치기 쉽다. 희귀도별 성장 범위를 한 곳에 두고 여기서 뽑아내면
 * 상한 준수가 구조적으로 보장된다.
 *
 * 생성 후에는 tools/validate-data.ts가 스키마와 상한을 다시 검증한다.
 */
import fs from 'node:fs';

const GROWTH_SCORE_CAP = 5.1;
const score = (g) => g.hp / 5 + g.atk + g.def + g.spd;

/**
 * 희귀도별 성장 범위.
 *
 * max 조합이 상한을 넘지 않도록 잡았다. epic도 5.08로 상한 아래다 —
 * 상한은 "도달 가능한 목표"가 아니라 "절대 넘을 수 없는 천장"이어야
 * 결제로 뚫는 설계가 애초에 성립하지 않는다.
 */
const GROWTH = {
  common:   { min: { hp: 3.0, atk: 0.82, def: 0.80, spd: 0.82 }, max: { hp: 4.4, atk: 1.12, def: 1.10, spd: 1.14 } },
  uncommon: { min: { hp: 3.4, atk: 0.90, def: 0.88, spd: 0.90 }, max: { hp: 4.8, atk: 1.20, def: 1.18, spd: 1.22 } },
  rare:     { min: { hp: 3.8, atk: 0.98, def: 0.95, spd: 0.98 }, max: { hp: 5.2, atk: 1.28, def: 1.25, spd: 1.30 } },
  epic:     { min: { hp: 4.2, atk: 1.05, def: 1.02, spd: 1.05 }, max: { hp: 5.5, atk: 1.33, def: 1.30, spd: 1.35 } },
};

for (const [r, g] of Object.entries(GROWTH)) {
  const s = score(g.max);
  if (s > GROWTH_SCORE_CAP) throw new Error(`${r} 최대 성장률이 상한 초과: ${s}`);
  console.log(`  ${r.padEnd(9)} 최대 성장률 지표 ${s.toFixed(3)} / 상한 ${GROWTH_SCORE_CAP}`);
}

const CAPTURE = { common: 0.42, uncommon: 0.30, rare: 0.18, epic: 0.08 };

/** id, 이름, 속성쌍, 희귀도, 기초스탯 배수, 스킬풀 */
const SPECIES = [
  // ── 지(earth) ──
  ['bouldershell', '바위등딱지', 'earth', null,    'common',   [1.15, 0.90, 1.25, 0.75], ['stoneThrow','burrow','harden']],
  ['dustmole',     '흙두더지',   'earth', null,    'common',   [0.95, 1.00, 1.00, 1.05], ['strike','burrow','stoneThrow']],
  ['cragox',       '돌뿔소',     'earth', 'fire',  'uncommon', [1.20, 1.10, 1.10, 0.80], ['gore','harden','quake','ironWall']],
  ['vinecarapace', '넝쿨거북',   'earth', 'water', 'uncommon', [1.10, 0.85, 1.30, 0.80], ['stoneThrow','ironWall','regrow','bind']],
  ['granitewarden','화강암거인', 'earth', null,    'rare',     [1.30, 1.15, 1.35, 0.70], ['burrow','quake','ironWall','guardBreak']],
  ['terrasovereign','대지의수호수','earth','wind', 'epic',     [1.35, 1.20, 1.30, 0.90], ['burrow','quake','earthAura','frenzy','ironWall']],
  // ── 수(water) ──
  ['dewtail',      '물방울꼬리', 'water', null,    'common',   [0.90, 0.95, 0.90, 1.15], ['splash','mist','strike']],
  ['brookotter',   '여울수달',   'water', null,    'common',   [0.95, 1.05, 0.85, 1.15], ['splash','strike','lull']],
  ['abyssray',     '심해가오리', 'water', 'wind',  'uncommon', [1.00, 1.10, 0.95, 1.20], ['splash','tidalWave','mist','harden']],
  ['frostscale',   '서리비늘',   'water', null,    'uncommon', [1.05, 1.05, 1.10, 1.00], ['splash','frostArmor','mist','waterAura']],
  ['currentwyrm',  '해류이무기', 'water', 'earth', 'rare',     [1.20, 1.20, 1.05, 1.10], ['splash','tidalWave','waterAura','guardBreak']],
  ['abysslord',    '심연의군주', 'water', null,    'epic',     [1.30, 1.25, 1.15, 1.05], ['splash','tidalWave','waterAura','frenzy','mend']],
  // ── 화(fire) ──
  ['emberfox',     '불씨여우',   'fire',  null,    'common',   [0.88, 1.10, 0.82, 1.15], ['scorch','strike','flare']],
  ['ashnewt',      '잿빛도롱뇽', 'fire',  'earth', 'common',   [0.95, 1.05, 0.95, 0.98], ['scorch','venomSpine','strike']],
  ['blazeboar',    '화염멧돼지', 'fire',  null,    'uncommon', [1.15, 1.20, 1.00, 0.95], ['gore','flare','frenzy']],
  ['magmasnail',   '용암달팽이', 'fire',  'earth', 'uncommon', [1.20, 0.95, 1.30, 0.65], ['scorch','flare','harden','fireAura']],
  ['plumewing',    '불꽃깃새',   'fire',  'wind',  'rare',     [0.95, 1.25, 0.90, 1.35], ['scorch','flare','fireAura','guardBreak']],
  ['pyrarch',      '화산의패자', 'fire',  'earth', 'epic',     [1.30, 1.35, 1.10, 1.00], ['scorch','flare','fireAura','frenzy3','mend']],
  // ── 풍(wind) ──
  ['breezefinch',  '바람참새',   'wind',  null,    'common',   [0.82, 0.95, 0.80, 1.25], ['windSlash','gale','feint']],
  ['meadowhare',   '초원토끼',   'wind',  'earth', 'common',   [0.88, 0.92, 0.88, 1.22], ['windSlash','strike','lull']],
  ['gustwolf',     '질풍늑대',   'wind',  null,    'uncommon', [1.00, 1.20, 0.92, 1.25], ['windSlash','gale','frenzy','feint']],
  ['whirlstag',    '회오리사슴', 'wind',  'water', 'uncommon', [1.05, 1.05, 1.00, 1.20], ['windSlash','gale','windAura','mend']],
  ['stormfalcon',  '폭풍매',     'wind',  'water', 'rare',     [0.95, 1.30, 0.88, 1.40], ['windSlash','gale','windAura','guardBreak']],
  ['skysuzerain',  '창공의주인', 'wind',  'fire',  'epic',     [1.15, 1.30, 1.05, 1.40], ['windSlash','gale','windAura','frenzy','mend']],
];

/**
 * 외형 골격.
 *
 * 이름이 곧 골격이다 — 등딱지 달린 것은 shell, 네발 짐승은 beast, 목이 긴 거수는
 * saurian. 밸런스에는 들어가지 않지만 종마다 반드시 하나 있어야 하므로 표를 따로
 * 두고 아래에서 누락을 확인한다.
 *
 * 뿔·귀·꼬리 같은 세부는 여기 없다. 그건 골격이 아니라 부속이고,
 * src/render/species.ts 의 특징표가 맡는다.
 */
const FORM = {
  bouldershell: 'shell',   dustmole: 'beast',     cragox: 'beast',
  vinecarapace: 'shell',   granitewarden: 'golem', terrasovereign: 'saurian',
  dewtail: 'beast',        brookotter: 'beast',   abyssray: 'ray',
  frostscale: 'serpent',   currentwyrm: 'serpent', abysslord: 'saurian',
  emberfox: 'beast',       ashnewt: 'serpent',    blazeboar: 'beast',
  magmasnail: 'shell',     plumewing: 'bird',     pyrarch: 'saurian',
  breezefinch: 'bird',     meadowhare: 'beast',   gustwolf: 'beast',
  whirlstag: 'beast',      stormfalcon: 'bird',   skysuzerain: 'bird',
};

const BASE = { hp: 42, atk: 11, def: 10, spd: 11 };

/**
 * 스탯의 실제 전투 가치.
 *
 * 짐작이 아니라 측정값이다 — 기준 개체에서 스탯 하나만 +10% 하고 400회씩
 * 붙여 승률 초과분을 잰 결과다(tools/simulate.ts 로 재현 가능). 공격이 가장
 * 크고, 방어가 가장 작다. 순발력은 행동 순서 때문에 체력만큼 값이 나간다.
 */
const STAT_VALUE = { hp: 1.00, atk: 1.35, def: 0.70, spd: 0.97 };

/**
 * 등급별 스탯 예산.
 *
 * 같은 등급 안에서는 **총량이 같아야** 한다. 총량이 다르면 배분이 어떻든 한쪽이
 * 그냥 더 세고, 그 종을 고를 이유가 사라진다. 종의 개성은 총량이 아니라
 * 배분(탱커냐 딜러냐)에서 나와야 한다.
 */
const BUDGET = { common: 4.00, uncommon: 4.25, rare: 4.55, epic: 4.85 };

/** 모양은 유지한 채 가중 합만 목표치에 맞춘다. */
function normalize(mult, rarity) {
  const weighted = mult[0] * STAT_VALUE.hp + mult[1] * STAT_VALUE.atk + mult[2] * STAT_VALUE.def + mult[3] * STAT_VALUE.spd;
  const k = BUDGET[rarity] / weighted;
  return mult.map((v) => v * k);
}

const pets = SPECIES.map(([id, name, primary, secondary, rarity, rawMult, pool]) => ({
  id,
  name,
  element: { primary, secondary },
  baseStats: (() => {
    const mult = normalize(rawMult, rarity);
    return {
      hp: Math.round(BASE.hp * mult[0]),
      atk: Math.round(BASE.atk * mult[1] * 10) / 10,
      def: Math.round(BASE.def * mult[2] * 10) / 10,
      spd: Math.round(BASE.spd * mult[3] * 10) / 10,
    };
  })(),
  growthRange: GROWTH[rarity],
  skillPool: pool,
  captureBaseRate: CAPTURE[rarity],
  rarity,
  form: (() => {
    const f = FORM[id];
    if (!f) throw new Error(`외형이 정해지지 않은 종: ${id}`);
    return f;
  })(),
}));

// 진화 사슬 — 각 속성의 uncommon 하나가 rare로 간다
const EVOLVE = {
  cragox: ['granitewarden', 40, 'evolveStone'],
  frostscale: ['currentwyrm', 40, 'evolveStone'],
  magmasnail: ['plumewing', 40, 'evolveStone'],
  whirlstag: ['stormfalcon', 40, 'evolveStone'],
};
for (const p of pets) {
  const e = EVOLVE[p.id];
  if (e) p.evolveTo = { speciesId: e[0], requiredLevel: e[1], itemId: e[2] };
}

/* ── 스킬 ── */
const S = (id, name, archetype, element, target, power, cost, accuracy, extra = {}) =>
  ({ id, name, archetype, element, target, power, cost, accuracy, ...extra });

const skills = [
  // 단일 공격
  S('strike','몸통치기','single',null,'oneEnemy',1.00,0,0.95,{description:'기본 물리 공격.'}),
  S('gore','들이받기','single',null,'oneEnemy',1.35,6,0.90,{description:'뿔로 강하게 들이받는다.'}),
  S('stoneThrow','돌던지기','single','earth','oneEnemy',1.15,5,0.92,{description:'바위 조각을 던진다.'}),
  S('splash','물살치기','single','water','oneEnemy',1.15,5,0.93,{description:'물살로 후려친다.'}),
  S('scorch','불사르기','single','fire','oneEnemy',1.20,5,0.90,{description:'불길로 태운다.'}),
  S('burrow','땅뚫기','single','earth','oneEnemy',1.25,7,0.88,{description:'땅속에서 기습한다.'}),
  S('windSlash','칼바람','single','wind','oneEnemy',1.15,5,0.93,{description:'바람을 날로 세워 벤다.'}),
  S('venomSpine','독가시','single',null,'oneEnemy',0.85,6,0.90,{ailment:'poison',duration:4,description:'독을 묻힌 가시로 찌른다.'}),
  // 전체 공격
  S('quake','대지흔들기','aoe','earth','allEnemies',0.85,14,0.88,{description:'땅을 흔들어 전열을 무너뜨린다.'}),
  S('tidalWave','해일','aoe','water','allEnemies',0.85,14,0.88,{description:'파도를 일으켜 휩쓴다.'}),
  S('flare','화염폭발','aoe','fire','allEnemies',0.88,15,0.86,{description:'불길을 터뜨린다.'}),
  S('gale','돌풍','aoe','wind','allEnemies',0.82,13,0.90,{description:'바람의 칼날로 베어낸다.'}),
  // 방어 버프 3단계 — 원작 "배수의 진" 계열. 공격을 올리는 대신 방어를 깎는다.
  S('frenzy','배수의진 1','guardBuff',null,'self',0,6,1.00,{duration:3,modifiers:{atk:1.30,def:0.85},description:'공격력을 올리는 대신 방어를 내준다.'}),
  S('frenzy2','배수의진 2','guardBuff',null,'self',0,10,1.00,{duration:3,modifiers:{atk:1.60,def:0.70},description:'더 크게 공격에 치우친다.'}),
  S('frenzy3','배수의진 3','guardBuff',null,'self',0,15,1.00,{duration:3,modifiers:{atk:2.00,def:0.50},description:'방어를 절반 버리고 공격에 모든 걸 건다.'}),
  S('harden','굳히기','guardBuff',null,'self',0,5,1.00,{duration:3,modifiers:{def:1.35,spd:0.90},description:'몸을 굳혀 방어를 올린다.'}),
  S('ironWall','철벽','guardBuff',null,'allAllies',0,12,1.00,{duration:3,modifiers:{def:1.25},description:'아군 전체의 방어를 올린다.'}),
  S('frostArmor','서리갑옷','guardBuff','water','self',0,8,1.00,{duration:3,modifiers:{def:1.40,spd:0.85},description:'얼음으로 몸을 감싼다.'}),
  // 탱킹 유도
  S('taunt','도발','taunt',null,'self',0,6,1.00,{duration:2,description:'적의 공격을 자신에게 끌어온다.'}),
  S('shieldAlly','감싸기','taunt',null,'oneAlly',0,8,1.00,{duration:2,description:'지정한 아군이 받을 피해를 대신 받는다.'}),
  // 상태이상
  S('lull','잠재우기','ailment',null,'oneEnemy',0,8,0.70,{ailment:'sleep',duration:3,description:'대상을 잠재운다. 피격 시 깨어난다.'}),
  S('mist','안개걸기','ailment','water','oneEnemy',0,8,0.72,{ailment:'confusion',duration:3,description:'혼란시켜 무작위로 행동하게 한다.'}),
  S('numb','마비침','ailment',null,'oneEnemy',0,9,0.68,{ailment:'paralysis',duration:3,description:'신경을 마비시켜 행동을 막는다.'}),
  S('toxicCloud','독안개','ailment',null,'allEnemies',0,16,0.60,{ailment:'poison',duration:4,description:'적 전체에 독을 퍼뜨린다.'}),
  S('bind','옭아매기','ailment','earth','oneEnemy',0,7,0.75,{ailment:'paralysis',duration:2,description:'덩굴로 묶어 움직임을 막는다.'}),
  // 회복
  S('mend','치유','heal',null,'oneAlly',0,10,1.00,{power:0.35,description:'아군 하나의 체력을 회복한다.'}),
  S('regrow','재생','heal','earth','self',0,8,1.00,{power:0.30,description:'자신의 체력을 회복한다.'}),
  S('rally','회복의노래','heal',null,'allAllies',0,20,1.00,{power:0.20,description:'아군 전체를 조금씩 회복한다.'}),
  S('cleanse','정화','heal',null,'oneAlly',0,9,1.00,{description:'아군 하나의 상태이상을 해제한다.'}),
  // 속성 강화 — 단일 속성 파티를 만드는 축
  S('earthAura','대지의가호','elementBuff','earth','allAllies',0,14,1.00,{duration:4,modifiers:{atk:1.20,def:1.10},description:'지 속성 아군을 강화한다.'}),
  S('waterAura','물의가호','elementBuff','water','allAllies',0,14,1.00,{duration:4,modifiers:{atk:1.20,def:1.10},description:'수 속성 아군을 강화한다.'}),
  S('fireAura','불의가호','elementBuff','fire','allAllies',0,14,1.00,{duration:4,modifiers:{atk:1.25,def:1.05},description:'화 속성 아군을 강화한다.'}),
  S('windAura','바람의가호','elementBuff','wind','allAllies',0,14,1.00,{duration:4,modifiers:{atk:1.15,spd:1.20},description:'풍 속성 아군을 강화한다.'}),
  // 가드 브레이크
  S('guardBreak','방어깨기','guardBreak',null,'oneEnemy',0.90,9,0.88,{duration:3,modifiers:{def:0.70},description:'방어를 깨뜨려 이후 피해를 키운다.'}),
  S('feint','허찌르기','guardBreak',null,'oneEnemy',0.75,6,0.95,{duration:2,modifiers:{def:0.85},description:'빈틈을 노려 방어를 흐트러뜨린다.'}),
];

/* ── 정령 12종 ── */
const spiritLevels = (baseCost, baseRate, baseDur, basePower) =>
  Array.from({ length: 5 }, (_, i) => ({
    cost: baseCost + i * Math.round(baseCost * 0.35),
    successRate: Math.min(0.95, Math.round((baseRate + i * 0.07) * 100) / 100),
    duration: baseDur + i,
    power: Math.round((basePower * (1 + i * 0.25)) * 100) / 100,
  }));

// effect: 전투 엔진이 이 정령으로 뭘 해야 하는지. 설명문으로는 추론할 수 없으므로
// (석화피부=방어, 단조의심장=공격, 산들바람걸음=순발력이 전부 power 0 · oneAlly다)
// 데이터에 명시한다.
const spirits = [
  ['gaiaGrasp','대지의손아귀','earth','oneEnemy',8,0.55,2,0.9,'대지가 적을 붙든다.',{kind:'damage'}],
  ['stoneSkin','석화피부','earth','oneAlly',7,0.65,2,0.0,'피부를 돌처럼 굳힌다.',{kind:'buff',modifiers:{def:1.3}}],
  ['tideCall','조수부름','water','allEnemies',12,0.50,2,0.8,'조수를 불러 적 전체를 친다.',{kind:'damage'}],
  ['healingSpring','치유의샘','water','allAllies',11,0.70,1,0.25,'샘물이 아군을 적신다.',{kind:'heal'}],
  ['emberBrand','불씨낙인','fire','oneEnemy',8,0.58,3,1.0,'낙인이 남아 지속 피해를 준다.',{kind:'ailment',ailment:'poison'}],
  ['forgeHeart','단조의심장','fire','oneAlly',9,0.62,2,0.0,'공격력을 끌어올린다.',{kind:'buff',modifiers:{atk:1.25}}],
  ['zephyrStep','산들바람걸음','wind','oneAlly',7,0.68,2,0.0,'순발력을 올린다.',{kind:'buff',modifiers:{spd:1.3}}],
  ['tempestEye','폭풍의눈','wind','allEnemies',13,0.48,2,0.85,'폭풍이 적진을 훑는다.',{kind:'damage'}],
  ['slumberVeil','잠의장막',null,'oneEnemy',9,0.45,2,0.0,'대상을 재운다.',{kind:'ailment',ailment:'sleep'}],
  ['venomSeep','독기스밈',null,'oneEnemy',8,0.52,3,0.0,'독이 서서히 퍼진다.',{kind:'ailment',ailment:'poison'}],
  ['wardLight','수호의빛',null,'allAllies',14,0.60,2,0.0,'아군 전체의 방어를 올린다.',{kind:'buff',modifiers:{def:1.2}}],
  // 충성도는 전투 밖 시스템이라 전투 중에는 아무 일도 하지 않는다. Phase 3이 읽는다.
  ['soulTether','혼줄',null,'oneAlly',10,0.55,1,0.0,'충성도 하락을 잠시 막는다.',{kind:'loyaltyGuard'}],
].map(([id,name,element,target,cost,rate,dur,power,description,effect]) => ({
  id, name, element, target, effect, levels: spiritLevels(cost, rate, dur, power), description,
}));

/* ── 아이템 ── */
const items = [
  { id:'herbSmall', name:'약초', kind:'heal', price:60, weight:0.2, heal:60, description:'체력을 조금 회복한다.' },
  { id:'herbLarge', name:'상급 약초', kind:'heal', price:220, weight:0.3, heal:220, description:'체력을 크게 회복한다.' },
  { id:'antidote', name:'해독제', kind:'heal', price:90, weight:0.2, heal:0, description:'독을 해제한다.' },
  { id:'ropeCrude', name:'거친 밧줄', kind:'captureTool', price:120, weight:0.5, captureMultiplier:1.0, description:'기본 포획 도구.' },
  { id:'ropeFine', name:'질긴 밧줄', kind:'captureTool', price:400, weight:0.5, captureMultiplier:1.35, description:'포획률이 오른다.' },
  { id:'ropeMaster', name:'명인의 밧줄', kind:'captureTool', price:1500, weight:0.6, captureMultiplier:1.8, description:'포획률이 크게 오른다.' },
  { id:'evolveStone', name:'진화의 돌', kind:'evolution', price:5000, weight:1.0, description:'조건을 갖춘 펫을 진화시킨다. 성장률이 재추첨된다.' },
  { id:'catalyst', name:'촉진제', kind:'evolution', price:8000, weight:1.0, description:'이전 성장률을 일부 물려주며 진화시킨다.' },
  { id:'rerollDraught', name:'재추첨의 물약', kind:'evolution', price:3000, weight:0.4, description:'성장률을 다시 추첨한다. 상한은 오르지 않는다.' },
  { id:'meatChunk', name:'고기 덩이', kind:'food', price:80, weight:0.4, loyalty:8, description:'충성도를 회복한다.' },
  { id:'honeyJar', name:'꿀단지', kind:'food', price:260, weight:0.5, loyalty:22, description:'충성도를 크게 회복한다.' },
  { id:'clubStone', name:'돌몽둥이', kind:'equipment', price:300, weight:3.0, slot:'weapon', bonus:{atk:6}, description:'기본 무기.' },
  { id:'spearBone', name:'뼈창', kind:'equipment', price:900, weight:2.6, slot:'weapon', bonus:{atk:12,spd:2}, spiritId:'emberBrand', description:'불씨낙인이 깃든 창.' },
  { id:'hideArmor', name:'가죽 갑옷', kind:'equipment', price:350, weight:4.0, slot:'armor', bonus:{def:7,hp:20}, description:'기본 방어구.' },
  { id:'shellPlate', name:'등딱지 갑옷', kind:'equipment', price:1100, weight:6.0, slot:'armor', bonus:{def:15,hp:60,spd:-2}, spiritId:'stoneSkin', description:'석화피부가 깃든 갑옷.' },
  { id:'featherCharm', name:'깃털 부적', kind:'equipment', price:700, weight:0.3, slot:'accessory', bonus:{spd:6}, spiritId:'zephyrStep', description:'산들바람걸음이 깃든 부적.' },
  { id:'tideAmulet', name:'물결 목걸이', kind:'equipment', price:1200, weight:0.4, slot:'accessory', bonus:{hp:40,def:4}, spiritId:'healingSpring', description:'치유의샘이 깃든 목걸이.' },
];

const write = (name, data) => {
  fs.writeFileSync(`src/data/${name}.json`, JSON.stringify(data, null, 2) + '\n');
  console.log(`  src/data/${name}.json — ${Array.isArray(data) ? data.length : Object.keys(data).length}개`);
};

console.log('\n성장률 범위 검산');
console.log('\n생성');
write('pets', pets);
write('skills', skills);
write('spirits', spirits);
write('items', items);

// 참조 무결성: 스킬풀·진화 아이템이 실제로 존재하는지
const skillIds = new Set(skills.map(s => s.id));
const itemIds = new Set(items.map(i => i.id));
const petIds = new Set(pets.map(p => p.id));
const spiritIds = new Set(spirits.map(s => s.id));
let bad = 0;
for (const p of pets) {
  for (const s of p.skillPool) if (!skillIds.has(s)) { console.error(`  ✗ ${p.id}: 없는 스킬 ${s}`); bad++; }
  if (p.evolveTo) {
    if (!petIds.has(p.evolveTo.speciesId)) { console.error(`  ✗ ${p.id}: 없는 진화처 ${p.evolveTo.speciesId}`); bad++; }
    if (!itemIds.has(p.evolveTo.itemId)) { console.error(`  ✗ ${p.id}: 없는 진화 아이템 ${p.evolveTo.itemId}`); bad++; }
  }
}
for (const i of items) if (i.spiritId && !spiritIds.has(i.spiritId)) { console.error(`  ✗ ${i.id}: 없는 정령 ${i.spiritId}`); bad++; }
console.log(`\n참조 무결성: ${bad === 0 ? '이상 없음' : bad + '건 오류'}`);
if (bad) process.exit(1);
