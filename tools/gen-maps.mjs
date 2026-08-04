/**
 * 맵 생성기.
 *
 * 레이아웃은 ASCII로 그린다. JSON 배열을 손으로 편집하는 것보다 읽고 고치기가
 * 비교할 수 없이 낫고, collision·encounter 레이어를 여기서 같이 구워내므로
 * 세 레이어가 어긋날 수 없다.
 *
 *   pnpm gen:maps
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(fileURLToPath(new URL('../src/data/maps.json', import.meta.url)));

const GROUND = { grass: 0, path: 1, water: 2, sand: 3, stone: 4, marsh: 5, scorched: 6, caveFloor: 7 };
const OBJ = { none: 0, tree: 1, bush: 2, rock: 3, wall: 4, door: 5, sign: 6, stalagmite: 7, lava: 8, crystal: 9 };

/**
 * 문자 → [바닥, 오브젝트, 통행불가]
 *
 * 통행 여부를 문자 정의에 붙여둔다. "물은 못 건넌다"가 렌더링 코드가 아니라
 * 맵 정의에 있어야 나중에 배를 추가할 때 한 곳만 고친다.
 */
const TILES = {
  '.': [GROUND.grass, OBJ.none, 0],
  ',': [GROUND.path, OBJ.none, 0],
  ':': [GROUND.sand, OBJ.none, 0],
  'm': [GROUND.marsh, OBJ.none, 0],
  's': [GROUND.scorched, OBJ.none, 0],
  'c': [GROUND.caveFloor, OBJ.none, 0],
  '_': [GROUND.stone, OBJ.none, 0],
  '~': [GROUND.water, OBJ.none, 1],
  'T': [GROUND.grass, OBJ.tree, 1],
  'b': [GROUND.grass, OBJ.bush, 0],
  'B': [GROUND.marsh, OBJ.bush, 0],
  '#': [GROUND.stone, OBJ.rock, 1],
  'R': [GROUND.scorched, OBJ.rock, 1],
  'W': [GROUND.stone, OBJ.wall, 1],
  'D': [GROUND.path, OBJ.door, 0],
  'S': [GROUND.path, OBJ.sign, 1],
  '^': [GROUND.caveFloor, OBJ.stalagmite, 1],
  'L': [GROUND.scorched, OBJ.lava, 1],
  'X': [GROUND.caveFloor, OBJ.crystal, 1],
};

function build({ id, name, indoor, rows, zones = [], zoneRects = [], warps = [], spawn }) {
  const height = rows.length;
  const width = rows[0].length;
  for (const [i, r] of rows.entries()) {
    if (r.length !== width) throw new Error(`${id}: ${i}행 길이가 ${r.length} (기대 ${width})`);
  }

  const ground = [];
  const object = [];
  const collision = [];
  for (const row of rows) {
    for (const ch of row) {
      const t = TILES[ch];
      if (!t) throw new Error(`${id}: 모르는 타일 문자 '${ch}'`);
      ground.push(t[0]);
      object.push(t[1]);
      collision.push(t[2]);
    }
  }

  // 인카운터 존은 사각형으로 칠한다. 두 곳은 비운다.
  //  - 통행 불가 타일: 지나갈 수 없는 곳의 존은 영원히 안 도는 죽은 데이터다
  //  - 워프 타일: 맵을 넘나드는 칸은 안전한 발판이어야 물러설 곳이 생긴다
  const encounter = new Array(width * height).fill(0);
  const warpTiles = new Set(warps.map((w) => w.y * width + w.x));
  for (const { zone, x, y, w, h } of zoneRects) {
    const zi = zones.findIndex((z) => z.id === zone);
    if (zi < 0) throw new Error(`${id}: 없는 존 ${zone}`);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) throw new Error(`${id}: 존 ${zone}이 맵 밖으로 나간다`);
        const i = yy * width + xx;
        if (collision[i] === 0 && !warpTiles.has(i)) encounter[i] = zi + 1;
      }
    }
  }

  return {
    id, name, width, height, tileSize: 32,
    layers: { ground, object, collision, encounter },
    zones, warps, spawn, indoor,
  };
}

/* ─────────────── 마을 — 인카운터 없음, 여기서 시작한다 ─────────────── */

const village = build({
  id: 'village', name: '돌바람 마을', indoor: false,
  spawn: { x: 12, y: 11 },
  rows: [
    'TTTTTTTTTTTTTTTTTTTTTTTT',
    'T......................T',
    'T..WWWW......WWWW......T',
    'T..WWWW......WWWW..b...T',
    'T..WWDW......WWDW......T',
    'T....,,,,,,,,,,........T',
    'T....,................bT',
    'T..b.,....S....b.......T',
    'T....,.................T',
    'T..WWDW......,,,,,,,,,,T',
    'T..WWWW......,.........T',
    'T..WWWW......,....b....T',
    'T............,.........T',
    'T...b........,.........T',
    'T~~~.........,......b..T',
    'T~~~~........,.........T',
    'TTTTTTTTTTTTT,TTTTTTTTTT',
  ],
  warps: [{ x: 13, y: 16, toMapId: 'meadow', toX: 15, toY: 1, label: '초원으로' }],
});

/* ─────────────── 필드 1 — 초원 ─────────────── */

const meadow = build({
  id: 'meadow', name: '바람풀 초원', indoor: false,
  spawn: { x: 15, y: 1 },
  rows: [
    'TTTTTTTTTTTTTTT,TTTTTTTTTTTTTT',
    'T..............,.............T',
    'T....bb........,......b......T',
    'T...bTTb.......,.....bb......T',
    'T....bb........,.............T',
    'T..............,........TT...T',
    'T,,,,,,,,,,,,,,,.......TTTT..T',
    'T,.............,........TT...T',
    'T,....b........,.............T',
    'T,.....~~~~....,......b......T',
    'T,....~~~~~~...,.............T',
    'T,....~~~~~~...,,,,,,,,,,,,,,T',
    'T,.....~~~~....,............,T',
    'T,....b........,......bb....,T',
    'T,.............,.....bTTb...,T',
    'T,....TT.......,......bb....,T',
    'T,...TTTT......,............,T',
    'T,....TT.......,............,T',
    'T,.............,............,T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTT,T',
  ],
  zones: [
    { id: 'meadowGrass', name: '풀숲', encounterRate: 0.055, levelRange: [3, 8], speciesIds: ['meadowhare', 'breezefinch', 'dustmole', 'dewtail'], partySize: [1, 2] },
    { id: 'meadowDeep', name: '깊은 풀숲', encounterRate: 0.085, levelRange: [6, 11], speciesIds: ['gustwolf', 'whirlstag', 'bouldershell', 'brookotter'], partySize: [1, 3] },
  ],
  zoneRects: [
    { zone: 'meadowGrass', x: 1, y: 1, w: 13, h: 18 },
    { zone: 'meadowDeep', x: 16, y: 1, w: 13, h: 18 },
  ],
  warps: [
    { x: 15, y: 0, toMapId: 'village', toX: 13, toY: 15, label: '마을로' },
    { x: 28, y: 19, toMapId: 'marsh', toX: 2, toY: 1, label: '늪지로' },
  ],
});

/* ─────────────── 필드 2 — 늪지 ─────────────── */

const marsh = build({
  id: 'marsh', name: '안개늪', indoor: false,
  spawn: { x: 2, y: 1 },
  rows: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'T,mmmmmmmmmmmmmmmmmmmmmmmmmmmT',
    'T,mmmmmmmmmmmmmmmmmmmmmmmmmmmT',
    'T,mmm~~mmmmmmmm~~~mmmmmmBmmmmT',
    'T,mm~~~~mmmmmm~~~~~mmmmmmmmmmT',
    'T,mmm~~mmmmmmmm~~~mmmmmmmmmmmT',
    'T,mmmmmmmmmmmmmmmmmmmmmmmmmmmT',
    'T,mmmmmmmmmmmmmmmmmmmmmmmmmmmT',
    'T,mmmmBmmmmmmmmmmmmmmBmmmmmmmT',
    'T,mmmmmmmmmmmmmmmmmmmmmmmmmmmT',
    'T,,,,,,,,,,,,,,,,,,,,,,,,,,mmT',
    'Tmmmmmmmmmm,mmmmmmmmmmmmmmmmmT',
    'Tmmmmmmmmmm,mmmmmmmmmmmmmmmmmT',
    'Tmmmm~~mmmm,mmmmmmmmm~~mmmmmmT',
    'Tmmm~~~~mmm,mmmmmmmm~~~~mmmmmT',
    'Tmmmm~~mmmm,mmmmmmmmm~~mmmmmmT',
    'Tmmmmmmmmmm,mmmmmmmmmmmmmmmmmT',
    'Tmmmmmmmmmm,mmmmmmmmmmmmmmmmmT',
    'TmmmmBmmmmm,mmmmBmmmmmmmmBmmmT',
    'TTTTTTTTTTT,TTTTTTTTTTTTTTTTTT',
  ],
  zones: [
    { id: 'marshShallow', name: '얕은 늪', encounterRate: 0.075, levelRange: [8, 13], speciesIds: ['brookotter', 'vinecarapace', 'ashnewt', 'frostscale'], partySize: [1, 3] },
    { id: 'marshDeep', name: '안개 짙은 늪', encounterRate: 0.105, levelRange: [11, 16], speciesIds: ['abyssray', 'cragox', 'magmasnail', 'currentwyrm'], partySize: [2, 3] },
  ],
  zoneRects: [
    { zone: 'marshShallow', x: 1, y: 1, w: 28, h: 9 },
    { zone: 'marshDeep', x: 1, y: 11, w: 28, h: 8 },
  ],
  warps: [
    { x: 1, y: 1, toMapId: 'meadow', toX: 28, toY: 18, label: '초원으로' },
    { x: 11, y: 19, toMapId: 'foothills', toX: 15, toY: 1, label: '화산 기슭으로' },
  ],
});

/* ─────────────── 필드 3 — 화산 기슭 ─────────────── */

const foothills = build({
  id: 'foothills', name: '잿빛 기슭', indoor: false,
  spawn: { x: 15, y: 1 },
  rows: [
    'RRRRRRRRRRRRRRR,RRRRRRRRRRRRRR',
    'Rssssssssssssss,sssssssssssssR',
    'Rssssssssssssss,sssssssssssssR',
    'RssLLssssssssss,ssssssssssLLsR',
    'RssLLssssssssss,ssssssssssLLsR',
    'Rssssssssssssss,sssssssssssssR',
    'Rssssssssssssss,sssssssssssssR',
    'R,,,,,,,,,,,,,,,,,,,,,,,,,,,,R',
    'R,sssssssssssssssssssssssssssR',
    'R,ssssRRsssssssssssssssRRssssR',
    'R,sssRRRRsssssssssssssRRRRsssR',
    'R,ssssRRsssssssLsssssssRRssssR',
    'R,sssssssssssssssssssssssssssR',
    'R,sssssssssssssssssssssssssssR',
    'R,sssssssssssssssssssssssssssR',
    'R,sssssssssssssssssssssssssssR',
    'R,sssssssssssssssssssssssssssR',
    'R,sssssLLsssssssssssLLsssssssR',
    'R,sssssssssssssssssssssssssssR',
    'RRRRRRRRRRRRRRRRRRR,RRRRRRRRRR',
  ],
  zones: [
    { id: 'ashSlope', name: '잿더미 비탈', encounterRate: 0.09, levelRange: [14, 19], speciesIds: ['blazeboar', 'magmasnail', 'cragox', 'gustwolf'], partySize: [2, 3] },
    { id: 'emberField', name: '불티 벌판', encounterRate: 0.12, levelRange: [18, 24], speciesIds: ['plumewing', 'granitewarden', 'stormfalcon', 'currentwyrm'], partySize: [2, 4] },
  ],
  zoneRects: [
    { zone: 'ashSlope', x: 1, y: 1, w: 28, h: 6 },
    { zone: 'emberField', x: 1, y: 8, w: 28, h: 11 },
  ],
  warps: [
    { x: 15, y: 0, toMapId: 'marsh', toX: 11, toY: 18, label: '늪지로' },
    { x: 19, y: 19, toMapId: 'cavern', toX: 14, toY: 1, label: '깊은 굴로' },
  ],
});

/* ─────────────── 던전 — 깊은 굴 ─────────────── */

const cavern = build({
  id: 'cavern', name: '메아리 굴', indoor: true,
  spawn: { x: 14, y: 1 },
  rows: [
    '##############,#############',
    '#_____________,____________#',
    '#_ccccccc_____,_____ccccccc#',
    '#_cc^^^cc_____,_____cc^^^cc#',
    '#_cc^X^cc_____,_____cc^X^cc#',
    '#_cc^^^cc_____,_____cc^^^cc#',
    '#_ccccccc_____,_____ccccccc#',
    '#_____________,____________#',
    '#,,,,,,,,,,,,,,,,,,,,,,,,,,#',
    '#,_________________________#',
    '#,___ccccccccccccccccc_____#',
    '#,___cc^^^^^^^^^^^^^cc_____#',
    '#,___cc^ccccccccccc^cc_____#',
    '#,___cc^cc_______cc^cc_____#',
    '#,___cc^cc___X___cc^cc_____#',
    '#,___cc^cc_______cc^cc_____#',
    '#,___cc^ccccccccccc^cc_____#',
    '#,___cc^^^^^^^^^^^^^cc_____#',
    '#,___ccccccccccccccccc_____#',
    '############################',
  ],
  zones: [
    { id: 'cavernOuter', name: '바깥 굴', encounterRate: 0.11, levelRange: [22, 28], speciesIds: ['granitewarden', 'currentwyrm', 'plumewing', 'stormfalcon'], partySize: [2, 4] },
    { id: 'cavernCore', name: '굴 안쪽', encounterRate: 0.16, levelRange: [28, 36], speciesIds: ['terrasovereign', 'abysslord', 'pyrarch', 'skysuzerain'], partySize: [1, 2] },
  ],
  zoneRects: [
    { zone: 'cavernOuter', x: 1, y: 1, w: 26, h: 8 },
    { zone: 'cavernCore', x: 1, y: 9, w: 26, h: 10 },
  ],
  warps: [{ x: 14, y: 0, toMapId: 'foothills', toX: 19, toY: 18, label: '기슭으로' }],
});

/* ─────────────── 굽기 ─────────────── */

const maps = [village, meadow, marsh, foothills, cavern];

// 워프는 양쪽이 맞물려야 한다. 한쪽만 있으면 들어갔다가 못 나온다.
const byId = new Map(maps.map((m) => [m.id, m]));
let bad = 0;
for (const m of maps) {
  for (const w of m.warps) {
    const dest = byId.get(w.toMapId);
    if (!dest) {
      console.error(`  ✗ ${m.id}: 없는 맵으로 워프 ${w.toMapId}`);
      bad++;
      continue;
    }
    if (w.toX < 0 || w.toY < 0 || w.toX >= dest.width || w.toY >= dest.height) {
      console.error(`  ✗ ${m.id} → ${w.toMapId}: 도착점 (${w.toX},${w.toY})이 맵 밖이다`);
      bad++;
    } else if (dest.layers.collision[w.toY * dest.width + w.toX] === 1) {
      console.error(`  ✗ ${m.id} → ${w.toMapId}: 도착점 (${w.toX},${w.toY})이 벽이다`);
      bad++;
    }
    const back = dest.warps.some((b) => b.toMapId === m.id);
    if (!back) {
      console.error(`  ✗ ${m.id} → ${w.toMapId}: 돌아오는 워프가 없다`);
      bad++;
    }
  }
  if (m.layers.collision[m.spawn.y * m.width + m.spawn.x] === 1) {
    console.error(`  ✗ ${m.id}: 시작 지점이 벽이다`);
    bad++;
  }
}

const index = Object.fromEntries(maps.map((m) => [m.id, m]));
fs.writeFileSync(OUT, JSON.stringify(index, null, 1) + '\n');

console.log('\n맵 생성');
for (const m of maps) {
  const walkable = m.layers.collision.filter((c) => c === 0).length;
  const zoned = m.layers.encounter.filter((z) => z > 0).length;
  console.log(
    `  ${m.id.padEnd(10)} ${m.name.padEnd(9)} ${m.width}x${m.height}` +
      `  통행 ${String(walkable).padStart(4)}칸  인카운터 ${String(zoned).padStart(4)}칸` +
      `  존 ${m.zones.length}  워프 ${m.warps.length}`,
  );
}
console.log(bad === 0 ? '\n연결 검사: 이상 없음\n' : `\n연결 검사: ${bad}건 실패\n`);
if (bad > 0) process.exit(1);
