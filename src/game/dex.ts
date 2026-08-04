/**
 * 도감.
 *
 * 본 것과 잡은 것을 따로 센다. 마주친 적은 있지만 못 잡은 종이 목록에 남아
 * 있어야 "저건 아직 못 잡았다"가 눈에 보이고, 그게 다시 나가는 이유가 된다.
 *
 * 순수 함수다. 상태는 Set 두 개뿐이라 세이브에도 그대로 담긴다.
 */

import type { PetSpecies, Rarity } from '../engine/types';

export interface DexState {
  seen: string[];
  caught: string[];
}

export function emptyDex(): DexState {
  return { seen: [], caught: [] };
}

function withId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? [...list] : [...list, id];
}

export function markSeen(dex: DexState, speciesIds: readonly string[]): DexState {
  let seen = dex.seen;
  for (const id of speciesIds) seen = withId(seen, id);
  return seen === dex.seen ? dex : { ...dex, seen };
}

export function markCaught(dex: DexState, speciesId: string): DexState {
  return { seen: withId(dex.seen, speciesId), caught: withId(dex.caught, speciesId) };
}

export type DexEntryState = 'unknown' | 'seen' | 'caught';

export function entryState(dex: DexState, speciesId: string): DexEntryState {
  if (dex.caught.includes(speciesId)) return 'caught';
  if (dex.seen.includes(speciesId)) return 'seen';
  return 'unknown';
}

export interface DexSummary {
  seen: number;
  caught: number;
  total: number;
  byRarity: Record<Rarity, { caught: number; total: number }>;
}

export function summarize(dex: DexState, species: readonly PetSpecies[]): DexSummary {
  const byRarity = {
    common: { caught: 0, total: 0 },
    uncommon: { caught: 0, total: 0 },
    rare: { caught: 0, total: 0 },
    epic: { caught: 0, total: 0 },
  } as Record<Rarity, { caught: number; total: number }>;

  for (const s of species) {
    byRarity[s.rarity].total += 1;
    if (dex.caught.includes(s.id)) byRarity[s.rarity].caught += 1;
  }

  return { seen: dex.seen.length, caught: dex.caught.length, total: species.length, byRarity };
}
