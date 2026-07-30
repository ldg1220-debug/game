/**
 * 타일 기반 필드 맵 (완성도 가이드 1.2~1.5절).
 *
 * 맵은 파일로 저장하지 않고 지역 시드에서 결정적으로 생성한다. 같은 시드는
 * 항상 같은 지형을 만들므로 세이브에는 좌표와 획득한 보물 id만 넣으면 되고,
 * 지역을 추가할 때 수작업 타일맵을 그릴 필요가 없다.
 */

export const TILE_SIZE = 32;

export type TileKind = 'grass' | 'tall-grass' | 'tree' | 'rock' | 'water' | 'path' | 'sand' | 'ice' | 'lava';

export interface TileInfo {
  walkable: boolean;
  /** 야생 조우가 발생하는 타일 */
  encounter: boolean;
  color: string;
  detail?: string;
}

export const TILES: Record<TileKind, TileInfo> = {
  grass: { walkable: true, encounter: false, color: '#3f6b3a', detail: '#4a7d44' },
  'tall-grass': { walkable: true, encounter: true, color: '#2f5c2c', detail: '#66BB6A' },
  tree: { walkable: false, encounter: false, color: '#1e3d1c', detail: '#2E7D32' },
  rock: { walkable: false, encounter: false, color: '#4a4a55', detail: '#6b6b78' },
  water: { walkable: false, encounter: false, color: '#1d4f7a', detail: '#0099FF' },
  path: { walkable: true, encounter: false, color: '#6b5a42', detail: '#7d6a4e' },
  sand: { walkable: true, encounter: true, color: '#7a6444', detail: '#9c8055' },
  ice: { walkable: true, encounter: true, color: '#4a7691', detail: '#9fd4ea' },
  lava: { walkable: false, encounter: false, color: '#8a2f14', detail: '#FF6B35' },
};

export interface MapObject {
  id: string;
  kind: 'treasure' | 'npc' | 'dungeon' | 'town';
  x: number;
  y: number;
  label: string;
  /** NPC 대사 또는 보물 내용 */
  message?: string;
}

export interface RegionMap {
  regionId: string;
  /** 타일 단위 크기 */
  cols: number;
  rows: number;
  seed: number;
  /** 이 지역 지형에 쓰이는 타일 구성 */
  terrain: { base: TileKind; encounterTile: TileKind; blockers: TileKind[] };
  treasureCount: number;
  npcCount: number;
  dungeonCount: number;
  spawn: { x: number; y: number };
}

/** 가이드 1.2절의 지역별 크기 스펙을 타일 수로 환산했다 (32px 기준) */
export const REGION_MAPS: Record<string, RegionMap> = {
  plains: {
    regionId: 'plains',
    cols: 25, // 800px
    rows: 19, // 608px
    seed: 1337,
    terrain: { base: 'grass', encounterTile: 'tall-grass', blockers: ['tree', 'rock'] },
    treasureCount: 5,
    npcCount: 2,
    dungeonCount: 2,
    spawn: { x: 12, y: 15 },
  },
  forest: {
    regionId: 'forest',
    cols: 31, // 992px
    rows: 25, // 800px
    seed: 2718,
    terrain: { base: 'grass', encounterTile: 'tall-grass', blockers: ['tree', 'tree', 'rock'] },
    treasureCount: 8,
    npcCount: 3,
    dungeonCount: 3,
    spawn: { x: 15, y: 21 },
  },
  mountain: {
    regionId: 'mountain',
    cols: 37, // 1184px
    rows: 28, // 896px
    seed: 3141,
    terrain: { base: 'path', encounterTile: 'sand', blockers: ['rock', 'rock', 'tree'] },
    treasureCount: 10,
    npcCount: 3,
    dungeonCount: 3,
    spawn: { x: 18, y: 24 },
  },
  volcano: {
    regionId: 'volcano',
    cols: 31,
    rows: 25,
    seed: 1618,
    terrain: { base: 'sand', encounterTile: 'sand', blockers: ['lava', 'rock'] },
    treasureCount: 12,
    npcCount: 2,
    dungeonCount: 4,
    spawn: { x: 15, y: 21 },
  },
  glacier: {
    regionId: 'glacier',
    cols: 37, // 1184px
    rows: 31, // 992px
    seed: 2236,
    terrain: { base: 'ice', encounterTile: 'ice', blockers: ['rock', 'water'] },
    treasureCount: 15,
    npcCount: 3,
    dungeonCount: 5,
    spawn: { x: 18, y: 27 },
  },
};

export function getRegionMap(regionId: string): RegionMap {
  return REGION_MAPS[regionId] ?? REGION_MAPS.plains;
}

/** 결정적 난수. 같은 시드·좌표는 항상 같은 값을 낸다. */
function hash(seed: number, x: number, y: number): number {
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** 부드러운 노이즈. 지형 덩어리를 만들기 위해 이웃 값을 섞는다. */
function smoothNoise(seed: number, x: number, y: number, scale: number): number {
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  const fx = (x / scale) % 1;
  const fy = (y / scale) % 1;
  const a = hash(seed, gx, gy);
  const b = hash(seed, gx + 1, gy);
  const c = hash(seed, gx, gy + 1);
  const d = hash(seed, gx + 1, gy + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

export interface GeneratedMap {
  tiles: TileKind[][];
  objects: MapObject[];
  map: RegionMap;
}

const NPC_LINES = [
  '높은 성장률의 펫은 같은 종이라도 능력치가 확 달라진다네.',
  '원소 배분이 한쪽으로 몰린 개체가 그 속성 기술을 더 세게 쓴다지.',
  '수풀에서만 야생 펫이 나온다네. 길 위는 안전해.',
  '상대를 재우거나 얼리면 포획이 훨씬 쉬워져.',
  '던전 깊은 곳의 보스를 이기면 다음 지역으로 갈 수 있다더군.',
  '진화해도 성장률은 그대로야. 좋은 개체를 키우는 게 답이지.',
];

const TREASURE_LOOT = [
  { message: '골드 200을 발견했다!', gold: 200 },
  { message: '좋은 포켓볼 2개를 발견했다!', pokeball: 'good' as const, qty: 2 },
  { message: '슈퍼 포켓볼 1개를 발견했다!', pokeball: 'super' as const, qty: 1 },
  { message: '회복 포션 2개를 발견했다!', potion: 2 },
  { message: '진화석 1개를 발견했다!', stone: 1 },
  { message: '골드 500을 발견했다!', gold: 500 },
];

export function treasureLoot(index: number) {
  return TREASURE_LOOT[index % TREASURE_LOOT.length];
}

/**
 * 지역 맵을 생성한다. 결정적이므로 같은 지역은 항상 같은 지형이 나온다.
 * 시작 지점 주변은 반드시 걸을 수 있게 비워 스폰 갇힘을 막는다.
 */
export function generateMap(regionId: string): GeneratedMap {
  const map = getRegionMap(regionId);
  const { cols, rows, seed, terrain } = map;
  const tiles: TileKind[][] = [];

  for (let y = 0; y < rows; y++) {
    const row: TileKind[] = [];
    for (let x = 0; x < cols; x++) {
      // 테두리는 막는다
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
        // 같은 블로커만 두면 경계가 똑같은 나무 줄로 보인다. 위치별로 섞는다.
        const pick = Math.floor(hash(seed + 7, x, y) * terrain.blockers.length);
        row.push(terrain.blockers[pick % terrain.blockers.length]);
        continue;
      }
      /*
       * 단일 옥타브 노이즈는 같은 값이 가로로 길게 이어져 바위가 띠처럼 늘어섰다.
       * 스케일이 다른 두 옥타브를 섞고 x/y 스케일을 다르게 줘 방향성을 깬다.
       */
      const n =
        smoothNoise(seed, x, y * 1.7, 5.5) * 0.6 +
        smoothNoise(seed + 411, x * 1.6, y, 2.7) * 0.4;
      const n2 = smoothNoise(seed + 99, x, y, 2.5);

      // 밀도: 벌판이 비어 보이지 않도록 블로커와 수풀 비중을 올린다
      if (n > 0.6) {
        row.push(terrain.blockers[Math.floor(n2 * terrain.blockers.length) % terrain.blockers.length]);
      } else if (n < 0.46) {
        row.push(terrain.encounterTile);
      } else {
        row.push(terrain.base);
      }
    }
    tiles.push(row);
  }

  // 스폰 주변 3×3은 안전한 길로 비운다
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = map.spawn.x + dx;
      const y = map.spawn.y + dy;
      if (tiles[y]?.[x]) tiles[y][x] = 'path';
    }
  }

  /*
   * 간선 도로를 깐다.
   *
   * 노이즈만으로 지형을 만들면 스폰이 벽으로 둘러싸인 주머니에 갇히는 맵이 나온다
   * (실제로 초원 스폰에서 두 칸밖에 못 움직이는 맵이 생성됐다). 스폰을 지나는
   * 십자로와 1/4·3/4 지점의 도로를 깔아 큰 줄기를 항상 연결해 두고, 남는 고립
   * 지역은 아래 도달 가능성 검사에서 정리한다. 가이드 1.4의 "권장 경로 제시"에도 맞다.
   */
  const carveRow = (y: number) => {
    if (y <= 0 || y >= rows - 1) return;
    for (let x = 1; x < cols - 1; x++) tiles[y][x] = terrain.base;
  };
  const carveCol = (x: number) => {
    if (x <= 0 || x >= cols - 1) return;
    for (let y = 1; y < rows - 1; y++) tiles[y][x] = terrain.base;
  };
  carveRow(map.spawn.y);
  carveCol(map.spawn.x);
  carveRow(Math.floor(rows / 4));
  carveRow(Math.floor((rows * 3) / 4));
  carveCol(Math.floor(cols / 4));
  carveCol(Math.floor((cols * 3) / 4));

  // 스폰에서 실제로 갈 수 있는 칸을 구한다
  const reachable = new Set<number>();
  const key = (x: number, y: number) => y * cols + x;
  const queue: { x: number; y: number }[] = [map.spawn];
  reachable.add(key(map.spawn.x, map.spawn.y));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (reachable.has(key(nx, ny))) continue;
      if (!TILES[tiles[ny][nx]].walkable) continue;
      reachable.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }

  // 갈 수 없는데 걸을 수 있어 보이는 칸은 지형지물로 막아 오해를 없앤다
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (TILES[tiles[y][x]].walkable && !reachable.has(key(x, y))) {
        tiles[y][x] = terrain.blockers[0];
      }
    }
  }

  // 배치 가능한 칸 목록 (도달 가능하고 스폰과 겹치지 않는 곳)
  const free: { x: number; y: number }[] = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (!reachable.has(key(x, y))) continue;
      if (Math.abs(x - map.spawn.x) < 2 && Math.abs(y - map.spawn.y) < 2) continue;
      free.push({ x, y });
    }
  }
  // 결정적으로 섞는다
  free.sort((a, b) => hash(seed + 7, a.x, a.y) - hash(seed + 7, b.x, b.y));

  const objects: MapObject[] = [];
  let cursor = 0;
  const take = () => free[cursor++ % Math.max(1, free.length)];

  // 마을 입구는 스폰 근처에 둔다
  objects.push({
    id: `${regionId}-town`,
    kind: 'town',
    x: map.spawn.x,
    y: map.spawn.y + 1 < rows - 1 ? map.spawn.y + 1 : map.spawn.y - 1,
    label: '마을',
  });

  for (let i = 0; i < map.dungeonCount; i++) {
    const p = take();
    objects.push({ id: `${regionId}-dungeon-${i}`, kind: 'dungeon', x: p.x, y: p.y, label: `던전 ${i + 1}` });
  }
  for (let i = 0; i < map.npcCount; i++) {
    const p = take();
    objects.push({
      id: `${regionId}-npc-${i}`,
      kind: 'npc',
      x: p.x,
      y: p.y,
      label: '주민',
      message: NPC_LINES[(i + seed) % NPC_LINES.length],
    });
  }
  for (let i = 0; i < map.treasureCount; i++) {
    const p = take();
    objects.push({
      id: `${regionId}-treasure-${i}`,
      kind: 'treasure',
      x: p.x,
      y: p.y,
      label: '보물상자',
      message: treasureLoot(i + seed).message,
    });
  }

  return { tiles, objects, map };
}

export function tileAt(tiles: TileKind[][], x: number, y: number): TileKind | null {
  return tiles[y]?.[x] ?? null;
}

export function isWalkable(tiles: TileKind[][], x: number, y: number): boolean {
  const t = tileAt(tiles, x, y);
  return t !== null && TILES[t].walkable;
}
