import type { Element, Skill } from './gameTypes';

function skill(
  id: string,
  name: string,
  element: Element,
  power: number,
  category: 'physical' | 'special',
  accuracy: number,
  description: string,
  extra: Partial<Skill> = {},
): Skill {
  return { id, name, element, power, category, accuracy, description, ...extra };
}

export const SKILLS: Record<string, Skill> = {
  // 무속성 — 자기 원소 배분으로 상성을 계산한다
  tackle: skill('tackle', '몸통박치기', 'none', 35, 'physical', 100, '자신의 원소 배분으로 상성이 계산되는 기본 공격.'),
  quickstrike: skill('quickstrike', '기습', 'none', 30, 'physical', 100, '반드시 먼저 공격한다.', { priority: 1 }),
  headbutt: skill('headbutt', '박치기', 'none', 55, 'physical', 95, '위력이 높은 무속성 공격.'),
  howl: skill('howl', '포효', 'none', 40, 'physical', 90, '낮은 확률로 상대를 마비시킨다.', {
    inflicts: { effect: 'paralysis', chance: 0.25 },
  }),
  lullaby: skill('lullaby', '자장가', 'none', 20, 'special', 90, '상대를 재운다. 수면 중에는 포획률이 오른다.', {
    inflicts: { effect: 'sleep', chance: 0.55 },
  }),

  // 화
  ember: skill('ember', '불씨', 'fire', 35, 'special', 100, '작은 불꽃을 날린다.'),
  fireball: skill('fireball', '화염구', 'fire', 45, 'special', 95, '불덩이를 던진다.'),
  flamefang: skill('flamefang', '화염송곳니', 'fire', 52, 'physical', 95, '불타는 이빨로 문다. 화상을 입힐 수 있다.', {
    inflicts: { effect: 'burn', chance: 0.3 },
  }),
  eruption: skill('eruption', '분화', 'fire', 60, 'special', 85, '대지를 뚫고 불길이 솟는다.'),

  // 수
  bubble: skill('bubble', '거품세례', 'water', 35, 'special', 100, '거품을 뿜는다.'),
  waterjet: skill('waterjet', '물줄기', 'water', 45, 'special', 95, '고압의 물을 쏜다.'),
  frostbite: skill('frostbite', '서리물기', 'water', 52, 'physical', 95, '얼어붙은 이빨로 문다. 동결시킬 수 있다.', {
    inflicts: { effect: 'freeze', chance: 0.25 },
  }),
  tidalwave: skill('tidalwave', '해일', 'water', 60, 'special', 85, '거대한 물결로 휩쓴다.'),

  // 지
  mudslap: skill('mudslap', '흙탕치기', 'earth', 35, 'physical', 100, '진흙을 끼얹는다.'),
  rockcharge: skill('rockcharge', '돌진', 'earth', 45, 'physical', 95, '바위처럼 단단하게 부딪친다.'),
  toxicspore: skill('toxicspore', '독포자', 'earth', 40, 'special', 95, '포자를 뿌려 중독시킨다.', {
    inflicts: { effect: 'poison', chance: 0.45 },
  }),
  earthquake: skill('earthquake', '지진', 'earth', 60, 'physical', 85, '대지를 뒤흔든다.'),

  // 풍
  gust: skill('gust', '돌풍', 'wind', 35, 'special', 100, '바람을 일으킨다.'),
  galeslash: skill('galeslash', '질풍베기', 'wind', 45, 'physical', 95, '바람을 칼날처럼 벤다.'),
  thunderclap: skill('thunderclap', '뇌명', 'wind', 52, 'special', 95, '번개를 부른다. 마비시킬 수 있다.', {
    inflicts: { effect: 'paralysis', chance: 0.3 },
  }),
  tempest: skill('tempest', '폭풍', 'wind', 60, 'special', 85, '폭풍으로 몰아친다.'),
};

export function getSkill(id: string): Skill {
  const s = SKILLS[id];
  if (!s) throw new Error(`Unknown skill id ${id}`);
  return s;
}

export function getSkills(ids: string[]): Skill[] {
  return ids.map(getSkill);
}
