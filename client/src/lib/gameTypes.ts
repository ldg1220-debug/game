/** 스킬에 붙는 속성. 'none'(무)은 상성을 타지 않는 무속성 스킬을 뜻한다. */
export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'none';

/** 펫의 원소 배분에 쓰이는 4원소. 무는 배분 대상이 아니다. */
export type CoreElement = 'fire' | 'water' | 'earth' | 'wind';

export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'wind', 'none'];

export const CORE_ELEMENTS: CoreElement[] = ['fire', 'water', 'earth', 'wind'];

/**
 * 펫 하나가 가지는 원소 포인트 총합. 스톤에이지의 화9수1 같은 배분을 그대로 쓴다.
 * 같은 종이라도 개체마다 배분이 달라서 성장률과 함께 개체차를 만든다.
 */
export const ELEMENT_POINT_TOTAL = 10;

/** 4원소에 걸친 포인트 배분. 합은 항상 ELEMENT_POINT_TOTAL. */
export type ElementPoints = Record<CoreElement, number>;

export const ELEMENT_LABEL: Record<Element, string> = {
  fire: '화',
  water: '수',
  earth: '지',
  wind: '풍',
  none: '무',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#e2543f',
  water: '#3f8fe2',
  earth: '#5aa858',
  wind: '#d9c04a',
  none: '#9298a8',
};

/** 배분에서 포인트가 가장 높은 원소. 스프라이트 색과 대표 속성 표시에 쓴다. */
export function dominantElement(points: ElementPoints): CoreElement {
  return CORE_ELEMENTS.reduce((best, e) => (points[e] > points[best] ? e : best), CORE_ELEMENTS[0]);
}

/** 포인트가 1 이상인 원소를 많은 순으로. 배분 표시용. */
export function activeElements(points: ElementPoints): CoreElement[] {
  return CORE_ELEMENTS.filter((e) => points[e] > 0).sort((a, b) => points[b] - points[a]);
}

/** "화9 수1" 형태의 표기 */
export function formatElementPoints(points: ElementPoints): string {
  return activeElements(points)
    .map((e) => `${ELEMENT_LABEL[e]}${points[e]}`)
    .join(' ');
}

export type StatKey = 'STR' | 'AGI' | 'VIT' | 'SPA' | 'SPD' | 'LCK';

export const STAT_KEYS: StatKey[] = ['STR', 'AGI', 'VIT', 'SPA', 'SPD', 'LCK'];

export type PetStat = Record<StatKey, number>;

export interface PetAbility {
  HP: number;
  ATK: number;
  DEF: number;
  SPA: number;
  SPD: number;
  SPE: number;
  CRI: number;
}

export type Nature =
  | '용감한'
  | '민첩한'
  | '튼튼한'
  | '똑똑한'
  | '신중한'
  | '균형잡힌';

export const NATURES: Record<Nature, { boost: StatKey | null; cut: StatKey | null }> = {
  용감한: { boost: 'STR', cut: 'AGI' },
  민첩한: { boost: 'AGI', cut: 'STR' },
  튼튼한: { boost: 'VIT', cut: 'SPA' },
  똑똑한: { boost: 'SPA', cut: 'VIT' },
  신중한: { boost: 'SPD', cut: 'AGI' },
  균형잡힌: { boost: null, cut: null },
};

export type Personality = '크리티컬' | '회피' | '경험치' | '운' | '회복' | '일반';

export const PERSONALITIES: Record<
  Personality,
  { statBonus?: Partial<PetStat>; expBonusPct?: number }
> = {
  크리티컬: { statBonus: { LCK: 2 } },
  회피: { statBonus: { AGI: 1 } },
  경험치: { expBonusPct: 10 },
  운: { statBonus: { LCK: 3 } },
  회복: { statBonus: { VIT: 1 } },
  일반: {},
};

/** 상태이상. 포획률 보정(수면·동결 1.5배)도 여기에 연동된다. */
export type StatusEffect = 'poison' | 'paralysis' | 'sleep' | 'burn' | 'freeze';

export const STATUS_LABEL: Record<StatusEffect, string> = {
  poison: '독',
  paralysis: '마비',
  sleep: '수면',
  burn: '화상',
  freeze: '동결',
};

export const STATUS_ICON: Record<StatusEffect, string> = {
  poison: '☠',
  paralysis: '⚡',
  sleep: '💤',
  burn: '🔥',
  freeze: '❄',
};

export const STATUS_COLOR: Record<StatusEffect, string> = {
  poison: '#a25fd0',
  paralysis: '#d9c04a',
  sleep: '#7d8bb5',
  burn: '#e2543f',
  freeze: '#5fc8e2',
};

export interface ActiveStatus {
  effect: StatusEffect;
  turnsLeft: number;
}

export interface Skill {
  id: string;
  name: string;
  element: Element;
  power: number;
  category: 'physical' | 'special';
  accuracy: number;
  priority?: number;
  /** 명중 시 상태이상을 부여할 확률(0~1)과 종류 */
  inflicts?: { effect: StatusEffect; chance: number };
  description: string;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'boss';

export interface PetShape {
  id: number;
  name: string;
  /** 원소 배분을 굴릴 때 중심이 되는 원소. 첫 번째가 주 원소. */
  elementBias: CoreElement[];
  rarity: Rarity;
  baseStat: PetStat;
  region: string;
  /** 레벨업으로 배우는 스킬 (레벨 오름차순) */
  learnset: { level: number; skillId: string }[];
  /** 진화 대상. 조건을 만족하면 해당 종으로 진화한다. */
  evolvesTo?: { shapeId: number; level: number };
}

export interface GrowthRates extends Record<StatKey, number> {}

/** 펫이 동시에 들고 다닐 수 있는 스킬 수 */
export const MAX_SKILL_SLOTS = 4;

export interface PetInstance {
  id: string;
  shapeId: number;
  /** 4원소 10포인트 배분. 개체마다 다르다. */
  elementPoints: ElementPoints;
  nickname?: string;
  level: number;
  experience: number;
  growthRates: GrowthRates;
  averageGrowthRate: number;
  isLegendary: boolean;
  nature: Nature;
  personality: Personality;
  level0Stat: PetStat;
  currentHp: number;
  /** 습득해서 장착 중인 스킬 (최대 MAX_SKILL_SLOTS개) */
  skillIds: string[];
  caughtAt: number;
}

export interface PlayerState {
  name: string;
  level: number;
  experience: number;
  gold: number;
  /**
   * 테이머도 펫과 함께 전투에 참여한다(스톤에이지 방식).
   * 전투 중 남은 HP를 보관하고, 능력치는 레벨에서 파생한다.
   */
  currentHp: number;
}

/** 도감은 형상(종) 단위로 기록한다. 원소 배분은 개체마다 달라 집계 기준이 되지 않는다. */
export interface PokedexEntry {
  shapeId: number;
  caught: boolean;
  count: number;
  /** 지금까지 이 종에서 본 가장 높은 평균 성장률 */
  bestGrowthRate: number;
}

export type LocationId = 'town' | 'field' | 'dungeon';

export interface Region {
  id: string;
  name: string;
  levelRange: [number, number];
  townName: string;
  fieldName: string;
  dungeonName: string;
  description: string;
}

/** 세이브 구조가 바뀌면 올린다. 불일치 시 storage에서 마이그레이션한다. */
export const SAVE_VERSION = 2;

export interface GameState {
  version: number;
  player: PlayerState;
  team: PetInstance[];
  box: PetInstance[];
  pokedex: PokedexEntry[];
  currentLocation: LocationId;
  currentRegionId: string;
  unlockedRegionIds: string[];
  pokeballs: Record<string, number>;
  potions: number;
  antidotes: number;
  evolutionStones: number;
  pvpRanking: number;
}

export type PokeballType = 'normal' | 'good' | 'super' | 'master';

export interface Pokeball {
  id: PokeballType;
  name: string;
  multiplier: number;
  cost: number;
}
