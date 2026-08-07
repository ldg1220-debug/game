/**
 * 전투 수식.
 *
 * 헌장 절대규칙 2에 따라 상수는 전부 /src/data/formula.json 에 있다. 이 파일에는
 * 식의 **모양**만 있고, 숫자는 하나도 없다. 밸런스를 만질 때 코드를 열 일이
 * 없어야 밸런스 시뮬레이터가 의미를 갖는다.
 *
 * 모든 함수는 순수 함수다. 난수가 필요한 건 RNG를 인자로 받는다.
 */

import type { RNG } from '../rng';
import { ADVANTAGE, type Element, type ElementPair, type Stats } from '../types';
import type { AttackElement, FormulaConfig, Row } from './types';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ─────────────── 행동 순서 ─────────────── */

/** order = spd * rng(0.9, 1.1). 순발력이 높아도 뒤집힐 여지를 남긴다. */
export function initiative(spd: number, rng: RNG, f: FormulaConfig): number {
  return spd * rng.float(f.order.jitterMin, f.order.jitterMax);
}

/* ─────────────── 명중 ─────────────── */

/** hit = clamp(base + (공격자 순발 - 방어자 순발) * w, min, max) */
export function hitChance(attackerSpd: number, defenderSpd: number, f: FormulaConfig): number {
  return clamp(
    f.hit.base + (attackerSpd - defenderSpd) * f.hit.spdWeight,
    f.hit.min,
    f.hit.max,
  );
}

/* ─────────────── 속성 ─────────────── */

type Weighted = readonly [Element, number][];

function weights(e: AttackElement, f: FormulaConfig): Weighted {
  if (e === null) return [];
  if (typeof e === 'string') return [[e, 1]];
  const pair = e as ElementPair;
  if (pair.secondary === null) return [[pair.primary, 1]];
  return [
    [pair.primary, f.element.primaryWeight],
    [pair.secondary, f.element.secondaryWeight],
  ];
}

function pairMultiplier(atk: Element, def: Element, f: FormulaConfig): number {
  if (ADVANTAGE[atk] === def) return f.element.advantage;
  if (ADVANTAGE[def] === atk) return f.element.disadvantage;
  return f.element.neutral;
}

/**
 * 속성 배율.
 *
 * 이중속성은 primary 0.7 + secondary 0.3 가중 평균이며, 공격·방어 양쪽에
 * 똑같이 적용한다. 단일 대 단일이면 정확히 1.25 / 1.0 / 0.8 이 나온다.
 * 무속성(물리) 공격은 상성을 타지 않는다.
 */
export function elementMultiplier(
  attack: AttackElement,
  defender: ElementPair,
  f: FormulaConfig,
): number {
  const aw = weights(attack, f);
  if (aw.length === 0) return f.element.neutral;
  const dw = weights(defender, f);
  if (dw.length === 0) return f.element.neutral;

  let sum = 0;
  for (const [a, wa] of aw) {
    for (const [d, wd] of dw) sum += wa * wd * pairMultiplier(a, d, f);
  }
  return sum;
}

/* ─────────────── 치명타 ─────────────── */

export function critChance(spd: number, f: FormulaConfig): number {
  // 상한은 밸런스 값이 아니라 폭주 방지용 안전 장치다. 순발력이 비정상적으로
  // 높은 개체가 들어와도 확률이 1을 넘지 않게 한다.
  return clamp(f.crit.base + spd * f.crit.spdWeight, 0, f.crit.max);
}

/* ─────────────── 피해 ─────────────── */

/** raw = atk * skillPower - def * 0.5. 음수가 나올 수 있고, 바닥은 최종 단계에서 잡는다. */
export function rawDamage(atk: number, skillPower: number, def: number, f: FormulaConfig): number {
  return atk * skillPower - def * f.damage.defFactor;
}

export interface DamageInput {
  atk: number;
  def: number;
  skillPower: number;
  elementMul: number;
  critMul: number;
  /** 후열 보정·방어 커맨드 등 곱해서 들어오는 배수 */
  situational: number;
  variance: number;
}

/**
 * dmg = max(1, raw * elem * crit * 상황보정 * rng(0.95,1.05))
 *
 * 바닥값 1은 밸런스가 아니라 규칙이다 — 아무리 방어가 높아도 피해가 0이 되면
 * 전투가 끝나지 않는다.
 */
export function finalDamage(d: DamageInput, f: FormulaConfig): number {
  const raw = rawDamage(d.atk, d.skillPower, d.def, f);
  const dmg = raw * d.elementMul * d.critMul * d.situational * d.variance;
  // NaN은 비교를 전부 false로 만들어 max()를 빠져나간다. 명시적으로 막는다.
  if (!Number.isFinite(dmg)) return f.damage.floor;
  return Math.max(f.damage.floor, Math.round(dmg));
}

export function damageVariance(rng: RNG, f: FormulaConfig): number {
  return rng.float(f.damage.varianceMin, f.damage.varianceMax);
}

/* ─────────────── 진형 ─────────────── */

/** 후열이 받는 물리 피해 보정. 마법(속성) 피해는 진형의 영향을 받지 않는다. */
export function rowTakenMultiplier(row: Row, physical: boolean, f: FormulaConfig): number {
  return row === 'back' && physical ? f.row.backTakenPhysical : 1;
}

/** 후열이 주는 근접 피해 보정. 근접 = 무속성 물리 공격. */
export function rowDealtMultiplier(row: Row, melee: boolean, f: FormulaConfig): number {
  return row === 'back' && melee ? f.row.backDealtMelee : 1;
}

/* ─────────────── 상태이상 ─────────────── */

/** 저항은 대상 순발력 기반. 저항률이 높을수록 상태이상이 덜 걸린다. */
export function ailmentResist(targetSpd: number, f: FormulaConfig): number {
  return clamp(
    f.ailment.resistBase + targetSpd * f.ailment.resistSpdWeight,
    0,
    f.ailment.resistMax,
  );
}

/** 최종 적중률 = 스킬 명중률 × (1 - 저항) */
export function ailmentChance(accuracy: number, targetSpd: number, f: FormulaConfig): number {
  return clamp(accuracy * (1 - ailmentResist(targetSpd, f)), 0, 1);
}

export function poisonDamage(maxHp: number, f: FormulaConfig): number {
  return Math.max(1, Math.round(maxHp * f.ailment.poisonMaxHpRatio));
}

/* ─────────────── 도주 ─────────────── */

export function fleeChance(fleeingSpd: number, opposingSpd: number, f: FormulaConfig): number {
  return clamp(
    f.flee.base + (fleeingSpd - opposingSpd) * f.flee.spdWeight,
    f.flee.min,
    f.flee.max,
  );
}

/* ─────────────── 버프 적용 ─────────────── */

/** 버프/디버프는 곱연산으로 쌓인다. 합연산이면 스택 수에 따라 폭주한다. */
export function applyModifiers(
  base: Stats,
  mods: readonly { atk?: number; def?: number; spd?: number }[],
): Stats {
  let atk = base.atk;
  let def = base.def;
  let spd = base.spd;
  for (const m of mods) {
    if (m.atk !== undefined) atk *= m.atk;
    if (m.def !== undefined) def *= m.def;
    if (m.spd !== undefined) spd *= m.spd;
  }
  return { hp: base.hp, atk, def, spd };
}
