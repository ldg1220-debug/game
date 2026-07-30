import type { Element } from './gameTypes';

const CHART: Record<Element, Partial<Record<Element, number>>> = {
  fire: { earth: 2.0, water: 0.5, wind: 0.5, fire: 1.0, none: 1.0 },
  water: { fire: 2.0, wind: 2.0, earth: 0.5, water: 1.0, none: 1.0 },
  earth: { water: 2.0, fire: 0.5, wind: 0.5, earth: 1.0, none: 1.0 },
  wind: { fire: 2.0, earth: 2.0, water: 0.5, wind: 1.0, none: 1.0 },
  none: { fire: 1.0, water: 1.0, earth: 1.0, wind: 1.0, none: 1.0 },
};

export function typeMultiplier(attack: Element, defense: Element): number {
  return CHART[attack]?.[defense] ?? 1.0;
}

export function dualTypeMultiplier(
  attackElement: Element,
  defenderPrimary: Element,
  defenderSecondary: Element | null,
  secondaryRatio = 0.2,
): number {
  if (!defenderSecondary || defenderSecondary === defenderPrimary) {
    return typeMultiplier(attackElement, defenderPrimary);
  }
  const primaryRatio = 1 - secondaryRatio;
  return (
    typeMultiplier(attackElement, defenderPrimary) * primaryRatio +
    typeMultiplier(attackElement, defenderSecondary) * secondaryRatio
  );
}
