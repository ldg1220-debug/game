/**
 * 필드 렌더러.
 *
 * **읽기 전용이다.** 이 파일의 어떤 함수도 게임 상태를 바꾸지 않는다. 렌더러가
 * 상태를 만지기 시작하면 "화면에 보이는 것"과 "실제 상태"가 갈라지고, 그 순간
 * 밸런스도 리플레이도 검증할 수 없게 된다.
 *
 * 인자는 전부 readonly로 받는다. 규칙을 문서가 아니라 타입으로 붙들어 둔다.
 */

import { renderPosition, type PlayerState } from '../game/movement';
import type { TileMap } from '../game/mapTypes';
import { OBJECT } from '../game/mapTypes';
import type { Tileset } from './tileset';

export interface Camera {
  /** 화면 좌상단이 가리키는 타일 좌표(실수) */
  x: number;
  y: number;
}

/** 플레이어를 화면 중앙에 두되, 맵 밖이 보이지 않게 가둔다. */
export function focusCamera(map: TileMap, player: Readonly<PlayerState>, viewW: number, viewH: number): Camera {
  const p = renderPosition(player);
  const tilesW = viewW / map.tileSize;
  const tilesH = viewH / map.tileSize;
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  return {
    // 맵이 화면보다 작으면 가운데 정렬한다(음수 하한이 상한보다 커지는 경우)
    x: tilesW >= map.width ? (map.width - tilesW) / 2 : clamp(p.x + 0.5 - tilesW / 2, 0, map.width - tilesW),
    y: tilesH >= map.height ? (map.height - tilesH) / 2 : clamp(p.y + 0.5 - tilesH / 2, 0, map.height - tilesH),
  };
}

const FACING_OFFSET: Record<string, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  upLeft: [-0.7, -0.7], upRight: [0.7, -0.7], downLeft: [-0.7, 0.7], downRight: [0.7, 0.7],
};

/**
 * NPC.
 *
 * 표식이 없으면 어디에 누가 있는지 알 방법이 걸어서 밟아보는 것뿐이다.
 * 실제로 그렇게 만들어 봤고, 마을을 두 바퀴 돌게 된다.
 */
function drawNpc(g: CanvasRenderingContext2D, n: NpcMarker, px: number, py: number, s: number): void {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(px + s / 2, py + s - 4, s * 0.26, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();

  // 로브 — 플레이어와 실루엣을 갈라 놓는다
  g.fillStyle = '#4a4a68';
  g.beginPath();
  g.moveTo(px + s * 0.5, py + s * 0.34);
  g.lineTo(px + s * 0.76, py + s * 0.88);
  g.lineTo(px + s * 0.24, py + s * 0.88);
  g.closePath();
  g.fill();

  g.fillStyle = '#e8bd94';
  g.beginPath();
  g.arc(px + s / 2, py + s * 0.3, s * 0.15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8d8e4';
  g.beginPath();
  g.arc(px + s / 2, py + s * 0.26, s * 0.16, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = '#231a12';
  for (const side of [-1, 1]) g.fillRect(px + s / 2 + side * s * 0.06 - 1, py + s * 0.31, 2, 2);

  if (n.mark) {
    const bob = Math.sin(performance.now() / 260) * 2;
    const cx = px + s / 2;
    const cy = py - 7 + bob;
    // 받침을 깔지 않으면 표식이 뒤 타일에 묻힌다. 촌장이 마침 표지판 아래에
    // 서 있었고, 느낌표가 표지판 무늬와 섞여 안 보였다.
    g.fillStyle = 'rgba(12,12,20,0.82)';
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = n.mark === 'available' ? '#e0b552' : '#6bbf6b';
    g.lineWidth = 1.5;
    g.stroke();

    g.font = 'bold 14px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = n.mark === 'available' ? '#e0b552' : '#6bbf6b';
    g.fillText(n.mark === 'available' ? '!' : '?', cx, cy + 1);
    g.textBaseline = 'alphabetic';
  }

  g.font = '10px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(px + s / 2 - 20, py + s - 1, 40, 12);
  g.fillStyle = '#e6e4dd';
  g.fillText(n.name, px + s / 2, py + s + 8);
}

function drawPlayer(g: CanvasRenderingContext2D, px: number, py: number, size: number, facing: string, walking: boolean): void {
  const s = size;
  const bob = walking ? Math.sin(performance.now() / 90) * 1.2 : 0;

  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(px + s / 2, py + s - 4, s * 0.26, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();

  // 몸
  g.fillStyle = '#8c5a3c';
  g.fillRect(px + s * 0.3, py + s * 0.42 + bob, s * 0.4, s * 0.4);
  g.fillStyle = '#a86b47';
  g.fillRect(px + s * 0.3, py + s * 0.42 + bob, s * 0.4, s * 0.12);

  // 머리
  g.fillStyle = '#e8bd94';
  g.beginPath();
  g.arc(px + s / 2, py + s * 0.32 + bob, s * 0.17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a2a1c';
  g.beginPath();
  g.arc(px + s / 2, py + s * 0.27 + bob, s * 0.17, Math.PI, Math.PI * 2);
  g.fill();

  // 바라보는 방향 — 눈을 그 쪽으로 민다
  const [ox, oy] = FACING_OFFSET[facing] ?? [0, 1];
  g.fillStyle = '#231a12';
  for (const side of [-1, 1]) {
    g.fillRect(px + s / 2 + side * s * 0.07 + ox * s * 0.05 - 1, py + s * 0.33 + oy * s * 0.03 + bob, 2, 2);
  }
}

/** 맵 위에 서 있는 사람. 렌더러는 이름과 표식만 알면 된다. */
export interface NpcMarker {
  x: number;
  y: number;
  name: string;
  /** 느낌표(받을 수 있음) / 물음표(보고 가능) / 없음 */
  mark: 'available' | 'ready' | null;
}

export interface DrawOptions {
  /** 위험도 0~1. 화면 가장자리 붉은 기운으로 보여준다. */
  danger: number;
  dangerVisible: boolean;
  npcs?: readonly NpcMarker[];
}

/**
 * 한 프레임 그린다.
 *
 * 보이는 타일만 순회한다. 전체를 매번 도는 코드로 시작하면 맵이 커질 때
 * 조용히 느려지고, 그때는 원인을 찾기 어렵다.
 */
export function drawField(
  g: CanvasRenderingContext2D,
  map: TileMap,
  player: Readonly<PlayerState>,
  tileset: Tileset,
  opts: DrawOptions,
): void {
  const { width: viewW, height: viewH } = g.canvas;
  const ts = map.tileSize;
  const cam = focusCamera(map, player, viewW, viewH);

  g.imageSmoothingEnabled = false;
  g.fillStyle = map.indoor ? '#14121a' : '#1b2a1f';
  g.fillRect(0, 0, viewW, viewH);

  const x0 = Math.floor(cam.x);
  const y0 = Math.floor(cam.y);
  const x1 = Math.min(map.width - 1, Math.ceil(cam.x + viewW / ts));
  const y1 = Math.min(map.height - 1, Math.ceil(cam.y + viewH / ts));

  const screenX = (tx: number) => Math.round((tx - cam.x) * ts);
  const screenY = (ty: number) => Math.round((ty - cam.y) * ts);

  for (let y = Math.max(0, y0); y <= y1; y++) {
    for (let x = Math.max(0, x0); x <= x1; x++) {
      const i = y * map.width + x;
      const tile = tileset.ground.get(map.layers.ground[i]!);
      if (tile) g.drawImage(tile, screenX(x), screenY(y));
    }
  }

  // 인카운터 존을 아주 옅게 덧칠한다. 어디서 전투가 걸리는지 눈에 보여야
  // "지금 풀숲으로 들어갈까"가 선택이 된다.
  for (let y = Math.max(0, y0); y <= y1; y++) {
    for (let x = Math.max(0, x0); x <= x1; x++) {
      const z = map.layers.encounter[y * map.width + x]!;
      if (z === 0) continue;
      g.fillStyle = z === 1 ? 'rgba(255,214,120,0.07)' : 'rgba(255,120,90,0.09)';
      g.fillRect(screenX(x), screenY(y), ts, ts);
    }
  }

  // 워프 표시
  for (const w of map.warps) {
    if (w.x < x0 - 1 || w.x > x1 + 1 || w.y < y0 - 1 || w.y > y1 + 1) continue;
    const sx = screenX(w.x);
    const sy = screenY(w.y);
    const pulse = 0.35 + Math.sin(performance.now() / 320) * 0.15;
    g.fillStyle = `rgba(255,236,170,${pulse})`;
    g.fillRect(sx + 2, sy + 2, ts - 4, ts - 4);
    g.strokeStyle = 'rgba(255,236,170,0.8)';
    g.lineWidth = 2;
    g.strokeRect(sx + 2, sy + 2, ts - 4, ts - 4);
  }

  // 오브젝트와 플레이어를 y 순으로 섞어 그린다 — 나무 뒤로 걸어가면 가려져야 한다
  const p = renderPosition(player);
  const playerRow = Math.round(p.y);
  const drawPlayerAt = () => drawPlayer(g, screenX(p.x), screenY(p.y), ts, player.facing, player.target !== null);
  let playerDrawn = false;

  const npcs = opts.npcs ?? [];
  for (let y = Math.max(0, y0); y <= y1; y++) {
    if (!playerDrawn && playerRow < y) {
      drawPlayerAt();
      playerDrawn = true;
    }
    for (let x = Math.max(0, x0); x <= x1; x++) {
      const kind = map.layers.object[y * map.width + x]!;
      if (kind === OBJECT.none) continue;
      const tile = tileset.object.get(kind);
      if (tile) g.drawImage(tile, screenX(x), screenY(y));
    }
    for (const n of npcs) {
      if (n.y === y) drawNpc(g, n, screenX(n.x), screenY(n.y), ts);
    }
  }
  if (!playerDrawn) drawPlayerAt();

  if (map.indoor) {
    // 동굴은 시야를 좁힌다. 던전이 필드와 다르게 느껴져야 한다.
    const cx = screenX(p.x) + ts / 2;
    const cy = screenY(p.y) + ts / 2;
    const grad = g.createRadialGradient(cx, cy, ts * 2.2, cx, cy, ts * 7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.82)');
    g.fillStyle = grad;
    g.fillRect(0, 0, viewW, viewH);
  }

  if (opts.dangerVisible && opts.danger > 0.05) {
    // 위험도를 화면 가장자리로도 알린다. 게이지를 안 보고 있어도 느껴져야 한다.
    const a = Math.min(0.45, opts.danger * 0.45);
    const grad = g.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.32, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(150,20,20,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, viewW, viewH);
  }
}
