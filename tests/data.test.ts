import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateData, isGrowthWithinSpecies } from '../src/data/schema';
import {
  ADVANTAGE,
  ELEMENTS,
  GROWTH_SCORE_CAP,
  assertWithinCap,
  growthScore,
  type Element,
  type PetSpecies,
  type Rarity,
} from '../src/engine/types';

/**
 * 데이터 검증 테스트.
 *
 * 두 가지를 본다. 하나는 지금 저장소에 있는 데이터가 실제로 유효한가.
 * 다른 하나는 **잘못된 데이터를 넣었을 때 검증이 정말 잡아내는가** — 후자가
 * 없으면 검증기가 조용히 통과만 시켜도 아무도 모른다.
 */

const DATA_DIR = path.resolve(__dirname, '../src/data');
const load = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf8')) as unknown;

const raw = {
  pets: load('pets'),
  skills: load('skills'),
  spirits: load('spirits'),
  items: load('items'),
  formula: load('formula'),
  growth: load('growth'),
  field: load('field'),
};
const data = validateData(raw);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('현재 데이터', () => {
  it('검증을 통과한다', () => {
    expect(data.errors).toEqual([]);
  });

  it('네 파일이 모두 비어있지 않다', () => {
    expect(data.pets.length).toBeGreaterThan(0);
    expect(data.skills.length).toBeGreaterThan(0);
    expect(data.spirits.length).toBeGreaterThan(0);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it('속성별 펫 수가 고르다', () => {
    const perElement = new Map<Element, number>(ELEMENTS.map((e) => [e, 0]));
    for (const p of data.pets) {
      perElement.set(p.element.primary, perElement.get(p.element.primary)! + 1);
    }
    const counts = [...perElement.values()];
    // 한 속성만 펫이 많으면 그 속성 파티가 강제된다
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('희귀도마다 최소 하나씩 있다', () => {
    const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
    for (const r of rarities) {
      expect(data.pets.filter((p) => p.rarity === r).length).toBeGreaterThan(0);
    }
  });

  it('부속성은 주속성과 다르다', () => {
    for (const p of data.pets) {
      if (p.element.secondary) expect(p.element.secondary).not.toBe(p.element.primary);
    }
  });

  it('진화 대상은 더 높은 희귀도다', () => {
    const rank: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3 };
    const byId = new Map(data.pets.map((p) => [p.id, p]));
    for (const p of data.pets) {
      if (!p.evolveTo) continue;
      const to = byId.get(p.evolveTo.speciesId)!;
      expect(rank[to.rarity]).toBeGreaterThan(rank[p.rarity]);
    }
  });

  it('희귀도가 높을수록 포획이 어렵다', () => {
    const rate = (r: Rarity) => {
      const rows = data.pets.filter((p) => p.rarity === r).map((p) => p.captureBaseRate);
      return Math.max(...rows);
    };
    expect(rate('common')).toBeGreaterThan(rate('uncommon'));
    expect(rate('uncommon')).toBeGreaterThan(rate('rare'));
    expect(rate('rare')).toBeGreaterThan(rate('epic'));
  });

  it('배수의 진 계열 3단계가 존재하고 단계마다 대가가 커진다', () => {
    const tiers = data.skills
      .filter((s) => s.archetype === 'guardBuff' && (s.modifiers?.atk ?? 0) > 1)
      .sort((a, b) => (a.modifiers!.atk ?? 0) - (b.modifiers!.atk ?? 0));
    expect(tiers.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < tiers.length; i++) {
      // 공격이 오를수록 방어는 더 깎여야 한다
      expect(tiers[i]!.modifiers!.def!).toBeLessThan(tiers[i - 1]!.modifiers!.def!);
    }
  });

  it('정령이 깃든 장비가 존재한다', () => {
    expect(data.items.filter((i) => i.spiritId).length).toBeGreaterThan(0);
  });
});

describe('성장률 상한', () => {
  it('모든 종의 최대 성장률이 상한 아래다', () => {
    for (const p of data.pets) {
      expect(growthScore(p.growthRange.max)).toBeLessThanOrEqual(GROWTH_SCORE_CAP);
    }
  });

  it('상한은 도달 가능한 목표가 아니라 천장이다 — 어떤 종도 상한에 닿지 않는다', () => {
    // 상한에 닿는 종이 있으면 "상한을 조금만 올려달라"는 압력이 생긴다.
    for (const p of data.pets) {
      expect(growthScore(p.growthRange.max)).toBeLessThan(GROWTH_SCORE_CAP);
    }
  });

  it('희귀도가 높을수록 성장률 기대치가 높다', () => {
    const best = (r: Rarity) =>
      Math.max(...data.pets.filter((p) => p.rarity === r).map((p) => growthScore(p.growthRange.max)));
    expect(best('uncommon')).toBeGreaterThan(best('common'));
    expect(best('rare')).toBeGreaterThan(best('uncommon'));
    expect(best('epic')).toBeGreaterThan(best('rare'));
  });

  it('assertWithinCap은 상한 초과를 던진다', () => {
    expect(() => assertWithinCap({ hp: 5.5, atk: 1.33, def: 1.3, spd: 1.35 }, '테스트')).not.toThrow();
    expect(() => assertWithinCap({ hp: 6.0, atk: 1.5, def: 1.5, spd: 1.5 }, '테스트')).toThrow(RangeError);
  });

  it('isGrowthWithinSpecies는 범위 밖과 상한 초과를 모두 거른다', () => {
    const p = data.pets[0]!;
    expect(isGrowthWithinSpecies(p.growthRange.min, p)).toBe(true);
    expect(isGrowthWithinSpecies(p.growthRange.max, p)).toBe(true);
    const over = { ...p.growthRange.max, atk: p.growthRange.max.atk + 0.5 };
    expect(isGrowthWithinSpecies(over, p)).toBe(false);
    expect(isGrowthWithinSpecies({ hp: 9, atk: 2, def: 2, spd: 2 }, p)).toBe(false);
  });
});

describe('상성 순환', () => {
  it('네 속성이 하나의 순환을 이룬다', () => {
    let cur: Element = 'earth';
    const seen: Element[] = [];
    for (let i = 0; i < ELEMENTS.length; i++) {
      seen.push(cur);
      cur = ADVANTAGE[cur];
    }
    expect(cur).toBe('earth');
    expect(new Set(seen).size).toBe(ELEMENTS.length);
  });

  it('자기 자신에게 강한 속성은 없고, 상호 우위도 없다', () => {
    for (const e of ELEMENTS) {
      expect(ADVANTAGE[e]).not.toBe(e);
      expect(ADVANTAGE[ADVANTAGE[e]]).not.toBe(e);
    }
  });
});

describe('검증기가 실제로 잡아내는가', () => {
  const withPets = (mutate: (p: PetSpecies[]) => void) => {
    const pets = clone(data.pets);
    mutate(pets);
    return validateData({ ...raw, pets }).errors;
  };

  it('성장률 상한을 넘기면 실패한다', () => {
    const errors = withPets((pets) => {
      pets[0]!.growthRange.max = { hp: 6.0, atk: 1.6, def: 1.6, spd: 1.6 };
    });
    expect(errors.some((e) => e.includes('성장률 상한 초과'))).toBe(true);
  });

  it('min이 max보다 크면 실패한다', () => {
    const errors = withPets((pets) => {
      pets[0]!.growthRange.min.atk = pets[0]!.growthRange.max.atk + 1;
    });
    expect(errors.some((e) => e.includes('보다 크다'))).toBe(true);
  });

  it('모르는 필드가 있으면 실패한다', () => {
    const pets = clone(data.pets) as unknown as Record<string, unknown>[];
    pets[0]!['cashOnly'] = true;
    expect(validateData({ ...raw, pets }).errors.length).toBeGreaterThan(0);
  });

  it('없는 스킬을 참조하면 실패한다', () => {
    const errors = withPets((pets) => {
      pets[0]!.skillPool = ['nonexistentSkill'];
    });
    expect(errors.some((e) => e.includes('없는 스킬'))).toBe(true);
  });

  it('없는 진화 아이템을 참조하면 실패한다', () => {
    const errors = withPets((pets) => {
      const target = pets.find((p) => p.evolveTo)!;
      target.evolveTo!.itemId = 'nonexistentItem';
    });
    expect(errors.some((e) => e.includes('없는 아이템'))).toBe(true);
  });

  it('id가 중복되면 실패한다', () => {
    const errors = withPets((pets) => {
      pets[1]!.id = pets[0]!.id;
    });
    expect(errors.some((e) => e.includes('id 중복'))).toBe(true);
  });

  it('타입이 틀리면 실패한다', () => {
    const pets = clone(data.pets) as unknown as Record<string, unknown>[];
    pets[0]!['captureBaseRate'] = '높음';
    expect(validateData({ ...raw, pets }).errors.length).toBeGreaterThan(0);
  });

  it('포획률이 1을 넘으면 실패한다', () => {
    const errors = withPets((pets) => {
      pets[0]!.captureBaseRate = 1.5;
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('대가 없는 공격 버프는 실패한다', () => {
    const skills = clone(data.skills);
    const buff = skills.find((s) => s.archetype === 'guardBuff' && (s.modifiers?.atk ?? 0) > 1)!;
    buff.modifiers = { atk: 2.0 };
    const errors = validateData({ ...raw, skills }).errors;
    expect(errors.some((e) => e.includes('대가'))).toBe(true);
  });

  it('정령이 소모품에 깃들면 실패한다', () => {
    const items = clone(data.items);
    const potion = items.find((i) => i.kind === 'heal')!;
    potion.spiritId = data.spirits[0]!.id;
    const errors = validateData({ ...raw, items }).errors;
    expect(errors.some((e) => e.includes('장비에만'))).toBe(true);
  });

  it('정령 레벨이 거꾸로 가면 실패한다', () => {
    const spirits = clone(data.spirits);
    spirits[0]!.levels[4]!.successRate = 0.01;
    const errors = validateData({ ...raw, spirits }).errors;
    expect(errors.some((e) => e.includes('성공률'))).toBe(true);
  });

  it('정령 효과와 수치가 어긋나면 실패한다', () => {
    const spirits = clone(data.spirits);
    const buff = spirits.find((s) => s.effect.kind === 'buff')!;
    delete buff.effect.modifiers;
    expect(validateData({ ...raw, spirits }).errors.some((e) => e.includes('modifiers'))).toBe(true);
  });

  it('전투 수식 상수가 뒤집히면 실패한다', () => {
    const formula = clone(raw.formula) as Record<string, Record<string, number>>;
    formula['element']!['disadvantage'] = 2.0;
    expect(validateData({ ...raw, formula }).errors.some((e) => e.includes('불리 < 동일 < 유리'))).toBe(true);
  });

  it('방어 커맨드가 피해를 안 줄이면 실패한다', () => {
    const formula = clone(raw.formula) as Record<string, Record<string, number>>;
    formula['defend']!['damageTaken'] = 1.2;
    expect(validateData({ ...raw, formula }).errors.some((e) => e.includes('방어 커맨드'))).toBe(true);
  });

  it('최상위가 배열이 아니면 실패한다', () => {
    expect(validateData({ ...raw, pets: { a: 1 } }).errors.some((e) => e.includes('배열'))).toBe(true);
  });
});
