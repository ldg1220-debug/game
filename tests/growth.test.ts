import { describe, it, expect } from 'vitest';
import petsJson from '../src/data/pets.json';
import {
  DEFAULT_EXP_CONFIG,
  battleStats,
  createPetInstance,
  expToNext,
  gainExp,
  levelUp,
  rollGrowth,
  totalExpForLevel,
} from '../src/engine/growth';
import {
  DEFAULT_CAPTURE_CONFIG,
  captureChance,
  initialLoyalty,
  levelPenalty,
  tryCapture,
} from '../src/engine/capture';
import {
  DEFAULT_LOYALTY_CONFIG,
  checkFlee,
  checkObedience,
  disobeyChance,
  hostileChance,
  loyaltyTier,
  onCharmDrop,
  onFaint,
  onFeed,
  onIdle,
  onVictory,
} from '../src/engine/loyalty';
import { createRng } from '../src/engine/rng';
import { GROWTH_SCORE_CAP, growthScore, type PetSpecies, type Stats } from '../src/engine/types';

/**
 * 성장 · 포획 · 충성도 테스트.
 *
 * 헌장 Phase 3이 요구한 두 가지가 핵심이다.
 *   - 성장률 10만 회 추첨 → 분포 히스토그램, 상한 초과 0건
 *   - 포획 확률이 HP·레벨차에 대해 단조성을 갖는지
 *
 * 단조성은 "더 깎을까 지금 잡을까"라는 판단이 성립하기 위한 전제다. 깎았는데
 * 확률이 떨어지는 구간이 하나라도 있으면 플레이어는 규칙을 못 믿게 된다.
 */

const PETS = petsJson as PetSpecies[];
const species = (id: string) => PETS.find((p) => p.id === id)!;

/* ─────────────── 성장률 추첨 ─────────────── */

describe('성장률 추첨', () => {
  it('10만 회 추첨해도 상한을 넘는 개체가 하나도 없다', () => {
    const rng = createRng(20260804);
    const buckets = new Array(12).fill(0) as number[];
    let over = 0;
    let best = 0;
    let sum = 0;
    const N = 100_000;

    for (let i = 0; i < N; i++) {
      const sp = rng.pick(PETS);
      const g = rollGrowth(sp, rng);
      const score = growthScore(g);
      if (score > GROWTH_SCORE_CAP) over++;
      best = Math.max(best, score);
      sum += score;
      // 3.0 미만부터 0.25 간격으로 12칸
      const b = Math.min(11, Math.max(0, Math.floor((score - 3.0) / 0.25)));
      buckets[b]!++;
    }

    const width = 44;
    const peak = Math.max(...buckets);
    const hist = buckets
      .map((c, i) => {
        const lo = (3.0 + i * 0.25).toFixed(2);
        const bar = '█'.repeat(Math.round((c / peak) * width));
        return `  ${lo}~ ${String(c).padStart(6)} ${bar}`;
      })
      .join('\n');
    console.log(
      `\n성장률 지표 분포 (${N.toLocaleString()}회, 24종 무작위)\n${hist}\n` +
        `  평균 ${(sum / N).toFixed(3)} · 최고 ${best.toFixed(3)} · 상한 ${GROWTH_SCORE_CAP} · 초과 ${over}건`,
    );

    expect(over).toBe(0);
    expect(best).toBeLessThan(GROWTH_SCORE_CAP);
  });

  it('추첨 결과가 종의 범위 안에 있다', () => {
    const rng = createRng(7);
    for (const sp of PETS) {
      for (let i = 0; i < 500; i++) {
        const g = rollGrowth(sp, rng);
        for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
          expect(g[k]).toBeGreaterThanOrEqual(sp.growthRange.min[k] - 1e-9);
          expect(g[k]).toBeLessThanOrEqual(sp.growthRange.max[k] + 1e-9);
        }
      }
    }
  });

  it('희귀도가 높은 종은 기대 성장률이 높다 — 추첨에 보정을 걸어서가 아니다', () => {
    const rng = createRng(99);
    const mean = (id: string) => {
      const sp = species(id);
      let s = 0;
      for (let i = 0; i < 4000; i++) s += growthScore(rollGrowth(sp, rng));
      return s / 4000;
    };
    const commons = PETS.filter((p) => p.rarity === 'common');
    const epics = PETS.filter((p) => p.rarity === 'epic');
    expect(mean(epics[0]!.id)).toBeGreaterThan(mean(commons[0]!.id));
  });

  it('상한을 넘는 범위가 들어와도 비율로 눌러 담는다', () => {
    // 손으로 고친 데이터에 대한 마지막 방어선. 정상 데이터에서는 발동하지 않는다.
    const rigged: PetSpecies = {
      ...species(PETS[0]!.id),
      growthRange: {
        min: { hp: 9, atk: 3, def: 3, spd: 3 },
        max: { hp: 10, atk: 3.5, def: 3.5, spd: 3.5 },
      },
    };
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const g = rollGrowth(rigged, rng);
      expect(growthScore(g)).toBeLessThanOrEqual(GROWTH_SCORE_CAP + 1e-9);
    }
  });

  it('같은 seed면 같은 성장률이 나온다', () => {
    const a = rollGrowth(species(PETS[3]!.id), createRng(555));
    const b = rollGrowth(species(PETS[3]!.id), createRng(555));
    expect(a).toEqual(b);
  });
});

/* ─────────────── 경험치와 레벨업 ─────────────── */

describe('경험치', () => {
  it('필요 경험치가 레벨에 따라 단조 증가한다', () => {
    for (let n = 1; n < DEFAULT_EXP_CONFIG.maxLevel - 1; n++) {
      expect(expToNext(n + 1)).toBeGreaterThan(expToNext(n));
    }
  });

  it('만렙에서는 더 올라가지 않는다', () => {
    expect(expToNext(DEFAULT_EXP_CONFIG.maxLevel)).toBe(Infinity);
  });

  it('누적 경험치가 각 구간의 합과 같다', () => {
    let sum = 0;
    for (let n = 1; n < 30; n++) sum += expToNext(n);
    expect(totalExpForLevel(30)).toBe(sum);
  });

  it('곡선이 원작 형태를 따른다 — exp(n) = 12 * n^2.6', () => {
    expect(expToNext(1)).toBe(12);
    expect(expToNext(10)).toBe(Math.round(12 * Math.pow(10, 2.6)));
    console.log(
      '\n경험치 곡선  ' +
        [1, 10, 25, 50, 75, 98].map((n) => `Lv${n}→${n + 1}: ${expToNext(n).toLocaleString()}`).join(' · '),
    );
  });
});

describe('레벨업', () => {
  const pet = () =>
    createPetInstance(species('emberfox'), {
      uid: 'p1',
      level: 1,
      seed: 42,
      rng: createRng(42),
      loyalty: 60,
      capturedAt: 0,
    });

  it('입력을 건드리지 않고 새 개체를 돌려준다', () => {
    const before = pet();
    const snapshot = JSON.stringify(before);
    levelUp(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('능력치가 성장률만큼 오른다', () => {
    const p = pet();
    const up = levelUp(p);
    expect(up.level).toBe(2);
    for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
      expect(up.currentStats[k]).toBeCloseTo(p.currentStats[k] + p.growth[k], 10);
    }
  });

  it('소수점이 잘리지 않고 누적된다', () => {
    // 성장률 0.9인 스탯을 10레벨 올리면 9가 올라야 한다. 매 레벨 내림하면 0이 된다.
    let p = pet();
    p = { ...p, growth: { ...p.growth, atk: 0.9 }, currentStats: { ...p.currentStats, atk: 10 } };
    for (let i = 0; i < 10; i++) p = levelUp(p);
    expect(p.currentStats.atk).toBeCloseTo(19, 6);
    expect(battleStats(p).atk).toBe(19);
  });

  it('성장률 차이가 레벨이 쌓일수록 벌어진다', () => {
    const grow = (g: Stats) => {
      let p = pet();
      p = { ...p, growth: g, currentStats: { hp: 40, atk: 10, def: 10, spd: 10 } };
      for (let i = 1; i < 80; i++) p = levelUp(p);
      return battleStats(p);
    };
    const low = grow({ hp: 4.0, atk: 1.0, def: 1.0, spd: 1.0 });
    const high = grow({ hp: 4.4, atk: 1.1, def: 1.1, spd: 1.1 });
    // 성장률 지표 0.18 차이가 79레벨 뒤에 눈에 보이는 격차가 된다
    expect(high.atk - low.atk).toBeGreaterThanOrEqual(7);
    console.log(
      `\n79레벨 뒤 격차 — 성장률 4.8: HP ${low.hp} 공 ${low.atk} / 성장률 5.28: HP ${high.hp} 공 ${high.atk}`,
    );
  });

  it('만렙을 넘지 않는다', () => {
    let p = pet();
    const { pet: maxed } = gainExp(p, 1e12);
    expect(maxed.level).toBe(DEFAULT_EXP_CONFIG.maxLevel);
    p = levelUp(maxed);
    expect(p.level).toBe(DEFAULT_EXP_CONFIG.maxLevel);
  });

  it('경험치를 한 번에 넣으면 여러 레벨이 오른다', () => {
    const p = pet();
    const { pet: after, levelsGained } = gainExp(p, totalExpForLevel(10));
    expect(after.level).toBe(10);
    expect(levelsGained).toBe(9);
    expect(after.exp).toBe(0);
  });

  it('음수 경험치는 던진다', () => {
    expect(() => gainExp(pet(), -1)).toThrow(RangeError);
  });
});

describe('개체 생성', () => {
  it('레벨에 맞는 능력치로 만들어지고 seed가 남는다', () => {
    const sp = species('emberfox');
    const p = createPetInstance(sp, { uid: 'x', level: 20, seed: 777, rng: createRng(777), loyalty: 55, capturedAt: 123 });
    expect(p.level).toBe(20);
    expect(p.seedUsed).toBe(777);
    expect(p.capturedAt).toBe(123);
    expect(p.currentStats.atk).toBeCloseTo(sp.baseStats.atk + p.growth.atk * 19, 10);
    expect(growthScore(p.growth)).toBeLessThan(GROWTH_SCORE_CAP);
  });

  it('같은 seed면 같은 개체가 나온다 — 재현 가능해야 분쟁을 검증할 수 있다', () => {
    const make = () =>
      createPetInstance(species('cragox'), { uid: 'x', level: 5, seed: 31337, rng: createRng(31337), loyalty: 50, capturedAt: 0 });
    expect(make()).toEqual(make());
  });
});

/* ─────────────── 포획 ─────────────── */

describe('포획 확률', () => {
  const target = (hp: number, level = 10) => ({
    speciesId: 'emberfox',
    captureBaseRate: 0.42,
    hp,
    maxHp: 100,
    level,
  });
  const capturer = (level = 10, charm = 0) => ({ level, charm });

  it('HP가 낮을수록 단조 증가한다', () => {
    let prev = -1;
    for (let hp = 100; hp >= 0; hp--) {
      const p = captureChance(target(hp), capturer(), 1);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('레벨차가 벌어질수록 단조 감소한다', () => {
    let prev = Infinity;
    for (let diff = 0; diff <= 60; diff++) {
      const p = captureChance(target(10, 10 + diff), capturer(10), 1);
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });

  it('내 레벨이 높으면 페널티가 없다', () => {
    expect(levelPenalty(50, 10)).toBe(1);
    expect(levelPenalty(50, 50)).toBe(1);
    expect(levelPenalty(10, 50)).toBeLessThan(0.1);
  });

  it('좋은 도구와 높은 매력이 확률을 올린다', () => {
    const base = captureChance(target(30), capturer(), 1);
    expect(captureChance(target(30), capturer(), 1.8)).toBeGreaterThan(base);
    expect(captureChance(target(30), capturer(10, 50), 1)).toBeGreaterThan(base);
  });

  it('확률이 절대로 범위를 벗어나지 않는다', () => {
    const cases = [
      captureChance(target(0, 1), capturer(99, 9999), 100),
      captureChance(target(100, 99), capturer(1, 0), 0.001),
      captureChance({ ...target(50), maxHp: 0 }, capturer(), 1),
    ];
    for (const p of cases) {
      expect(p).toBeGreaterThanOrEqual(DEFAULT_CAPTURE_CONFIG.min);
      expect(p).toBeLessThanOrEqual(DEFAULT_CAPTURE_CONFIG.max);
    }
  });

  it('만피 포획을 확실하게 만드는 조합은 없다 — 상한이 규칙이다', () => {
    expect(captureChance(target(0, 1), capturer(99, 99999), 1000)).toBeLessThan(1);
  });

  it('희귀 종일수록 잡기 어렵다', () => {
    const at = (id: string) => {
      const sp = species(id);
      return captureChance(
        { speciesId: id, captureBaseRate: sp.captureBaseRate, hp: 10, maxHp: 100, level: 10 },
        capturer(),
        1,
      );
    };
    const common = PETS.find((p) => p.rarity === 'common')!;
    const epic = PETS.find((p) => p.rarity === 'epic')!;
    expect(at(common.id)).toBeGreaterThan(at(epic.id));
  });

  it('실제 시도 비율이 계산된 확률에 수렴한다', () => {
    const rng = createRng(2024);
    const t = target(20);
    const expected = captureChance(t, capturer(), 1);
    let hit = 0;
    const N = 40_000;
    for (let i = 0; i < N; i++) if (tryCapture(t, capturer(), { captureMultiplier: 1 }, rng).success) hit++;
    expect(Math.abs(hit / N - expected)).toBeLessThan(0.01);
  });
});

describe('초기 충성도', () => {
  const t = (hp: number) => ({ speciesId: 'x', captureBaseRate: 0.4, hp, maxHp: 100, level: 10 });

  it('깎아서 잡을수록 처음부터 잘 따른다', () => {
    expect(initialLoyalty(t(5), { level: 10, charm: 0 })).toBeGreaterThan(
      initialLoyalty(t(95), { level: 10, charm: 0 }),
    );
  });

  it('매력이 높으면 오른다', () => {
    expect(initialLoyalty(t(50), { level: 10, charm: 40 })).toBeGreaterThan(
      initialLoyalty(t(50), { level: 10, charm: 0 }),
    );
  });

  it('범위를 벗어나지 않고, 잡자마자 적대 구간이 되지는 않는다', () => {
    for (const hp of [0, 25, 50, 75, 100]) {
      for (const charm of [0, 50, 9999]) {
        const l = initialLoyalty(t(hp), { level: 10, charm });
        expect(l).toBeGreaterThanOrEqual(DEFAULT_LOYALTY_CONFIG.min);
        expect(l).toBeLessThanOrEqual(DEFAULT_LOYALTY_CONFIG.max);
        expect(l).toBeGreaterThan(DEFAULT_LOYALTY_CONFIG.hostileThreshold);
      }
    }
  });

  it('실패하면 충성도를 주지 않는다', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) {
      const r = tryCapture(t(90), { level: 5, charm: 0 }, { captureMultiplier: 1 }, rng);
      if (!r.success) expect(r.loyalty).toBe(0);
    }
  });
});

/* ─────────────── 충성도 ─────────────── */

describe('충성도 변화', () => {
  it('기절은 크게 깎고 승리는 조금 올린다 — 하락이 회복보다 빠르다', () => {
    expect(onFaint(80)).toBe(80 - DEFAULT_LOYALTY_CONFIG.faintPenalty);
    expect(onVictory(80)).toBe(80 + DEFAULT_LOYALTY_CONFIG.victoryBonus);
    expect(DEFAULT_LOYALTY_CONFIG.faintPenalty).toBeGreaterThan(DEFAULT_LOYALTY_CONFIG.victoryBonus);
  });

  it('먹이와 방치와 매력 하락이 각각 반영된다', () => {
    expect(onFeed(50, 22)).toBe(72);
    expect(onIdle(50, 5)).toBe(50 - 5 * DEFAULT_LOYALTY_CONFIG.idleDecayPerDay);
    expect(onCharmDrop(50, 10)).toBe(50 - 10 * DEFAULT_LOYALTY_CONFIG.charmDropWeight);
  });

  it('어떤 경로로도 범위를 벗어나지 않는다', () => {
    expect(onFeed(99, 9999)).toBe(DEFAULT_LOYALTY_CONFIG.max);
    expect(onIdle(5, 9999)).toBe(DEFAULT_LOYALTY_CONFIG.min);
    expect(onFaint(0)).toBe(DEFAULT_LOYALTY_CONFIG.min);
    expect(onVictory(100)).toBe(DEFAULT_LOYALTY_CONFIG.max);
  });

  it('먹이로 충성도를 깎으려 하면 던진다', () => {
    expect(() => onFeed(50, -10)).toThrow(RangeError);
    expect(() => onIdle(50, -1)).toThrow(RangeError);
    expect(() => onCharmDrop(50, -1)).toThrow(RangeError);
  });
});

describe('충성도 판정', () => {
  it('임계값 위에서는 아무 일도 없다', () => {
    const rng = createRng(1);
    for (let i = 0; i < 2000; i++) expect(checkObedience(100, rng)).toBe('obey');
    expect(disobeyChance(70)).toBe(0);
    expect(hostileChance(30)).toBe(0);
  });

  it('낮을수록 불복종이 잦아진다 — 절벽이 아니라 경사다', () => {
    let prev = -1;
    for (let l = 70; l >= 0; l--) {
      const c = disobeyChance(l);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('적대는 불복종 안에서만 나온다', () => {
    const rng = createRng(3);
    const tally = { obey: 0, disobey: 0, hostile: 0 };
    for (let i = 0; i < 20000; i++) tally[checkObedience(20, rng)]++;
    expect(tally.hostile).toBeGreaterThan(0);
    expect(tally.disobey).toBeGreaterThan(tally.hostile);
    expect(tally.obey).toBeGreaterThan(0);

    // 적대 구간(30) 위에서는 불복종은 나와도 적대는 안 나온다
    const t2 = { obey: 0, disobey: 0, hostile: 0 };
    for (let i = 0; i < 20000; i++) t2[checkObedience(50, rng)]++;
    expect(t2.disobey).toBeGreaterThan(0);
    expect(t2.hostile).toBe(0);
  });

  it('도주는 10 미만에서만 일어난다', () => {
    const rng = createRng(4);
    for (let i = 0; i < 5000; i++) expect(checkFlee(10, rng)).toBe(false);
    let fled = 0;
    for (let i = 0; i < 5000; i++) if (checkFlee(1, rng)) fled++;
    expect(fled).toBeGreaterThan(0);
  });

  it('구간 이름이 임계값과 맞는다', () => {
    expect(loyaltyTier(100)).toBe('devoted');
    expect(loyaltyTier(80)).toBe('steady');
    expect(loyaltyTier(50)).toBe('restless');
    expect(loyaltyTier(20)).toBe('hostile');
    expect(loyaltyTier(5)).toBe('leaving');
  });

  it('충성도가 낮은 개체를 방치하면 결국 떠난다', () => {
    // 도주는 되돌릴 수 없다. 그 리스크가 실제로 닥치는지 확인한다.
    const rng = createRng(6);
    let loyalty = 40;
    let days = 0;
    let left = false;
    while (days < 60 && !left) {
      loyalty = onIdle(loyalty, 1);
      left = checkFlee(loyalty, rng);
      days++;
    }
    expect(left).toBe(true);
    console.log(`\n충성도 40에서 방치 — ${days}일째 도주 (충성도 ${loyalty})`);
  });
});
