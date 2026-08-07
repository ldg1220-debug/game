/**
 * 타일 텍스처 생성.
 *
 * 외부 이미지 없이 코드로 굽는다. 타일 하나를 한 번만 그려 오프스크린 캔버스에
 * 담아두고 이후에는 복사만 하므로, 매 프레임 수백 개의 도형을 다시 그리지 않는다.
 *
 * 아이소메트릭으로 옮기면서 세 가지가 늘었다:
 *
 *   1. **변종** — 같은 그림이 격자로 늘어서면 눈이 즉시 반복을 잡아낸다. 종류마다
 *      네 장을 굽고 좌표 해시로 고른다. 시간이 아니라 좌표로 고르는 게 중요하다.
 *      시간으로 고르면 가만히 서 있어도 바닥이 지글거린다.
 *   2. **경계 블렌딩** — 이웃 타일 종류가 다르면 그쪽 색을 마름모 변에서 안쪽으로
 *      흐리게 깔아준다. 이게 없으면 풀밭과 모래밭 경계가 톱니로 보인다.
 *   3. **높이** — 오브젝트는 마름모 위로 솟는다. 벽과 바위는 윗면 + 옆면 두 장으로
 *      된 진짜 육면체로 그린다. 정사각 타일 시절엔 그릴 수 없던 것이다.
 */

import { createRng } from '../engine/rng';
import { GROUND, OBJECT } from '../game/mapTypes';
import { ART_SCALE, diamondPath, TILE_H, TILE_W } from './iso';

const HW = TILE_W / 2;
const HH = TILE_H / 2;
/** 오브젝트를 그릴 때 쓰는 기준 타일 반폭·반높이. 마지막에 ART_SCALE로 늘린다. */
const BHW = 32;
const BHH = 16;

export interface TilePalette {
  base: string;
  speck: string;
  edge: string;
  /** 잔풀·자갈 같은 잔부속. 없으면 안 그린다. */
  detail?: string;
}

/** 바닥 색. 지역 분위기를 색 하나로 가르는 게 목표라 채도를 크게 벌렸다. */
export const GROUND_PALETTE: Record<number, TilePalette> = {
  [GROUND.grass]: { base: '#4a7c3f', speck: '#5b9150', edge: '#3d6835', detail: '#6ea85b' },
  [GROUND.path]: { base: '#a38b62', speck: '#b59a70', edge: '#8d7752', detail: '#c0a87e' },
  [GROUND.water]: { base: '#2e5f8a', speck: '#3d76a6', edge: '#24496b' },
  [GROUND.sand]: { base: '#c4ad78', speck: '#d3bd8b', edge: '#a89463', detail: '#e0cd9e' },
  [GROUND.stone]: { base: '#6b6b73', speck: '#7d7d86', edge: '#585860', detail: '#8b8b95' },
  [GROUND.marsh]: { base: '#4d5c3a', speck: '#5d6e46', edge: '#3f4c2f', detail: '#6b7d4e' },
  [GROUND.scorched]: { base: '#5a4741', speck: '#6b554d', edge: '#483833', detail: '#7a5f52' },
  [GROUND.caveFloor]: { base: '#3e3a44', speck: '#4b4652', edge: '#332f38', detail: '#565060' },
};

const OBJECT_COLORS: Record<number, { body: string; shade: string; light: string }> = {
  [OBJECT.tree]: { body: '#2f5a2c', shade: '#22421f', light: '#4a8442' },
  [OBJECT.bush]: { body: '#3b6b33', shade: '#2c5127', light: '#4c8542' },
  [OBJECT.rock]: { body: '#767680', shade: '#565660', light: '#9a9aa6' },
  [OBJECT.wall]: { body: '#8a7355', shade: '#63533d', light: '#ab9070' },
  [OBJECT.door]: { body: '#5c4326', shade: '#3a2917', light: '#7a5b36' },
  [OBJECT.sign]: { body: '#8a6b3f', shade: '#65502f', light: '#a88450' },
  [OBJECT.stalagmite]: { body: '#575160', shade: '#3c3745', light: '#7b7389' },
  [OBJECT.lava]: { body: '#c9421c', shade: '#8f2a10', light: '#ffb04a' },
  [OBJECT.crystal]: { body: '#6f7fd6', shade: '#414c96', light: '#b6c1ff' },
};

/** 마름모 변. 이름은 화면에서 그 변이 어느 쪽을 향하는지를 가리킨다. */
export type Edge = 'tr' | 'br' | 'bl' | 'tl';
/** 변 → 그 너머에 있는 이웃 타일의 월드 좌표 차이. */
export const EDGE_NEIGHBOR: Record<Edge, [number, number]> = {
  tr: [0, -1],
  br: [1, 0],
  bl: [0, 1],
  tl: [-1, 0],
};
const EDGE_MID: Record<Edge, [number, number]> = {
  tr: [HW / 2, -HH / 2],
  br: [HW / 2, HH / 2],
  bl: [-HW / 2, HH / 2],
  tl: [-HW / 2, -HH / 2],
};

/**
 * 오브젝트 스프라이트 판 크기와, 그 안에서 타일 중심이 놓이는 자리.
 *
 * 그림은 64×32 타일 기준으로 그리고 ART_SCALE로 늘린다. 판 크기도 같이 늘어난다.
 */
const OBJ_BASE_W = 96;
const OBJ_BASE_H = 148;
const OBJ_BASE_ANCHOR_Y = OBJ_BASE_H - 30;
export const OBJ_W = Math.ceil(OBJ_BASE_W * ART_SCALE);
export const OBJ_H = Math.ceil(OBJ_BASE_H * ART_SCALE);
export const OBJ_ANCHOR_X = OBJ_W / 2;
export const OBJ_ANCHOR_Y = OBJ_BASE_ANCHOR_Y * ART_SCALE;

const GROUND_VARIANTS = 4;

export interface Tileset {
  /** 종류당 GROUND_VARIANTS 장 */
  ground: Map<number, HTMLCanvasElement[]>;
  /** 종류당 변 4개의 블렌딩 조각 */
  blend: Map<number, Record<Edge, HTMLCanvasElement>>;
  /** 종류당 OBJECT_VARIANTS 장. 벽·문처럼 이어져야 하는 것은 한 장뿐이다. */
  object: Map<number, HTMLCanvasElement[]>;
}

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D 컨텍스트를 얻지 못했다');
  return { c, g };
}

/* ─────────────── 바닥 ─────────────── */

function drawGround(g: CanvasRenderingContext2D, pal: TilePalette, seed: number, water: boolean): void {
  const rng = createRng(seed);
  g.save();
  g.translate(HW, HH);
  diamondPath(g, 0, 0);
  g.clip();

  g.fillStyle = pal.base;
  g.fillRect(-HW, -HH, TILE_W, TILE_H);

  // 잔무늬. 단색 타일이 격자로 늘어서면 화면이 죽는다.
  g.fillStyle = pal.speck;
  for (let i = 0; i < 70; i++) g.fillRect(rng.int(-HW, HW), rng.int(-HH, HH), 1, 1);
  g.fillStyle = pal.edge;
  for (let i = 0; i < 24; i++) g.fillRect(rng.int(-HW, HW), rng.int(-HH, HH), 2, 1);

  if (water) {
    // 물결. 변종이 곧 애니메이션 프레임이라 위상이 seed에 실려 있다.
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const y = -HH + ((i + rng.float(0, 1)) / 3) * TILE_H;
      g.beginPath();
      g.moveTo(-HW, y);
      for (let x = -HW; x <= HW; x += 8) g.lineTo(x, y + Math.sin(x / 9 + seed) * 1.6);
      g.stroke();
    }
  } else if (pal.detail) {
    // 잔풀·자갈. 변종마다 다른 자리에 몇 개만 — 많으면 지저분해진다.
    g.fillStyle = pal.detail;
    for (let i = 0; i < 5; i++) {
      const x = rng.int(-HW + 6, HW - 6);
      const y = rng.int(-HH + 3, HH - 3);
      // 마름모 안쪽인지 확인한다. 클립이 잘라주긴 하지만 반쪽만 남은 풀이 생긴다.
      if (Math.abs(x) / HW + Math.abs(y) / HH > 0.78) continue;
      g.fillRect(x, y, 2, 2);
      g.fillRect(x + 2, y - 1, 1, 2);
    }
  }

  // 윗변은 밝게, 아랫변은 어둡게 — 평평한 마름모에 두께를 준다
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.beginPath();
  g.moveTo(-HW, 0);
  g.lineTo(0, -HH);
  g.lineTo(HW, 0);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.beginPath();
  g.moveTo(-HW, 0);
  g.lineTo(0, HH);
  g.lineTo(HW, 0);
  g.stroke();

  g.restore();
}

/**
 * 경계 조각.
 *
 * 이웃이 다른 종류일 때 **이웃 색을** 이쪽 마름모의 그 변에 흐리게 깐다. 반대로
 * 하면(내 색을 이웃에 깔면) 두 타일이 서로를 덮으면서 경계가 두 겹이 된다.
 */
function drawBlend(g: CanvasRenderingContext2D, pal: TilePalette, edge: Edge): void {
  g.save();
  g.translate(HW, HH);
  diamondPath(g, 0, 0);
  g.clip();

  // 변 한가운데에서 반대편으로 흐르는 그라디언트. 마름모 밖은 클립이 자른다.
  const [mx, my] = EDGE_MID[edge];
  // 처음엔 0.85로 깔았더니 길과 풀이 번갈아 놓인 마을 광장이 통째로 탁해졌다.
  // 경계를 부드럽게 하려던 것이지 바닥색을 섞으려던 게 아니다 — 얇게 깐다.
  const grad = g.createLinearGradient(mx, my, -mx * 0.45, -my * 0.45);
  grad.addColorStop(0, hexToRgba(pal.base, 0.5));
  grad.addColorStop(0.55, hexToRgba(pal.base, 0.14));
  grad.addColorStop(1, hexToRgba(pal.base, 0));
  g.fillStyle = grad;
  g.fillRect(-HW, -HH, TILE_W, TILE_H);

  g.restore();
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ─────────────── 오브젝트 ─────────────── */

/**
 * 아이소메트릭 육면체.
 *
 * 윗면 마름모 하나 + 옆면 둘. 옆면 밝기를 다르게 줘야 모서리가 보인다 — 같은
 * 색으로 칠하면 그냥 육각형이 된다.
 */
function isoCube(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  h: number,
  c: { body: string; shade: string; light: string },
  hw = BHW,
  hh = BHH,
): void {
  // 왼쪽 옆면(화면 아래-왼쪽을 향한다)
  g.fillStyle = c.shade;
  g.beginPath();
  g.moveTo(cx - hw, cy - h);
  g.lineTo(cx, cy - h + hh);
  g.lineTo(cx, cy + hh);
  g.lineTo(cx - hw, cy);
  g.closePath();
  g.fill();

  // 오른쪽 옆면
  g.fillStyle = c.body;
  g.beginPath();
  g.moveTo(cx + hw, cy - h);
  g.lineTo(cx, cy - h + hh);
  g.lineTo(cx, cy + hh);
  g.lineTo(cx + hw, cy);
  g.closePath();
  g.fill();

  // 윗면
  g.fillStyle = c.light;
  diamondPath(g, cx, cy - h, hw * 2, hh * 2);
  g.fill();
}

function shadow(g: CanvasRenderingContext2D, rx = BHW * 0.62, ry = BHH * 0.6, a = 0.26): void {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

const HUT_H = 54;
/** 지붕 색. 벽과 확실히 갈라야 지붕으로 읽힌다. */
const THATCH = { top: '#9a6b3a', topDark: '#7d5429', ridge: '#c08a4e' };

/**
 * 오두막 한 칸.
 *
 * 맵 데이터에서 집은 wall 타일을 여러 칸 깔아 만든다. 그래서 칸마다 독립된
 * 그림이어야 하고, 옆에 같은 게 붙어도 이어져 보여야 한다.
 *
 * 처음엔 회색 육면체로 그렸더니 집이 아니라 돌 평상이 됐다. 윗면을 벽과 다른
 * 색(초가)으로 칠하고 높이를 올리자 비로소 건물로 읽힌다. 지붕 능선을 마름모
 * 대각선으로 하나 그어주면 칸이 여럿 붙어도 지붕면이 이어진다.
 *
 * 문은 별도 타일이 아니라 같은 오두막에 출입구만 낸 것이다. 벽과 색이 다르면
 * 문만 다른 재질의 건물처럼 보인다.
 */
function drawHut(g: CanvasRenderingContext2D, wall: { body: string; shade: string; light: string }, door: boolean): void {
  isoCube(g, 0, 0, HUT_H, { body: wall.body, shade: wall.shade, light: THATCH.top });

  // 초가 결.
  //
  // 처음엔 능선에서 부챗살로 뻗게 그렸다. 한 칸만 보면 그럴듯한데, 집은 이 타일을
  // 여러 칸 이어 만들기 때문에 칸마다 부챗살과 능선이 반복되면서 지붕이 아니라
  // 삼각 천막이 죽 늘어선 모양이 됐다. 이어 붙였을 때 티가 안 나려면 방향이
  // 없는 무늬여야 한다.
  g.save();
  diamondPath(g, 0, -HUT_H, BHW * 2, BHH * 2);
  g.clip();
  // 아래쪽 절반을 살짝 눌러 지붕에 기울기를 준다
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(-BHW, -HUT_H, BHW * 2, BHH);
  g.strokeStyle = THATCH.topDark;
  g.lineWidth = 1.2;
  const straw = createRng(9173);
  for (let i = 0; i < 26; i++) {
    const x = straw.int(-BHW, BHW);
    const y = straw.int(-HUT_H - BHH, -HUT_H + BHH);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + straw.int(4, 9), y + straw.int(-2, 2));
    g.stroke();
  }
  g.restore();

  // 처마. 지붕이 벽보다 조금 튀어나와야 그늘이 생긴다.
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.moveTo(-BHW, -HUT_H);
  g.lineTo(0, -HUT_H + BHH);
  g.lineTo(BHW, -HUT_H);
  g.lineTo(BHW, -HUT_H + 4);
  g.lineTo(0, -HUT_H + BHH + 4);
  g.lineTo(-BHW, -HUT_H + 4);
  g.closePath();
  g.fill();

  // 통나무 결. 옆면 두 쪽에 각각 기울여 긋는다.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const dy = -(HUT_H / 4) * i;
    g.beginPath();
    g.moveTo(-BHW, dy);
    g.lineTo(0, dy + BHH);
    g.lineTo(BHW, dy);
    g.stroke();
  }

  if (!door) return;

  // 오른쪽 옆면 위의 한 점. a는 가운데 모서리(0)에서 오른쪽 끝(1)으로,
  // b는 처마(0)에서 바닥(1)으로 간다. 면 위에서만 좌표를 만들면 문이 지붕
  // 위로 삐져나가는 일이 없다 — 처음엔 화면 좌표로 찍었다가 그렇게 됐다.
  const face = (a: number, b: number): [number, number] => [a * BHW, BHH * (1 - a) - HUT_H * (1 - b)];

  g.fillStyle = '#241a0f';
  g.beginPath();
  const a0 = 0.16;
  const a1 = 0.74;
  g.moveTo(...face(a0, 1));
  g.lineTo(...face(a0, 0.42));
  // 아치
  for (let k = 0; k <= 6; k++) {
    const f = k / 6;
    const a = a0 + (a1 - a0) * f;
    g.lineTo(...face(a, 0.42 - Math.sin(f * Math.PI) * 0.1));
  }
  g.lineTo(...face(a1, 1));
  g.closePath();
  g.fill();

  // 문틀
  g.strokeStyle = '#6b4a2c';
  g.lineWidth = 2.5;
  g.stroke();
}

/**
 * 종류별 변종 수.
 *
 * 나무가 전부 같으면 숲 가장자리가 울타리처럼 보인다 — 실제로 그렇게 나왔다.
 * 반대로 벽과 문은 반드시 하나여야 한다. 여러 칸이 이어져 건물이 되는데 칸마다
 * 지붕 결이 다르면 지붕이 조각조각 난다.
 */
const OBJECT_VARIANTS: Record<number, number> = {
  [OBJECT.tree]: 3,
  [OBJECT.bush]: 3,
  [OBJECT.rock]: 3,
  [OBJECT.stalagmite]: 3,
  [OBJECT.crystal]: 2,
};

function drawObject(g: CanvasRenderingContext2D, kind: number, v = 0): void {
  const c = OBJECT_COLORS[kind];
  if (!c) return;
  const rng = createRng(kind * 7919 + v * 617 + 3);

  // 나무 말고는 크기와 좌우 반전만으로 변종을 만든다. 돌과 덤불은 실루엣이
  // 단순해서 그 정도로 충분히 달라 보인다.
  if (kind !== OBJECT.tree && (OBJECT_VARIANTS[kind] ?? 1) > 1) {
    const s = [1, 0.86, 1.12][v] ?? 1;
    g.scale(v === 1 ? -s : s, s);
  }

  switch (kind) {
    case OBJECT.tree: {
      shadow(g, BHW * 0.5, BHH * 0.5);
      // 변종마다 키와 기울기를 바꾼다. 색까지 바꾸면 숲이 얼룩덜룩해진다.
      const grow = [1, 0.84, 1.14][v] ?? 1;
      const lean = [0, -3, 2][v] ?? 0;
      const trunk = 46 * grow;
      g.translate(lean, 0);

      // 줄기 — 아래가 굵고 위가 가늘다
      g.fillStyle = '#4a3524';
      g.beginPath();
      g.moveTo(-7, 4);
      g.lineTo(-4, -trunk);
      g.lineTo(4, -trunk);
      g.lineTo(7, 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#33241a';
      g.beginPath();
      g.moveTo(0, 4);
      g.lineTo(0, -trunk);
      g.lineTo(4, -trunk);
      g.lineTo(7, 4);
      g.closePath();
      g.fill();

      // 잎을 세 층으로 쌓는다. 한 덩이보다 훨씬 나무처럼 보인다.
      const layers = [
        { y: -44 * grow, r: 27 * grow, col: c.shade },
        { y: -56 * grow, r: 24 * grow, col: c.body },
        { y: -68 * grow, r: 18 * grow, col: c.light },
      ];
      for (const l of layers) {
        g.fillStyle = l.col;
        g.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const rr = l.r * (0.82 + rng.float(0, 1) * 0.32);
          const x = Math.cos(a) * rr;
          const y = l.y + Math.sin(a) * rr * 0.62;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.ellipse(-8 * grow, -70 * grow, 9, 6, -0.4, 0, Math.PI * 2);
      g.fill();
      break;
    }

    case OBJECT.bush: {
      shadow(g, BHW * 0.42, BHH * 0.44);
      for (const [dx, dy, r, col] of [
        [-11, -6, 13, c.shade],
        [11, -5, 12, c.shade],
        [0, -15, 15, c.body],
        [-4, -20, 8, c.light],
      ] as const) {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(dx, dy, r, r * 0.82, 0, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }

    case OBJECT.rock: {
      shadow(g, BHW * 0.46, BHH * 0.5);
      isoCube(g, 0, -2, 16, c, BHW * 0.42, BHH * 0.42);
      // 위에 작은 돌 하나 더 얹으면 덩어리로 보인다
      isoCube(g, -5, -17, 10, { body: c.light, shade: c.body, light: '#b4b4c0' }, BHW * 0.2, BHH * 0.2);
      break;
    }

    case OBJECT.stalagmite: {
      shadow(g, BHW * 0.38, BHH * 0.42);
      g.fillStyle = c.shade;
      g.beginPath();
      g.moveTo(-16, 2);
      g.lineTo(-2, -62);
      g.lineTo(2, -62);
      g.lineTo(16, 2);
      g.closePath();
      g.fill();
      g.fillStyle = c.light;
      g.beginPath();
      g.moveTo(0, 2);
      g.lineTo(0, -62);
      g.lineTo(2, -62);
      g.lineTo(16, 2);
      g.closePath();
      g.fill();
      break;
    }

    case OBJECT.wall: {
      drawHut(g, c, false);
      break;
    }

    case OBJECT.door: {
      drawHut(g, OBJECT_COLORS[OBJECT.wall]!, true);
      break;
    }

    case OBJECT.sign: {
      shadow(g, BHW * 0.28, BHH * 0.32);
      g.fillStyle = '#4a3524';
      g.fillRect(-3, -34, 6, 36);
      g.fillStyle = c.body;
      g.beginPath();
      g.moveTo(-22, -52);
      g.lineTo(22, -52);
      g.lineTo(22, -32);
      g.lineTo(-22, -32);
      g.closePath();
      g.fill();
      g.fillStyle = c.light;
      g.fillRect(-22, -52, 44, 3);
      g.fillStyle = c.shade;
      for (let i = 0; i < 3; i++) g.fillRect(-16, -48 + i * 5, 32, 2);
      break;
    }

    case OBJECT.lava: {
      // 바닥에 고인 것이므로 솟지 않는다
      g.fillStyle = c.shade;
      diamondPath(g, 0, 0);
      g.fill();
      g.save();
      diamondPath(g, 0, 0);
      g.clip();
      g.fillStyle = c.body;
      diamondPath(g, 0, 0, 64 * 0.86, 32 * 0.86);
      g.fill();
      g.fillStyle = c.light;
      for (let i = 0; i < 12; i++) {
        const x = rng.int(-BHW + 4, BHW - 4);
        const y = rng.int(-BHH + 2, BHH - 2);
        if (Math.abs(x) / BHW + Math.abs(y) / BHH > 0.8) continue;
        g.fillRect(x, y, rng.int(3, 7), 2);
      }
      g.restore();
      // 열기
      const glow = g.createRadialGradient(0, -6, 2, 0, -6, 30);
      glow.addColorStop(0, 'rgba(255,150,60,0.35)');
      glow.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = glow;
      g.fillRect(-40, -40, 80, 60);
      break;
    }

    case OBJECT.crystal: {
      shadow(g, BHW * 0.34, BHH * 0.38);
      const glow = g.createRadialGradient(0, -26, 3, 0, -26, 40);
      glow.addColorStop(0, 'rgba(150,170,255,0.30)');
      glow.addColorStop(1, 'rgba(150,170,255,0)');
      g.fillStyle = glow;
      g.fillRect(-46, -70, 92, 88);

      for (const [dx, s, hgt] of [
        [-11, 0.62, 34],
        [9, 0.72, 28],
        [0, 1, 56],
      ] as const) {
        g.fillStyle = c.shade;
        g.beginPath();
        g.moveTo(dx, -hgt);
        g.lineTo(dx + 11 * s, -hgt * 0.42);
        g.lineTo(dx, 2);
        g.lineTo(dx - 11 * s, -hgt * 0.42);
        g.closePath();
        g.fill();
        g.fillStyle = c.light;
        g.beginPath();
        g.moveTo(dx, -hgt);
        g.lineTo(dx + 11 * s, -hgt * 0.42);
        g.lineTo(dx, 2);
        g.closePath();
        g.fill();
      }
      break;
    }
  }
}

/* ─────────────── 조립 ─────────────── */

/** 타일셋을 한 번 굽는다. 앱 시작 시 한 번만 부른다. */
export function buildTileset(): Tileset {
  const ground = new Map<number, HTMLCanvasElement[]>();
  const blend = new Map<number, Record<Edge, HTMLCanvasElement>>();

  for (const [key, pal] of Object.entries(GROUND_PALETTE)) {
    const kind = Number(key);
    const water = kind === GROUND.water;
    const variants: HTMLCanvasElement[] = [];
    for (let v = 0; v < GROUND_VARIANTS; v++) {
      const { c, g } = makeCanvas(TILE_W, TILE_H);
      drawGround(g, pal, kind * 7919 + v * 131 + 13, water);
      variants.push(c);
    }
    ground.set(kind, variants);

    const edges = {} as Record<Edge, HTMLCanvasElement>;
    for (const e of ['tr', 'br', 'bl', 'tl'] as const) {
      const { c, g } = makeCanvas(TILE_W, TILE_H);
      drawBlend(g, pal, e);
      edges[e] = c;
    }
    blend.set(kind, edges);
  }

  const object = new Map<number, HTMLCanvasElement[]>();
  for (const kind of Object.values(OBJECT)) {
    if (kind === OBJECT.none) continue;
    const variants: HTMLCanvasElement[] = [];
    for (let v = 0; v < (OBJECT_VARIANTS[kind] ?? 1); v++) {
      const { c, g } = makeCanvas(OBJ_W, OBJ_H);
      // 그림은 64×32 타일 기준으로 그려져 있다. 여기서 한 번 늘린다.
      g.translate(OBJ_ANCHOR_X, OBJ_ANCHOR_Y);
      g.scale(ART_SCALE, ART_SCALE);
      g.save();
      drawObject(g, kind, v);
      g.restore();
      variants.push(c);
    }
    object.set(kind, variants);
  }

  return { ground, blend, object };
}

/**
 * 좌표로 변종을 고른다.
 *
 * 난수를 쓰면 매 프레임 달라져 바닥이 끓는다. 좌표 해시는 같은 칸이면 언제나
 * 같은 변종이라 화면이 가만히 있는다.
 */
export function variantAt(x: number, y: number, count = GROUND_VARIANTS): number {
  const n = (x * 73856093) ^ (y * 19349663);
  return ((n % count) + count) % count;
}

/** 물은 시간으로 넘긴다. 흐르지 않는 물은 물로 안 보인다. */
export function waterFrame(t: number, count = GROUND_VARIANTS): number {
  return Math.floor(t / 340) % count;
}
