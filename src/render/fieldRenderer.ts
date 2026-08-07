/**
 * 필드 렌더러.
 *
 * **읽기 전용이다.** 이 파일의 어떤 함수도 게임 상태를 바꾸지 않는다. 렌더러가
 * 상태를 만지기 시작하면 "화면에 보이는 것"과 "실제 상태"가 갈라지고, 그 순간
 * 밸런스도 리플레이도 검증할 수 없게 된다.
 *
 * 인자는 전부 readonly로 받는다. 규칙을 문서가 아니라 타입으로 붙들어 둔다.
 *
 * 그리는 순서가 곧 깊이다. 아이소메트릭에서는 (x+y)가 큰 쪽이 카메라에 가까우므로
 * 그 순서로 그린다. 탑다운 시절의 "y로 정렬"을 그대로 옮기면 나무 뒤로 걸어가도
 * 가려지지 않는다 — 실제로 그렇게 짜봤고, 대각선으로 걸을 때 바로 티가 난다.
 */

import { renderPosition, type PlayerState } from '../game/movement';
import type { TileMap } from '../game/mapTypes';
import { GROUND, OBJECT } from '../game/mapTypes';
import {
  ART_SCALE,
  focusCamera,
  isoX,
  isoY,
  screenDir,
  visibleTiles,
  diamondPath,
  TILE_H,
  TILE_W,
  type Camera,
} from './iso';
import { drawHuman } from './sprites';
import { humanPalette, PLAYER_PALETTE } from './palette';
import { EDGE_NEIGHBOR, OBJ_ANCHOR_X, OBJ_ANCHOR_Y, variantAt, waterFrame, type Edge, type Tileset } from './tileset';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
const EDGES: Edge[] = ['tr', 'br', 'bl', 'tl'];

export type { Camera };

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

/** 플레이어를 화면 중앙에 두되, 맵 밖이 보이지 않게 가둔다. */
export function focusOn(map: TileMap, player: Readonly<PlayerState>, viewW: number, viewH: number): Camera {
  const p = renderPosition(player);
  return focusCamera(map.width, map.height, p.x, p.y, viewW, viewH);
}

/**
 * 표식.
 *
 * 표식이 없으면 어디에 누가 있는지 알 방법이 걸어서 밟아보는 것뿐이다. 실제로
 * 그렇게 만들어 봤고, 마을을 두 바퀴 돌게 된다.
 */
function drawMark(g: CanvasRenderingContext2D, x: number, y: number, mark: 'available' | 'ready', t: number): void {
  const bob = Math.sin(t / 260) * 2;
  const cy = y + bob;
  const col = mark === 'available' ? '#e0b552' : '#6bbf6b';

  // 받침을 깔지 않으면 표식이 뒤 타일에 묻힌다. 촌장이 마침 표지판 아래에 서
  // 있었고, 느낌표가 표지판 무늬와 섞여 안 보였다.
  g.fillStyle = 'rgba(12,12,20,0.82)';
  g.beginPath();
  g.arc(x, cy, 9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = col;
  g.lineWidth = 1.5;
  g.stroke();

  g.font = 'bold 14px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(mark === 'available' ? '!' : '?', x, cy + 1);
  g.textBaseline = 'alphabetic';
}

function nameTag(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  g.font = '10px system-ui, sans-serif';
  g.textAlign = 'center';
  const w = g.measureText(text).width + 8;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.roundRect(x - w / 2, y - 9, w, 13, 3);
  g.fill();
  g.fillStyle = '#e6e4dd';
  g.fillText(text, x, y + 1);
}

/**
 * 한 프레임 그린다.
 *
 * 보이는 타일만 순회한다. 전체를 매번 도는 코드로 시작하면 맵이 커질 때 조용히
 * 느려지고, 그때는 원인을 찾기 어렵다.
 */
export function drawField(
  g: CanvasRenderingContext2D,
  map: TileMap,
  player: Readonly<PlayerState>,
  tileset: Tileset,
  opts: DrawOptions,
): void {
  const { width: viewW, height: viewH } = g.canvas;
  const t = performance.now();
  const cam = focusOn(map, player, viewW, viewH);

  // 화면 좌표로 옮기는 두 함수. 여기 말고는 아무도 투영을 몰라도 된다.
  const sx = (tx: number, ty: number) => isoX(tx, ty) - cam.x + viewW / 2;
  const sy = (tx: number, ty: number) => isoY(tx, ty) - cam.y + viewH / 2;

  g.imageSmoothingEnabled = false;
  g.fillStyle = map.indoor ? '#0b0910' : '#141d20';
  g.fillRect(0, 0, viewW, viewH);

  const { x0, x1, y0, y1 } = visibleTiles(cam, viewW, viewH, map.width, map.height);
  const at = (x: number, y: number) => y * map.width + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;

  /* ── 바닥 ── */
  const wf = waterFrame(t);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const kind = map.layers.ground[at(x, y)]!;
      const variants = tileset.ground.get(kind);
      if (!variants) continue;
      const cx = sx(x, y);
      const cy = sy(x, y);
      // 물만 시간으로 넘긴다. 땅이 시간에 따라 바뀌면 가만히 서 있어도 지글거린다.
      const v = kind === GROUND.water ? wf : variantAt(x, y);
      g.drawImage(variants[v % variants.length]!, cx - HW, cy - HH);

      // 이웃이 다른 종류면 그쪽 색을 이 변에 흐리게 깐다
      for (const e of EDGES) {
        const [dx, dy] = EDGE_NEIGHBOR[e];
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny)) continue;
        const nk = map.layers.ground[at(nx, ny)]!;
        if (nk === kind) continue;
        const blend = tileset.blend.get(nk);
        if (blend) g.drawImage(blend[e], cx - HW, cy - HH);
      }
    }
  }

  /* ── 맵 가장자리 ── */
  // 지형을 허공에 뜬 섬처럼 마감한다. 아무것도 안 그리면 배경색과 맞닿아 지형이
  // 그냥 잘려 보인다.
  g.fillStyle = map.indoor ? '#080610' : '#0d1416';
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const front = !inside(x + 1, y);
      const side = !inside(x, y + 1);
      if (!front && !side) continue;
      const cx = sx(x, y);
      const cy = sy(x, y);
      const d = 14;
      if (front) {
        g.beginPath();
        g.moveTo(cx, cy + HH);
        g.lineTo(cx + HW, cy);
        g.lineTo(cx + HW, cy + d);
        g.lineTo(cx, cy + HH + d);
        g.closePath();
        g.fill();
      }
      if (side) {
        g.beginPath();
        g.moveTo(cx, cy + HH);
        g.lineTo(cx - HW, cy);
        g.lineTo(cx - HW, cy + d);
        g.lineTo(cx, cy + HH + d);
        g.closePath();
        g.fill();
      }
    }
  }

  /* ── 인카운터 존 ── */
  // 어디서 전투가 걸리는지 눈에 보여야 "지금 풀숲으로 들어갈까"가 선택이 된다.
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const z = map.layers.encounter[at(x, y)]!;
      if (z === 0) continue;
      g.fillStyle = z === 1 ? 'rgba(255,214,120,0.08)' : 'rgba(255,120,90,0.11)';
      diamondPath(g, sx(x, y), sy(x, y));
      g.fill();
    }
  }

  /* ── 워프 ── */
  const pulse = 0.3 + Math.sin(t / 320) * 0.16;
  for (const w of map.warps) {
    if (w.x < x0 || w.x > x1 || w.y < y0 || w.y > y1) continue;
    const cx = sx(w.x, w.y);
    const cy = sy(w.x, w.y);
    g.fillStyle = `rgba(255,236,170,${pulse})`;
    diamondPath(g, cx, cy, TILE_W - 8, TILE_H - 4);
    g.fill();
    g.strokeStyle = 'rgba(255,236,170,0.85)';
    g.lineWidth = 2;
    diamondPath(g, cx, cy, TILE_W - 8, TILE_H - 4);
    g.stroke();
    // 위로 뻗는 빛기둥. 워프는 멀리서도 보여야 한다.
    const beam = g.createLinearGradient(cx, cy - 60, cx, cy);
    beam.addColorStop(0, 'rgba(255,236,170,0)');
    beam.addColorStop(1, `rgba(255,236,170,${pulse * 0.5})`);
    g.fillStyle = beam;
    g.fillRect(cx - HW + 6, cy - 60, TILE_W - 12, 60);
  }

  /* ── 솟은 것들 ── */
  // 깊이(x+y)가 같은 것끼리 한 대각선이다. 대각선을 앞에서부터 훑으면서 그 줄에
  // 속한 오브젝트와 사람을 함께 그린다.
  const p = renderPosition(player);
  const npcs = opts.npcs ?? [];

  interface Actor {
    depth: number;
    draw: () => void;
  }
  const actors: Actor[] = [
    {
      depth: p.x + p.y,
      draw: () => {
        drawHuman(g, {
          x: sx(p.x, p.y),
          y: sy(p.x, p.y),
          u: 48 * ART_SCALE,
          dir: screenDir(player.facing),
          pal: PLAYER_PALETTE,
          t,
          walking: player.target !== null,
          club: true,
        });
      },
    },
  ];
  for (const n of npcs) {
    actors.push({
      depth: n.x + n.y,
      draw: () => {
        const cx = sx(n.x, n.y);
        const cy = sy(n.x, n.y);
        drawHuman(g, { x: cx, y: cy, u: 45 * ART_SCALE, dir: 'sw', pal: humanPalette(n.name), t, robe: true });
        if (n.mark) drawMark(g, cx, cy - 45 * ART_SCALE - 16, n.mark, t);
        nameTag(g, n.name, cx, cy + 14);
      },
    });
  }
  actors.sort((a, b) => a.depth - b.depth);

  let ai = 0;
  for (let d = x0 + y0; d <= x1 + y1; d++) {
    while (ai < actors.length && actors[ai]!.depth < d) actors[ai++]!.draw();
    // 이 대각선 위의 타일들. x가 커지면 y가 그만큼 작아진다.
    const lo = Math.max(x0, d - y1);
    const hi = Math.min(x1, d - y0);
    for (let x = lo; x <= hi; x++) {
      const y = d - x;
      const kind = map.layers.object[at(x, y)]!;
      if (kind === OBJECT.none) continue;
      const sprites = tileset.object.get(kind);
      if (!sprites || sprites.length === 0) continue;
      const sprite = sprites[variantAt(x, y, sprites.length)]!;
      g.drawImage(sprite, sx(x, y) - OBJ_ANCHOR_X, sy(x, y) - OBJ_ANCHOR_Y);
    }
  }
  while (ai < actors.length) actors[ai++]!.draw();

  /* ── 분위기 ── */
  if (map.indoor) {
    // 동굴은 시야를 좁힌다. 던전이 필드와 다르게 느껴져야 한다.
    const cx = sx(p.x, p.y);
    const cy = sy(p.x, p.y);
    const grad = g.createRadialGradient(cx, cy, TILE_W * 1.1, cx, cy, TILE_W * 4.4);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.86)');
    g.fillStyle = grad;
    g.fillRect(0, 0, viewW, viewH);
  }

  if (opts.dangerVisible && opts.danger > 0.05) {
    // 위험도를 화면 가장자리로도 알린다. 게이지를 안 보고 있어도 느껴져야 한다.
    const a = Math.min(0.45, opts.danger * 0.45);
    const grad = g.createRadialGradient(
      viewW / 2,
      viewH / 2,
      Math.min(viewW, viewH) * 0.32,
      viewW / 2,
      viewH / 2,
      Math.max(viewW, viewH) * 0.7,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(150,20,20,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, viewW, viewH);
  }
}
