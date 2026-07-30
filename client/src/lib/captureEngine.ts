import type { Pokeball, PokeballType, PetInstance } from './gameTypes';
import { getMaxHp } from './petUtils';
import { getShape } from './petData';

export const POKEBALLS: Record<PokeballType, Pokeball> = {
  normal: { id: 'normal', name: '일반 포켓볼', multiplier: 1.0, cost: 50 },
  good: { id: 'good', name: '좋은 포켓볼', multiplier: 1.5, cost: 150 },
  super: { id: 'super', name: '슈퍼 포켓볼', multiplier: 2.0, cost: 400 },
  master: { id: 'master', name: '마스터볼', multiplier: 4.0, cost: 3000 },
};

const RARITY_FACTOR: Record<string, number> = {
  common: 1.0,
  uncommon: 0.8,
  rare: 0.6,
  boss: 0.3,
};

export type PetStatus = 'normal' | 'asleep' | 'frozen';

const STATUS_MULTIPLIER: Record<PetStatus, number> = {
  normal: 1.0,
  asleep: 1.5,
  frozen: 1.5,
};

const BASE_CAPTURE_RATE = 0.4;

export function calculateCaptureRate(
  pet: PetInstance,
  pokeball: Pokeball,
  playerLevel: number,
  status: PetStatus = 'normal',
): number {
  const maxHp = getMaxHp(pet);
  const hpRatio = maxHp > 0 ? pet.currentHp / maxHp : 1;
  const hpFactor = 1 - hpRatio * 0.7;

  const rarity = getShape(pet.shapeId).rarity;
  const rarityFactor = RARITY_FACTOR[rarity] ?? 1.0;

  const levelFactor = Math.min(1.5, Math.max(0.5, playerLevel / Math.max(1, pet.level))) * 0.1 + 0.9;

  const rate =
    BASE_CAPTURE_RATE * hpFactor * rarityFactor * pokeball.multiplier * STATUS_MULTIPLIER[status] * levelFactor;

  return Math.max(0.02, Math.min(1, rate));
}

export function attemptCapture(
  pet: PetInstance,
  pokeball: Pokeball,
  playerLevel: number,
  status: PetStatus = 'normal',
): { success: boolean; rate: number } {
  const rate = calculateCaptureRate(pet, pokeball, playerLevel, status);
  return { success: Math.random() < rate, rate };
}
