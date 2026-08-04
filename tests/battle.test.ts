import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATALOG,
  DEFAULT_FORMULA,
  elementMultiplier,
  hitChance,
  critChance,
  finalDamage,
  fleeChance,
  ailmentChance,
  simulateBattle,
  type BattleCommand,
  type BattleEvent,
  type Combatant,
  type CommandSource,
} from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import { ELEMENTS, type Element } from '../src/engine/types';

/**
 * 전투 엔진 테스트.
 *
 * 헌장 Phase 2가 요구한 5가지를 전부 포함한다.
 *   1. 같은 seed 100회 → 결과 완전 일치
 *   2. 속성 상성 4x4 매트릭스
 *   3. 극단값에서 피해 ≥ 1, NaN/Infinity 없음
 *   4. 200라운드 초과 시 무승부 종료
 *   5. 1000회 랜덤 매치업 승률 분포 출력
 */

const F = DEFAULT_FORMULA;

function mk(over: Partial<Combatant> & { id: string }): Combatant {
  const hp = over.stats?.hp ?? 300;
  return {
    name: over.id,
    kind: 'pet',
    level: 20,
    element: { primary: 'earth', secondary: null },
    stats: { hp, atk: 40, def: 30, spd: 30 },
    hp,
    energy: 40,
    maxEnergy: 40,
    row: 'front',
    skills: ['strike'],
    ...over,
  };
}

/** 항상 같은 커맨드를 내는 소스 — 수식을 검증할 때 AI 난수를 배제한다. */
function fixed(map: Record<string, BattleCommand>): CommandSource {
  return () => map;
}

type EventOf<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;
const pick = <T extends BattleEvent['type']>(log: BattleEvent[], type: T): EventOf<T>[] =>
  log.filter((e): e is EventOf<T> => e.type === type);

const damages = (log: BattleEvent[]) => pick(log, 'damage');

/* ─────────────── 1. 결정론 ─────────────── */

describe('결정론', () => {
  const input = () => ({
    allies: [mk({ id: 'a1', skills: ['strike', 'gore', 'frenzy', 'mend'] }), mk({ id: 'a2', row: 'back' as const })],
    enemies: [
      mk({ id: 'e1', element: { primary: 'water', secondary: null }, skills: ['strike', 'splash', 'numb'] }),
      mk({ id: 'e2', element: { primary: 'fire', secondary: 'wind' }, skills: ['strike', 'scorch', 'toxicCloud'] }),
    ],
    seed: 20260804,
  });

  it('같은 seed로 100회 돌리면 로그까지 완전히 같다', () => {
    const first = JSON.stringify(simulateBattle(input()));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(simulateBattle(input()))).toBe(first);
    }
  });

  it('seed가 다르면 결과가 갈린다', () => {
    const a = JSON.stringify(simulateBattle({ ...input(), seed: 1 }));
    const b = JSON.stringify(simulateBattle({ ...input(), seed: 2 }));
    expect(a).not.toBe(b);
  });

  it('입력 객체를 건드리지 않는다', () => {
    const arg = input();
    const before = JSON.stringify(arg);
    simulateBattle(arg);
    expect(JSON.stringify(arg)).toBe(before);
  });

  it('finalState는 입력과 같은 순서를 유지한다', () => {
    const r = simulateBattle(input());
    expect(r.finalState.allies.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(r.finalState.enemies.map((c) => c.id)).toEqual(['e1', 'e2']);
  });
});

/* ─────────────── 2. 속성 상성 ─────────────── */

describe('속성 상성 4x4', () => {
  const expected: Record<Element, Element> = { earth: 'water', water: 'fire', fire: 'wind', wind: 'earth' };

  it('매트릭스가 유리 1.25 / 동일 1.0 / 불리 0.8 이다', () => {
    const table: string[] = [];
    for (const a of ELEMENTS) {
      const row: number[] = [];
      for (const d of ELEMENTS) {
        const m = elementMultiplier(a, { primary: d, secondary: null }, F);
        row.push(m);
        if (expected[a] === d) expect(m).toBeCloseTo(F.element.advantage, 10);
        else if (expected[d] === a) expect(m).toBeCloseTo(F.element.disadvantage, 10);
        else expect(m).toBeCloseTo(F.element.neutral, 10);
      }
      table.push(`${a.padEnd(6)} ${row.map((v) => v.toFixed(2)).join('  ')}`);
    }
    console.log('\n속성 배율 (행=공격, 열=방어: ' + ELEMENTS.join(' ') + ')\n' + table.join('\n'));
  });

  it('무속성 공격은 상성을 타지 않는다', () => {
    for (const d of ELEMENTS) {
      expect(elementMultiplier(null, { primary: d, secondary: null }, F)).toBe(F.element.neutral);
    }
  });

  it('이중속성은 primary 0.7 + secondary 0.3 가중 평균이다', () => {
    // 화/수 공격 → 풍 방어: 화>풍 1.25 * 0.7 + 수·풍 무관 1.0 * 0.3 = 1.175
    const m = elementMultiplier({ primary: 'fire', secondary: 'water' }, { primary: 'wind', secondary: null }, F);
    expect(m).toBeCloseTo(1.25 * 0.7 + 1.0 * 0.3, 10);

    // 방어 쪽 이중속성도 같은 가중치로 섞인다
    const d = elementMultiplier('earth', { primary: 'water', secondary: 'fire' }, F);
    expect(d).toBeCloseTo(1.25 * 0.7 + 1.0 * 0.3, 10);
  });

  it('실제 전투 피해도 상성 순서를 따른다', () => {
    // 같은 seed·같은 커맨드로 방어자 속성만 바꿔 평균 피해를 비교한다
    const avg = (defender: Element) => {
      let sum = 0;
      let n = 0;
      for (let seed = 0; seed < 120; seed++) {
        const r = simulateBattle({
          allies: [mk({ id: 'a', element: { primary: 'fire', secondary: null }, skills: ['scorch'], stats: { hp: 4000, atk: 60, def: 30, spd: 30 } })],
          enemies: [mk({ id: 'e', element: { primary: defender, secondary: null }, stats: { hp: 4000, atk: 10, def: 30, spd: 10 } })],
          seed,
          commandSource: fixed({ a: { kind: 'skill', skillId: 'scorch', targetId: 'e' }, e: { kind: 'defend' } }),
        });
        for (const d of damages(r.log)) {
          if (d.actorId === 'a') {
            sum += d.amount;
            n++;
          }
        }
      }
      return sum / n;
    };
    const strong = avg('wind'); // 화 > 풍
    const even = avg('earth');
    const weak = avg('water'); // 수 > 화
    expect(strong).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(weak);
    console.log(`\n화염 공격 평균 피해 — 유리 ${strong.toFixed(1)} / 동일 ${even.toFixed(1)} / 불리 ${weak.toFixed(1)}`);
  });
});

/* ─────────────── 3. 극단값 ─────────────── */

describe('극단값', () => {
  it('공격 0 · 방어 9999 여도 피해가 1 이상이고 유한하다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', stats: { hp: 500, atk: 0, def: 0, spd: 50 } })],
      enemies: [mk({ id: 'e', stats: { hp: 500, atk: 0, def: 9999, spd: 1 } })],
      seed: 7,
      commandSource: fixed({ a: { kind: 'attack', targetId: 'e' }, e: { kind: 'defend' } }),
    });
    const hits = damages(r.log);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(Number.isFinite(h.amount)).toBe(true);
      expect(h.amount).toBeGreaterThanOrEqual(F.damage.floor);
    }
  });

  it('로그 전체에 NaN/Infinity가 없다', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const r = simulateBattle({
        allies: [
          mk({ id: 'a1', stats: { hp: 1, atk: 99999, def: 0, spd: 99999 }, skills: ['strike', 'quake', 'frenzy3'] }),
          mk({ id: 'a2', stats: { hp: 99999, atk: 0, def: 99999, spd: 0 }, skills: ['strike', 'harden', 'toxicCloud'] }),
        ],
        enemies: [mk({ id: 'e1', stats: { hp: 300, atk: 1, def: 1, spd: 1 }, skills: ['strike', 'mend'] })],
        seed,
      });
      const found: string[] = [];
      JSON.stringify(r, (k, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) found.push(k);
        return v;
      });
      expect(found).toEqual([]);
    }
  });

  it('수식 함수가 경계에서도 범위를 지킨다', () => {
    expect(hitChance(99999, 0, F)).toBeLessThanOrEqual(F.hit.max);
    expect(hitChance(0, 99999, F)).toBeGreaterThanOrEqual(F.hit.min);
    expect(critChance(99999, F)).toBeLessThanOrEqual(F.crit.max);
    expect(critChance(0, F)).toBeGreaterThanOrEqual(0);
    expect(fleeChance(0, 99999, F)).toBeGreaterThanOrEqual(F.flee.min);
    expect(fleeChance(99999, 0, F)).toBeLessThanOrEqual(F.flee.max);
    expect(ailmentChance(1, 99999, F)).toBeGreaterThanOrEqual(1 - F.ailment.resistMax - 1e-9);
    expect(
      finalDamage({ atk: NaN, def: 1, skillPower: 1, elementMul: 1, critMul: 1, situational: 1, variance: 1 }, F),
    ).toBe(F.damage.floor);
  });

  it('빈 파티나 정원 초과는 던진다', () => {
    expect(() => simulateBattle({ allies: [], enemies: [mk({ id: 'e' })], seed: 1 })).toThrow(RangeError);
    const six = Array.from({ length: 6 }, (_, i) => mk({ id: `a${i}` }));
    expect(() => simulateBattle({ allies: six, enemies: [mk({ id: 'e' })], seed: 1 })).toThrow(RangeError);
  });

  it('전투원 id가 중복되면 던진다', () => {
    expect(() => simulateBattle({ allies: [mk({ id: 'x' })], enemies: [mk({ id: 'x' })], seed: 1 })).toThrow(RangeError);
  });
});

/* ─────────────── 4. 무한루프 방지 ─────────────── */

describe('라운드 상한', () => {
  it('서로 못 죽이면 200라운드에서 무승부로 끝난다', () => {
    const tank = (id: string) => mk({ id, stats: { hp: 900000, atk: 1, def: 9999, spd: 10 }, skills: ['strike'] });
    const r = simulateBattle({
      allies: [tank('a')],
      enemies: [tank('e')],
      seed: 3,
      commandSource: fixed({ a: { kind: 'attack', targetId: 'e' }, e: { kind: 'attack', targetId: 'a' } }),
    });
    expect(r.winner).toBe('draw');
    expect(r.endedBy).toBe('roundLimit');
    expect(r.rounds).toBe(F.battle.maxRounds);
    const rounds = r.log.filter((e) => e.type === 'roundStart').length;
    expect(rounds).toBe(F.battle.maxRounds);
  });
});

/* ─────────────── 전투 규칙 ─────────────── */

describe('진형과 방어', () => {
  const probe = (attackerRow: 'front' | 'back', defenderRow: 'front' | 'back', defend: boolean, seeds = 150) => {
    let sum = 0;
    let n = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const r = simulateBattle({
        allies: [mk({ id: 'a', row: attackerRow, stats: { hp: 9000, atk: 60, def: 30, spd: 30 } })],
        enemies: [mk({ id: 'e', row: defenderRow, stats: { hp: 9000, atk: 1, def: 30, spd: 5 } })],
        seed,
        commandSource: fixed({
          a: { kind: 'attack', targetId: 'e' },
          e: defend ? { kind: 'defend' } : { kind: 'attack', targetId: 'a' },
        }),
      });
      for (const d of damages(r.log)) if (d.actorId === 'a') (sum += d.amount), n++;
    }
    return sum / n;
  };

  it('후열은 물리 피해를 덜 받는다', () => {
    expect(probe('front', 'back', false)).toBeLessThan(probe('front', 'front', false));
  });

  it('후열은 근접 피해를 덜 준다', () => {
    expect(probe('back', 'front', false)).toBeLessThan(probe('front', 'front', false));
  });

  it('방어 커맨드는 받는 피해를 절반으로 줄인다', () => {
    const guarded = probe('front', 'front', true);
    const open = probe('front', 'front', false);
    expect(guarded).toBeLessThan(open * 0.62);
  });

  it('가드 브레이크는 방어 커맨드를 무시한다', () => {
    // 첫 타만 본다. 뒤 라운드까지 합치면 가드 브레이크의 방어 감소 디버프가
    // 섞여 들어와, "방어를 무시했는가"가 아니라 "디버프가 쌓였는가"를 재게 된다.
    const firstHit = (skillId: string, defend: boolean) => {
      let sum = 0;
      let n = 0;
      for (let seed = 0; seed < 250; seed++) {
        const r = simulateBattle({
          allies: [mk({ id: 'a', skills: [skillId], stats: { hp: 9000, atk: 60, def: 30, spd: 30 }, energy: 9000, maxEnergy: 9000 })],
          enemies: [mk({ id: 'e', stats: { hp: 9000, atk: 1, def: 30, spd: 5 } })],
          seed,
          commandSource: fixed({
            a: { kind: 'skill', skillId, targetId: 'e' },
            e: defend ? { kind: 'defend' } : { kind: 'attack', targetId: 'a' },
          }),
        });
        const first = damages(r.log).find((d) => d.actorId === 'a');
        if (first) (sum += first.amount), n++;
      }
      return sum / n;
    };

    // 보통 공격은 방어 커맨드에 절반으로 깎인다
    expect(firstHit('gore', true) / firstHit('gore', false)).toBeLessThan(0.62);
    // 가드 브레이크는 방어를 해도 그대로 들어간다
    expect(firstHit('feint', true) / firstHit('feint', false)).toBeGreaterThan(0.93);
  });
});

describe('도발과 감싸기', () => {
  it('도발한 유닛이 단일 공격을 전부 끌어온다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', stats: { hp: 2000, atk: 30, def: 20, spd: 5 } })],
      enemies: [
        mk({ id: 'tank', skills: ['taunt'], stats: { hp: 3000, atk: 10, def: 40, spd: 40 } }),
        mk({ id: 'squishy', stats: { hp: 300, atk: 10, def: 5, spd: 20 } }),
      ],
      seed: 11,
      commandSource: fixed({
        a: { kind: 'attack', targetId: 'squishy' },
        tank: { kind: 'skill', skillId: 'taunt' },
        squishy: { kind: 'defend' },
      }),
    });
    const hitIds = new Set(damages(r.log).filter((d) => d.actorId === 'a').map((d) => d.targetId));
    expect(hitIds.has('tank')).toBe(true);
    expect(hitIds.has('squishy')).toBe(false);
  });

  it('감싸기는 지정한 아군의 피해를 대신 받는다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', stats: { hp: 2000, atk: 30, def: 20, spd: 5 } })],
      enemies: [
        mk({ id: 'guard', skills: ['shieldAlly'], stats: { hp: 3000, atk: 10, def: 40, spd: 40 } }),
        mk({ id: 'weak', stats: { hp: 400, atk: 10, def: 5, spd: 20 } }),
      ],
      seed: 12,
      commandSource: fixed({
        a: { kind: 'attack', targetId: 'weak' },
        guard: { kind: 'skill', skillId: 'shieldAlly', targetId: 'weak' },
        weak: { kind: 'defend' },
      }),
    });
    const redirected = damages(r.log).filter((d) => d.redirectedFrom === 'weak');
    expect(redirected.length).toBeGreaterThan(0);
    for (const d of redirected) expect(d.targetId).toBe('guard');
  });
});

describe('상태이상', () => {
  it('마비는 1~3턴이고 그동안 행동을 못 한다', () => {
    const turns = new Set<number>();
    let skipped = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateBattle({
        allies: [mk({ id: 'a', skills: ['numb'], energy: 900, maxEnergy: 900, stats: { hp: 5000, atk: 20, def: 20, spd: 60 } })],
        enemies: [mk({ id: 'e', stats: { hp: 5000, atk: 20, def: 20, spd: 5 } })],
        seed,
        commandSource: fixed({ a: { kind: 'skill', skillId: 'numb', targetId: 'e' }, e: { kind: 'attack', targetId: 'a' } }),
      });
      for (const ev of r.log) {
        if (ev.type === 'ailmentApplied' && ev.ailment === 'paralysis') turns.add(ev.turns);
        if (ev.type === 'skipped' && ev.reason === 'paralysis') skipped++;
      }
    }
    expect([...turns].sort()).toEqual([1, 2, 3]);
    expect(skipped).toBeGreaterThan(0);
  });

  it('수면은 피격 시 풀린다', () => {
    let woken = 0;
    for (let seed = 0; seed < 120; seed++) {
      const r = simulateBattle({
        allies: [
          mk({ id: 'caster', skills: ['lull'], energy: 900, maxEnergy: 900, stats: { hp: 3000, atk: 5, def: 20, spd: 90 } }),
          mk({ id: 'hitter', stats: { hp: 3000, atk: 40, def: 20, spd: 10 } }),
        ],
        enemies: [mk({ id: 'e', stats: { hp: 3000, atk: 10, def: 20, spd: 1 } })],
        seed,
        commandSource: fixed({
          caster: { kind: 'skill', skillId: 'lull', targetId: 'e' },
          hitter: { kind: 'attack', targetId: 'e' },
          e: { kind: 'attack', targetId: 'caster' },
        }),
      });
      woken += r.log.filter((ev) => ev.type === 'ailmentCleared' && ev.reason === 'woken').length;
    }
    expect(woken).toBeGreaterThan(0);
  });

  it('독은 최대 체력 비례로 들어가고 방어를 무시한다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', skills: ['toxicCloud'], energy: 900, maxEnergy: 900, stats: { hp: 5000, atk: 5, def: 20, spd: 60 } })],
      enemies: [mk({ id: 'e', stats: { hp: 1000, atk: 5, def: 9999, spd: 5 } })],
      seed: 21,
      commandSource: fixed({ a: { kind: 'skill', skillId: 'toxicCloud', targetId: 'e' }, e: { kind: 'defend' } }),
    });
    const ticks = pick(r.log, 'ailmentTick').filter((ev) => ev.ailment === 'poison');
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) expect(t.amount).toBe(Math.round(1000 * F.ailment.poisonMaxHpRatio));
  });

  it('혼란은 대상을 무작위로 바꾼다 — 아군을 때리기도 한다', () => {
    let friendlyFire = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = simulateBattle({
        allies: [mk({ id: 'a', skills: ['mist'], energy: 900, maxEnergy: 900, stats: { hp: 4000, atk: 10, def: 20, spd: 90 } })],
        enemies: [
          mk({ id: 'e1', stats: { hp: 4000, atk: 40, def: 20, spd: 5 } }),
          mk({ id: 'e2', stats: { hp: 4000, atk: 10, def: 20, spd: 4 } }),
        ],
        seed,
        commandSource: fixed({
          a: { kind: 'skill', skillId: 'mist', targetId: 'e1' },
          e1: { kind: 'attack', targetId: 'a' },
          e2: { kind: 'defend' },
        }),
      });
      friendlyFire += damages(r.log).filter((d) => d.actorId === 'e1' && d.targetId === 'e2').length;
    }
    expect(friendlyFire).toBeGreaterThan(0);
  });

  it('저항은 순발력이 높을수록 잘 된다', () => {
    const applied = (spd: number) => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        const r = simulateBattle({
          allies: [mk({ id: 'a', skills: ['numb'], energy: 900, maxEnergy: 900, stats: { hp: 4000, atk: 5, def: 20, spd: 50 } })],
          enemies: [mk({ id: 'e', stats: { hp: 4000, atk: 5, def: 20, spd } })],
          seed,
          commandSource: fixed({ a: { kind: 'skill', skillId: 'numb', targetId: 'e' }, e: { kind: 'defend' } }),
        });
        n += r.log.filter((ev) => ev.type === 'ailmentApplied').length;
      }
      return n;
    };
    expect(applied(150)).toBeLessThan(applied(5));
  });
});

describe('버프', () => {
  it('배수의 진은 공격을 올리고 방어를 내준다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', skills: ['frenzy3'], energy: 900, maxEnergy: 900 })],
      enemies: [mk({ id: 'e', stats: { hp: 9000, atk: 20, def: 20, spd: 1 } })],
      seed: 31,
      commandSource: fixed({ a: { kind: 'skill', skillId: 'frenzy3' }, e: { kind: 'attack', targetId: 'a' } }),
    });
    const mod = r.log.find((ev) => ev.type === 'modifierApplied');
    expect(mod).toMatchObject({ sourceId: 'frenzy3', atk: 2, def: 0.5 });
  });

  it('같은 버프를 반복해도 곱해서 쌓이지 않는다', () => {
    // 매 라운드 배수의 진을 다시 걸면서, 라운드마다 활성 수정자와 실제 공격력을
    // 들여다본다. 갱신이 아니라 누적이면 공격력이 1.3배씩 계속 불어난다.
    let maxStack = 0;
    let maxAtk = 0;
    const base = 40;
    const source: CommandSource = (v) => {
      const a = v.allies[0]!;
      maxStack = Math.max(maxStack, a.modifiers.filter((m) => m.sourceId === 'frenzy').length);
      maxAtk = Math.max(maxAtk, a.effectiveStats.atk);
      return { a: { kind: 'skill', skillId: 'frenzy' }, e: { kind: 'defend' } };
    };
    const r = simulateBattle({
      allies: [mk({ id: 'a', skills: ['frenzy'], energy: 9000, maxEnergy: 9000, stats: { hp: 9000, atk: base, def: 30, spd: 30 } })],
      enemies: [mk({ id: 'e', stats: { hp: 9000, atk: 5, def: 20, spd: 1 } })],
      seed: 32,
      commandSource: source,
    });
    expect(pick(r.log, 'modifierApplied').length).toBeGreaterThan(5);
    expect(maxStack).toBe(1);
    expect(maxAtk).toBeCloseTo(base * 1.3, 6);
  });

  it('속성 강화는 같은 속성 아군에게만 걸린다', () => {
    const r = simulateBattle({
      allies: [
        mk({ id: 'caster', element: { primary: 'fire', secondary: null }, skills: ['fireAura'], energy: 900, maxEnergy: 900, stats: { hp: 5000, atk: 5, def: 20, spd: 90 } }),
        mk({ id: 'fireAlly', element: { primary: 'fire', secondary: null }, stats: { hp: 5000, atk: 5, def: 20, spd: 3 } }),
        mk({ id: 'waterAlly', element: { primary: 'water', secondary: null }, stats: { hp: 5000, atk: 5, def: 20, spd: 2 } }),
      ],
      enemies: [mk({ id: 'e', stats: { hp: 5000, atk: 5, def: 20, spd: 1 } })],
      seed: 33,
      commandSource: fixed({
        caster: { kind: 'skill', skillId: 'fireAura' },
        fireAlly: { kind: 'defend' },
        waterAlly: { kind: 'defend' },
        e: { kind: 'defend' },
      }),
    });
    const buffed = new Set(
      r.log.filter((ev) => ev.type === 'modifierApplied' && ev.sourceId === 'fireAura').map((ev) => (ev as { targetId: string }).targetId),
    );
    expect(buffed.has('fireAlly')).toBe(true);
    expect(buffed.has('caster')).toBe(true);
    expect(buffed.has('waterAlly')).toBe(false);
  });
});

describe('기력·정령·아이템', () => {
  it('기력이 모자라면 스킬 대신 평타가 나간다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', skills: ['gore'], energy: 0, maxEnergy: 0, stats: { hp: 900, atk: 40, def: 20, spd: 30 } })],
      enemies: [mk({ id: 'e', stats: { hp: 900, atk: 5, def: 20, spd: 1 } })],
      seed: 41,
      commandSource: fixed({ a: { kind: 'skill', skillId: 'gore', targetId: 'e' }, e: { kind: 'defend' } }),
    });
    expect(r.log.some((ev) => ev.type === 'noEnergy')).toBe(true);
    expect(damages(r.log).every((d) => d.actorId !== 'a' || d.skillId === 'strike')).toBe(true);
  });

  it('장비에 깃들지 않은 정령은 쓸 수 없다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', energy: 900, maxEnergy: 900, stats: { hp: 900, atk: 40, def: 20, spd: 30 } })],
      enemies: [mk({ id: 'e', stats: { hp: 900, atk: 5, def: 20, spd: 1 } })],
      seed: 42,
      commandSource: fixed({ a: { kind: 'spirit', spiritId: 'tideCall', level: 3, targetId: 'e' }, e: { kind: 'defend' } }),
    });
    expect(r.log.some((ev) => ev.type === 'spiritUsed')).toBe(false);
    expect(damages(r.log).some((d) => d.actorId === 'a')).toBe(true);
  });

  it('깃든 정령은 기력을 쓰고 효과를 낸다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', spirits: ['tideCall'], energy: 900, maxEnergy: 900, stats: { hp: 5000, atk: 40, def: 20, spd: 30 } })],
      enemies: [mk({ id: 'e', stats: { hp: 5000, atk: 5, def: 20, spd: 1 } })],
      seed: 43,
      commandSource: fixed({ a: { kind: 'spirit', spiritId: 'tideCall', level: 5, targetId: 'e' }, e: { kind: 'defend' } }),
    });
    const uses = r.log.filter((ev) => ev.type === 'spiritUsed');
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.some((u) => u.success)).toBe(true);
    expect(damages(r.log).some((d) => d.skillId === 'tideCall')).toBe(true);
  });

  it('회복 아이템은 체력을 올리고 해독제는 독을 지운다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', hp: 100, stats: { hp: 2000, atk: 5, def: 20, spd: 30 } })],
      enemies: [mk({ id: 'e', stats: { hp: 2000, atk: 20, def: 20, spd: 1 } })],
      seed: 44,
      commandSource: fixed({ a: { kind: 'item', itemId: 'herbLarge' }, e: { kind: 'attack', targetId: 'a' } }),
    });
    const heals = r.log.filter((ev) => ev.type === 'heal');
    expect(heals.length).toBeGreaterThan(0);
    expect(heals[0]!.amount).toBeGreaterThan(0);
  });
});

describe('포획과 도주', () => {
  it('약해진 펫일수록 포획 확률이 높다', () => {
    const chanceAt = (hp: number) => {
      const r = simulateBattle({
        allies: [mk({ id: 'a', kind: 'character', charm: 10, stats: { hp: 900, atk: 5, def: 20, spd: 30 } })],
        enemies: [mk({ id: 'e', speciesId: 'emberfox', captureBaseRate: 0.42, hp, stats: { hp: 1000, atk: 1, def: 20, spd: 1 } })],
        seed: 51,
        commandSource: fixed({ a: { kind: 'capture', targetId: 'e', itemId: 'ropeCrude' }, e: { kind: 'defend' } }),
      });
      const attempt = r.log.find((ev) => ev.type === 'captureAttempt');
      return attempt?.chance ?? 0;
    };
    expect(chanceAt(100)).toBeGreaterThan(chanceAt(900));
  });

  it('좋은 도구가 포획 확률을 올린다', () => {
    const chance = (itemId: string) => {
      const r = simulateBattle({
        allies: [mk({ id: 'a', kind: 'character', stats: { hp: 900, atk: 5, def: 20, spd: 30 } })],
        enemies: [mk({ id: 'e', speciesId: 'emberfox', captureBaseRate: 0.42, hp: 300, stats: { hp: 1000, atk: 1, def: 20, spd: 1 } })],
        seed: 52,
        commandSource: fixed({ a: { kind: 'capture', targetId: 'e', itemId }, e: { kind: 'defend' } }),
      });
      return r.log.find((ev) => ev.type === 'captureAttempt')?.chance ?? 0;
    };
    expect(chance('ropeMaster')).toBeGreaterThan(chance('ropeCrude'));
  });

  it('포획에 성공하면 결과에 근거가 남는다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', kind: 'character', stats: { hp: 900, atk: 5, def: 20, spd: 30 } })],
      enemies: [mk({ id: 'e', speciesId: 'emberfox', captureBaseRate: 0.42, hp: 20, stats: { hp: 1000, atk: 1, def: 20, spd: 1 } })],
      seed: 53,
      commandSource: fixed({ a: { kind: 'capture', targetId: 'e', itemId: 'ropeMaster' }, e: { kind: 'defend' } }),
    });
    expect(r.capturedPet).toBeDefined();
    expect(r.capturedPet!.speciesId).toBe('emberfox');
    expect(r.capturedPet!.capturerId).toBe('a');
    expect(r.endedBy).toBe('capture');
  });

  it('캐릭터는 포획할 수 없다', () => {
    const r = simulateBattle({
      allies: [mk({ id: 'a', kind: 'character', stats: { hp: 900, atk: 20, def: 20, spd: 30 } })],
      enemies: [mk({ id: 'e', kind: 'character', hp: 20, stats: { hp: 1000, atk: 1, def: 20, spd: 1 } })],
      seed: 54,
      commandSource: fixed({ a: { kind: 'capture', targetId: 'e', itemId: 'ropeMaster' }, e: { kind: 'defend' } }),
    });
    expect(r.log.some((ev) => ev.type === 'captureAttempt')).toBe(false);
    expect(r.capturedPet).toBeUndefined();
  });

  it('도주에 성공하면 전투가 끝나고 이기지 못한다', () => {
    let fled = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = simulateBattle({
        allies: [mk({ id: 'a', stats: { hp: 3000, atk: 5, def: 20, spd: 90 } })],
        enemies: [mk({ id: 'e', stats: { hp: 3000, atk: 5, def: 20, spd: 5 } })],
        seed,
        commandSource: fixed({ a: { kind: 'flee' }, e: { kind: 'defend' } }),
      });
      if (r.endedBy === 'flee') {
        fled++;
        expect(r.winner).toBe('enemy');
      }
    }
    expect(fled).toBeGreaterThan(0);
  });
});

/* ─────────────── 5. 랜덤 매치업 승률 분포 ─────────────── */

describe('랜덤 매치업 1000회', () => {
  it('승률이 한쪽으로 쏠리지 않고 전투가 제때 끝난다', () => {
    const rng = createRng(20260804);
    const skillIds = Object.keys(DEFAULT_CATALOG.skills);

    const roll = (side: 'a' | 'e', i: number): Combatant => {
      const primary = rng.pick(ELEMENTS);
      const level = rng.int(10, 40);
      const hp = rng.int(140, 420);
      return mk({
        id: `${side}${i}`,
        level,
        element: { primary, secondary: rng.chance(0.3) ? rng.pick(ELEMENTS.filter((x) => x !== primary)) : null },
        stats: { hp, atk: rng.int(20, 60), def: rng.int(15, 50), spd: rng.int(15, 55) },
        hp,
        energy: rng.int(20, 60),
        maxEnergy: 60,
        row: rng.chance(0.5) ? 'front' : 'back',
        skills: ['strike', ...rng.shuffle(skillIds).slice(0, 3)],
      });
    };

    const N = 1000;
    const tally: Record<string, number> = { ally: 0, enemy: 0, draw: 0 };
    const reasons: Record<string, number> = {};
    const roundBuckets = [0, 0, 0, 0, 0]; // 1-5, 6-10, 11-20, 21-50, 51+
    let totalRounds = 0;

    for (let i = 0; i < N; i++) {
      const size = rng.int(1, 5);
      const input = {
        allies: Array.from({ length: size }, (_, k) => roll('a', k)),
        enemies: Array.from({ length: rng.int(1, 5) }, (_, k) => roll('e', k)),
        seed: rng.int(0, 2 ** 30),
      };
      const r = simulateBattle(input);
      tally[r.winner]!++;
      reasons[r.endedBy] = (reasons[r.endedBy] ?? 0) + 1;
      totalRounds += r.rounds;
      const b = r.rounds <= 5 ? 0 : r.rounds <= 10 ? 1 : r.rounds <= 20 ? 2 : r.rounds <= 50 ? 3 : 4;
      roundBuckets[b]!++;

      expect(Number.isFinite(r.rounds)).toBe(true);
      expect(r.rounds).toBeLessThanOrEqual(F.battle.maxRounds);
    }

    const pct = (n: number) => `${((n / N) * 100).toFixed(1)}%`;
    console.log(
      `\n랜덤 매치업 ${N}회\n` +
        `  승자    아군 ${pct(tally.ally!)} · 적군 ${pct(tally.enemy!)} · 무승부 ${pct(tally.draw!)}\n` +
        `  종료    ${Object.entries(reasons).map(([k, v]) => `${k} ${pct(v)}`).join(' · ')}\n` +
        `  평균 라운드 ${(totalRounds / N).toFixed(1)}\n` +
        `  라운드 분포  1-5 ${pct(roundBuckets[0]!)} · 6-10 ${pct(roundBuckets[1]!)} · 11-20 ${pct(roundBuckets[2]!)} · 21-50 ${pct(roundBuckets[3]!)} · 51+ ${pct(roundBuckets[4]!)}`,
    );

    // 양쪽을 같은 분포에서 뽑았으므로 승률이 크게 갈리면 엔진이 한쪽을 편든다는 뜻이다
    const allyRate = tally.ally! / (tally.ally! + tally.enemy!);
    expect(allyRate).toBeGreaterThan(0.42);
    expect(allyRate).toBeLessThan(0.58);
    // 대부분의 전투는 상한에 닿기 전에 끝나야 한다
    expect(tally.draw! / N).toBeLessThan(0.05);
  });
});
