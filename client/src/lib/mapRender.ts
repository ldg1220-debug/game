import { TILES, TILE_SIZE, type TileKind } from './mapData';

/**
 * 필드 지형 렌더러.
 *
 * 이전 구현은 타일마다 배경색을 칠하고 그 위에 같은 도형을 찍어서, 32px 격자와
 * 똑같은 바위가 줄지어 늘어선 모습이 그대로 드러났다. 여기서는 세 가지를 바꾼다.
 *
 *  1. 바닥은 타일 단위로 칠하지 않고 화면 전체에 연속된 레이어로 깐다.
 *     노이즈로 색을 흔들어 격자 경계가 생기지 않게 한다.
 *  2. 지형 경계는 이웃 타일을 보고 부드럽게 번지게 한다(오토타일 대용).
 *  3. 나무·바위 같은 프롭은 좌표 해시로 크기·회전·색조를 흔들고 접지 그림자를
 *     깔아, 같은 종류라도 전부 다르게 보이도록 한다.
 *
 * 프롭은 오프스크린 캔버스에 미리 그려 캐시한다. 변형 조합이 유한하므로
 * 매 프레임 경로를 다시 그리지 않아도 되고 60FPS를 유지할 수 있다.
 */

/** 결정적 해시. 같은 좌표는 항상 같은 변형을 낸다. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round((((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t) + (pb & 255) * t));
  return `rgb(${r},${g},${bl})`;
}

function shift(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)))),
  );
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface TerrainTheme {
  /** 바닥 기본색과 얼룩색 */
  ground: [string, string];
  /** 수풀 덩어리 색 */
  brush: [string, string];
  /** 길 색 */
  path: [string, string];
  /** 프롭(나무/바위) 색 */
  foliage: [string, string];
  rock: [string, string];
  water: [string, string];
  /** 화면 전체에 얹는 분위기 색과 세기 */
  ambient: [string, number];
}

export const THEMES: Record<string, TerrainTheme> = {
  plains: {
    ground: ['#5c9a4a', '#6fae57'],
    brush: ['#3d7a37', '#559a45'],
    path: ['#a38b5e', '#b89d6d'],
    foliage: ['#2f6b30', '#4b9b46'],
    rock: ['#7d8794', '#9aa4b0'],
    water: ['#2d6f9e', '#4a9ccc'],
    ambient: ['#ffe9a8', 0.06],
  },
  forest: {
    ground: ['#3d6b38', '#4d8144'],
    brush: ['#2a5628', '#3d7536'],
    path: ['#7d6a48', '#8f7a55'],
    foliage: ['#1e4a22', '#356b33'],
    rock: ['#5f6a72', '#78848d'],
    water: ['#255a7a', '#3d84a8'],
    ambient: ['#0d2a14', 0.16],
  },
  mountain: {
    ground: ['#8a8378', '#9b9488'],
    brush: ['#6f7a5c', '#89946f'],
    path: ['#a89b86', '#bcae97'],
    foliage: ['#3f5f3c', '#587c4f'],
    rock: ['#6e747c', '#8e959e'],
    water: ['#3a6d8c', '#5292b5'],
    ambient: ['#cfd8e6', 0.08],
  },
  volcano: {
    ground: ['#5a3a30', '#6e4a3c'],
    brush: ['#6b3a24', '#8a4c2c'],
    path: ['#7a5344', '#8f6552'],
    foliage: ['#4a2a1c', '#633a24'],
    rock: ['#4e4038', '#6b5a4e'],
    water: ['#b03a12', '#e2661f'],
    ambient: ['#ff6b35', 0.12],
  },
  glacier: {
    ground: ['#7d9fb8', '#96b8ce'],
    brush: ['#6a92ad', '#88b0c8'],
    path: ['#adc4d4', '#c4d8e4'],
    foliage: ['#4e7f97', '#6fa0b6'],
    rock: ['#7b8794', '#9aa6b2'],
    water: ['#3f7fa8', '#69aed2'],
    ambient: ['#cfeaff', 0.14],
  },
};

export function themeFor(regionId: string): TerrainTheme {
  return THEMES[regionId] ?? THEMES.plains;
}

/* ─────────── 프롭 캐시 ─────────── */

const PROP_VARIANTS = 6;
const propCache = new Map<string, HTMLCanvasElement>();

function makeCanvas(w: number, h: number): { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d')! };
}

/** 접지 그림자. 프롭이 바닥에 붙어 보이게 한다. */
function castShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, t: TerrainTheme, v: number, S: number) {
  const r = (n: number) => hash2(v * 31 + n, v * 17 + n, 7);
  const cx = S / 2;
  const scale = 0.86 + r(1) * 0.3;
  const tint = (r(2) - 0.5) * 0.22;
  const dark = shift(t.foliage[0], tint - 0.05);
  const lit = shift(t.foliage[1], tint + 0.08);

  castShadow(ctx, cx + 2, S * 0.92, 13 * scale, 5 * scale);

  // 줄기
  const tg = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0);
  tg.addColorStop(0, '#3a2a1c');
  tg.addColorStop(0.5, '#5a4229');
  tg.addColorStop(1, '#33241a');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(cx - 3.5 * scale, S * 0.92);
  ctx.lineTo(cx - 2 * scale, S * 0.5);
  ctx.lineTo(cx + 2 * scale, S * 0.5);
  ctx.lineTo(cx + 3.5 * scale, S * 0.92);
  ctx.closePath();
  ctx.fill();

  // 잎: 겹친 덩어리 여러 개로 유기적인 윤곽을 만든다
  const blobs: [number, number, number][] = [
    [cx - 8 * scale, S * 0.5, 10 * scale],
    [cx + 8 * scale, S * 0.5, 9.5 * scale],
    [cx, S * 0.36, 12 * scale],
    [cx - 5 * scale, S * 0.3, 8.5 * scale],
    [cx + 6 * scale, S * 0.32, 8 * scale],
  ];
  ctx.fillStyle = dark;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  // 좌상단 광원
  const lg = ctx.createRadialGradient(cx - 6 * scale, S * 0.28, 1, cx, S * 0.42, 16 * scale);
  lg.addColorStop(0, lit);
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg;
  for (const [bx, by, br] of blobs) {
    ctx.beginPath();
    ctx.arc(bx, by, br * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRock(ctx: CanvasRenderingContext2D, t: TerrainTheme, v: number, S: number) {
  const r = (n: number) => hash2(v * 53 + n, v * 29 + n, 11);
  const cx = S / 2;
  const tint = (r(2) - 0.5) * 0.2;
  const base = shift(t.rock[0], tint);
  const lit = shift(t.rock[1], tint + 0.14);
  const dark = shift(t.rock[0], -0.34);

  // 실루엣을 세 갈래로 나눠 같은 돔이 반복되지 않게 한다
  const form = v % 3;

  const boulder = (ox: number, oy: number, sc: number, seedOff: number) => {
    const q = (n: number) => hash2(v * 17 + seedOff + n, v * 7 + seedOff - n, 19);
    const pts: [number, number][] = [];
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const rad = (8 + q(i) * 5) * sc;
      pts.push([cx + ox + Math.cos(a) * rad, S * 0.62 + oy + Math.sin(a) * rad * 0.78]);
    }
    castShadow(ctx, cx + ox + 2, S * 0.86 + oy * 0.4, 11 * sc, 4.2 * sc);
    const g = ctx.createLinearGradient(cx + ox - 10 * sc, S * 0.3, cx + ox + 10 * sc, S * 0.9);
    g.addColorStop(0, lit);
    g.addColorStop(0.5, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    // 밝은 면
    ctx.fillStyle = shift(t.rock[1], 0.24);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  if (form === 0) {
    // 큰 바위 하나
    boulder(0, -2, 1.35, 0);
  } else if (form === 1) {
    // 뾰족한 바위 기둥
    castShadow(ctx, cx + 2, S * 0.88, 12, 4.5);
    const g = ctx.createLinearGradient(cx - 10, S * 0.16, cx + 10, S * 0.88);
    g.addColorStop(0, lit);
    g.addColorStop(0.5, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 10, S * 0.88);
    ctx.lineTo(cx - 5 + r(3) * 3, S * 0.42);
    ctx.lineTo(cx + 1, S * 0.14 + r(4) * 6);
    ctx.lineTo(cx + 8, S * 0.5);
    ctx.lineTo(cx + 11, S * 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shift(t.rock[1], 0.26);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - 5 + r(3) * 3, S * 0.42);
    ctx.lineTo(cx + 1, S * 0.14 + r(4) * 6);
    ctx.lineTo(cx + 2, S * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // 작은 바위 무리
    boulder(-7, 3, 0.72, 5);
    boulder(7, 1, 0.62, 11);
    boulder(1, -4, 0.9, 23);
  }
}

function drawBrush(ctx: CanvasRenderingContext2D, t: TerrainTheme, v: number, S: number) {
  const r = (n: number) => hash2(v * 71 + n, v * 41 + n, 3);
  const dark = shift(t.brush[0], (r(1) - 0.5) * 0.16);
  const lit = shift(t.brush[1], 0.1);
  // 바닥에 깔리는 덩어리 + 그 위에 풀잎. 획만 몇 개 그으면 듬성듬성해 보인다.
  ctx.fillStyle = dark;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 3; i++) {
    const bx = 6 + r(i * 7) * (S - 12);
    const by = S - 8 + r(i * 11) * 6;
    ctx.beginPath();
    ctx.ellipse(bx, by, 9 + r(i * 3) * 5, 5 + r(i * 5) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const bx = 2 + r(i * 2) * (S - 4);
    const by = S - 2 - r(i * 2 + 1) * 9;
    const h = 8 + r(i * 3) * 11;
    const lean = (r(i * 5) - 0.5) * 8;
    ctx.strokeStyle = i % 3 === 0 ? lit : dark;
    ctx.lineWidth = 1.6 + r(i * 9) * 1.1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + lean * 0.5, by - h * 0.6, bx + lean, by - h);
    ctx.stroke();
  }
}

function drawLava(ctx: CanvasRenderingContext2D, t: TerrainTheme, v: number, S: number) {
  const r = (n: number) => hash2(v * 91 + n, v * 37 + n, 5);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, '#ffd27a');
  g.addColorStop(0.35, t.water[1]);
  g.addColorStop(1, t.water[0]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2, S * 0.5, S * 0.44, r(1) * 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawWater(ctx: CanvasRenderingContext2D, t: TerrainTheme, v: number, S: number) {
  const r = (n: number) => hash2(v * 13 + n, v * 97 + n, 9);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, t.water[1]);
  g.addColorStop(1, t.water[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const wy = 8 + i * 13 + r(i) * 5;
    ctx.beginPath();
    ctx.moveTo(4, wy);
    ctx.quadraticCurveTo(S / 2, wy - 3, S - 4, wy);
    ctx.stroke();
  }
}

/** 프롭 스프라이트를 만들어 캐시한다 */
function propSprite(kind: TileKind, theme: string, variant: number): HTMLCanvasElement | null {
  const key = `${kind}|${theme}|${variant}`;
  const hit = propCache.get(key);
  if (hit) return hit;

  const t = themeFor(theme);
  const S = TILE_SIZE;
  // 나무는 타일보다 높게 그려 겹치도록 한다
  const h = kind === 'tree' ? S * 1.5 : S;
  const { cv, ctx } = makeCanvas(S, h);
  ctx.translate(0, h - S);

  if (kind === 'tree') drawTree(ctx, t, variant, S);
  else if (kind === 'rock') drawRock(ctx, t, variant, S);
  else if (kind === 'tall-grass') drawBrush(ctx, t, variant, S);
  else if (kind === 'lava') drawLava(ctx, t, variant, S);
  else if (kind === 'water') drawWater(ctx, t, variant, S);
  else return null;

  propCache.set(key, cv);
  return cv;
}

/** 평지에 흩뿌리는 잔장식. 빈 벌판을 메운다. */
export function decorSprite(theme: string, variant: number): HTMLCanvasElement {
  const key = `decor|${theme}|${variant}`;
  const hit = propCache.get(key);
  if (hit) return hit;
  const t = themeFor(theme);
  const S = TILE_SIZE;
  const { cv, ctx } = makeCanvas(S, S);
  const r = (n: number) => hash2(variant * 61 + n, variant * 23 + n, 13);

  if (variant % 3 === 0) {
    // 작은 꽃무리
    const petal = ['#f0e2a8', '#e8a0b8', '#cfe0f5', '#f5c98a'][variant % 4];
    for (let i = 0; i < 3; i++) {
      const fx = 6 + r(i) * (S - 12);
      const fy = 10 + r(i + 5) * (S - 16);
      ctx.strokeStyle = shift(t.foliage[1], -0.1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 4);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.fillStyle = petal;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * 1.7, fy + Math.sin(a) * 1.7, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (variant % 3 === 1) {
    // 조약돌
    for (let i = 0; i < 3; i++) {
      const px = 5 + r(i * 3) * (S - 10);
      const py = 8 + r(i * 3 + 1) * (S - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath();
      ctx.ellipse(px, py + 1.5, 3.2, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shift(t.rock[1], -0.1);
      ctx.beginPath();
      ctx.ellipse(px, py, 3, 2.1, r(i) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 짧은 풀 포기
    ctx.strokeStyle = shift(t.brush[1], 0.05);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const bx = 4 + r(i * 4) * (S - 8);
      const by = S - 6 - r(i * 4 + 1) * 8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (r(i) - 0.5) * 4, by - 4 - r(i * 2) * 3);
      ctx.stroke();
    }
  }
  propCache.set(key, cv);
  return cv;
}

export function getProp(kind: TileKind, theme: string, x: number, y: number): HTMLCanvasElement | null {
  if (!TILES[kind]) return null;
  const variant = Math.floor(hash2(x, y, 1) * PROP_VARIANTS);
  return propSprite(kind, theme, variant);
}

/* ─────────── 바닥 레이어 ─────────── */

const groundCache = new Map<string, HTMLCanvasElement>();

/**
 * 바닥은 큰 타일 하나를 미리 그려 반복해서 깐다. 노이즈 얼룩을 넣어
 * 32px 격자가 드러나지 않게 하고, 반복 주기를 타일 크기의 배수가 아닌
 * 값으로 잡아 패턴이 눈에 띄지 않게 한다.
 */
export function groundPattern(theme: string, kind: 'ground' | 'path'): HTMLCanvasElement {
  const key = `${theme}|${kind}`;
  const hit = groundCache.get(key);
  if (hit) return hit;

  const t = themeFor(theme);
  const [c0, c1] = kind === 'path' ? t.path : t.ground;
  const S = 256;
  const { cv, ctx } = makeCanvas(S, S);

  ctx.fillStyle = c0;
  ctx.fillRect(0, 0, S, S);

  /**
   * 얼룩은 반드시 상하좌우로 이어져야 한다. 타일 안쪽에만 그리면 반복할 때
   * 이음매가 격자로 드러난다(첫 구현에서 실제로 그렇게 보였다).
   * 같은 얼룩을 ±S로 아홉 번 찍어 경계를 넘어가게 만든다.
   */
  const wrapped = (draw: (ox: number, oy: number) => void) => {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) draw(ox * S, oy * S);
  };

  // 넓고 아주 옅은 색조 변화
  for (let i = 0; i < 26; i++) {
    const rx = hash2(i, 1, 21) * S;
    const ry = hash2(i, 2, 22) * S;
    const rr = 40 + hash2(i, 3, 23) * 60;
    const up = hash2(i, 4, 24) > 0.5;
    wrapped((ox, oy) => {
      const g = ctx.createRadialGradient(rx + ox, ry + oy, 0, rx + ox, ry + oy, rr);
      g.addColorStop(0, up ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(rx + ox, ry + oy, rr, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 잔디 결: 짧은 획을 흩뿌려 면이 비어 보이지 않게 한다
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const rx = hash2(i, 5, 31) * S;
    const ry = hash2(i, 6, 32) * S;
    const len = 2 + hash2(i, 7, 33) * 4;
    const ang = hash2(i, 8, 34) * Math.PI;
    const light = hash2(i, 9, 35);
    ctx.strokeStyle =
      light > 0.62
        ? mix(c0, c1, 0.9)
        : light > 0.3
          ? mix(c0, c1, 0.45)
          : `rgba(0,0,0,0.07)`;
    ctx.lineWidth = 1;
    wrapped((ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(rx + ox, ry + oy);
      ctx.lineTo(rx + ox + Math.cos(ang) * len, ry + oy + Math.sin(ang) * len);
      ctx.stroke();
    });
  }

  groundCache.set(key, cv);
  return cv;
}

export { shift as shiftColor, mix as mixColor };
