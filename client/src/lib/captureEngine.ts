import type { Pokeball, PokeballType, StatusEffect } from './gameTypes';
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

/** 문서 3.5: 정상 1.0 ~ 동결/수면 1.5 */
const STATUS_MULTIPLIER: Record<StatusEffect, number> = {
  sleep: 1.5,
  freeze: 1.5,
  paralysis: 1.3,
  poison: 1.2,
  burn: 1.2,
};

const BASE_CAPTURE_RATE = 0.4;

export interface CaptureTarget {
  shapeId: number;
  level: number;
  hp: number;
  maxHp: number;
  status: StatusEffect | null;
}

export function calculateCaptureRate(
  target: CaptureTarget,
  pokeball: Pokeball,
  playerLevel: number,
): number {
  const hpRatio = target.maxHp > 0 ? target.hp / target.maxHp : 1;
  const hpFactor = 1 - hpRatio * 0.7;

  const rarityFactor = RARITY_FACTOR[getShape(target.shapeId).rarity] ?? 1.0;
  const statusFactor = target.status ? STATUS_MULTIPLIER[target.status] : 1.0;
  const levelFactor =
    Math.min(1.5, Math.max(0.5, playerLevel / Math.max(1, target.level))) * 0.1 + 0.9;

  const rate =
    BASE_CAPTURE_RATE * hpFactor * rarityFactor * pokeball.multiplier * statusFactor * levelFactor;

  return Math.max(0.02, Math.min(1, rate));
}

export function attemptCapture(
  target: CaptureTarget,
  pokeball: Pokeball,
  playerLevel: number,
): { success: boolean; rate: number } {
  const rate = calculateCaptureRate(target, pokeball, playerLevel);
  return { success: Math.random() < rate, rate };
}
