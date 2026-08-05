/**
 * 색.
 *
 * 스프라이트는 외부 이미지 없이 코드로 그린다. 그래서 "무슨 색으로 칠할까"가
 * 렌더러 곳곳에 흩어지기 쉬운데, 흩어지면 같은 속성인데 필드와 전투에서 다른
 * 색으로 나오는 일이 생긴다. 색 결정은 전부 여기 모아둔다.
 *
 * 종마다 색을 데이터에 적지 않는 이유: 24종을 손으로 칠하면 속성 구분이 무너진다.
 * 속성이 기준 색조를 정하고 종 id가 그 안에서 흔든다 — 같은 속성끼리 구별되면서도
 * 한눈에 같은 속성으로 읽힌다.
 */

import type { Element, ElementPair } from '../engine/types';

export const hsl = (h: number, s: number, l: number, a = 1): string =>
  a >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;

/** 속성의 기준 색조. 원작의 지·수·화·풍 배색을 따른다. */
const ELEMENT_HSL: Record<Element, [number, number, number]> = {
  earth: [34, 40, 46],
  water: [204, 52, 52],
  fire: [12, 66, 50],
  wind: [148, 38, 46],
};

/** UI에서 속성을 한 색으로 나타낼 때. */
export function elementColor(e: Element): string {
  const [h, s, l] = ELEMENT_HSL[e];
  return hsl(h, s, l);
}

/** id를 32비트로 접는다. 같은 종은 언제나 같은 색이어야 한다. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Palette {
  /** 그늘 */
  dark: string;
  /** 몸통 */
  body: string;
  /** 빛 받는 면 */
  light: string;
  /** 무늬·등딱지·뿔 같은 부속 */
  accent: string;
  /** 배·부리·발바닥처럼 밝은 살 */
  belly: string;
}

/**
 * 종 팔레트.
 *
 * 부속성이 있으면 색조를 그쪽으로 조금 당긴다. 데이터상 이속성인 종이 절반이
 * 넘는데 겉으로 전혀 안 드러나면 상성 계산이 화면과 따로 논다.
 */
export function speciesPalette(id: string, element: ElementPair): Palette {
  const [bh, bs, bl] = ELEMENT_HSL[element.primary];
  const n = hashId(id);
  // 0~1 난수 세 개를 비트에서 꺼낸다. 종마다 고정이고 새로고침해도 안 변한다.
  const r1 = ((n >>> 0) & 255) / 255;
  const r2 = ((n >>> 8) & 255) / 255;
  const r3 = ((n >>> 16) & 255) / 255;

  let h = bh + (r1 - 0.5) * 30;
  let s = bs + (r2 - 0.5) * 16;
  const l = bl + (r3 - 0.5) * 10;

  if (element.secondary) {
    const [sh, ss] = ELEMENT_HSL[element.secondary];
    // 색조는 원형이라 짧은 쪽으로 돌아야 한다. 안 그러면 빨강+보라가 초록이 된다.
    let d = sh - h;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    h += d * 0.28;
    s = s * 0.8 + ss * 0.2;
  }
  h = ((h % 360) + 360) % 360;

  return {
    dark: hsl(h, s, Math.max(8, l - 18)),
    body: hsl(h, s, l),
    light: hsl(h, Math.max(0, s - 6), Math.min(88, l + 14)),
    accent: hsl((h + 42) % 360, Math.min(90, s + 18), Math.min(82, l + 24)),
    belly: hsl(h, Math.max(0, s - 22), Math.min(92, l + 30)),
  };
}

/** 사람 팔레트. 펫과 달리 속성이 없으므로 직접 고른다. */
export interface HumanPalette {
  skin: string;
  skinShade: string;
  hair: string;
  cloth: string;
  clothShade: string;
  accent: string;
}

/**
 * 플레이어 색은 고정이다.
 *
 * 처음엔 다른 사람들과 같은 방식(id 해시)으로 뽑았는데, 흙길 위에서 갈색 옷을 입은
 * 캐릭터가 배경에 묻혀 어디 있는지 찾게 됐다. 주인공은 어느 지형 위에서도 즉시
 * 눈에 띄어야 하므로 지형에 거의 안 쓰는 색을 골라 박아둔다.
 */
export const PLAYER_PALETTE: HumanPalette = {
  skin: hsl(28, 46, 74),
  skinShade: hsl(26, 42, 60),
  hair: hsl(20, 44, 18),
  cloth: hsl(352, 62, 48),
  clothShade: hsl(352, 58, 36),
  accent: hsl(44, 78, 62),
};

export function humanPalette(id: string, hue?: number): HumanPalette {
  const n = hashId(id);
  const skinL = 66 + (((n >>> 3) & 15) / 15) * 12;
  const hairH = [24, 12, 38, 220, 0][n % 5]!;
  const hairL = 14 + (((n >>> 7) & 7) / 7) * 16;
  const ch = hue ?? (n >>> 11) % 360;
  const cl = 34 + (((n >>> 17) & 15) / 15) * 16;
  return {
    skin: hsl(28, 44, skinL),
    skinShade: hsl(24, 40, skinL - 14),
    hair: hsl(hairH, hairH === 0 ? 0 : 46, hairL),
    cloth: hsl(ch, 34, cl),
    clothShade: hsl(ch, 34, cl - 12),
    accent: hsl((ch + 30) % 360, 52, Math.min(78, cl + 26)),
  };
}
