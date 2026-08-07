/**
 * 맵 포맷.
 *
 * 헌장이 요구한 레이어 구성을 그대로 따른다:
 * ground / object / collision / encounter-zone / warp.
 *
 * collision을 ground·object에서 매번 유도하지 않고 따로 굽는 이유는, 이동 판정이
 * 매 프레임 도는 코드이기 때문이다. 데이터를 만들 때 한 번 계산해두면 런타임에는
 * 배열 조회 한 번이면 된다. 대신 어긋날 수 있으므로 생성기가 항상 같이 굽는다.
 */

/** 바닥 타일. 렌더러가 이 값으로 텍스처를 고른다. */
export const GROUND = {
  grass: 0,
  path: 1,
  water: 2,
  sand: 3,
  stone: 4,
  marsh: 5,
  scorched: 6,
  caveFloor: 7,
} as const;
export type GroundTile = (typeof GROUND)[keyof typeof GROUND];

/** 바닥 위에 얹히는 것. 0은 아무것도 없음. */
export const OBJECT = {
  none: 0,
  tree: 1,
  bush: 2,
  rock: 3,
  wall: 4,
  door: 5,
  sign: 6,
  stalagmite: 7,
  lava: 8,
  crystal: 9,
} as const;
export type ObjectTile = (typeof OBJECT)[keyof typeof OBJECT];

/** 인카운터 존. 존 밖(zone 레이어 값 0)에서는 전투가 걸리지 않는다. */
export interface EncounterZone {
  id: string;
  name: string;
  /** 한 걸음당 위험도 상승분. 클수록 자주 걸린다. */
  encounterRate: number;
  levelRange: [number, number];
  /** 이 존에서 나오는 종. pets.json의 id다. */
  speciesIds: string[];
  /** 한 번에 나오는 마릿수 */
  partySize: [number, number];
}

export interface Warp {
  x: number;
  y: number;
  toMapId: string;
  toX: number;
  toY: number;
  label: string;
}

export interface TileMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  /** 전부 width*height 길이의 1차원 배열이다. 인덱스는 y * width + x. */
  layers: {
    ground: number[];
    object: number[];
    /** 1이면 못 지나간다 */
    collision: number[];
    /** zones 배열의 인덱스 + 1. 0은 존 없음. */
    encounter: number[];
  };
  zones: EncounterZone[];
  warps: Warp[];
  /** 다른 맵에서 들어오지 않고 이 맵에서 시작할 때의 위치 */
  spawn: { x: number; y: number };
  /** 실내·동굴이면 어둡게 그린다 */
  indoor: boolean;
}

export type MapIndex = Record<string, TileMap>;
