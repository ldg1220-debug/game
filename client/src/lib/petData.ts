import type { PetShape, Region } from './gameTypes';

export const REGIONS: Region[] = [
  {
    id: 'plains',
    name: '푸른 초원',
    levelRange: [1, 20],
    townName: '초록빛 마을',
    fieldName: '푸른 초원',
    dungeonName: '초원의 동굴',
    description: '넓은 들판과 밝은 햇빛. 순한 펫들이 모여 산다.',
  },
  {
    id: 'forest',
    name: '울창한 숲',
    levelRange: [15, 35],
    townName: '나무그늘 마을',
    fieldName: '울창한 숲',
    dungeonName: '숲의 심장',
    description: '햇빛이 잘 들지 않는 깊은 숲. 자연 속성 펫이 강하게 자란다.',
  },
  {
    id: 'mountain',
    name: '험준한 산맥',
    levelRange: [30, 50],
    townName: '바위턱 마을',
    fieldName: '험준한 산맥',
    dungeonName: '산맥의 봉우리',
    description: '가파른 바위와 거친 바람. 지 속성 펫이 단단하게 버틴다.',
  },
  {
    id: 'volcano',
    name: '불타는 화산',
    levelRange: [45, 65],
    townName: '잿빛 마을',
    fieldName: '불타는 화산',
    dungeonName: '화산의 심장부',
    description: '용암이 흐르고 열기가 치솟는다. 화 속성 펫의 본거지.',
  },
  {
    id: 'glacier',
    name: '신비한 빙산',
    levelRange: [60, 80],
    townName: '서리항 마을',
    fieldName: '신비한 빙산',
    dungeonName: '빙산의 궁전',
    description: '끝없는 얼음과 차가운 바람. 가장 강한 펫들이 잠들어 있다.',
  },
];

export function getRegion(id: string): Region {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

/**
 * 펫 종 데이터.
 * elementBias[0]이 주 원소이며, 개체 생성 시 이 원소에 포인트가 몰리도록 배분을 굴린다.
 * evolvesTo가 있으면 해당 레벨에서 진화석을 써서 진화할 수 있다.
 */
export const PET_SHAPES: PetShape[] = [
  // ─────────── 푸른 초원 · 기본형 ───────────
  {
    id: 1,
    name: '솜털토끼',
    elementBias: ['wind'],
    rarity: 'common',
    baseStat: { STR: 7, AGI: 9, VIT: 7, SPA: 5, SPD: 5, LCK: 6 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'gust' },
      { level: 8, skillId: 'quickstrike' },
      { level: 14, skillId: 'galeslash' },
    ],
    evolvesTo: { shapeId: 15, level: 18 },
  },
  {
    id: 2,
    name: '불꽃여우',
    elementBias: ['fire'],
    rarity: 'common',
    baseStat: { STR: 8, AGI: 8, VIT: 7, SPA: 9, SPD: 5, LCK: 5 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'ember' },
      { level: 9, skillId: 'fireball' },
      { level: 15, skillId: 'flamefang' },
    ],
    evolvesTo: { shapeId: 16, level: 18 },
  },
  {
    id: 3,
    name: '물방울슬라임',
    elementBias: ['water'],
    rarity: 'common',
    baseStat: { STR: 6, AGI: 5, VIT: 8, SPA: 8, SPD: 6, LCK: 5 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'bubble' },
      { level: 9, skillId: 'waterjet' },
      { level: 15, skillId: 'frostbite' },
    ],
    evolvesTo: { shapeId: 17, level: 18 },
  },
  {
    id: 4,
    name: '이끼거북',
    elementBias: ['earth', 'water'],
    rarity: 'common',
    baseStat: { STR: 7, AGI: 3, VIT: 11, SPA: 5, SPD: 6, LCK: 4 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'mudslap' },
      { level: 10, skillId: 'rockcharge' },
      { level: 16, skillId: 'toxicspore' },
    ],
    evolvesTo: { shapeId: 18, level: 20 },
  },
  {
    id: 5,
    name: '바람참새',
    elementBias: ['wind'],
    rarity: 'common',
    baseStat: { STR: 5, AGI: 10, VIT: 5, SPA: 6, SPD: 6, LCK: 5 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'gust' },
      { level: 7, skillId: 'quickstrike' },
      { level: 13, skillId: 'galeslash' },
    ],
    evolvesTo: { shapeId: 19, level: 16 },
  },
  {
    id: 6,
    name: '반딧불이',
    elementBias: ['fire', 'wind'],
    rarity: 'common',
    baseStat: { STR: 4, AGI: 8, VIT: 5, SPA: 9, SPD: 5, LCK: 7 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'ember' },
      { level: 9, skillId: 'gust' },
      { level: 15, skillId: 'fireball' },
    ],
    evolvesTo: { shapeId: 20, level: 17 },
  },
  {
    id: 7,
    name: '조약돌두더지',
    elementBias: ['earth'],
    rarity: 'common',
    baseStat: { STR: 9, AGI: 4, VIT: 9, SPA: 4, SPD: 5, LCK: 4 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'mudslap' },
      { level: 10, skillId: 'rockcharge' },
      { level: 16, skillId: 'headbutt' },
    ],
    evolvesTo: { shapeId: 21, level: 18 },
  },

  // ─────────── 푸른 초원 · 상위 등급 ───────────
  {
    id: 8,
    name: '안개고양이',
    elementBias: ['water'],
    rarity: 'uncommon',
    baseStat: { STR: 7, AGI: 9, VIT: 6, SPA: 7, SPD: 6, LCK: 7 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'bubble' },
      { level: 11, skillId: 'quickstrike' },
      { level: 18, skillId: 'frostbite' },
    ],
  },
  {
    id: 9,
    name: '화산도마뱀',
    elementBias: ['fire', 'earth'],
    rarity: 'uncommon',
    baseStat: { STR: 9, AGI: 5, VIT: 8, SPA: 8, SPD: 5, LCK: 4 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'ember' },
      { level: 12, skillId: 'flamefang' },
      { level: 22, skillId: 'eruption' },
    ],
  },
  {
    id: 10,
    name: '폭풍매',
    elementBias: ['wind', 'water'],
    rarity: 'uncommon',
    baseStat: { STR: 8, AGI: 10, VIT: 5, SPA: 7, SPD: 5, LCK: 6 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'gust' },
      { level: 12, skillId: 'galeslash' },
      { level: 22, skillId: 'tempest' },
    ],
  },
  {
    id: 11,
    name: '크리스탈사슴',
    elementBias: ['earth'],
    rarity: 'uncommon',
    baseStat: { STR: 6, AGI: 7, VIT: 8, SPA: 8, SPD: 8, LCK: 6 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'mudslap' },
      { level: 12, skillId: 'rockcharge' },
      { level: 22, skillId: 'earthquake' },
    ],
  },
  {
    id: 12,
    name: '그림자늑대',
    elementBias: ['wind', 'fire'],
    rarity: 'uncommon',
    baseStat: { STR: 10, AGI: 9, VIT: 6, SPA: 5, SPD: 5, LCK: 6 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'howl' },
      { level: 12, skillId: 'headbutt' },
      { level: 20, skillId: 'galeslash' },
    ],
  },
  {
    id: 13,
    name: '빛나는부엉이',
    elementBias: ['wind'],
    rarity: 'rare',
    baseStat: { STR: 6, AGI: 8, VIT: 6, SPA: 11, SPD: 9, LCK: 7 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'gust' },
      { level: 1, skillId: 'lullaby' },
      { level: 14, skillId: 'thunderclap' },
      { level: 24, skillId: 'tempest' },
    ],
  },
  {
    id: 14,
    name: '태초의거북',
    elementBias: ['earth', 'water'],
    rarity: 'boss',
    baseStat: { STR: 12, AGI: 6, VIT: 16, SPA: 10, SPD: 10, LCK: 8 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'rockcharge' },
      { level: 1, skillId: 'waterjet' },
      { level: 1, skillId: 'toxicspore' },
      { level: 20, skillId: 'earthquake' },
    ],
  },

  // ─────────── 진화형 ───────────
  {
    id: 15,
    name: '질풍토끼',
    elementBias: ['wind'],
    rarity: 'uncommon',
    baseStat: { STR: 11, AGI: 14, VIT: 10, SPA: 7, SPD: 8, LCK: 8 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'quickstrike' },
      { level: 1, skillId: 'galeslash' },
      { level: 24, skillId: 'thunderclap' },
      { level: 30, skillId: 'tempest' },
    ],
  },
  {
    id: 16,
    name: '홍염여우',
    elementBias: ['fire'],
    rarity: 'uncommon',
    baseStat: { STR: 12, AGI: 12, VIT: 10, SPA: 14, SPD: 8, LCK: 7 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'fireball' },
      { level: 1, skillId: 'flamefang' },
      { level: 24, skillId: 'howl' },
      { level: 30, skillId: 'eruption' },
    ],
  },
  {
    id: 17,
    name: '해류슬라임',
    elementBias: ['water'],
    rarity: 'uncommon',
    baseStat: { STR: 9, AGI: 8, VIT: 13, SPA: 13, SPD: 10, LCK: 7 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'waterjet' },
      { level: 1, skillId: 'frostbite' },
      { level: 24, skillId: 'lullaby' },
      { level: 30, skillId: 'tidalwave' },
    ],
  },
  {
    id: 18,
    name: '바위거북',
    elementBias: ['earth', 'water'],
    rarity: 'rare',
    baseStat: { STR: 12, AGI: 5, VIT: 17, SPA: 8, SPD: 11, LCK: 6 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'rockcharge' },
      { level: 1, skillId: 'toxicspore' },
      { level: 26, skillId: 'waterjet' },
      { level: 32, skillId: 'earthquake' },
    ],
  },
  {
    id: 19,
    name: '창공제비',
    elementBias: ['wind'],
    rarity: 'uncommon',
    baseStat: { STR: 9, AGI: 15, VIT: 8, SPA: 10, SPD: 9, LCK: 8 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'quickstrike' },
      { level: 1, skillId: 'galeslash' },
      { level: 22, skillId: 'thunderclap' },
      { level: 28, skillId: 'tempest' },
    ],
  },
  {
    id: 20,
    name: '불나방',
    elementBias: ['fire', 'wind'],
    rarity: 'uncommon',
    baseStat: { STR: 7, AGI: 12, VIT: 8, SPA: 14, SPD: 8, LCK: 10 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'fireball' },
      { level: 1, skillId: 'gust' },
      { level: 22, skillId: 'lullaby' },
      { level: 28, skillId: 'eruption' },
    ],
  },
  {
    id: 21,
    name: '바위두더지',
    elementBias: ['earth'],
    rarity: 'uncommon',
    baseStat: { STR: 14, AGI: 6, VIT: 13, SPA: 6, SPD: 8, LCK: 6 },
    region: 'plains',
    learnset: [
      { level: 1, skillId: 'rockcharge' },
      { level: 1, skillId: 'headbutt' },
      { level: 24, skillId: 'toxicspore' },
      { level: 30, skillId: 'earthquake' },
    ],
  },

  // ─────────── 울창한 숲 ───────────
  {
    id: 22,
    name: '덩굴뱀',
    elementBias: ['earth', 'wind'],
    rarity: 'common',
    baseStat: { STR: 10, AGI: 11, VIT: 8, SPA: 8, SPD: 7, LCK: 6 },
    region: 'forest',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'mudslap' },
      { level: 20, skillId: 'toxicspore' },
      { level: 28, skillId: 'earthquake' },
    ],
  },
  {
    id: 23,
    name: '버섯두꺼비',
    elementBias: ['earth'],
    rarity: 'common',
    baseStat: { STR: 8, AGI: 5, VIT: 14, SPA: 10, SPD: 9, LCK: 5 },
    region: 'forest',
    learnset: [
      { level: 1, skillId: 'tackle' },
      { level: 1, skillId: 'toxicspore' },
      { level: 20, skillId: 'lullaby' },
      { level: 28, skillId: 'earthquake' },
    ],
  },
  {
    id: 24,
    name: '늪지악어',
    elementBias: ['water', 'earth'],
    rarity: 'uncommon',
    baseStat: { STR: 14, AGI: 7, VIT: 12, SPA: 7, SPD: 8, LCK: 5 },
    region: 'forest',
    learnset: [
      { level: 1, skillId: 'headbutt' },
      { level: 1, skillId: 'bubble' },
      { level: 22, skillId: 'frostbite' },
      { level: 30, skillId: 'tidalwave' },
    ],
  },
  {
    id: 25,
    name: '달빛표범',
    elementBias: ['wind', 'water'],
    rarity: 'uncommon',
    baseStat: { STR: 13, AGI: 14, VIT: 9, SPA: 9, SPD: 8, LCK: 9 },
    region: 'forest',
    learnset: [
      { level: 1, skillId: 'quickstrike' },
      { level: 1, skillId: 'galeslash' },
      { level: 24, skillId: 'howl' },
      { level: 32, skillId: 'tempest' },
    ],
  },
  {
    id: 26,
    name: '고대나무정령',
    elementBias: ['earth', 'wind'],
    rarity: 'rare',
    baseStat: { STR: 11, AGI: 6, VIT: 15, SPA: 13, SPD: 13, LCK: 7 },
    region: 'forest',
    learnset: [
      { level: 1, skillId: 'toxicspore' },
      { level: 1, skillId: 'gust' },
      { level: 26, skillId: 'lullaby' },
      { level: 34, skillId: 'earthquake' },
    ],
  },
  {
    id: 27,
    name: '숲의수호자',
    elementBias: ['earth', 'wind'],
    rarity: 'boss',
    baseStat: { STR: 17, AGI: 10, VIT: 19, SPA: 14, SPD: 14, LCK: 9 },
    region: 'forest',
    learnset: [
      { level: 1, skillId: 'earthquake' },
      { level: 1, skillId: 'tempest' },
      { level: 1, skillId: 'toxicspore' },
      { level: 30, skillId: 'howl' },
    ],
  },

  // ─────────── 험준한 산맥 ───────────
  {
    id: 28,
    name: '뿔산양',
    elementBias: ['earth'],
    rarity: 'common',
    baseStat: { STR: 16, AGI: 12, VIT: 18, SPA: 8, SPD: 14, LCK: 7 },
    region: 'mountain',
    learnset: [
      { level: 1, skillId: 'headbutt' },
      { level: 1, skillId: 'rockcharge' },
      { level: 34, skillId: 'earthquake' },
      { level: 42, skillId: 'howl' },
    ],
  },
  {
    id: 29,
    name: '바위게',
    elementBias: ['earth', 'water'],
    rarity: 'common',
    baseStat: { STR: 15, AGI: 7, VIT: 23, SPA: 9, SPD: 18, LCK: 6 },
    region: 'mountain',
    learnset: [
      { level: 1, skillId: 'rockcharge' },
      { level: 1, skillId: 'bubble' },
      { level: 34, skillId: 'frostbite' },
      { level: 42, skillId: 'earthquake' },
    ],
  },
  {
    id: 30,
    name: '폭풍독수리',
    elementBias: ['wind'],
    rarity: 'uncommon',
    baseStat: { STR: 17, AGI: 19, VIT: 16, SPA: 13, SPD: 13, LCK: 9 },
    region: 'mountain',
    learnset: [
      { level: 1, skillId: 'galeslash' },
      { level: 1, skillId: 'quickstrike' },
      { level: 36, skillId: 'thunderclap' },
      { level: 44, skillId: 'tempest' },
    ],
  },
  {
    id: 31,
    name: '설인',
    elementBias: ['earth', 'water'],
    rarity: 'rare',
    baseStat: { STR: 20, AGI: 9, VIT: 26, SPA: 11, SPD: 19, LCK: 7 },
    region: 'mountain',
    learnset: [
      { level: 1, skillId: 'headbutt' },
      { level: 1, skillId: 'frostbite' },
      { level: 38, skillId: 'earthquake' },
      { level: 46, skillId: 'tidalwave' },
    ],
  },
  {
    id: 32,
    name: '산맥의패왕',
    elementBias: ['earth', 'wind'],
    rarity: 'boss',
    baseStat: { STR: 24, AGI: 14, VIT: 31, SPA: 16, SPD: 24, LCK: 10 },
    region: 'mountain',
    learnset: [
      { level: 1, skillId: 'earthquake' },
      { level: 1, skillId: 'tempest' },
      { level: 1, skillId: 'headbutt' },
      { level: 45, skillId: 'howl' },
    ],
  },

  // ─────────── 불타는 화산 ───────────
  {
    id: 33,
    name: '용암달팽이',
    elementBias: ['fire'],
    rarity: 'common',
    baseStat: { STR: 16, AGI: 6, VIT: 29, SPA: 17, SPD: 23, LCK: 7 },
    region: 'volcano',
    learnset: [
      { level: 1, skillId: 'ember' },
      { level: 1, skillId: 'fireball' },
      { level: 50, skillId: 'flamefang' },
      { level: 58, skillId: 'eruption' },
    ],
  },
  {
    id: 34,
    name: '잿빛까마귀',
    elementBias: ['fire', 'wind'],
    rarity: 'common',
    baseStat: { STR: 18, AGI: 21, VIT: 19, SPA: 18, SPD: 16, LCK: 11 },
    region: 'volcano',
    learnset: [
      { level: 1, skillId: 'gust' },
      { level: 1, skillId: 'ember' },
      { level: 50, skillId: 'thunderclap' },
      { level: 58, skillId: 'eruption' },
    ],
  },
  {
    id: 35,
    name: '마그마골렘',
    elementBias: ['fire', 'earth'],
    rarity: 'uncommon',
    baseStat: { STR: 24, AGI: 8, VIT: 31, SPA: 16, SPD: 23, LCK: 7 },
    region: 'volcano',
    learnset: [
      { level: 1, skillId: 'rockcharge' },
      { level: 1, skillId: 'flamefang' },
      { level: 52, skillId: 'earthquake' },
      { level: 60, skillId: 'eruption' },
    ],
  },
  {
    id: 36,
    name: '불사조',
    elementBias: ['fire'],
    rarity: 'rare',
    baseStat: { STR: 20, AGI: 22, VIT: 24, SPA: 25, SPD: 24, LCK: 13 },
    region: 'volcano',
    learnset: [
      { level: 1, skillId: 'fireball' },
      { level: 1, skillId: 'tempest' },
      { level: 54, skillId: 'flamefang' },
      { level: 62, skillId: 'eruption' },
    ],
  },
  {
    id: 37,
    name: '화산의군주',
    elementBias: ['fire', 'earth'],
    rarity: 'boss',
    baseStat: { STR: 30, AGI: 17, VIT: 39, SPA: 26, SPD: 31, LCK: 12 },
    region: 'volcano',
    learnset: [
      { level: 1, skillId: 'eruption' },
      { level: 1, skillId: 'earthquake' },
      { level: 1, skillId: 'flamefang' },
      { level: 60, skillId: 'howl' },
    ],
  },

  // ─────────── 신비한 빙산 ───────────
  {
    id: 38,
    name: '얼음여우',
    elementBias: ['water'],
    rarity: 'common',
    baseStat: { STR: 20, AGI: 22, VIT: 24, SPA: 24, SPD: 25, LCK: 11 },
    region: 'glacier',
    learnset: [
      { level: 1, skillId: 'bubble' },
      { level: 1, skillId: 'frostbite' },
      { level: 66, skillId: 'waterjet' },
      { level: 74, skillId: 'tidalwave' },
    ],
  },
  {
    id: 39,
    name: '빙하매머드',
    elementBias: ['water', 'earth'],
    rarity: 'common',
    baseStat: { STR: 28, AGI: 10, VIT: 39, SPA: 16, SPD: 28, LCK: 8 },
    region: 'glacier',
    learnset: [
      { level: 1, skillId: 'headbutt' },
      { level: 1, skillId: 'frostbite' },
      { level: 66, skillId: 'earthquake' },
      { level: 74, skillId: 'tidalwave' },
    ],
  },
  {
    id: 40,
    name: '서리정령',
    elementBias: ['water', 'wind'],
    rarity: 'uncommon',
    baseStat: { STR: 18, AGI: 24, VIT: 26, SPA: 30, SPD: 33, LCK: 13 },
    region: 'glacier',
    learnset: [
      { level: 1, skillId: 'frostbite' },
      { level: 1, skillId: 'gust' },
      { level: 68, skillId: 'lullaby' },
      { level: 76, skillId: 'tidalwave' },
    ],
  },
  {
    id: 41,
    name: '심해리바이어던',
    elementBias: ['water'],
    rarity: 'rare',
    baseStat: { STR: 30, AGI: 18, VIT: 41, SPA: 28, SPD: 31, LCK: 11 },
    region: 'glacier',
    learnset: [
      { level: 1, skillId: 'waterjet' },
      { level: 1, skillId: 'frostbite' },
      { level: 70, skillId: 'earthquake' },
      { level: 78, skillId: 'tidalwave' },
    ],
  },
  {
    id: 42,
    name: '빙산의여왕',
    elementBias: ['water', 'wind'],
    rarity: 'boss',
    baseStat: { STR: 32, AGI: 26, VIT: 46, SPA: 34, SPD: 40, LCK: 15 },
    region: 'glacier',
    learnset: [
      { level: 1, skillId: 'tidalwave' },
      { level: 1, skillId: 'tempest' },
      { level: 1, skillId: 'frostbite' },
      { level: 75, skillId: 'lullaby' },
    ],
  },
];

const SHAPE_BY_ID = new Map(PET_SHAPES.map((s) => [s.id, s]));

export function getShape(shapeId: number): PetShape {
  const shape = SHAPE_BY_ID.get(shapeId);
  if (!shape) throw new Error(`Unknown shape id ${shapeId}`);
  return shape;
}

/** 야생에 출현하는 종. 진화형은 야생에서 나오지 않는다. */
const EVOLVED_IDS = new Set(PET_SHAPES.filter((s) => s.evolvesTo).map((s) => s.evolvesTo!.shapeId));

export function isEvolvedForm(shapeId: number): boolean {
  return EVOLVED_IDS.has(shapeId);
}

export function wildShapesFor(regionId: string): PetShape[] {
  return PET_SHAPES.filter((s) => s.region === regionId && !isEvolvedForm(s.id));
}

/** 해당 레벨까지 배울 수 있는 스킬 전부 */
export function learnableSkillsAt(shapeId: number, level: number): string[] {
  return getShape(shapeId)
    .learnset.filter((l) => l.level <= level)
    .map((l) => l.skillId);
}

/** 정확히 이 레벨에 배우는 스킬 */
export function skillsLearnedAt(shapeId: number, level: number): string[] {
  return getShape(shapeId)
    .learnset.filter((l) => l.level === level)
    .map((l) => l.skillId);
}
