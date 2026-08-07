import { v4 as uuid } from 'uuid';
import {
  CORE_ELEMENTS,
  ELEMENT_POINT_TOTAL,
  MAX_SKILL_SLOTS,
  NATURES,
  PERSONALITIES,
  STAT_KEYS,
  type CoreElement,
  type ElementPoints,
  type GrowthRates,
  type Nature,
  type Personality,
  type PetAbility,
  type PetInstance,
  type PetStat,
} from './gameTypes';
import { getShape, learnableSkillsAt } from './petData';
import { getSkill } from './skillData';

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

const LEGENDARY_PROBABILITY = 0.000000044; // 0.0000044% - 서버 전설

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
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
    growthRates[key] = isLegendary
      ? Math.round(randomInRange(1.2, 1.3) * 100) / 100
      : generateIndividualGrowthRate(selectGrowthRateTier());
  }

  const averageGrowthRate =
    Math.round(
      (STAT_KEYS.reduce((sum, key) => sum + growthRates[key], 0) / STAT_KEYS.length) * 1000,
    ) / 1000;

  return { growthRates, averageGrowthRate, isLegendary };
}

/**
 * 원소 10포인트를 배분한다. 주 원소에 6~10을 몰아주고 남은 포인트를
 * 부 원소와 나머지에 흩뿌린다. 같은 종이라도 화10 개체와 화6수4 개체가 나온다.
 */
export function generateElementPoints(bias: CoreElement[]): ElementPoints {
  const points: ElementPoints = { fire: 0, water: 0, earth: 0, wind: 0 };
  let remaining = ELEMENT_POINT_TOTAL;

  points[bias[0]] = randomInt(6, ELEMENT_POINT_TOTAL);
  remaining -= points[bias[0]];

  if (remaining > 0 && bias[1]) {
    const share = randomInt(Math.ceil(remaining / 2), remaining);
    points[bias[1]] += share;
    remaining -= share;
  }

  while (remaining > 0) {
    const element = pickRandom(CORE_ELEMENTS);
    const amount = randomInt(1, remaining);
    points[element] += amount;
    remaining -= amount;
  }

  return points;
}

export function calculateStatAtLevel(
  level0Stat: PetStat,
  growthRates: GrowthRates,
  level: number,
): PetStat {
  const stat = {} as PetStat;
  for (const key of STAT_KEYS) {
    stat[key] = Math.max(1, Math.round(level0Stat[key] + growthRates[key] * (level - 1)));
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

/** 현재 레벨까지 배운 스킬 전부 (장착 여부와 무관) */
export function availableSkillIds(pet: PetInstance): string[] {
  return learnableSkillsAt(pet.shapeId, pet.level);
}

/** 장착 중인 스킬. 비어 있으면 기본 공격이라도 돌려준다. */
export function equippedSkillIds(pet: PetInstance): string[] {
  const available = new Set(availableSkillIds(pet));
  const equipped = pet.skillIds.filter((id) => available.has(id));
  if (equipped.length > 0) return equipped.slice(0, MAX_SKILL_SLOTS);
  return availableSkillIds(pet).slice(0, MAX_SKILL_SLOTS);
}

function level0StatFor(shapeId: number, growthRates: GrowthRates, nature: Nature, personality: Personality): PetStat {
  const shape = getShape(shapeId);
  const stat = {} as PetStat;
  for (const key of STAT_KEYS) {
    stat[key] = Math.max(1, Math.round(shape.baseStat[key] * growthRates[key]));
  }

  const natureInfo = NATURES[nature];
  if (natureInfo.boost) stat[natureInfo.boost] += 1;
  if (natureInfo.cut) stat[natureInfo.cut] = Math.max(1, stat[natureInfo.cut] - 1);

  const bonus = PERSONALITIES[personality].statBonus;
  if (bonus) {
    for (const key of STAT_KEYS) {
      if (bonus[key]) stat[key] += bonus[key]!;
    }
  }
  return stat;
}

export function generatePetInstance(shapeId: number, level = 1): PetInstance {
  const shape = getShape(shapeId);
  const { growthRates, averageGrowthRate, isLegendary } = generateGrowthRates();
  const nature = pickRandom(Object.keys(NATURES) as Nature[]);
  const personality = pickRandom(Object.keys(PERSONALITIES) as Personality[]);

  const pet: PetInstance = {
    id: uuid(),
    shapeId,
    elementPoints: generateElementPoints(shape.elementBias),
    level,
    experience: 0,
    growthRates,
    averageGrowthRate,
    isLegendary,
    nature,
    personality,
    level0Stat: level0StatFor(shapeId, growthRates, nature, personality),
    currentHp: 0,
    skillIds: [],
    caughtAt: Date.now(),
  };

  // 레벨에 맞는 스킬을 뒤에서부터(강한 것 우선) 슬롯만큼 장착
  pet.skillIds = learnableSkillsAt(shapeId, level).slice(-MAX_SKILL_SLOTS);
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
 */
const STARTER_MIN_GROWTH = 0.98;
const STARTER_MAX_REROLLS = 200;

export function generateStarterPet(shapeId: number): PetInstance {
  let candidate = generatePetInstance(shapeId, 1);
  for (
    let attempt = 0;
    attempt < STARTER_MAX_REROLLS && candidate.averageGrowthRate < STARTER_MIN_GROWTH;
    attempt++
  ) {
    candidate = generatePetInstance(shapeId, 1);
  }
  return candidate;
}

export function addExperience(
  pet: PetInstance,
  exp: number,
): { pet: PetInstance; leveledUp: boolean; levelsGained: number; learnedSkillIds: string[] } {
  const expBonus = PERSONALITIES[pet.personality].expBonusPct;
  const gained = expBonus ? Math.round(exp * (1 + expBonus / 100)) : exp;

  const prevMaxHp = getMaxHp(pet);
  const missingHp = prevMaxHp - pet.currentHp;
  const knownBefore = new Set(availableSkillIds(pet));

  let experience = pet.experience + gained;
  let level = pet.level;
  let levelsGained = 0;

  while (level < 100 && experience >= expToNextLevel(level)) {
    experience -= expToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }

  const updated: PetInstance = { ...pet, experience, level, skillIds: [...pet.skillIds] };

  // 새로 배운 스킬은 빈 슬롯이 있으면 자동 장착한다. 슬롯이 차 있으면
  // 펫 관리 화면에서 직접 교체하도록 남겨둔다.
  const learnedSkillIds = availableSkillIds(updated).filter((id) => !knownBefore.has(id));
  for (const id of learnedSkillIds) {
    if (updated.skillIds.length < MAX_SKILL_SLOTS && !updated.skillIds.includes(id)) {
      updated.skillIds.push(id);
    }
  }

  const newMaxHp = getMaxHp(updated);
  updated.currentHp = Math.max(1, Math.min(newMaxHp, newMaxHp - missingHp));

  return { pet: updated, leveledUp: levelsGained > 0, levelsGained, learnedSkillIds };
}

/** 진화 가능 여부. 조건을 만족하면 진화 대상 정보를 돌려준다. */
export function evolutionTarget(pet: PetInstance): { shapeId: number; level: number } | null {
  const evo = getShape(pet.shapeId).evolvesTo;
  if (!evo) return null;
  return pet.level >= evo.level ? evo : null;
}

/** 진화하지 못하는 이유를 포함한 안내 (UI 표시용) */
export function evolutionInfo(pet: PetInstance): { target: number; requiredLevel: number } | null {
  const evo = getShape(pet.shapeId).evolvesTo;
  if (!evo) return null;
  return { target: evo.shapeId, requiredLevel: evo.level };
}

/**
 * 진화. 성장률·원소 배분·레벨·경험치는 그대로 두고 종만 바뀐다.
 * 기본 스탯이 오르므로 0레벨 스탯을 새 종 기준으로 다시 계산하는데,
 * 이때도 같은 성장률을 곱하므로 개체의 우열은 진화 후에도 유지된다.
 */
export function evolvePet(pet: PetInstance): PetInstance {
  const evo = evolutionTarget(pet);
  if (!evo) return pet;

  const hpRatio = pet.currentHp / getMaxHp(pet);
  const evolved: PetInstance = {
    ...pet,
    shapeId: evo.shapeId,
    level0Stat: level0StatFor(evo.shapeId, pet.growthRates, pet.nature, pet.personality),
  };

  const keptSkills = evolved.skillIds.filter((id) =>
    learnableSkillsAt(evo.shapeId, evolved.level).includes(id),
  );
  const newSkills = learnableSkillsAt(evo.shapeId, evolved.level).filter((id) => !keptSkills.includes(id));
  evolved.skillIds = [...keptSkills, ...newSkills].slice(0, MAX_SKILL_SLOTS);
  if (evolved.skillIds.length === 0) {
    evolved.skillIds = learnableSkillsAt(evo.shapeId, evolved.level).slice(0, MAX_SKILL_SLOTS);
  }

  evolved.currentHp = Math.max(1, Math.round(getMaxHp(evolved) * hpRatio));
  return evolved;
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

/**
 * 테이머 능력치. 펫과 같은 변환식을 쓰되 레벨에 선형으로 자란다.
 *
 * 펫보다 확실히 약하게 잡는다. 테이머는 펫이 쓰러진 뒤에도 계속 싸우기 때문에,
 * 펫과 비슷한 HP를 주면 사실상 체력이 두 배가 되어 초반 승률이 93~100%까지 올라간다.
 * VIT를 펫의 절반 수준으로 낮춰 "한 번 더 버틸 기회"에 그치도록 했다.
 */
export function tamerAbility(level: number): PetAbility {
  const stat: PetStat = {
    STR: 4 + Math.round(level * 0.8),
    AGI: 4 + Math.round(level * 0.7),
    VIT: 4 + Math.round(level * 0.6),
    SPA: 4 + Math.round(level * 0.6),
    SPD: 4 + Math.round(level * 0.6),
    LCK: 4 + Math.round(level * 0.4),
  };
  return calculateAbilityFromStat(stat);
}

export function tamerMaxHp(level: number): number {
  return tamerAbility(level).HP;
}

export { getSkill };
