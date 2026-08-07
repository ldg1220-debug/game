/**
 * 성장 — 성장률 추첨, 레벨업, 경험치.
 *
 * 이 게임의 심장이다. 같은 종의 펫이라도 개체마다 최종 능력치가 다르다는 것,
 * 그게 포획을 슬롯머신으로 만들고 레벨업을 천천히 공개되는 스크래치 카드로
 * 만든다. 그래서 여기 규칙은 전부 방어 대상이다.
 *
 * 헌장 절대규칙 3: 성장률 상한은 어떤 경로로도 초과할 수 없다. 이 모듈은
 * 상한을 넘길 방법을 제공하지 않으며, 추첨 결과에 희귀도 보정도 걸지 않는다.
 * 희귀도가 높은 종은 growthRange 자체가 높을 뿐이다.
 */

import growthJson from '../../data/growth.json';
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

export interface ExpConfig {
  coefficient: number;
  exponent: number;
  maxLevel: number;
}

export interface GrowthConfig {
  exp: ExpConfig;
}

export const DEFAULT_EXP_CONFIG: ExpConfig = growthJson.exp;

/* ─────────────── 성장률 추첨 ─────────────── */

/**
 * 개체 성장률을 추첨한다.
 *
 * 각 스탯을 종의 min~max 사이 균등분포로 뽑는다. 여기에 아이템·결제·이벤트
 * 보정이 들어가는 자리는 없다 — 있으면 그게 곧 상한 인플레의 입구가 된다.
 *
 * 데이터 검증이 이미 max 조합조차 상한 아래임을 보장하므로 아래 스케일 다운은
 * 정상 데이터에서는 발동하지 않는다. 손으로 고친 데이터에 대한 마지막 방어선이다.
 */
export function rollGrowth(species: PetSpecies, rng: RNG): Stats {
  const { min, max } = species.growthRange;
  const rolled: Stats = {
    hp: rng.float(min.hp, max.hp),
    atk: rng.float(min.atk, max.atk),
    def: rng.float(min.def, max.def),
    spd: rng.float(min.spd, max.spd),
  };

  const score = growthScore(rolled);
  if (score > GROWTH_SCORE_CAP) {
    // 비율로 줄인다. 성장률 지표는 각 스탯에 대해 선형이라, 전부 같은 배수를
    // 곱하면 지표도 정확히 그 배수만큼 준다.
    const factor = GROWTH_SCORE_CAP / score;
    for (const k of STAT_KEYS) rolled[k] *= factor;
  }

  assertWithinCap(rolled, `rollGrowth(${species.id})`);
  return rolled;
}

/* ─────────────── 경험치 ─────────────── */

/**
 * 다음 레벨까지 필요한 경험치. exp(n) = 12 * n^2.6
 *
 * 캐릭터와 펫이 같은 테이블을 쓴다. 원작에서 펫이 소환수가 아니라 동급
 * 전투원이었던 이유가 여기 있다 — 테이블이 갈리는 순간 펫은 부속품이 된다.
 */
export function expToNext(level: number, cfg: ExpConfig = DEFAULT_EXP_CONFIG): number {
  if (level >= cfg.maxLevel) return Infinity;
  return Math.round(cfg.coefficient * Math.pow(level, cfg.exponent));
}

/** 1레벨부터 해당 레벨까지 모으는 데 든 누적 경험치. */
export function totalExpForLevel(level: number, cfg: ExpConfig = DEFAULT_EXP_CONFIG): number {
  let sum = 0;
  for (let n = 1; n < Math.min(level, cfg.maxLevel); n++) sum += expToNext(n, cfg);
  return sum;
}

/* ─────────────── 레벨업 ─────────────── */

/**
 * 레벨을 하나 올린다. 새 객체를 돌려주고 입력은 건드리지 않는다.
 *
 * 능력치는 소수점을 그대로 누적한다. 매 레벨 반올림해서 버리면 성장률 4.9와
 * 5.0의 차이가 수십 레벨 뒤에 사라져, 개체차라는 게임의 축이 무너진다.
 * 화면과 전투에는 battleStats()로 내림해서 넘긴다.
 */
export function levelUp(pet: PetInstance, cfg: ExpConfig = DEFAULT_EXP_CONFIG): PetInstance {
  if (pet.level >= cfg.maxLevel) return pet;
  return {
    ...pet,
    level: pet.level + 1,
    growth: { ...pet.growth },
    currentStats: {
      hp: pet.currentStats.hp + pet.growth.hp,
      atk: pet.currentStats.atk + pet.growth.atk,
      def: pet.currentStats.def + pet.growth.def,
      spd: pet.currentStats.spd + pet.growth.spd,
    },
    skills: [...pet.skills],
  };
}

/** 경험치를 넣고 오를 수 있는 만큼 올린다. */
export function gainExp(
  pet: PetInstance,
  amount: number,
  cfg: ExpConfig = DEFAULT_EXP_CONFIG,
): { pet: PetInstance; levelsGained: number } {
  if (amount < 0) throw new RangeError(`경험치는 음수일 수 없다: ${amount}`);

  let current: PetInstance = { ...pet, exp: pet.exp + amount };
  let levelsGained = 0;

  while (current.level < cfg.maxLevel) {
    const need = expToNext(current.level, cfg);
    if (current.exp < need) break;
    current = levelUp({ ...current, exp: current.exp - need }, cfg);
    levelsGained++;
  }

  // 만렙에서는 경험치를 쌓아둘 이유가 없다
  if (current.level >= cfg.maxLevel) current = { ...current, exp: 0 };

  return { pet: current, levelsGained };
}

/* ─────────────── 개체 생성 ─────────────── */

/**
 * 종에서 개체를 만든다. 포획·진화·야생 인카운터가 전부 이걸 쓴다.
 *
 * seedUsed를 남기는 건 나중에 "이 개체가 정말 그 확률로 나왔는가"를 다시
 * 계산해볼 수 있게 하기 위해서다. 거래 분쟁과 버그 추적에 필요하다.
 */
export function createPetInstance(
  species: PetSpecies,
  opts: { uid: string; level: number; seed: number; rng: RNG; loyalty: number; capturedAt: number },
): PetInstance {
  const growth = rollGrowth(species, opts.rng);
  const levels = Math.max(0, opts.level - 1);
  return {
    uid: opts.uid,
    speciesId: species.id,
    nickname: null,
    level: opts.level,
    exp: 0,
    growth,
    currentStats: {
      hp: species.baseStats.hp + growth.hp * levels,
      atk: species.baseStats.atk + growth.atk * levels,
      def: species.baseStats.def + growth.def * levels,
      spd: species.baseStats.spd + growth.spd * levels,
    },
    loyalty: opts.loyalty,
    skills: [...species.skillPool].slice(0, 4),
    capturedAt: opts.capturedAt,
    seedUsed: opts.seed,
  };
}

/**
 * 소수 누적으로 생긴 부동소수점 오차. 성장률 0.9를 10번 더하면
 * 18.999999999999996이 되고, 그냥 내리면 능력치 1을 빼앗긴다.
 */
const FP_EPSILON = 1e-9;

/**
 * 레벨과 성장률만으로 계산한 능력치.
 *
 * 개체의 currentStats는 레벨업마다 성장률을 더해 쌓은 값이라, 실은 `종족 기본 +
 * 성장률 × (레벨-1)` 이라는 닫힌 식과 같다. 생성 시점(createPetInstance)도
 * 레벨업(levelUp)도 결국 이 식을 만족하므로, 저장된 값을 믿지 않고 다시 계산할 수
 * 있다 — 멀티플레이에서 세이브를 검증하려면 반드시 필요하다.
 *
 * 더하는 순서가 달라 부동소수점 끝자리가 어긋날 수 있으므로, 비교할 때는 오차를
 * 허용해야 한다. 값 자체는 battleStats가 어차피 내림한다.
 */
export function expectedStats(base: Stats, growth: Stats, level: number): Stats {
  const levels = Math.max(0, level - 1);
  return {
    hp: base.hp + growth.hp * levels,
    atk: base.atk + growth.atk * levels,
    def: base.def + growth.def * levels,
    spd: base.spd + growth.spd * levels,
  };
}

/** 전투와 화면에 넘길 정수 능력치. 소수점 누적분은 개체에 그대로 남는다. */
export function battleStats(pet: PetInstance): Stats {
  const floor = (v: number) => Math.floor(v + FP_EPSILON);
  return {
    hp: floor(pet.currentStats.hp),
    atk: floor(pet.currentStats.atk),
    def: floor(pet.currentStats.def),
    spd: floor(pet.currentStats.spd),
  };
}
