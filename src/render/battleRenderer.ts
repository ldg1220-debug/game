/**
 * 전투 화면 렌더러.
 *
 * 필드 렌더러와 같은 규칙: 읽기만 한다. 입력은 ReplayState에서 나온 값들뿐이고,
 * 그건 BattleEvent 로그를 접어 만든 것이다. 여기서 피해를 계산하거나 상태를 바꾸는
 * 일은 없다.
 *
 * 배치도 아이소메트릭이다. 다만 필드처럼 타일 맵을 순회하지 않고 (깊이, 좌우) 두
 * 값으로 직접 자리를 잡는다. 투기장은 지형이 아니라 무대라서, 칸에 맞출 이유가
 * 없고 맞추면 오히려 배치가 뻣뻣해진다.
 *
 *   화면 x = 좌우 × FW
 *   화면 y = 깊이 × FH
 *
 * 이 두 줄이 필드의 isoX/isoY와 같은 관계를 유지하므로, 바닥 마름모와 서 있는
 * 위치가 자동으로 맞아떨어진다.
 */

import { SPECIES } from '../game/party';
import type { Impact, ReplayUnit } from '../game/replay';
import type { Element, PetForm, Rarity } from '../engine/types';
import { elementColor, PLAYER_PALETTE } from './palette';
import { drawCreature, drawHuman } from './sprites';

/** 바닥 마름모의 반폭·반높이. 원작의 큼직한 석판 비율을 따랐다. */
const FW = 74;
const FH = 37;

/**
 * 진영별 줄의 깊이. 음수가 멀고 양수가 가깝다.
 *
 * 처음엔 네 줄을 촘촘히 뒀다가 개체와 이름표가 서로를 덮었다. 개체 하나가
 * 세로로 90px쯤 차지하는데 줄 간격이 그보다 좁으면 겹칠 수밖에 없다. 진영
 * 사이는 넓게, 같은 진영의 전열·후열은 반쯤 겹치게 둔다 — 후열이 전열 뒤에
 * 반쯤 가리는 게 진형이 있다는 신호다.
 */
const ROW_DEPTH = {
  enemyBack: -3.1,
  enemyFront: -1.75,
  allyFront: 1.35,
  allyBack: 2.7,
} as const;

/** 등급이 높을수록 크다. 화면만 봐도 격이 읽혀야 한다. */
const SIZE_BY_RARITY: Record<Rarity, number> = { common: 40, uncommon: 45, rare: 52, epic: 60 };

interface Placed {
  u: ReplayUnit;
  x: number;
  y: number;
  depth: number;
}

/**
 * 좌우 간격.
 *
 * 석판 반폭(FW)을 그대로 쓰면 둘이 나란히 설 때 이름표(약 70px)가 겹친다.
 * 개체가 슬래브 정중앙에 설 이유는 없으므로 간격만 따로 벌린다.
 */
const SPREAD = 104;

/**
 * 진영을 좌우로도 갈라 놓는다.
 *
 * 처음엔 두 진영을 위아래로만 나누고 가운데 정렬했다. 그랬더니 적은 왼쪽을,
 * 아군은 오른쪽을 보는데 서로 마주 보지 않고 등을 돌린 꼴이 됐다 — 위아래로만
 * 떨어져 있으니 "왼쪽"이 상대 쪽이 아니었던 것이다. 진영을 대각선으로 어긋나게
 * 두면 바라보는 방향이 그대로 상대를 향한다.
 */
const SIDE_OFFSET = 0.5;

/** 한쪽 진영을 전열·후열로 나눠 배치한다. */
function place(units: ReplayUnit[], frontDepth: number, backDepth: number, center: number): Placed[] {
  const out: Placed[] = [];
  for (const [rows, depth, stagger] of [
    [units.filter((u) => u.row === 'back'), backDepth, 0.5],
    [units.filter((u) => u.row === 'front'), frontDepth, 0],
  ] as const) {
    rows.forEach((u, i) => {
      const lateral = center + i - (rows.length - 1) / 2 + stagger;
      out.push({ u, x: lateral * SPREAD, y: depth * FH, depth });
    });
  }
  return out;
}

/* ─────────────── 무대 ─────────────── */

function drawArena(g: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, indoor: boolean): void {
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (indoor) {
    sky.addColorStop(0, '#1a1526');
    sky.addColorStop(0.55, '#120e1c');
    sky.addColorStop(1, '#0a0812');
  } else {
    sky.addColorStop(0, '#3c5470');
    sky.addColorStop(0.45, '#2a3a4e');
    sky.addColorStop(1, '#18222e');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  if (!indoor) {
    // 먼 능선. 하늘과 바닥 사이가 비면 무대가 허공에 뜬다.
    g.fillStyle = 'rgba(20,32,28,0.75)';
    g.beginPath();
    g.moveTo(0, H * 0.42);
    for (let x = 0; x <= W; x += 40) {
      g.lineTo(x, H * 0.42 - Math.sin(x / 130) * 26 - Math.sin(x / 47) * 9);
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    g.fill();
  }

  // 석판 바닥. 마름모를 (깊이, 좌우) 격자로 깐다.
  const slab = indoor
    ? { light: '#413b4c', body: '#332e3e', dark: '#26222f' }
    : { light: '#8e8b84', body: '#7a776f', dark: '#5f5c56' };

  g.save();
  g.translate(cx, cy);
  for (let d = -4; d <= 4; d++) {
    for (let l = -4; l <= 4; l++) {
      // 마름모 격자는 깊이와 좌우의 홀짝이 같은 자리에만 놓인다
      if (((d + l) & 1) !== 0) continue;
      const x = l * FW;
      const y = d * FH;
      const fade = 1 - Math.min(1, Math.hypot(x / (FW * 3.4), y / (FH * 3.2)));
      if (fade <= 0.02) continue;
      g.globalAlpha = Math.min(1, fade * 1.6);
      g.fillStyle = ((d + l) / 2 + 8) % 2 === 0 ? slab.body : slab.light;
      g.beginPath();
      g.moveTo(x, y - FH);
      g.lineTo(x + FW, y);
      g.lineTo(x, y + FH);
      g.lineTo(x - FW, y);
      g.closePath();
      g.fill();
      g.strokeStyle = slab.dark;
      g.lineWidth = 2;
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  g.restore();

  // 무대 가장자리를 어둡게 눌러 시선을 가운데로 모은다
  const vig = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.22, cx, cy, Math.max(W, H) * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, indoor ? 'rgba(0,0,0,0.8)' : 'rgba(8,12,18,0.66)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
}

/* ─────────────── 이펙트 ─────────────── */

const EFFECT_MS = 520;

/**
 * 속성별 타격 연출.
 *
 * 속성이 화면에서 안 보이면 상성이 숫자로만 존재하게 된다. 불은 터지고 물은
 * 튀고 땅은 솟고 바람은 벤다 — 모양이 달라야 무슨 일이 일어났는지 읽힌다.
 */
function drawElementBurst(g: CanvasRenderingContext2D, x: number, y: number, el: Element | null, p: number): void {
  const ease = 1 - Math.pow(1 - p, 2.2);
  const fade = 1 - p;

  g.save();
  g.translate(x, y);

  if (el === 'fire') {
    const r = 16 + ease * 62;
    const grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    grad.addColorStop(0, `rgba(255,246,196,${0.95 * fade})`);
    grad.addColorStop(0.4, `rgba(255,158,50,${0.8 * fade})`);
    grad.addColorStop(1, 'rgba(190,40,10,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.92, 0, 0, Math.PI * 2);
    g.fill();
    // 불티가 위로 오른다
    g.fillStyle = `rgba(255,200,90,${fade})`;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillRect(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.4 - ease * 46, 3, 5);
    }
  } else if (el === 'water') {
    g.strokeStyle = `rgba(150,220,255,${0.9 * fade})`;
    g.lineWidth = 4;
    for (const k of [0.55, 1]) {
      g.beginPath();
      g.ellipse(0, 6, 20 + ease * 60 * k, (20 + ease * 60 * k) * 0.42, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = `rgba(190,236,255,${fade})`;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const d = ease * 56;
      g.beginPath();
      g.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.45 - ease * 34 + ease * ease * 30, 3.4, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (el === 'earth') {
    g.fillStyle = `rgba(150,120,80,${fade})`;
    g.beginPath();
    g.ellipse(0, 8, 24 + ease * 54, (24 + ease * 54) * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    // 돌조각이 솟았다 떨어진다
    g.fillStyle = `rgba(120,104,88,${fade})`;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const d = 14 + ease * 46;
      const up = Math.sin(p * Math.PI) * 44;
      g.save();
      g.translate(Math.cos(a) * d, Math.sin(a) * d * 0.4 - up);
      g.rotate(a + p * 3);
      g.fillRect(-6, -6, 12, 12);
      g.restore();
    }
  } else if (el === 'wind') {
    g.strokeStyle = `rgba(180,255,220,${0.95 * fade})`;
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = p * 6 + (i / 3) * Math.PI * 2;
      const r = 22 + ease * 50 + i * 6;
      g.beginPath();
      g.arc(0, 0, r, a0, a0 + 1.5);
      g.stroke();
    }
  } else {
    // 속성이 없는 타격 — 도트 피해나 정령 피해
    g.strokeStyle = `rgba(255,255,255,${0.85 * fade})`;
    g.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r0 = 10 + ease * 22;
      const r1 = r0 + 20;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.6);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.6);
      g.stroke();
    }
  }

  g.restore();
}

function drawHealBurst(g: CanvasRenderingContext2D, x: number, y: number, p: number): void {
  const fade = 1 - p;
  g.save();
  g.translate(x, y);
  g.fillStyle = `rgba(140,240,150,${0.9 * fade})`;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rise = p * 66;
    g.beginPath();
    g.ellipse(Math.cos(a) * 26, Math.sin(a) * 12 - rise, 4, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = `rgba(160,255,175,${0.7 * fade})`;
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(0, 8, 34, 14, 0, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** 밧줄. 포획은 결과가 아니라 순간이 보여야 손에 땀이 난다. */
function drawCaptureRing(g: CanvasRenderingContext2D, x: number, y: number, p: number): void {
  const fade = 1 - p;
  g.save();
  g.translate(x, y - 24);
  g.strokeStyle = `rgba(230,196,120,${fade})`;
  g.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    const t = Math.max(0, p - i * 0.12);
    g.beginPath();
    g.ellipse(0, -30 + t * 60, 30 - t * 10, 11, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** 떠오르는 숫자. */
function floatNumber(g: CanvasRenderingContext2D, x: number, y: number, text: string, p: number, color: string, big: boolean): void {
  const rise = 12 + p * 42;
  const alpha = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;
  // 처음 잠깐 커졌다 제자리로 — 튀어나오는 느낌을 준다
  const pop = p < 0.16 ? 1 + (0.16 - p) * 2.4 : 1;
  g.save();
  g.globalAlpha = Math.max(0, alpha);
  g.translate(x, y - rise);
  g.scale(pop, pop);
  g.font = `bold ${big ? 26 : 19}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  g.restore();
}

/* ─────────────── 개체 ─────────────── */

function nameplate(g: CanvasRenderingContext2D, u: ReplayUnit, x: number, y: number): void {
  const barW = 68;
  const barX = x - barW / 2;
  const ratio = Math.max(0, Math.min(1, u.hp / u.maxHp));

  g.fillStyle = 'rgba(8,8,14,0.72)';
  g.beginPath();
  g.roundRect(barX - 3, y - 3, barW + 6, 24, 4);
  g.fill();

  g.fillStyle = '#0d0d16';
  g.fillRect(barX, y, barW, 6);
  g.fillStyle = ratio > 0.5 ? '#6bbf6b' : ratio > 0.22 ? '#e0b552' : '#d2503f';
  g.fillRect(barX, y, barW * ratio, 6);
  g.strokeStyle = '#38384d';
  g.lineWidth = 1;
  g.strokeRect(barX + 0.5, y + 0.5, barW - 1, 5);

  g.fillStyle = u.fainted ? '#6b6a7a' : '#e6e4dd';
  g.font = '11px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(`${u.name} L${u.level}`, x, y + 18);

  // 속성 점. 이름 옆에 붙여야 대상을 고를 때 눈이 한 번에 읽는다.
  g.fillStyle = elementColor(u.element.primary);
  g.beginPath();
  g.arc(barX - 8, y + 3, 3.5, 0, Math.PI * 2);
  g.fill();
  if (u.element.secondary) {
    g.fillStyle = elementColor(u.element.secondary);
    g.beginPath();
    g.arc(barX + barW + 8, y + 3, 3.5, 0, Math.PI * 2);
    g.fill();
  }

  if (u.ailments.length > 0) {
    g.fillStyle = '#d2a03f';
    g.font = '10px system-ui, sans-serif';
    g.fillText('●'.repeat(u.ailments.length), x, y - 8);
  }
  if (u.modifiers.length > 0) {
    g.fillStyle = '#7fb0e0';
    g.font = '10px system-ui, sans-serif';
    g.fillText('▲'.repeat(Math.min(3, u.modifiers.length)), x, y + 30);
  }
}

/** 캐릭터는 사람으로, 펫은 종에 맞는 몸으로 그린다. */
function drawFighter(g: CanvasRenderingContext2D, u: ReplayUnit, x: number, y: number, t: number, hitShake: number): void {
  // 적은 왼쪽, 아군은 오른쪽을 본다 — 서로 마주 봐야 대치로 읽힌다
  const enemy = u.side === 'enemy';
  const px = x + hitShake;

  if (u.kind === 'character' || !u.speciesId) {
    drawHuman(g, {
      x: px,
      y,
      u: 64,
      dir: enemy ? 'sw' : 'ne',
      pal: PLAYER_PALETTE,
      t,
      club: true,
      fx: u.fainted ? { alpha: 0.4, rotate: Math.PI * 0.42 } : u.flash === 'hit' ? { tint: '#ff5a44', tintAlpha: 0.5 } : {},
    });
    return;
  }

  const sp = SPECIES[u.speciesId];
  drawCreature(g, {
    speciesId: u.speciesId,
    form: (sp?.form ?? 'beast') as PetForm,
    element: u.element,
    x: px,
    y,
    u: SIZE_BY_RARITY[sp?.rarity ?? 'common'],
    // 적은 왼쪽을 보므로 뒤집는다
    flip: enemy,
    t,
    walk: 0,
    fainted: u.fainted,
    fx:
      u.flash === 'hit'
        ? { tint: '#ff5a44', tintAlpha: 0.55 }
        : u.flash === 'heal'
          ? { tint: '#7fe07f', tintAlpha: 0.45 }
          : u.captured
            ? { tint: '#e0b552', tintAlpha: 0.4 }
            : {},
  });
}

/* ─────────────── 한 프레임 ─────────────── */

export interface BattleDrawOptions {
  indoor: boolean;
  /** 지금 재생 시점이 화면에 나타난 지 얼마나 됐는가(ms). 이펙트 진행도의 기준이다. */
  age: number;
  impact: Impact | null;
}

export function drawBattle(g: CanvasRenderingContext2D, units: readonly ReplayUnit[], opts: BattleDrawOptions): void {
  const { width: W, height: H } = g.canvas;
  const t = performance.now();
  const cx = W / 2;
  const cy = H * 0.54;

  drawArena(g, W, H, cx, cy, opts.indoor);

  const enemies = units.filter((u) => u.side === 'enemy');
  const allies = units.filter((u) => u.side === 'ally');
  const cells = [
    ...place(enemies, ROW_DEPTH.enemyFront, ROW_DEPTH.enemyBack, SIDE_OFFSET),
    ...place(allies, ROW_DEPTH.allyFront, ROW_DEPTH.allyBack, -SIDE_OFFSET),
  ];
  // 깊이 순. 앞줄이 뒷줄을 가려야 두 줄이 다른 거리에 있는 것으로 읽힌다.
  cells.sort((a, b) => a.depth - b.depth);

  const p = Math.min(1, opts.age / EFFECT_MS);
  const active = p < 1 && opts.impact !== null;

  for (const c of cells) {
    const x = cx + c.x;
    const y = cy + c.y;
    // 맞은 개체를 잠깐 밀어낸다. 숫자만 뜨는 것보다 훨씬 맞은 것처럼 보인다.
    const hit = active && opts.impact!.targetId === c.u.id && opts.impact!.kind === 'hit';
    const shake = hit ? Math.sin(p * Math.PI * 4) * (1 - p) * 9 * (c.u.side === 'enemy' ? -1 : 1) : 0;
    drawFighter(g, c.u, x, y, t, shake);
    // 후열 이름표는 머리 위로 올린다. 발밑에 두면 그 앞에 선 전열 개체가
    // 덮어버려서, 정작 체력을 봐야 할 개체의 체력이 안 보인다.
    nameplate(g, c.u, x, c.u.row === 'back' ? y - 96 : y + 16);
  }

  // 이펙트는 개체 위에 얹는다
  if (active && opts.impact) {
    const im = opts.impact;
    const target = cells.find((c) => c.u.id === im.targetId);
    if (target) {
      const x = cx + target.x;
      const y = cy + target.y - 34;
      if (im.kind === 'hit') {
        drawElementBurst(g, x, y, im.element, p);
        floatNumber(g, x, y, String(im.amount), p, im.crit ? '#ffd54a' : '#ff8a72', im.crit);
      } else if (im.kind === 'heal') {
        drawHealBurst(g, x, y, p);
        floatNumber(g, x, y, `+${im.amount}`, p, '#8ce89a', false);
      } else if (im.kind === 'miss') {
        floatNumber(g, x, y, '빗나감', p, '#b9b8c8', false);
      } else if (im.kind === 'capture') {
        drawCaptureRing(g, x, y, p);
        floatNumber(g, x, y - 20, '포획!', p, '#ffd54a', true);
      }
    }
  }
}
