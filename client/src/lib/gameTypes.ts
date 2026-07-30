export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'none';

export const ELEMENTS: Element[] = ['fire', 'water', 'earth', 'wind', 'none'];

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

export interface Skill {
  id: string;
  name: string;
  element: Element;
  power: number;
  category: 'physical' | 'special';
  accuracy: number;
  priority?: number;
}

export interface PetShape {
  id: number;
  name: string;
  elements: Element[];
  rarity: 'common' | 'uncommon' | 'rare' | 'boss';
  baseStat: PetStat;
  region: string;
}

export interface GrowthRates extends Record<StatKey, number> {}

export interface PetInstance {
  id: string;
  shapeId: number;
  elementPrimary: Element;
  elementSecondary: Element | null;
  secondaryRatio: number;
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
  caughtAt: number;
}

export interface PlayerState {
  name: string;
  level: number;
  experience: number;
  gold: number;
}

export interface PokedexEntry {
  shapeId: number;
  elementPrimary: Element;
  caught: boolean;
  count: number;
}

export type LocationId = 'town' | 'field' | 'dungeon';

export interface GameState {
  player: PlayerState;
  team: PetInstance[];
  box: PetInstance[];
  pokedex: PokedexEntry[];
  currentLocation: LocationId;
  currentRegion: string;
  pokeballs: Record<string, number>;
  potions: number;
  pvpRanking: number;
}

export type PokeballType = 'normal' | 'good' | 'super' | 'master';

export interface Pokeball {
  id: PokeballType;
  name: string;
  multiplier: number;
  cost: number;
}
