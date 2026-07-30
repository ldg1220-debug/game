import { v4 as uuid } from 'uuid';
import {
  NATURES,
  PERSONALITIES,
  STAT_KEYS,
  type Element,
  type GrowthRates,
  type Nature,
  type Personality,
  type PetAbility,
  type PetInstance,
  type PetStat,
} from './gameTypes';
import { getShape } from './petData';

interface GrowthTier {
  name: string;
  probability: number;
  min: number;
  max: number;
}

const GROWTH_TIERS: GrowthTier[] = [
  { name: '최상위급', probability: 0.01, min: 1.1, max: 1.15 },
  { name: '상위급', probability: 0.05, min: 1.05, max: 1.09 },
  { name: '중상급', probability: 0.15, min: 1.0, max: 1.04 },
  { name: '중급', probability: 0.3, min: 0.95, max: 0.99 },
  { name: '하위급', probability: 0.35, min: 0.9, max: 0.94 },
  { name: '최하위급', probability: 0.14, min: 0.85, max: 0.89 },
];

const LEGENDARY_PROBABILITY = 0.000000044; // 0.0000044% - server legend

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function selectGrowthRateTier(): GrowthTier {
  const roll = Math.random();
  let cumulative = 0;
  for (const tier of GROWTH_TIERS) {
    cumulative += tier.probability;
    if (roll <= cumulative) return tier;
  }
  return GROWTH_TIERS[GROWTH_TIERS.length - 1];
}

export function generateIndividualGrowthRate(tier: GrowthTier): number {
  return Math.round(randomInRange(tier.min, tier.max) * 100) / 100;
}

export function generateGrowthRates(): {
  growthRates: GrowthRates;
  averageGrowthRate: number;
  isLegendary: boolean;
} {
  const isLegendary = Math.random() < LEGENDARY_PROBABILITY;
  const growthRates = {} as GrowthRates;

  for (const key of STAT_KEYS) {
    const rate = isLegendary
      ? Math.round(randomInRange(1.2, 1.3) * 100) / 100
      : generateIndividualGrowthRate(selectGrowthRateTier());
    growthRates[key] = rate;
  }

  const averageGrowthRate =
    Math.round(
      (STAT_KEYS.reduce((sum, key) => sum + growthRates[key], 0) / STAT_KEYS.length) * 1000,
    ) / 1000;

  return { growthRates, averageGrowthRate, isLegendary };
}

export function calculateStatAtLevel(
  level0Stat: PetStat,
  growthRates: GrowthRates,
  level: number,
): PetStat {
  const stat = {} as PetStat;
  for (const key of STAT_KEYS) {
    const value = level0Stat[key] + growthRates[key] * (level - 1);
    stat[key] = Math.max(1, Math.round(value));
  }
  return stat;
}

export function calculateAbilityFromStat(stat: PetStat): PetAbility {
  return {
    HP: Math.round(stat.VIT * 5 + 10),
    ATK: Math.round(stat.STR * 2 + 5),
    DEF: Math.round((stat.VIT + stat.SPD) / 2 + 3),
    SPA: Math.round(stat.SPA * 2 + 5),
    SPD: Math.round(stat.SPD * 2 + 5),
    SPE: Math.round(stat.AGI * 2 + 1),
    CRI: Math.round((stat.LCK * 1 + 3) * 10) / 10,
  };
}

export function getCurrentStat(pet: PetInstance): PetStat {
  return calculateStatAtLevel(pet.level0Stat, pet.growthRates, pet.level);
}

export function getCurrentAbility(pet: PetInstance): PetAbility {
  return calculateAbilityFromStat(getCurrentStat(pet));
}

export function getMaxHp(pet: PetInstance): number {
  return getCurrentAbility(pet).HP;
}

export function expToNextLevel(level: number): number {
  return Math.floor(15 * Math.pow(level, 1.6) + 15);
}

export function generatePetInstance(
  shapeId: number,
  elementPrimary: Element,
  elementSecondary: Element | null,
  level = 1,
): PetInstance {
  const shape = getShape(shapeId);
  const { growthRates, averageGrowthRate, isLegendary } = generateGrowthRates();
  const nature = pickRandom(Object.keys(NATURES) as Nature[]);
  const personality = pickRandom(Object.keys(PERSONALITIES) as Personality[]);

  const level0Stat = {} as PetStat;
  for (const key of STAT_KEYS) {
    level0Stat[key] = Math.max(1, Math.round(shape.baseStat[key] * growthRates[key]));
  }

  const natureInfo = NATURES[nature];
  if (natureInfo.boost) level0Stat[natureInfo.boost] += 1;
  if (natureInfo.cut) level0Stat[natureInfo.cut] = Math.max(1, level0Stat[natureInfo.cut] - 1);

  const personalityInfo = PERSONALITIES[personality];
  if (personalityInfo.statBonus) {
    for (const key of STAT_KEYS) {
      const bonus = personalityInfo.statBonus[key];
      if (bonus) level0Stat[key] += bonus;
    }
  }

  const secondaryRatio = elementSecondary ? Math.round(randomInRange(0.1, 0.4) * 100) / 100 : 0;

  const pet: PetInstance = {
    id: uuid(),
    shapeId,
    elementPrimary,
    elementSecondary,
    secondaryRatio,
    level,
    experience: 0,
    growthRates,
    averageGrowthRate,
    isLegendary,
    nature,
    personality,
    level0Stat,
    currentHp: 0,
    caughtAt: Date.now(),
  };
  pet.currentHp = getMaxHp(pet);
  return pet;
}

/**
 * 첫 파트너 전용 생성기. 평균 성장률이 최소 기준 이상인 개체만 제시한다.
 * 야생 포획과 달리 최하위급 스타터를 뽑아 시작부터 막히는 상황을 막으면서,
 * "개체마다 성장률이 다르다"는 핵심 규칙은 세 후보 간 차이로 그대로 보여준다.
 *
 * 하한 0.98은 전체 분포 평균(약 0.953)보다 위이면서 단발 통과율이 13%라
 * 재추첨 200회로 사실상 확정되고, 동시에 후보 간 편차도 남는 값이다.
 * (하한을 1.00으로 두면 단발 통과율이 2.6%까지 떨어져 재추첨이 자주 소진된다.)
 */
const STARTER_MIN_GROWTH = 0.98;
const STARTER_MAX_REROLLS = 200;

export function generateStarterPet(
  shapeId: number,
  elementPrimary: Element,
  elementSecondary: Element | null,
): PetInstance {
  let candidate = generatePetInstance(shapeId, elementPrimary, elementSecondary, 1);
  for (
    let attempt = 0;
    attempt < STARTER_MAX_REROLLS && candidate.averageGrowthRate < STARTER_MIN_GROWTH;
    attempt++
  ) {
    candidate = generatePetInstance(shapeId, elementPrimary, elementSecondary, 1);
  }
  return candidate;
}

export function addExperience(
  pet: PetInstance,
  exp: number,
): { pet: PetInstance; leveledUp: boolean; levelsGained: number } {
  const personalityInfo = PERSONALITIES[pet.personality];
  const bonusExp = personalityInfo.expBonusPct
    ? Math.round(exp * (1 + personalityInfo.expBonusPct / 100))
    : exp;

  const prevMaxHp = getMaxHp(pet);
  const missingHp = prevMaxHp - pet.currentHp;

  let experience = pet.experience + bonusExp;
  let level = pet.level;
  let levelsGained = 0;

  while (level < 100 && experience >= expToNextLevel(level)) {
    experience -= expToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }

  const updated: PetInstance = { ...pet, experience, level };
  const newMaxHp = getMaxHp(updated);
  updated.currentHp = Math.max(1, Math.min(newMaxHp, newMaxHp - missingHp));

  return { pet: updated, leveledUp: levelsGained > 0, levelsGained };
}

export function growthTierLabel(averageGrowthRate: number): string {
  if (averageGrowthRate >= 1.2) return '전설급';
  if (averageGrowthRate >= 1.1) return '최상위급';
  if (averageGrowthRate >= 1.05) return '상위급';
  if (averageGrowthRate >= 1.0) return '중상급';
  if (averageGrowthRate >= 0.95) return '중급';
  if (averageGrowthRate >= 0.9) return '하위급';
  return '최하위급';
}
