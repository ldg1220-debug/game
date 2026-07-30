import type { PetInstance, PetShape } from './gameTypes';
import { PET_SHAPES } from './petData';
import { generatePetInstance } from './petUtils';

const RARITY_WEIGHT: Record<string, number> = {
  common: 70,
  uncommon: 25,
  rare: 5,
  boss: 1,
};

function weightedPick(shapes: PetShape[]): PetShape {
  const weighted = shapes.map((s) => ({ shape: s, weight: RARITY_WEIGHT[s.rarity] ?? 1 }));
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.shape;
  }
  return shapes[0];
}

function instanceFromShape(shape: PetShape, level: number): PetInstance {
  const primary = shape.elements[Math.floor(Math.random() * shape.elements.length)];
  const secondary = shape.elements.find((e) => e !== primary) ?? null;
  return generatePetInstance(shape.id, primary, secondary, level);
}

/** 초반 플레이어를 보호하는 구간. 이 레벨 미만에서는 common 종만, 동레벨 이하로만 출현한다. */
const NOVICE_LEVEL = 5;

export function rollFieldEncounter(playerLevel: number): PetInstance {
  const novice = playerLevel < NOVICE_LEVEL;
  const pool = PET_SHAPES.filter(
    (s) => s.rarity !== 'boss' && s.region === '푸른 초원' && (!novice || s.rarity === 'common'),
  );
  const shape = weightedPick(pool);
  // 야생 개체는 플레이어보다 살짝 낮은 레벨대에서 출현시켜 첫 전투가 성립하도록 한다.
  const level = novice
    ? clamp(randomInt(playerLevel - 1, playerLevel), 1, 20)
    : clamp(randomInt(playerLevel - 2, playerLevel + 1), 1, 20);
  return instanceFromShape(shape, level);
}

export function rollDungeonEncounter(playerLevel: number): PetInstance {
  const pool = PET_SHAPES.filter((s) => s.rarity !== 'common');
  const shape = weightedPick(pool);
  const level = clamp(randomInt(playerLevel, playerLevel + 4), 5, 30);
  return instanceFromShape(shape, level);
}

export function battleRewards(enemy: PetInstance): { gold: number; exp: number } {
  return {
    gold: enemy.level * 10 + randomInt(0, 10),
    exp: enemy.level * 8 + randomInt(0, 5),
  };
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
