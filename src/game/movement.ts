/**
 * 이동.
 *
 * 8방향 · 타일 스냅 · 충돌 판정. 전부 순수 함수라 테스트가 프레임 없이 돈다.
 *
 * "타일 스냅"은 한 번 움직이기 시작하면 반드시 다음 타일 중앙까지 간다는 뜻이다.
 * 그래야 인카운터를 "걸음 수"로 셀 수 있고, 걸음 수가 세지면 위험도 게이지를
 * 유저에게 정직하게 보여줄 수 있다. 자유 이동이면 그 계약이 성립하지 않는다.
 */

import fieldJson from '../data/field.json';
import { isBlocked } from './maps';
import type { TileMap } from './mapTypes';

export const DIRECTIONS = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface MovementConfig {
  tilesPerSecond: number;
}
export const DEFAULT_MOVEMENT: MovementConfig = fieldJson.movement;

export interface PlayerState {
  mapId: string;
  /** 지금 서 있는(또는 떠나온) 타일 */
  tile: { x: number; y: number };
  /** 이동 중이면 도착할 타일. 아니면 null. */
  target: { x: number; y: number } | null;
  /** 0~1. target으로 가는 진행도. 렌더러가 보간에 쓴다. */
  progress: number;
  facing: Direction;
  /** 누적 걸음 수. 인카운터 판정의 단위다. */
  steps: number;
}

/** 입력. -1/0/1 두 축. */
export interface MoveInput {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export function directionOf(dx: number, dy: number): Direction | null {
  if (dx === 0 && dy === 0) return null;
  if (dx === 0) return dy < 0 ? 'up' : 'down';
  if (dy === 0) return dx < 0 ? 'left' : 'right';
  if (dy < 0) return dx < 0 ? 'upLeft' : 'upRight';
  return dx < 0 ? 'downLeft' : 'downRight';
}

/**
 * 그 방향으로 갈 수 있는가.
 *
 * 대각선은 양옆 두 칸이 모두 뚫려 있어야 한다. 하나만 봐도 되게 하면 벽 모서리를
 * 대각으로 뚫고 지나가는 그림이 나온다 — 보는 사람이 바로 버그라고 느끼는 종류다.
 */
export function canStep(map: TileMap, from: { x: number; y: number }, dx: number, dy: number): boolean {
  const nx = from.x + dx;
  const ny = from.y + dy;
  if (isBlocked(map, nx, ny)) return false;
  if (dx !== 0 && dy !== 0) {
    if (isBlocked(map, from.x + dx, from.y)) return false;
    if (isBlocked(map, from.x, from.y + dy)) return false;
  }
  return true;
}

export interface StepResult {
  player: PlayerState;
  /** 이번 프레임에 새 타일에 도착했다 — 인카운터 판정은 이때만 돈다 */
  arrived: boolean;
  /** 가려고 했으나 막혔다 */
  blocked: boolean;
}

/**
 * 한 프레임 진행.
 *
 * 이동 중이면 입력을 무시하고 하던 걸음을 끝낸다. 도착한 프레임에 남은 시간을
 * 다음 걸음으로 넘기지 않는 이유는, 넘기면 한 프레임에 두 칸 이상 이동할 수 있고
 * 그러면 걸음 수와 인카운터 판정이 프레임률에 따라 달라지기 때문이다.
 */
export function stepMovement(
  map: TileMap,
  player: PlayerState,
  input: MoveInput,
  dt: number,
  cfg: MovementConfig = DEFAULT_MOVEMENT,
): StepResult {
  if (player.target) {
    const progress = player.progress + dt * cfg.tilesPerSecond;
    if (progress < 1) {
      return { player: { ...player, progress }, arrived: false, blocked: false };
    }
    return {
      player: { ...player, tile: player.target, target: null, progress: 0, steps: player.steps + 1 },
      arrived: true,
      blocked: false,
    };
  }

  const dir = directionOf(input.dx, input.dy);
  if (dir === null) return { player, arrived: false, blocked: false };

  // 막혀 있어도 바라보는 방향은 바뀐다. 벽을 보고 서는 게 자연스럽다.
  const facing = { ...player, facing: dir };
  if (!canStep(map, player.tile, input.dx, input.dy)) {
    return { player: facing, arrived: false, blocked: true };
  }

  return {
    player: { ...facing, target: { x: player.tile.x + input.dx, y: player.tile.y + input.dy }, progress: 0 },
    arrived: false,
    blocked: false,
  };
}

/** 렌더러가 쓰는 보간 위치(타일 단위). 이동 중이면 두 타일 사이에 있다. */
export function renderPosition(player: PlayerState): { x: number; y: number } {
  if (!player.target) return { x: player.tile.x, y: player.tile.y };
  const t = player.progress;
  return {
    x: player.tile.x + (player.target.x - player.tile.x) * t,
    y: player.tile.y + (player.target.y - player.tile.y) * t,
  };
}

export function createPlayer(mapId: string, x: number, y: number): PlayerState {
  return { mapId, tile: { x, y }, target: null, progress: 0, facing: 'down', steps: 0 };
}
