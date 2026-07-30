import type { Element, PetShape, Skill } from './gameTypes';

export const SKILLS: Record<string, Skill> = {
  tackle: { id: 'tackle', name: '몸통박치기', element: 'none', power: 35, category: 'physical', accuracy: 100 },
  quickstrike: { id: 'quickstrike', name: '기습', element: 'none', power: 30, category: 'physical', accuracy: 100, priority: 1 },
  fireball: { id: 'fireball', name: '화염구', element: 'fire', power: 45, category: 'special', accuracy: 95 },
  ember: { id: 'ember', name: '불씨', element: 'fire', power: 35, category: 'special', accuracy: 100 },
  waterjet: { id: 'waterjet', name: '물줄기', element: 'water', power: 45, category: 'special', accuracy: 95 },
  bubble: { id: 'bubble', name: '거품세례', element: 'water', power: 35, category: 'special', accuracy: 100 },
  rockcharge: { id: 'rockcharge', name: '돌진', element: 'earth', power: 45, category: 'physical', accuracy: 95 },
  mudslap: { id: 'mudslap', name: '흙탕치기', element: 'earth', power: 35, category: 'physical', accuracy: 100 },
  galeslash: { id: 'galeslash', name: '질풍베기', element: 'wind', power: 45, category: 'physical', accuracy: 95 },
  gust: { id: 'gust', name: '돌풍', element: 'wind', power: 35, category: 'special', accuracy: 100 },
};

export const ELEMENT_MOVES: Record<Element, string[]> = {
  fire: ['fireball', 'ember'],
  water: ['waterjet', 'bubble'],
  earth: ['rockcharge', 'mudslap'],
  wind: ['galeslash', 'gust'],
  none: ['tackle', 'quickstrike'],
};

export const PET_SHAPES: PetShape[] = [
  // 1~3번은 스타터 종. HP가 VIT에 5배로 걸리는 구조라 VIT가 낮으면 총합이 같아도
  // 실전에서 크게 밀린다. 세 종 모두 VIT 7~8 구간에 두어 출발선을 맞추고,
  // 개성은 속도/화력/내구 배분으로 준다.
  {
    id: 1,
    name: '솜털토끼',
    elements: ['none', 'wind'],
    rarity: 'common',
    baseStat: { STR: 7, AGI: 9, VIT: 7, SPA: 5, SPD: 5, LCK: 6 },
    region: '푸른 초원',
  },
  {
    id: 2,
    name: '불꽃여우',
    elements: ['fire'],
    rarity: 'common',
    baseStat: { STR: 8, AGI: 8, VIT: 7, SPA: 9, SPD: 5, LCK: 5 },
    region: '푸른 초원',
  },
  {
    id: 3,
    name: '물방울슬라임',
    elements: ['water'],
    rarity: 'common',
    baseStat: { STR: 6, AGI: 5, VIT: 8, SPA: 8, SPD: 6, LCK: 5 },
    region: '푸른 초원',
  },
  {
    id: 4,
    name: '이끼거북',
    elements: ['earth', 'water'],
    rarity: 'common',
    baseStat: { STR: 7, AGI: 3, VIT: 11, SPA: 5, SPD: 6, LCK: 4 },
    region: '푸른 초원',
  },
  {
    id: 5,
    name: '바람참새',
    elements: ['wind'],
    rarity: 'common',
    baseStat: { STR: 5, AGI: 10, VIT: 5, SPA: 6, SPD: 6, LCK: 5 },
    region: '푸른 초원',
  },
  {
    id: 6,
    name: '반딧불이',
    elements: ['fire', 'wind'],
    rarity: 'common',
    baseStat: { STR: 4, AGI: 8, VIT: 5, SPA: 9, SPD: 5, LCK: 7 },
    region: '푸른 초원',
  },
  {
    id: 7,
    name: '조약돌두더지',
    elements: ['earth'],
    rarity: 'common',
    baseStat: { STR: 9, AGI: 4, VIT: 9, SPA: 4, SPD: 5, LCK: 4 },
    region: '푸른 초원',
  },
  {
    id: 8,
    name: '안개고양이',
    elements: ['water', 'none'],
    rarity: 'uncommon',
    baseStat: { STR: 7, AGI: 9, VIT: 6, SPA: 7, SPD: 6, LCK: 7 },
    region: '푸른 초원',
  },
  {
    id: 9,
    name: '화산도마뱀',
    elements: ['fire', 'earth'],
    rarity: 'uncommon',
    baseStat: { STR: 9, AGI: 5, VIT: 8, SPA: 8, SPD: 5, LCK: 4 },
    region: '푸른 초원',
  },
  {
    id: 10,
    name: '폭풍매',
    elements: ['wind', 'water'],
    rarity: 'uncommon',
    baseStat: { STR: 8, AGI: 10, VIT: 5, SPA: 7, SPD: 5, LCK: 6 },
    region: '푸른 초원',
  },
  {
    id: 11,
    name: '크리스탈사슴',
    elements: ['earth', 'none'],
    rarity: 'uncommon',
    baseStat: { STR: 6, AGI: 7, VIT: 8, SPA: 8, SPD: 8, LCK: 6 },
    region: '푸른 초원',
  },
  {
    id: 12,
    name: '그림자늑대',
    elements: ['none'],
    rarity: 'uncommon',
    baseStat: { STR: 10, AGI: 9, VIT: 6, SPA: 5, SPD: 5, LCK: 6 },
    region: '푸른 초원',
  },
  {
    id: 13,
    name: '빛나는부엉이',
    elements: ['wind', 'none'],
    rarity: 'rare',
    baseStat: { STR: 6, AGI: 8, VIT: 6, SPA: 11, SPD: 9, LCK: 7 },
    region: '푸른 초원',
  },
  {
    id: 14,
    name: '태초의거북',
    elements: ['earth', 'water'],
    rarity: 'boss',
    baseStat: { STR: 12, AGI: 6, VIT: 16, SPA: 10, SPD: 10, LCK: 8 },
    region: '초원의 동굴',
  },
];

export function getShape(shapeId: number): PetShape {
  const shape = PET_SHAPES.find((s) => s.id === shapeId);
  if (!shape) throw new Error(`Unknown shape id ${shapeId}`);
  return shape;
}

export function movesForElement(element: Element): Skill[] {
  return ELEMENT_MOVES[element].map((id) => SKILLS[id]);
}
