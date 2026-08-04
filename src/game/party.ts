/**
 * 개체 ↔ 전투원 변환, 그리고 인카운터 파티 구성.
 *
 * 전투 엔진은 PetInstance를 모른다(성장률·경험치를 알 필요가 없다). 육성 쪽은
 * Combatant를 모른다(진형·기력을 알 필요가 없다). 그 둘을 잇는 게 이 파일이고,
 * 다리가 여기 하나뿐이라 어느 쪽을 바꿔도 다른 쪽이 흔들리지 않는다.
 */

import fieldJson from '../data/field.json';
import petsJson from '../data/pets.json';
import type { Combatant, Row } from '../engine/battle';
import { battleStats, createPetInstance } from '../engine/growth';
import type { RNG } from '../engine/rng';
import type { PetInstance, PetSpecies } from '../engine/types';
import type { EncounterZone } from './mapTypes';

export interface CombatantConfig {
  energyBase: number;
  energyPerLevel: number;
  skillSlots: number;
}
export const DEFAULT_COMBATANT: CombatantConfig = fieldJson.combatant;

export const SPECIES: Record<string, PetSpecies> = Object.fromEntries(
  (petsJson as PetSpecies[]).map((s) => [s.id, s]),
);

export function getSpecies(id: string): PetSpecies {
  const s = SPECIES[id];
  if (!s) throw new RangeError(`없는 종: ${id}`);
  return s;
}

export function maxEnergyFor(level: number, cfg: CombatantConfig = DEFAULT_COMBATANT): number {
  return Math.round(cfg.energyBase + level * cfg.energyPerLevel);
}

/** 개체를 전투원으로 옮긴다. 능력치는 소수점을 내려 정수로 넘어간다. */
export function petToCombatant(
  pet: PetInstance,
  row: Row,
  cfg: CombatantConfig = DEFAULT_COMBATANT,
): Combatant {
  const species = getSpecies(pet.speciesId);
  const stats = battleStats(pet);
  const energy = maxEnergyFor(pet.level, cfg);
  return {
    id: pet.uid,
    name: pet.nickname ?? species.name,
    kind: 'pet',
    level: pet.level,
    element: species.element,
    stats,
    hp: stats.hp,
    energy,
    maxEnergy: energy,
    row,
    skills: pet.skills.slice(0, cfg.skillSlots),
    speciesId: species.id,
    captureBaseRate: species.captureBaseRate,
    loyalty: pet.loyalty,
  };
}

/** 주인공. 펫과 같은 규칙으로 싸우되 장비를 낄 수 있고 포획을 할 수 있다. */
export function makeCharacter(opts: {
  id: string;
  name: string;
  level: number;
  charm: number;
  stats: Combatant['stats'];
  skills: string[];
  spirits?: string[];
  row?: Row;
  cfg?: CombatantConfig;
}): Combatant {
  const energy = maxEnergyFor(opts.level, opts.cfg ?? DEFAULT_COMBATANT);
  return {
    id: opts.id,
    name: opts.name,
    kind: 'character',
    level: opts.level,
    element: { primary: 'earth', secondary: null },
    stats: opts.stats,
    hp: opts.stats.hp,
    energy,
    maxEnergy: energy,
    row: opts.row ?? 'front',
    skills: opts.skills,
    ...(opts.spirits ? { spirits: opts.spirits } : {}),
    charm: opts.charm,
  };
}

/**
 * 존에서 야생 파티를 뽑는다.
 *
 * 뒤에 서는 개체가 생기도록 3마리 이상이면 뒤쪽을 후열로 돌린다 — 진형 규칙이
 * 야생 전투에서도 의미를 갖게 하려는 것이다.
 */
export function rollEncounterParty(
  zone: EncounterZone,
  rng: RNG,
  tick: number,
  cfg: CombatantConfig = DEFAULT_COMBATANT,
): { pets: PetInstance[]; combatants: Combatant[] } {
  const count = rng.int(zone.partySize[0], zone.partySize[1]);
  const pets: PetInstance[] = [];
  const combatants: Combatant[] = [];

  for (let i = 0; i < count; i++) {
    const species = getSpecies(rng.pick(zone.speciesIds));
    const level = rng.int(zone.levelRange[0], zone.levelRange[1]);
    // 개체마다 seed를 따로 남긴다. 나중에 "이 개체가 정말 그렇게 나왔는가"를
    // 다시 계산해볼 수 있어야 한다.
    const seed = rng.int(0, 2 ** 30);
    const pet = createPetInstance(species, {
      uid: `wild-${tick}-${i}`,
      level,
      seed,
      rng,
      loyalty: 0,
      capturedAt: 0,
    });
    pets.push(pet);
    combatants.push(petToCombatant(pet, i >= 2 ? 'back' : 'front', cfg));
  }

  return { pets, combatants };
}
