/**
 * 진화와 성장률 재추첨.
 *
 * 헌장이 두 가지를 구분한다.
 *   - **퀘스트 진화**: 성장률을 완전히 재추첨한다. 좋은 개체가 나빠질 수 있다.
 *   - **촉진 진화**: 이전 성장률이 결과에 가중치로 반영된다(0.5).
 *
 * 반영 방식이 설계의 핵심이다. 이전 성장률 **값**을 그대로 섞으면 안 된다 —
 * 진화체는 성장 범위 자체가 높으므로, 낮은 범위에서 나온 값을 섞는 순간 좋은
 * 개체일수록 손해를 본다. 촉진제가 진화의 돌보다 비싼데 결과가 나쁘면 그 물건은
 * 존재할 이유가 없다.
 *
 * 그래서 섞는 건 값이 아니라 **범위 안에서의 상대 위치**다. 제 종에서 상위
 * 90%였던 개체는 진화 후에도 상위권에서 시작한다. 이게 "키운 보람"이다.
 *
 * 어느 경로든 결과는 진화체의 범위 안에 있고, 따라서 성장률 상한을 구조적으로
 * 넘을 수 없다. 진화는 상한을 여는 문이 아니다.
 */

import type { RNG } from '../rng';
import {
  GROWTH_SCORE_CAP,
  STAT_KEYS,
  assertWithinCap,
  growthScore,
  type PetInstance,
  type PetSpecies,
  type Stats,
} from '../types';

/** 촉진 진화에서 이전 성장률이 갖는 비중. 헌장이 0.5로 못박았다. */
export const CATALYST_WEIGHT = 0.5;

/**
 * 범위 안에서의 상대 위치(0~1).
 *
 * min과 max가 같은 스탯이면 위치를 정의할 수 없으므로 중간값으로 본다.
 */
function positionIn(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  const t = (value - min) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function valueAt(t: number, min: number, max: number): number {
  return min + t * (max - min);
}

export interface PriorGrowth {
  /** 이전 성장률이 나온 종 — 상대 위치를 계산하려면 그 범위가 필요하다 */
  species: PetSpecies;
  growth: Stats;
  /** 0이면 완전 재추첨, 1이면 상대 위치를 그대로 물려받는다 */
  weight: number;
}

/**
 * 성장률을 추첨하되 이전 개체의 상대 위치를 섞는다.
 *
 * prior가 없으면 rollGrowth와 같은 완전 재추첨이다.
 */
export function rollGrowthWithPrior(
  species: PetSpecies,
  rng: RNG,
  prior?: PriorGrowth,
): Stats {
  const { min, max } = species.growthRange;
  const out = {} as Stats;

  for (const k of STAT_KEYS) {
    // 난수는 스탯마다 반드시 한 번씩 소비한다. prior 유무로 소비량이 달라지면
    // 같은 seed에서 두 경로의 이후 시퀀스가 갈린다.
    const fresh = rng.next();
    const t = prior
      ? prior.weight * positionIn(prior.growth[k], prior.species.growthRange.min[k], prior.species.growthRange.max[k]) +
        (1 - prior.weight) * fresh
      : fresh;
    out[k] = valueAt(t, min[k], max[k]);
  }

  // 범위 안에서 뽑았으므로 정상 데이터에서는 발동하지 않는다. 손으로 고친
  // 데이터에 대한 마지막 방어선이다.
  const score = growthScore(out);
  if (score > GROWTH_SCORE_CAP) {
    const factor = GROWTH_SCORE_CAP / score;
    for (const k of STAT_KEYS) out[k] *= factor;
  }
  assertWithinCap(out, `evolve(${species.id})`);
  return out;
}

export type EvolveMode =
  /** 진화의 돌 — 성장률 완전 재추첨 */
  | 'quest'
  /** 촉진제 — 이전 성장률이 가중치로 반영 */
  | 'catalyst';

export type EvolveBlock = 'noEvolution' | 'level' | 'item' | 'questIncomplete';

export interface EvolveCheck {
  ok: boolean;
  reason?: EvolveBlock;
  /** 진화 대상 종 id */
  toSpeciesId?: string;
  requiredLevel?: number;
  requiredItemId?: string;
}

/**
 * 진화 가능한지 본다. 실패는 예외가 아니라 이유로 돌려준다 — 화면이 "왜 안
 * 되는지"를 그대로 띄울 수 있어야 한다.
 */
export function canEvolve(
  pet: PetInstance,
  species: PetSpecies,
  opts: { hasItem: (itemId: string) => boolean; questDone: boolean; mode: EvolveMode },
): EvolveCheck {
  const to = species.evolveTo;
  if (!to) return { ok: false, reason: 'noEvolution' };

  const base = { toSpeciesId: to.speciesId, requiredLevel: to.requiredLevel, requiredItemId: itemFor(opts.mode, to.itemId) };
  if (pet.level < to.requiredLevel) return { ok: false, reason: 'level', ...base };
  if (!opts.hasItem(base.requiredItemId)) return { ok: false, reason: 'item', ...base };
  // 퀘스트 진화만 퀘스트를 요구한다. 촉진 진화는 돈으로 시간을 사는 경로다.
  if (opts.mode === 'quest' && !opts.questDone) return { ok: false, reason: 'questIncomplete', ...base };

  return { ok: true, ...base };
}

/** 촉진 진화는 촉진제를 쓴다. 진화체가 요구하는 물건은 데이터에 있다. */
export const CATALYST_ITEM = 'catalyst';

function itemFor(mode: EvolveMode, questItemId: string): string {
  return mode === 'catalyst' ? CATALYST_ITEM : questItemId;
}

export interface EvolveResult {
  pet: PetInstance;
  /** 진화 전 성장률 — 화면이 전후를 나란히 보여준다 */
  before: Stats;
  after: Stats;
  mode: EvolveMode;
}

/**
 * 진화시킨다. 새 개체를 돌려주고 입력은 건드리지 않는다.
 *
 * 능력치는 진화체의 기본치에서 다시 쌓는다. 원작의 퀘스트 진화가 "이전 능력치의
 * 영향을 받지 않는다"고 한 부분을 그대로 따른다 — 그래야 진화가 리셋이자
 * 재도약이라는 성격을 갖는다.
 */
export function evolve(
  pet: PetInstance,
  from: PetSpecies,
  to: PetSpecies,
  mode: EvolveMode,
  rng: RNG,
): EvolveResult {
  const prior: PriorGrowth | undefined =
    mode === 'catalyst' ? { species: from, growth: pet.growth, weight: CATALYST_WEIGHT } : undefined;

  const growth = rollGrowthWithPrior(to, rng, prior);
  const levels = Math.max(0, pet.level - 1);

  return {
    before: { ...pet.growth },
    after: growth,
    mode,
    pet: {
      ...pet,
      speciesId: to.id,
      growth,
      currentStats: {
        hp: to.baseStats.hp + growth.hp * levels,
        atk: to.baseStats.atk + growth.atk * levels,
        def: to.baseStats.def + growth.def * levels,
        spd: to.baseStats.spd + growth.spd * levels,
      },
      // 진화체의 스킬 풀로 갈아탄다. 기존 스킬 중 새 종도 쓸 수 있는 건 남긴다.
      skills: [
        ...pet.skills.filter((s) => to.skillPool.includes(s)),
        ...to.skillPool.filter((s) => !pet.skills.includes(s)),
      ].slice(0, 4),
    },
  };
}

/**
 * 같은 종 안에서 성장률만 다시 뽑는다(재추첨의 물약).
 *
 * 헌장의 "방생/재포획 노가다를 소모 아이템으로 부분 허용" 항목이다. 도박성은
 * 남기고 시간 낭비만 없앤다. **상한은 오르지 않는다** — 같은 종의 같은 범위에서
 * 다시 뽑을 뿐이다.
 */
export function rerollGrowth(pet: PetInstance, species: PetSpecies, rng: RNG): EvolveResult {
  const growth = rollGrowthWithPrior(species, rng);
  const levels = Math.max(0, pet.level - 1);
  return {
    before: { ...pet.growth },
    after: growth,
    mode: 'quest',
    pet: {
      ...pet,
      growth,
      currentStats: {
        hp: species.baseStats.hp + growth.hp * levels,
        atk: species.baseStats.atk + growth.atk * levels,
        def: species.baseStats.def + growth.def * levels,
        spd: species.baseStats.spd + growth.spd * levels,
      },
    },
  };
}
