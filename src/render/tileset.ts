/**
 * 타일 텍스처 생성.
 *
 * 외부 이미지 없이 코드로 굽는다. 타일 하나를 한 번만 그려 오프스크린 캔버스에
 * 담아두고 이후에는 복사만 하므로, 매 프레임 수백 개의 도형을 다시 그리지 않는다.
 *
 * 무늬는 seed 고정 난수로 찍는다. 같은 타일이 새로고침마다 달라 보이면 화면이
 * 흔들리는 느낌이 난다.
 */

import { createRng } from '../engine/rng';
import { GROUND, OBJECT } from '../game/mapTypes';

export interface TilePalette {
  base: string;
  speck: string;
  edge: string;
}

/** 바닥 색. 지역 분위기를 색 하나로 가르는 게 목표라 채도를 크게 벌렸다. */
export const GROUND_PALETTE: Record<number, TilePalette> = {
  [GROUND.grass]: { base: '#4a7c3f', speck: '#5b9150', edge: '#3d6835' },
  [GROUND.path]: { base: '#a38b62', speck: '#b59a70', edge: '#8d7752' },
  [GROUND.water]: { base: '#2e5f8a', speck: '#3d76a6', edge: '#24496b' },
  [GROUND.sand]: { base: '#c4ad78', speck: '#d3bd8b', edge: '#a89463' },
  [GROUND.stone]: { base: '#6b6b73', speck: '#7d7d86', edge: '#585860' },
  [GROUND.marsh]: { base: '#4d5c3a', speck: '#5d6e46', edge: '#3f4c2f' },
  [GROUND.scorched]: { base: '#5a4741', speck: '#6b554d', edge: '#483833' },
  [GROUND.caveFloor]: { base: '#3e3a44', speck: '#4b4652', edge: '#332f38' },
};

const OBJECT_COLORS: Record<number, { body: string; shade: string; light: string }> = {
  [OBJECT.tree]: { body: '#2f5a2c', shade: '#22421f', light: '#3d7238' },
  [OBJECT.bush]: { body: '#3b6b33', shade: '#2c5127', light: '#4c8542' },
  [OBJECT.rock]: { body: '#767680', shade: '#5a5a63', light: '#8e8e99' },
  [OBJECT.wall]: { body: '#8a7355', shade: '#6b5941', light: '#a38a68' },
  [OBJECT.door]: { body: '#5c4326', shade: '#42301b', light: '#7a5b36' },
  [OBJECT.sign]: { body: '#8a6b3f', shade: '#65502f', light: '#a8845020' },
  [OBJECT.stalagmite]: { body: '#575160', shade: '#403b49', light: '#6d6679' },
  [OBJECT.lava]: { body: '#c9421c', shade: '#8f2a10', light: '#f5843a' },
  [OBJECT.crystal]: { body: '#6f7fd6', shade: '#4c59a6', light: '#a3b0f0' },
};

export interface Tileset {
  size: number;
  ground: Map<number, HTMLCanvasElement>;
  object: Map<number, HTMLCanvasElement>;
}

function makeCanvas(size: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D 컨텍스트를 얻지 못했다');
  return { c, g };
}

function drawGround(g: CanvasRenderingContext2D, size: number, pal: TilePalette, seed: number): void {
  const rng = createRng(seed);
  g.fillStyle = pal.base;
  g.fillRect(0, 0, size, size);

  // 잔무늬. 단색 타일이 격자로 늘어서면 화면이 죽는다.
  g.fillStyle = pal.speck;
  const specks = Math.round(size * 0.9);
  for (let i = 0; i < specks; i++) {
    g.fillRect(rng.int(0, size - 1), rng.int(0, size - 1), 1, 1);
  }
  g.fillStyle = pal.edge;
  for (let i = 0; i < specks / 3; i++) {
    g.fillRect(rng.int(0, size - 2), rng.int(0, size - 2), 2, 1);
  }

  // 타일 경계를 아주 살짝. 격자가 보이면 이동이 타일 단위라는 게 읽힌다.
  g.strokeStyle = 'rgba(0,0,0,0.08)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, size - 1, size - 1);
}

function drawObject(g: CanvasRenderingContext2D, size: number, kind: number): void {
  const c = OBJECT_COLORS[kind];
  if (!c) return;
  const s = size;

  // 발밑 그림자 — 오브젝트가 바닥에 붙어 있다는 느낌을 만든다
  const shadow = () => {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(s / 2, s - 4, s * 0.3, s * 0.11, 0, 0, Math.PI * 2);
    g.fill();
  };

  switch (kind) {
    case OBJECT.tree: {
      shadow();
      g.fillStyle = '#4a3524';
      g.fillRect(s / 2 - 2, s * 0.55, 4, s * 0.35);
      for (const [r, col] of [[0.34, c.shade], [0.3, c.body], [0.22, c.light]] as const) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(s / 2, s * 0.4, s * r, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case OBJECT.bush: {
      shadow();
      for (const [dx, dy, r] of [[-0.16, 0.06, 0.22], [0.16, 0.06, 0.22], [0, -0.04, 0.26]] as const) {
        g.fillStyle = c.body;
        g.beginPath();
        g.arc(s / 2 + s * dx, s * 0.6 + s * dy, s * r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = c.light;
      g.beginPath();
      g.arc(s * 0.42, s * 0.48, s * 0.1, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case OBJECT.rock:
    case OBJECT.stalagmite: {
      shadow();
      const tall = kind === OBJECT.stalagmite;
      g.fillStyle = c.body;
      g.beginPath();
      if (tall) {
        g.moveTo(s * 0.3, s * 0.92);
        g.lineTo(s * 0.5, s * 0.12);
        g.lineTo(s * 0.7, s * 0.92);
      } else {
        g.moveTo(s * 0.18, s * 0.86);
        g.lineTo(s * 0.32, s * 0.34);
        g.lineTo(s * 0.62, s * 0.28);
        g.lineTo(s * 0.84, s * 0.86);
      }
      g.closePath();
      g.fill();
      g.fillStyle = c.light;
      g.beginPath();
      g.moveTo(s * 0.5, s * (tall ? 0.12 : 0.3));
      g.lineTo(s * 0.5, s * 0.86);
      g.lineTo(s * (tall ? 0.7 : 0.84), s * 0.88);
      g.closePath();
      g.fill();
      break;
    }
    case OBJECT.wall: {
      g.fillStyle = c.body;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = c.shade;
      g.lineWidth = 1;
      // 벽돌 무늬. 줄마다 반 칸 어긋나게 쌓는다.
      const rows = 4;
      const h = s / rows;
      for (let r = 0; r < rows; r++) {
        g.beginPath();
        g.moveTo(0, r * h + 0.5);
        g.lineTo(s, r * h + 0.5);
        g.stroke();
        const off = r % 2 === 0 ? 0 : s / 4;
        for (let x = off; x < s; x += s / 2) {
          g.beginPath();
          g.moveTo(x + 0.5, r * h);
          g.lineTo(x + 0.5, r * h + h);
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, 0, s, 2);
      break;
    }
    case OBJECT.door: {
      g.fillStyle = c.shade;
      g.fillRect(s * 0.15, s * 0.1, s * 0.7, s * 0.9);
      g.fillStyle = c.body;
      g.fillRect(s * 0.2, s * 0.15, s * 0.6, s * 0.85);
      g.fillStyle = '#d8c070';
      g.beginPath();
      g.arc(s * 0.7, s * 0.55, 2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case OBJECT.sign: {
      shadow();
      g.fillStyle = '#4a3524';
      g.fillRect(s / 2 - 2, s * 0.5, 4, s * 0.4);
      g.fillStyle = c.body;
      g.fillRect(s * 0.15, s * 0.2, s * 0.7, s * 0.35);
      g.fillStyle = c.shade;
      for (let i = 0; i < 3; i++) g.fillRect(s * 0.24, s * (0.28 + i * 0.08), s * 0.52, 2);
      break;
    }
    case OBJECT.lava: {
      g.fillStyle = c.shade;
      g.fillRect(0, 0, s, s);
      g.fillStyle = c.body;
      g.fillRect(1, 1, s - 2, s - 2);
      g.fillStyle = c.light;
      const rng = createRng(kind * 977);
      for (let i = 0; i < 14; i++) {
        g.fillRect(rng.int(2, s - 5), rng.int(2, s - 5), rng.int(2, 4), 2);
      }
      break;
    }
    case OBJECT.crystal: {
      shadow();
      g.fillStyle = c.body;
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.08);
      g.lineTo(s * 0.74, s * 0.5);
      g.lineTo(s * 0.5, s * 0.92);
      g.lineTo(s * 0.26, s * 0.5);
      g.closePath();
      g.fill();
      g.fillStyle = c.light;
      g.beginPath();
      g.moveTo(s * 0.5, s * 0.08);
      g.lineTo(s * 0.5, s * 0.92);
      g.lineTo(s * 0.26, s * 0.5);
      g.closePath();
      g.fill();
      break;
    }
  }
}

/** 타일셋을 한 번 굽는다. 앱 시작 시 한 번만 부른다. */
export function buildTileset(size = 32): Tileset {
  const ground = new Map<number, HTMLCanvasElement>();
  for (const [key, pal] of Object.entries(GROUND_PALETTE)) {
    const { c, g } = makeCanvas(size);
    drawGround(g, size, pal, Number(key) * 7919 + 13);
    ground.set(Number(key), c);
  }

  const object = new Map<number, HTMLCanvasElement>();
  for (const kind of Object.values(OBJECT)) {
    if (kind === OBJECT.none) continue;
    const { c, g } = makeCanvas(size);
    drawObject(g, size, kind);
    object.set(kind, c);
  }

  return { size, ground, object };
}
