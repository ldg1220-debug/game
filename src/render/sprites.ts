/**
 * 스프라이트.
 *
 * 외부 이미지 없이 캔버스 도형으로 조립한다. 이미지 파일을 쓰지 않는 건 제약이
 * 아니라 선택이다 — 24종에 8방향에 동작까지 그리면 수백 장이고, 그 수백 장이
 * 어긋나기 시작하면 손댈 수가 없다. 도형으로 짜면 종이 늘어도 골격 표에 한 줄
 * 붙는 것으로 끝난다.
 *
 * 대신 종마다 다 다르게 생기지는 못한다. 그래서 골격(form)을 여덟 가지로 나누고,
 * 색은 속성 + 종 id로 흔든다. 같은 골격이라도 색이 다르고, 같은 속성이면 색조가
 * 붙어 있다.
 *
 * **여기서도 상태는 안 만진다.** 전부 인자로 받은 값만 읽는다.
 */

import type { ElementPair, PetForm } from '../engine/types';
import { facesCamera, type ScreenDir } from './iso';
import { hashId, hsl, speciesPalette, type HumanPalette, type Palette } from './palette';

const TAU = Math.PI * 2;

/* ─────────────── 공통 도구 ─────────────── */

function ell(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
  g.fill();
}

function tri(g: CanvasRenderingContext2D, pts: readonly [number, number][]): void {
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.closePath();
  g.fill();
}

/** 굵기가 변하는 선. 목·꼬리·다리처럼 끝이 가늘어지는 부분에 쓴다. */
function taper(
  g: CanvasRenderingContext2D,
  path: (t: number) => [number, number],
  r0: number,
  r1: number,
  fill: string,
  steps = 14,
): void {
  g.fillStyle = fill;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = path(t);
    const r = r0 + (r1 - r0) * t;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
}

/** 발밑 그림자. 이게 없으면 모든 것이 공중에 뜬 스티커처럼 보인다. */
export function groundShadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.3): void {
  g.fillStyle = `rgba(0,0,0,${a})`;
  ell(g, x, y, rx, ry);
}

/**
 * 효과를 입혀 그린다.
 *
 * 피격 섬광은 실루엣 그대로 물들여야 한다. 사각형을 덮으면 몸 밖까지 번져
 * 스프라이트가 상자로 보인다. 그래서 별도 캔버스에 그린 뒤 `source-atop`으로
 * 칠하고 옮겨 붙인다.
 *
 * 효과가 없을 때는 그 캔버스를 아예 거치지 않는다 — 대부분의 프레임이 그렇고,
 * 복사 한 번이 6마리 × 60프레임이면 공짜가 아니다.
 */
let scratch: HTMLCanvasElement | null = null;
let outlineBuf: HTMLCanvasElement | null = null;

/** 외곽선 색. 원작 도트 스프라이트가 그렇듯 검정에 가까운 한 겹을 두른다. */
const OUTLINE = 'rgba(14,12,20,0.9)';

export interface SpriteFx {
  /** 실루엣을 물들일 색 */
  tint?: string | null;
  tintAlpha?: number;
  alpha?: number;
  /** 라디안. 쓰러진 개체를 눕힐 때 쓴다. */
  rotate?: number;
}

function ensure(ref: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = ref ?? document.createElement('canvas');
  if (c.width < w) c.width = w;
  if (c.height < h) c.height = h;
  return c;
}

/**
 * 외곽선을 두르고 효과를 입혀 그린다.
 *
 * 두 가지를 여기서 함께 처리한다.
 *
 * **외곽선.** 도형만 쌓으면 초록 펫이 초록 풀밭에, 회색 골렘이 회색 석판 위에
 * 묻힌다. 실제로 그렇게 나왔다. 도형마다 stroke를 거는 방법은 도형이 수십 개라
 * 반드시 몇 개를 빠뜨리고, 빠뜨린 곳만 테두리가 없어 더 이상해 보인다. 그래서
 * 완성된 실루엣을 어둡게 물들여 여덟 방향으로 한 픽셀씩 깔고 그 위에 원본을
 * 얹는다 — 어떤 도형을 추가해도 자동으로 테두리가 생긴다.
 *
 * **피격 섬광.** 같은 이유로 실루엣 그대로 물들여야 한다. 사각형을 덮으면 몸
 * 밖까지 번져 스프라이트가 상자로 보인다.
 */
function withFx(
  g: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  fx: SpriteFx,
  draw: (c: CanvasRenderingContext2D) => void,
): void {
  const W = Math.ceil(w);
  const H = Math.ceil(h);
  scratch = ensure(scratch, W, H);
  outlineBuf = ensure(outlineBuf, W, H);
  const c = scratch.getContext('2d');
  const o = outlineBuf.getContext('2d');
  if (!c || !o) return;
  c.clearRect(0, 0, scratch.width, scratch.height);
  o.clearRect(0, 0, outlineBuf.width, outlineBuf.height);

  // 스크래치 안에서의 원점. 로컬 좌표는 위·좌우로 뻗으므로 가운데 아래쯤에 둔다.
  const lx = W / 2;
  const ly = H * 0.82;
  c.save();
  c.translate(lx, ly);
  draw(c);
  c.restore();

  if (fx.tint) {
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.globalAlpha = fx.tintAlpha ?? 0.5;
    c.fillStyle = fx.tint;
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  // 어두운 실루엣을 만든다
  o.drawImage(scratch, 0, 0, W, H, 0, 0, W, H);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = OUTLINE;
  o.fillRect(0, 0, W, H);
  o.globalCompositeOperation = 'source-over';

  g.save();
  g.globalAlpha = fx.alpha ?? 1;
  g.translate(ox, oy);
  if (fx.rotate) g.rotate(fx.rotate);
  for (const [dx, dy] of OUTLINE_OFFSETS) {
    g.drawImage(outlineBuf, 0, 0, W, H, -lx + dx, -ly + dy, W, H);
  }
  g.drawImage(scratch, 0, 0, W, H, -lx, -ly, W, H);
  g.restore();
}

const OUTLINE_OFFSETS: readonly [number, number][] = [
  [-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/* ─────────────── 펫 ─────────────── */

export interface CreatureOptions {
  speciesId: string;
  form: PetForm;
  element: ElementPair;
  /** 발이 닿는 지점 */
  x: number;
  y: number;
  /** 어깨높이 기준 크기(px). 실제 그림은 이보다 위아래로 더 뻗는다. */
  u: number;
  /** 왼쪽을 보게 한다. 적 진영은 왼쪽, 아군은 오른쪽을 본다. */
  flip?: boolean;
  /** 애니메이션 시각(ms) */
  t?: number;
  /** 0이면 가만히, 1이면 최대로 걷는다 */
  walk?: number;
  fainted?: boolean;
  fx?: SpriteFx;
}

/**
 * 종 고유의 체형 흔들림.
 *
 * 같은 골격을 쓰는 종이 일곱이나 되다 보니, 색만 다르고 몸은 판박이였다. 종
 * id에서 뽑은 이 세 값으로 길이·키·머리 크기를 조금씩 흔들면 늑대는 길쭉하고
 * 두더지는 뭉툭해진다. 밸런스와는 무관하고 종마다 고정이다.
 */
export interface Jitter {
  /** 몸통 길이 */
  long: number;
  /** 다리 길이(어깨 높이) */
  tall: number;
  /** 머리 크기 */
  head: number;
}

type FormDrawer = (g: CanvasRenderingContext2D, u: number, p: Palette, ph: number, t: number, j: Jitter) => void;

/** 다리 하나. 걸음에 따라 앞뒤로 흔든다. */
function leg(g: CanvasRenderingContext2D, x: number, top: number, w: number, swing: number, col: string): void {
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, top);
  g.lineTo(x + swing, 0);
  g.stroke();
}

/**
 * 네발 짐승. 여우·늑대·멧돼지·수달·토끼·두더지, 그리고 뿔을 얹으면 소와 사슴.
 *
 * 골격을 하나로 두고 옵션으로 가르는 이유는, 종마다 함수를 따로 두면 같은
 * 수정(예: 다리 흔들기 위상)을 일곱 군데에 해야 하고 한 군데를 반드시 빠뜨리기
 * 때문이다.
 */
function beast(opt: { bulk: number; horns: 'ox' | 'antler' | null; ear: 'point' | 'long' | 'round'; tail: 'bush' | 'tuft' }): FormDrawer {
  return (g, u, p, ph, t, j) => {
    const b = opt.bulk * (1 + j.long * 0.12);
    const sw = Math.sin(ph * TAU) * u * 0.16;
    const bob = Math.sin(t / 460) * u * 0.015;
    // 어깨 높이 = 다리 길이. 늑대는 높고 두더지는 낮다.
    const bodyY = -u * (0.56 + j.tall * 0.07) + bob;
    const hr = 1 + j.head * 0.15;

    // 뒷다리를 먼저 — 몸통에 가려져야 깊이가 생긴다
    leg(g, -u * 0.34, bodyY + u * 0.16, u * 0.11 * b, -sw, p.dark);
    leg(g, u * 0.3, bodyY + u * 0.16, u * 0.11 * b, sw, p.dark);

    g.fillStyle = p.body;
    ell(g, 0, bodyY, u * 0.58 * b, u * 0.31 * b);
    g.fillStyle = p.dark;
    ell(g, -u * 0.4 * b, bodyY - u * 0.02, u * 0.28 * b, u * 0.28 * b);
    g.fillStyle = p.belly;
    ell(g, 0, bodyY + u * 0.16 * b, u * 0.4 * b, u * 0.12 * b);

    // 꼬리
    if (opt.tail === 'bush') {
      taper(g, (s) => [-u * (0.5 + s * 0.42) * b, bodyY - u * s * s * 0.5], u * 0.1, u * 0.16, p.light, 10);
    } else {
      taper(g, (s) => [-u * (0.5 + s * 0.3) * b, bodyY - u * s * 0.34], u * 0.07, u * 0.02, p.dark, 8);
    }

    // 앞다리
    leg(g, -u * 0.14, bodyY + u * 0.16, u * 0.11 * b, sw, p.body);
    leg(g, u * 0.44, bodyY + u * 0.16, u * 0.11 * b, -sw, p.body);

    g.fillStyle = p.body;
    ell(g, u * 0.42 * b, bodyY - u * 0.04, u * 0.26 * b, u * 0.26 * b);

    // 목과 머리
    const hx = u * 0.72 * b;
    const hy = bodyY - u * 0.24;
    taper(g, (s) => [u * (0.42 + s * 0.3) * b, bodyY - u * s * 0.2], u * 0.17 * b, u * 0.15 * b, p.body, 6);
    g.fillStyle = p.body;
    ell(g, hx, hy, u * 0.22 * hr, u * 0.2 * hr);
    g.fillStyle = p.belly;
    ell(g, hx + u * 0.19, hy + u * 0.05, u * 0.14, u * 0.1);
    g.fillStyle = p.dark;
    ell(g, hx + u * 0.31, hy + u * 0.04, u * 0.045, u * 0.04);

    // 귀
    g.fillStyle = p.dark;
    if (opt.ear === 'long') {
      for (const s of [-1, 1]) {
        const ex = hx - u * 0.06 + s * u * 0.07;
        ell(g, ex, hy - u * 0.34, u * 0.06, u * 0.28, s * 0.22);
        g.fillStyle = p.belly;
        ell(g, ex + s * u * 0.01, hy - u * 0.36, u * 0.03, u * 0.19, s * 0.22);
        g.fillStyle = p.dark;
      }
    } else if (opt.ear === 'round') {
      for (const s of [-1, 1]) ell(g, hx - u * 0.1 + s * u * 0.06, hy - u * 0.17, u * 0.08, u * 0.07);
    } else {
      tri(g, [
        [hx - u * 0.14, hy - u * 0.12],
        [hx - u * 0.06, hy - u * 0.36],
        [hx + u * 0.06, hy - u * 0.13],
      ]);
      tri(g, [
        [hx + u * 0.04, hy - u * 0.13],
        [hx + u * 0.14, hy - u * 0.32],
        [hx + u * 0.2, hy - u * 0.08],
      ]);
    }

    // 뿔
    if (opt.horns === 'ox') {
      g.strokeStyle = p.accent;
      g.lineWidth = u * 0.07;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(hx - u * 0.04, hy - u * 0.14);
        g.quadraticCurveTo(hx + s * u * 0.06 - u * 0.16, hy - u * 0.38, hx + u * 0.16 * s, hy - u * 0.42);
        g.stroke();
      }
    } else if (opt.horns === 'antler') {
      g.strokeStyle = p.accent;
      g.lineWidth = u * 0.045;
      g.lineCap = 'round';
      for (const s of [-1, 1]) {
        const bx = hx - u * 0.06 + s * u * 0.07;
        g.beginPath();
        g.moveTo(bx, hy - u * 0.16);
        g.lineTo(bx - u * 0.06, hy - u * 0.52);
        g.moveTo(bx - u * 0.04, hy - u * 0.32);
        g.lineTo(bx + u * 0.14, hy - u * 0.42);
        g.moveTo(bx - u * 0.05, hy - u * 0.44);
        g.lineTo(bx - u * 0.2, hy - u * 0.5);
        g.stroke();
      }
    }

    // 눈
    g.fillStyle = '#14121a';
    ell(g, hx + u * 0.11, hy - u * 0.04, u * 0.036, u * 0.045);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    ell(g, hx + u * 0.125, hy - u * 0.06, u * 0.014, u * 0.016);
  };
}

/** 등딱지. 거북과 달팽이. */
const shell: FormDrawer = (g, u, p, ph, t) => {
  const sw = Math.sin(ph * TAU) * u * 0.07;
  const bob = Math.sin(t / 620) * u * 0.012;
  const bodyY = -u * 0.3 + bob;

  for (const [x, s] of [[-u * 0.3, -1], [u * 0.28, 1]] as const) {
    leg(g, x, bodyY + u * 0.1, u * 0.12, sw * s, p.dark);
  }
  g.fillStyle = p.belly;
  ell(g, 0, bodyY + u * 0.02, u * 0.5, u * 0.2);

  // 머리
  const hx = u * 0.6;
  const hy = bodyY - u * 0.06;
  g.fillStyle = p.body;
  ell(g, hx, hy, u * 0.19, u * 0.16);
  g.fillStyle = p.dark;
  ell(g, hx + u * 0.15, hy + u * 0.03, u * 0.05, u * 0.04);

  // 등딱지 — 이 골격의 얼굴이다. 크고 확실하게.
  g.fillStyle = p.accent;
  g.beginPath();
  g.ellipse(-u * 0.02, bodyY - u * 0.04, u * 0.56, u * 0.44, 0, Math.PI, TAU);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.ellipse(-u * 0.16, bodyY - u * 0.16, u * 0.2, u * 0.14, -0.5, Math.PI, TAU);
  g.closePath();
  g.fill();

  // 판 무늬. 셋이면 등딱지로도 소용돌이로도 읽힌다.
  g.strokeStyle = p.dark;
  g.lineWidth = Math.max(1, u * 0.03);
  for (const r of [0.2, 0.36, 0.5]) {
    g.beginPath();
    g.ellipse(-u * 0.02, bodyY - u * 0.04, u * r, u * r * 0.78, 0, Math.PI, TAU);
    g.stroke();
  }

  g.fillStyle = '#14121a';
  ell(g, hx + u * 0.07, hy - u * 0.04, u * 0.032, u * 0.04);
  // 앞다리는 등딱지 앞에 온다
  leg(g, u * 0.34, bodyY + u * 0.08, u * 0.12, -sw, p.body);
};

/** 목이 긴 거수. 원작 화면의 그 공룡들이다. */
const saurian: FormDrawer = (g, u, p, ph, t) => {
  const sw = Math.sin(ph * TAU) * u * 0.13;
  const bob = Math.sin(t / 520) * u * 0.018;
  const bodyY = -u * 0.66 + bob;

  leg(g, -u * 0.3, bodyY + u * 0.2, u * 0.16, -sw, p.dark);
  leg(g, u * 0.26, bodyY + u * 0.2, u * 0.16, sw, p.dark);

  // 꼬리 — 몸통만큼 길어야 실루엣이 산다
  taper(g, (s) => [-u * (0.55 + s * 0.75), bodyY + u * 0.14 - u * s * s * 0.36], u * 0.17, u * 0.025, p.body, 18);

  g.fillStyle = p.body;
  ell(g, 0, bodyY, u * 0.62, u * 0.36);
  g.fillStyle = p.belly;
  ell(g, 0, bodyY + u * 0.2, u * 0.44, u * 0.14);

  leg(g, -u * 0.1, bodyY + u * 0.2, u * 0.16, sw, p.body);
  leg(g, u * 0.44, bodyY + u * 0.2, u * 0.16, -sw, p.body);

  // 목
  const hx = u * 0.92;
  const hy = bodyY - u * 0.86;
  taper(
    g,
    (s) => [u * (0.44 + s * 0.48), bodyY - u * (0.16 + s * 0.72) + u * s * (1 - s) * 0.18],
    u * 0.19,
    u * 0.11,
    p.body,
    16,
  );

  // 등판 — 스테고사우루스 쪽 실루엣을 빌린다
  g.fillStyle = p.accent;
  for (let i = 0; i < 5; i++) {
    const s = i / 4;
    const x = -u * 0.5 + s * u * 0.9;
    const h = u * (0.16 + Math.sin(s * Math.PI) * 0.16);
    tri(g, [
      [x - u * 0.09, bodyY - u * 0.3],
      [x, bodyY - u * 0.3 - h],
      [x + u * 0.09, bodyY - u * 0.3],
    ]);
  }

  g.fillStyle = p.body;
  ell(g, hx, hy, u * 0.19, u * 0.14, -0.25);
  g.fillStyle = p.belly;
  ell(g, hx + u * 0.15, hy + u * 0.04, u * 0.1, u * 0.07);
  g.fillStyle = '#14121a';
  ell(g, hx + u * 0.06, hy - u * 0.04, u * 0.032, u * 0.04);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  ell(g, hx + u * 0.072, hy - u * 0.055, u * 0.012, u * 0.014);
};

/** 뱀·도롱뇽·이무기. 몸을 S자로 흘린다. */
const serpent: FormDrawer = (g, u, p, ph, t) => {
  const wave = t / 360 + ph * TAU;
  const path = (s: number): [number, number] => [
    -u * 0.95 + s * u * 1.8,
    -u * 0.3 - Math.sin(s * Math.PI * 1.8 + wave) * u * 0.24 - s * u * 0.34,
  ];

  // 몸통을 원 사슬로 잇는다. 곡선을 따라 굵기를 바꾸기에 가장 단순한 방법이고,
  // 마디가 겹쳐 있어 이음매가 보이지 않는다.
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const [x, y] = path(s);
    const r = u * (0.05 + Math.sin(Math.min(1, s * 1.15) * Math.PI) * 0.15);
    g.fillStyle = p.body;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    if (i % 3 === 0 && s > 0.15) {
      g.fillStyle = p.accent;
      ell(g, x, y - r * 0.45, r * 0.36, r * 0.2);
    }
  }

  const [hx, hy] = path(1);
  g.fillStyle = p.body;
  ell(g, hx + u * 0.06, hy - u * 0.02, u * 0.2, u * 0.14, -0.2);
  g.fillStyle = p.belly;
  ell(g, hx + u * 0.19, hy + u * 0.03, u * 0.1, u * 0.07);

  // 볼 지느러미 — 도롱뇽과 이무기를 한 골격으로 쓰기 위한 절충
  g.fillStyle = p.accent;
  for (const s of [-1, 1]) {
    tri(g, [
      [hx - u * 0.02, hy + s * u * 0.04],
      [hx - u * 0.24, hy + s * u * 0.2],
      [hx - u * 0.16, hy + s * u * 0.02],
    ]);
  }

  g.fillStyle = '#14121a';
  ell(g, hx + u * 0.09, hy - u * 0.05, u * 0.034, u * 0.042);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  ell(g, hx + u * 0.1, hy - u * 0.066, u * 0.013, u * 0.015);
};

/**
 * 가오리. 땅에 발을 붙이지 않는다.
 *
 * 처음엔 꼭짓점 넷짜리 연 모양으로 그렸더니 화살표가 됐다. 가오리는 폭이 길이의
 * 1.6배쯤 되는 **납작한** 마름모라서, 옆으로 충분히 벌리지 않으면 가오리로 안
 * 보인다. 아래로 처지는 날개 끝이 펄럭이는 게 나머지 절반이다.
 */
const ray: FormDrawer = (g, u, p, ph, t) => {
  const flap = Math.sin(t / 380 + ph * TAU);
  const cy = -u * 0.66 + Math.sin(t / 760) * u * 0.05;
  const span = u * 1.15;

  const wing = (fill: string, k: number) => {
    g.fillStyle = fill;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(u * 0.5 * k, cy);
      // 앞쪽 가장자리는 완만하게, 뒤쪽은 오목하게 — 가오리 날개의 윤곽이다
      g.quadraticCurveTo(u * 0.28 * k, cy + s * span * 0.34, -u * 0.05, cy + s * span * (0.5 + flap * 0.1));
      g.quadraticCurveTo(-u * 0.34, cy + s * span * 0.24, -u * 0.5 * k, cy + s * u * 0.05);
      g.closePath();
      g.fill();
    }
  };

  wing(p.body, 1);
  g.save();
  g.translate(0, -u * 0.03);
  wing(p.light, 0.82);
  g.restore();

  // 몸통 능선
  g.fillStyle = p.dark;
  ell(g, u * 0.02, cy, u * 0.36, u * 0.15);
  g.fillStyle = p.belly;
  ell(g, u * 0.16, cy - u * 0.01, u * 0.18, u * 0.09);

  // 무늬 — 날개 위 점무늬가 가오리다움을 더한다
  g.fillStyle = p.accent;
  for (const s of [-1, 1]) {
    for (const d of [0.26, 0.46, 0.64]) {
      ell(g, u * (0.2 - d * 0.7), cy + s * span * d * 0.5, u * 0.055, u * 0.035);
    }
  }

  taper(g, (s) => [-u * (0.45 + s * 1.0), cy - u * s * 0.16], u * 0.045, u * 0.01, p.dark, 14);
  // 꼬리 가시
  g.fillStyle = p.accent;
  tri(g, [
    [-u * 0.95, cy - u * 0.1],
    [-u * 1.16, cy - u * 0.2],
    [-u * 0.98, cy - u * 0.02],
  ]);

  g.fillStyle = '#14121a';
  for (const s of [-1, 1]) ell(g, u * 0.3, cy + s * u * 0.08, u * 0.032, u * 0.034);
};

/** 새. 참새·매·불꽃깃새. */
const bird: FormDrawer = (g, u, p, ph, t, j) => {
  const flap = Math.sin(t / 220 + ph * TAU);
  const bob = Math.sin(t / 400) * u * 0.02;
  const bodyY = -u * (0.56 + j.tall * 0.08) + bob;
  const fat = 1 + j.long * 0.14;

  g.strokeStyle = p.accent;
  g.lineWidth = u * 0.05;
  g.lineCap = 'round';
  for (const x of [-u * 0.08, u * 0.1]) {
    g.beginPath();
    g.moveTo(x, bodyY + u * 0.2);
    g.lineTo(x + u * 0.03, 0);
    g.moveTo(x + u * 0.03, 0);
    g.lineTo(x + u * 0.14, 0);
    g.stroke();
  }

  // 꽁지
  g.fillStyle = p.dark;
  for (const a of [-0.3, 0, 0.3]) {
    tri(g, [
      [-u * 0.3, bodyY - u * 0.02],
      [-u * 0.92, bodyY - u * 0.2 + a * u * 0.5],
      [-u * 0.34, bodyY + u * 0.12],
    ]);
  }

  g.fillStyle = p.body;
  ell(g, 0, bodyY, u * 0.4 * fat, u * 0.32 * fat, -0.16);
  g.fillStyle = p.belly;
  ell(g, u * 0.08, bodyY + u * 0.12, u * 0.24, u * 0.17);

  // 날개 — 살짝 들썩이게 한다
  g.save();
  g.translate(-u * 0.04, bodyY - u * 0.04);
  g.rotate(-0.25 + flap * 0.16);
  g.fillStyle = p.dark;
  ell(g, -u * 0.06, 0, u * 0.36, u * 0.17);
  g.fillStyle = p.accent;
  ell(g, -u * 0.16, u * 0.02, u * 0.18, u * 0.08);
  g.restore();

  const hx = u * 0.36;
  const hy = bodyY - u * 0.34;
  g.fillStyle = p.body;
  ell(g, hx, hy, u * 0.21, u * 0.2);

  // 볏
  g.fillStyle = p.accent;
  for (const a of [-0.5, -0.1, 0.3]) {
    tri(g, [
      [hx - u * 0.06, hy - u * 0.14],
      [hx - u * 0.1 + Math.sin(a) * u * 0.3, hy - u * 0.44 - a * u * 0.1],
      [hx + u * 0.06, hy - u * 0.12],
    ]);
  }

  // 부리
  g.fillStyle = p.accent;
  tri(g, [
    [hx + u * 0.14, hy - u * 0.04],
    [hx + u * 0.44, hy + u * 0.02],
    [hx + u * 0.14, hy + u * 0.09],
  ]);

  g.fillStyle = '#14121a';
  ell(g, hx + u * 0.07, hy - u * 0.03, u * 0.04, u * 0.045);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  ell(g, hx + u * 0.084, hy - u * 0.048, u * 0.015, u * 0.017);
};

/** 바위 거인. 유일하게 두 발로 선다. */
const golem: FormDrawer = (g, u, p, ph, t) => {
  const sw = Math.sin(ph * TAU) * u * 0.1;
  const bob = Math.sin(t / 560) * u * 0.02;
  const hipY = -u * 0.52 + bob;

  const block = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x - w / 2, y, w, h, u * 0.05);
    g.fill();
  };

  block(-u * 0.18 + sw * 0.4, hipY, u * 0.24, u * 0.54, p.dark);
  block(u * 0.18 - sw * 0.4, hipY, u * 0.24, u * 0.54, p.dark);

  // 몸통 — 어깨가 넓고 허리가 좁아야 거인으로 읽힌다
  g.fillStyle = p.body;
  g.beginPath();
  g.moveTo(-u * 0.46, hipY - u * 0.66);
  g.lineTo(u * 0.46, hipY - u * 0.66);
  g.lineTo(u * 0.26, hipY + u * 0.04);
  g.lineTo(-u * 0.26, hipY + u * 0.04);
  g.closePath();
  g.fill();
  g.fillStyle = p.light;
  g.beginPath();
  g.moveTo(-u * 0.46, hipY - u * 0.66);
  g.lineTo(0, hipY - u * 0.66);
  g.lineTo(0, hipY + u * 0.04);
  g.lineTo(-u * 0.26, hipY + u * 0.04);
  g.closePath();
  g.fill();

  // 팔과 주먹
  for (const s of [-1, 1] as const) {
    const ax = s * u * 0.5;
    block(ax, hipY - u * 0.62, u * 0.2, u * 0.5 + s * sw, s < 0 ? p.dark : p.body);
    g.fillStyle = p.accent;
    ell(g, ax, hipY - u * 0.06 + s * sw, u * 0.16, u * 0.15);
  }

  // 어깨 바위
  g.fillStyle = p.accent;
  for (const s of [-1, 1]) {
    tri(g, [
      [s * u * 0.3, hipY - u * 0.66],
      [s * u * 0.56, hipY - u * 0.82],
      [s * u * 0.58, hipY - u * 0.6],
    ]);
  }

  const hy = hipY - u * 0.82;
  g.fillStyle = p.body;
  g.beginPath();
  g.roundRect(-u * 0.17, hy - u * 0.3, u * 0.34, u * 0.34, u * 0.06);
  g.fill();
  g.fillStyle = hsl(40, 90, 62);
  for (const s of [-1, 1]) ell(g, s * u * 0.08, hy - u * 0.14, u * 0.045, u * 0.035);
};

const FORM_DRAWERS: Record<PetForm, FormDrawer> = {
  beast: beast({ bulk: 1, horns: null, ear: 'point', tail: 'bush' }),
  horned: beast({ bulk: 1.18, horns: 'ox', ear: 'round', tail: 'tuft' }),
  shell,
  saurian,
  serpent,
  ray,
  bird,
  golem,
};

/** 사슴은 소와 뿔이 달라야 한다. 골격은 같고 부속만 바꾼다. */
const ANTLERED = beast({ bulk: 1.06, horns: 'antler', ear: 'long', tail: 'tuft' });
const LONG_EARED = beast({ bulk: 0.92, horns: null, ear: 'long', tail: 'bush' });

/** 종 하나가 골격 기본형과 다른 부속을 쓸 때. 표현일 뿐이라 여기 둔다. */
const SPECIES_OVERRIDE: Record<string, FormDrawer> = {
  whirlstag: ANTLERED,
  meadowhare: LONG_EARED,
};

export function drawCreature(g: CanvasRenderingContext2D, o: CreatureOptions): void {
  const u = o.u;
  const t = o.t ?? 0;
  const pal = speciesPalette(o.speciesId, o.element);
  const drawer = SPECIES_OVERRIDE[o.speciesId] ?? FORM_DRAWERS[o.form] ?? FORM_DRAWERS.beast;

  // 종마다 걸음 위상을 어긋나게 한다. 여섯 마리가 발을 맞춰 흔들면 군무가 된다.
  const n = hashId(o.speciesId);
  const offset = (n % 1000) / 1000;
  const ph = o.walk ? (t / 420 + offset) % 1 : offset;

  // 체형도 종 id에서 뽑는다. 색과 같은 출처라 새로고침해도 안 변한다.
  const jitter: Jitter = {
    long: (((n >>> 5) & 255) / 255) * 2 - 1,
    tall: (((n >>> 13) & 255) / 255) * 2 - 1,
    head: (((n >>> 21) & 255) / 255) * 2 - 1,
  };

  const shadowR = u * (o.form === 'saurian' ? 0.8 : o.form === 'serpent' ? 0.9 : 0.62);
  groundShadow(g, o.x, o.y, shadowR, shadowR * 0.28, o.fainted ? 0.14 : 0.3);

  const fx: SpriteFx = { ...(o.fx ?? {}) };
  if (o.fainted) {
    fx.alpha = (fx.alpha ?? 1) * 0.4;
    fx.rotate = (fx.rotate ?? 0) + Math.PI * 0.42;
  }

  withFx(g, o.x, o.y, u * 4.2, u * 3.4, fx, (c) => {
    if (o.flip) c.scale(-1, 1);
    drawer(c, u, pal, ph, t, jitter);
  });
}

/* ─────────────── 사람 ─────────────── */

export interface HumanOptions {
  x: number;
  y: number;
  /** 키(px) */
  u: number;
  dir: ScreenDir;
  pal: HumanPalette;
  t?: number;
  walking?: boolean;
  /** 로브를 입힌다. 촌장·상인처럼 마을 사람과 갈라 보이게 할 때. */
  robe?: boolean;
  /** 등에 멘 곤봉. 플레이어를 마을 사람과 구분하는 표시다. */
  club?: boolean;
  fx?: SpriteFx;
}

/**
 * 화면 방향 → 몸을 얼마나 돌렸는가. -1은 완전히 왼쪽, +1은 완전히 오른쪽.
 *
 * 처음엔 이 값 하나로 눈 위치와 몸 너비만 조금씩 바꿨다. 여덟 방향을 나란히
 * 놓고 보니 전부 똑같아 보였다 — 46px짜리 캐릭터에서 2px 움직인 눈은 방향이
 * 아니다. 그래서 지금은 (1) 앞/옆/뒤로 머리를 통째로 다르게 그리고, (2) 몸통
 * 너비를 크게 줄이고, (3) 팔 위치를 옮긴다.
 */
const TURN: Record<ScreenDir, number> = { s: 0, se: 0.6, e: 1, ne: 0.6, n: 0, nw: -0.6, w: -1, sw: -0.6 };

export function drawHuman(g: CanvasRenderingContext2D, o: HumanOptions): void {
  const u = o.u;
  const t = o.t ?? 0;
  const p = o.pal;
  const front = facesCamera(o.dir);
  const back = o.dir === 'n' || o.dir === 'ne' || o.dir === 'nw';
  const turn = TURN[o.dir];
  const side = Math.abs(turn) > 0.9;
  const ph = o.walking ? (t / 320) % 1 : 0;
  const swing = o.walking ? Math.sin(ph * TAU) * u * 0.15 : 0;
  const bob = o.walking ? Math.abs(Math.cos(ph * TAU)) * u * 0.016 : Math.sin(t / 900) * u * 0.007;

  groundShadow(g, o.x, o.y, u * 0.26, u * 0.09, 0.32);

  withFx(g, o.x, o.y, u * 2.6, u * 2.2, o.fx ?? {}, (c) => {
    // 옆을 볼수록 몸이 좁아진다. 이 폭 차이가 방향을 읽는 가장 큰 단서다.
    const narrow = 1 - Math.abs(turn) * 0.42;
    const hipY = -u * 0.38 - bob;
    const shoulderY = -u * 0.64 - bob;
    const headR = u * 0.155;
    // 머리를 어깨에서 조금 띄운다. 붙여 놓으면 목이 없어 웅크린 것처럼 보인다.
    const headY = -u * 0.84 - bob;
    const hx = turn * u * 0.05;

    /* ── 다리 ── */
    c.lineCap = 'round';
    c.strokeStyle = p.clothShade;
    c.lineWidth = u * 0.105;
    c.beginPath();
    c.moveTo(-u * 0.07 * narrow, hipY);
    c.lineTo(-u * 0.07 * narrow - swing, 0);
    c.stroke();
    c.strokeStyle = p.cloth;
    c.beginPath();
    c.moveTo(u * 0.07 * narrow, hipY);
    c.lineTo(u * 0.07 * narrow + swing, 0);
    c.stroke();

    /* ── 뒤쪽 팔 ── */
    c.strokeStyle = p.skinShade;
    c.lineWidth = u * 0.075;
    c.beginPath();
    c.moveTo(-u * 0.26 * narrow, shoulderY + u * 0.06);
    c.lineTo(-u * 0.25 * narrow + swing * 0.8, hipY + u * 0.05);
    c.stroke();

    // 등에 멘 곤봉은 몸통보다 먼저 — 뒤에 있어야 한다
    if (o.club && !front) {
      c.strokeStyle = '#6b4a2c';
      c.lineWidth = u * 0.062;
      c.beginPath();
      c.moveTo(u * 0.2, shoulderY - u * 0.02);
      c.lineTo(-u * 0.16, hipY + u * 0.16);
      c.stroke();
      c.fillStyle = '#8a6b4a';
      ell(c, -u * 0.18, hipY + u * 0.18, u * 0.065, u * 0.065);
    }

    /* ── 몸통 ── */
    // 어깨는 넓고 허리는 좁다. 같은 폭이면 사람이 아니라 상자가 된다.
    const sw2 = u * 0.23 * narrow;
    const hw2 = u * (o.robe ? 0.33 : 0.17) * narrow;

    // 목
    c.fillStyle = p.skinShade;
    c.fillRect(hx - u * 0.05, shoulderY - u * 0.07, u * 0.1, u * 0.09);
    const bot = hipY + u * (o.robe ? 0.3 : 0.05);
    c.fillStyle = p.cloth;
    c.beginPath();
    c.moveTo(-sw2, shoulderY);
    c.lineTo(sw2, shoulderY);
    c.lineTo(hw2, bot);
    c.lineTo(-hw2, bot);
    c.closePath();
    c.fill();
    // 오른쪽 절반에 그늘. 빛이 늘 왼쪽 위에서 온다고 정해두면 화면이 안정된다.
    c.fillStyle = p.clothShade;
    c.beginPath();
    c.moveTo(0, shoulderY);
    c.lineTo(sw2, shoulderY);
    c.lineTo(hw2, bot);
    c.lineTo(0, bot);
    c.closePath();
    c.fill();

    // 허리띠
    c.fillStyle = p.accent;
    c.fillRect(-hw2 * 0.96, hipY - u * 0.05, hw2 * 1.92, u * 0.05);

    /* ── 앞쪽 팔 ── */
    c.strokeStyle = p.skin;
    c.lineWidth = u * 0.075;
    c.beginPath();
    c.moveTo(u * 0.26 * narrow, shoulderY + u * 0.06);
    c.lineTo(u * 0.25 * narrow - swing * 0.8, hipY + u * 0.05);
    c.stroke();

    /* ── 머리 ── */
    c.fillStyle = p.skin;
    c.beginPath();
    c.arc(hx, headY, headR, 0, TAU);
    c.fill();

    if (back) {
      // 뒤통수 — 머리카락이 전부 덮는다. 얼굴이 없다는 것 자체가 신호다.
      c.fillStyle = p.hair;
      c.beginPath();
      c.arc(hx, headY, headR * 1.02, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.beginPath();
      c.arc(hx - headR * 0.3, headY - headR * 0.3, headR * 0.4, 0, TAU);
      c.fill();
    } else {
      // 앞머리
      c.fillStyle = p.hair;
      c.beginPath();
      c.arc(hx, headY - headR * 0.1, headR * 1.03, Math.PI * 0.92, TAU * 1.06);
      c.fill();
      if (side) {
        // 옆모습 — 코와 뒤통수 머리로 방향을 확실히 못박는다
        const s = Math.sign(turn);
        c.fillStyle = p.skin;
        c.beginPath();
        c.arc(hx + s * headR * 0.94, headY + headR * 0.14, headR * 0.22, 0, TAU);
        c.fill();
        c.fillStyle = p.hair;
        c.beginPath();
        c.arc(hx - s * headR * 0.42, headY, headR * 0.78, 0, TAU);
        c.fill();
        c.fillStyle = '#221a14';
        ell(c, hx + s * headR * 0.42, headY + headR * 0.1, headR * 0.13, headR * 0.17);
      } else {
        // 정면·비스듬 — 눈 둘. 돌아선 쪽으로 함께 밀린다.
        c.fillStyle = '#221a14';
        for (const s of [-1, 1]) {
          const ex = hx + s * headR * 0.36 + turn * headR * 0.34;
          if (Math.abs(ex - hx) > headR * 0.8) continue;
          ell(c, ex, headY + headR * 0.12, headR * 0.12, headR * 0.16);
        }
      }
    }

    if (o.robe) {
      // 후드
      c.fillStyle = p.clothShade;
      c.beginPath();
      c.arc(hx, headY - headR * 0.02, headR * 1.08, Math.PI * 1.08, TAU * 0.96);
      c.fill();
    }

    if (o.club && front) {
      c.strokeStyle = '#6b4a2c';
      c.lineWidth = u * 0.062;
      c.beginPath();
      c.moveTo(u * 0.33, shoulderY + u * 0.1);
      c.lineTo(u * 0.29, hipY + u * 0.2);
      c.stroke();
      c.fillStyle = '#8a6b4a';
      ell(c, u * 0.28, hipY + u * 0.22, u * 0.065, u * 0.065);
    }
  });
}
