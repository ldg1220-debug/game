import type { PetInstance, PetShape, Rarity } from './gameTypes';
import { getRegion, wildShapesFor } from './petData';
import { generatePetInstance } from './petUtils';

const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 70,
  uncommon: 25,
  rare: 5,
  boss: 1,
};

/** 초반 플레이어를 보호하는 구간. 이 레벨 미만에서는 common 종만, 동레벨 이하로만 출현한다. */
const NOVICE_LEVEL = 5;

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function weightedPick(shapes: PetShape[]): PetShape {
  const total = shapes.reduce((sum, s) => sum + RARITY_WEIGHT[s.rarity], 0);
  let roll = Math.random() * total;
  for (const s of shapes) {
    roll -= RARITY_WEIGHT[s.rarity];
    if (roll <= 0) return s;
  }
  return shapes[0];
}

export function rollFieldEncounter(regionId: string, playerLevel: number): PetInstance {
  const region = getRegion(regionId);
  const novice = playerLevel < NOVICE_LEVEL;
  const pool = wildShapesFor(regionId).filter(
    (s) => s.rarity !== 'boss' && (!novice || s.rarity === 'common'),
  );
  const shape = weightedPick(pool);

  // 야생 개체는 플레이어보다 살짝 낮은 레벨대에서 출현시켜 첫 전투가 성립하도록 한다.
  const [minLv, maxLv] = region.levelRange;
  const level = novice
    ? clamp(randomInt(playerLevel - 1, playerLevel), 1, maxLv)
    : clamp(randomInt(playerLevel - 2, playerLevel + 1), minLv, maxLv);

  return generatePetInstance(shape.id, level);
}

export function rollDungeonEncounter(regionId: string, playerLevel: number): PetInstance {
  const region = getRegion(regionId);
  const pool = wildShapesFor(regionId).filter((s) => s.rarity !== 'common');
  const shape = weightedPick(pool.length > 0 ? pool : wildShapesFor(regionId));
  const [minLv, maxLv] = region.levelRange;
  const level = clamp(randomInt(playerLevel, playerLevel + 4), minLv + 2, maxLv + 5);
  return generatePetInstance(shape.id, level);
}

/** 던전 보스. 지역당 하나. */
export function rollBossEncounter(regionId: string, playerLevel: number): PetInstance | null {
  const boss = wildShapesFor(regionId).find((s) => s.rarity === 'boss');
  if (!boss) return null;
  const [, maxLv] = getRegion(regionId).levelRange;
  return generatePetInstance(boss.id, clamp(playerLevel + 3, 8, maxLv + 5));
}

export function battleRewards(enemies: PetInstance[]): { gold: number; exp: number } {
  return enemies.reduce(
    (acc, e) => ({
      gold: acc.gold + e.level * 10 + randomInt(0, 10),
      exp: acc.exp + e.level * 8 + randomInt(0, 5),
    }),
    { gold: 0, exp: 0 },
  );
}
