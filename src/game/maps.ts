/**
 * 맵 조회 헬퍼.
 *
 * 전부 순수 함수다. 좌표가 맵 밖이면 통행 불가로 답한다 — 호출하는 쪽마다
 * 경계 검사를 반복하면 언젠가 한 곳을 빠뜨린다.
 */

import mapsJson from '../data/maps.json';
import type { EncounterZone, MapIndex, TileMap, Warp } from './mapTypes';

export const MAPS = mapsJson as unknown as MapIndex;

export function getMap(id: string): TileMap {
  const m = MAPS[id];
  if (!m) throw new RangeError(`없는 맵: ${id}`);
  return m;
}

export function inBounds(map: TileMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileIndex(map: TileMap, x: number, y: number): number {
  return y * map.width + x;
}

/** 맵 밖은 벽으로 친다. */
export function isBlocked(map: TileMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  return map.layers.collision[tileIndex(map, x, y)] === 1;
}

export function groundAt(map: TileMap, x: number, y: number): number {
  return inBounds(map, x, y) ? map.layers.ground[tileIndex(map, x, y)]! : 0;
}

export function objectAt(map: TileMap, x: number, y: number): number {
  return inBounds(map, x, y) ? map.layers.object[tileIndex(map, x, y)]! : 0;
}

/** 이 칸의 인카운터 존. 없으면 undefined. */
export function zoneAt(map: TileMap, x: number, y: number): EncounterZone | undefined {
  if (!inBounds(map, x, y)) return undefined;
  const z = map.layers.encounter[tileIndex(map, x, y)]!;
  return z > 0 ? map.zones[z - 1] : undefined;
}

export function warpAt(map: TileMap, x: number, y: number): Warp | undefined {
  return map.warps.find((w) => w.x === x && w.y === y);
}
