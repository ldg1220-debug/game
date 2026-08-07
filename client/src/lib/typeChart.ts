import { CORE_ELEMENTS, ELEMENT_POINT_TOTAL, type CoreElement, type Element, type ElementPoints } from './gameTypes';

/**
 * 상성 사이클: 화 > 풍 > 지 > 수 > 화
 *
 * 기획 문서 5.3의 표는 대칭이 아니다. 그대로 구현하면 수/풍은 공격 유리 2 · 방어 저항 2로
 * 종합 +2, 화/지는 종합 -2가 되어 사이클이 아니라 계층이 된다. 실제로 화 속성 스타터의
 * 첫 전투 승률이 33%까지 떨어졌다(다른 스타터는 64~67%).
 *
 * 네 속성이 각각 유리 1 · 불리 1 · 약점 1 · 저항 1을 갖도록 순환 구조로 재설계했다.
 * 배수(2.0 / 1.0 / 0.5)와 가중 합산 방식은 문서 그대로다.
 */
const ADVANTAGE: Record<CoreElement, CoreElement> = {
  fire: 'wind',
  wind: 'earth',
  earth: 'water',
  water: 'fire',
};

export const SUPER_EFFECTIVE = 2.0;
export const NOT_EFFECTIVE = 0.5;
export const NEUTRAL = 1.0;

export function typeMultiplier(attack: CoreElement, defense: CoreElement): number {
  if (ADVANTAGE[attack] === defense) return SUPER_EFFECTIVE;
  if (ADVANTAGE[defense] === attack) return NOT_EFFECTIVE;
  return NEUTRAL;
}

/** 원소 배분을 0~1 비율로 정규화한다. */
function ratio(points: ElementPoints, element: CoreElement): number {
  return points[element] / ELEMENT_POINT_TOTAL;
}

/**
 * 공격자와 방어자의 원소 배분을 모두 반영한 상성 배수.
 * 문서 5.3의 가중 합산을 양쪽으로 일반화한 것이다.
 *
 *   배수 = Σ(공격원소) Σ(방어원소) 상성[공][방] × 공격비율 × 방어비율
 *
 * 문서 예시(공격 화9수1 → 방어 지10)를 이 식에 넣으면 문서와 같은 형태로 계산된다.
 */
export function elementAffinity(attacker: ElementPoints, defender: ElementPoints): number {
  let total = 0;
  for (const a of CORE_ELEMENTS) {
    const ar = ratio(attacker, a);
    if (ar === 0) continue;
    for (const d of CORE_ELEMENTS) {
      const dr = ratio(defender, d);
      if (dr === 0) continue;
      total += typeMultiplier(a, d) * ar * dr;
    }
  }
  return total;
}

/** 속성이 정해진 스킬이 방어자 배분에 대해 갖는 상성 배수. */
export function skillAffinity(skillElement: Element, defender: ElementPoints): number {
  if (skillElement === 'none') return NEUTRAL;
  let total = 0;
  for (const d of CORE_ELEMENTS) {
    total += typeMultiplier(skillElement, d) * ratio(defender, d);
  }
  return total;
}

/**
 * 자속성 보정. 자기 배분이 높은 속성의 스킬일수록 위력이 오른다.
 * 화10인 펫이 화염 스킬을 쓰면 1.5배, 화0이면 보정 없음.
 */
export function sameElementBonus(attacker: ElementPoints, skillElement: Element): number {
  if (skillElement === 'none') return 1;
  return 1 + ratio(attacker, skillElement) * 0.5;
}
