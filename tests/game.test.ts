import { describe, it, expect } from 'vitest';
import { DEFAULT_CATALOG, createDefaultAI, simulateBattle, type Combatant } from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import { growthScore, GROWTH_SCORE_CAP } from '../src/engine/types';
import { MAPS, getMap, isBlocked, warpAt, zoneAt } from '../src/game/maps';
import { canStep, createPlayer, renderPosition, stepMovement, type MoveInput } from '../src/game/movement';
import { createDanger, dangerLevel, stepDanger, DEFAULT_ENCOUNTER } from '../src/game/encounter';
import { replayBattle } from '../src/game/replay';
import { getSpecies, petToCombatant, rollEncounterParty } from '../src/game/party';
import { createStanceSource } from '../src/game/stances';
import {
  depth,
  focusCamera,
  isoX,
  isoY,
  mapBounds,
  screenDir,
  screenInputToWorld,
  unproject,
  visibleTiles,
} from '../src/render/iso';

/**
 * 필드 레이어 테스트.
 *
 * 렌더링은 화면으로 확인하고, 여기서는 화면 없이 확인할 수 있는 것을 붙든다:
 * 맵 데이터의 정합성, 이동 규칙, 위험도 게이지, 그리고 **로그만으로 전투를
 * 재생할 수 있는가**.
 *
 * 마지막 항목이 이 Phase의 핵심 계약이다. 재생 결과가 엔진의 finalState와
 * 어긋나면 이벤트가 뭔가를 빠뜨린 것이고, 그건 렌더러가 아니라 엔진의 문제다.
 */

const ALL = Object.values(MAPS);
const step = (dx: -1 | 0 | 1, dy: -1 | 0 | 1): MoveInput => ({ dx, dy });

/* ─────────────── 맵 데이터 ─────────────── */

describe('맵 데이터', () => {
  it('마을 1 · 필드 3 · 던전 1 이 있다', () => {
    expect(ALL.length).toBe(5);
    expect(ALL.filter((m) => m.indoor).length).toBe(1);
    expect(MAPS['village']!.zones.length).toBe(0); // 마을에서는 전투가 걸리지 않는다
  });

  it('모든 레이어 길이가 width*height 와 같다', () => {
    for (const m of ALL) {
      const n = m.width * m.height;
      for (const [name, layer] of Object.entries(m.layers)) {
        expect(layer.length, `${m.id}.${name}`).toBe(n);
      }
    }
  });

  it('시작 지점과 워프 도착점이 걸어갈 수 있는 칸이다', () => {
    for (const m of ALL) {
      expect(isBlocked(m, m.spawn.x, m.spawn.y), `${m.id} 시작점`).toBe(false);
      for (const w of m.warps) {
        const dest = getMap(w.toMapId);
        expect(isBlocked(dest, w.toX, w.toY), `${m.id}→${w.toMapId}`).toBe(false);
      }
    }
  });

  it('워프는 양쪽이 맞물린다 — 들어갔다가 못 나오는 맵이 없다', () => {
    for (const m of ALL) {
      for (const w of m.warps) {
        const back = getMap(w.toMapId).warps.some((b) => b.toMapId === m.id);
        expect(back, `${w.toMapId}에서 ${m.id}로 돌아오는 길`).toBe(true);
      }
    }
  });

  it('마을에서 모든 맵에 갈 수 있다', () => {
    const seen = new Set(['village']);
    const queue = ['village'];
    while (queue.length) {
      for (const w of getMap(queue.pop()!).warps) {
        if (!seen.has(w.toMapId)) {
          seen.add(w.toMapId);
          queue.push(w.toMapId);
        }
      }
    }
    expect(seen.size).toBe(ALL.length);
  });

  it('인카운터 존은 걸어갈 수 있는 칸에만 칠해져 있다', () => {
    // 벽 위에 존이 있으면 영원히 안 도는 죽은 데이터가 된다
    for (const m of ALL) {
      for (let i = 0; i < m.layers.encounter.length; i++) {
        if (m.layers.encounter[i]! > 0) expect(m.layers.collision[i], `${m.id}[${i}]`).toBe(0);
      }
    }
  });

  it('존이 참조하는 종이 전부 실재한다', () => {
    for (const m of ALL) {
      for (const z of m.zones) {
        expect(z.speciesIds.length).toBeGreaterThan(0);
        for (const id of z.speciesIds) expect(() => getSpecies(id)).not.toThrow();
        expect(z.levelRange[0]).toBeLessThanOrEqual(z.levelRange[1]);
        expect(z.partySize[0]).toBeGreaterThan(0);
        expect(z.partySize[1]).toBeLessThanOrEqual(5); // 전투 정원
      }
    }
  });

  it('지역이 진행 순서대로 어려워진다', () => {
    const top = (id: string) => Math.max(...getMap(id).zones.map((z) => z.levelRange[1]));
    expect(top('meadow')).toBeLessThan(top('marsh'));
    expect(top('marsh')).toBeLessThan(top('foothills'));
    expect(top('foothills')).toBeLessThan(top('cavern'));
  });
});

/* ─────────────── 이동 ─────────────── */

describe('이동', () => {
  const map = getMap('meadow');

  it('벽으로는 못 간다', () => {
    const p = createPlayer('meadow', 1, 1);
    const r = stepMovement(map, p, step(-1, 0), 0.1); // 왼쪽은 나무 테두리
    expect(r.blocked).toBe(true);
    expect(r.player.target).toBeNull();
    // 막혀도 바라보는 방향은 바뀐다
    expect(r.player.facing).toBe('left');
  });

  it('대각선으로 벽 모서리를 뚫지 못한다', () => {
    // 실제 맵에 그런 지형이 있는지에 기대지 않고, 규칙 자체를 검사한다.
    // 3x3에 대각선으로만 이어진 통로를 만든다:
    //   . #
    //   # .    ← 가운데에서 오른쪽 위로 대각 이동
    const tiny = {
      ...map,
      width: 3,
      height: 3,
      layers: {
        ground: new Array(9).fill(0),
        object: new Array(9).fill(0),
        collision: [0, 1, 0, 1, 0, 1, 0, 1, 0],
        encounter: new Array(9).fill(0),
      },
      zones: [],
      warps: [],
    };
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      expect(canStep(tiny, { x: 1, y: 1 }, dx, dy), `${dx},${dy}`).toBe(false);
    }

    // 한쪽만 막혀도 대각선은 막는다. 모서리를 스치듯 지나가는 그림을 없애려는
    // 의도적으로 엄격한 규칙이다(movement.ts 참고).
    const oneSide = { ...tiny, layers: { ...tiny.layers, collision: [0, 1, 0, 0, 0, 0, 0, 0, 0] } };
    expect(canStep(oneSide, { x: 1, y: 1 }, 1, -1)).toBe(false);

    // 사방이 뚫려 있으면 당연히 간다 — 규칙이 대각선을 통째로 막고 있진 않은지
    const open = { ...tiny, layers: { ...tiny.layers, collision: new Array(9).fill(0) } };
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      expect(canStep(open, { x: 1, y: 1 }, dx, dy)).toBe(true);
    }
  });

  it('한 걸음은 정확히 한 칸이고, 도착해야 걸음 수가 오른다', () => {
    let p = createPlayer('meadow', 15, 1);
    let arrived = 0;
    for (let i = 0; i < 60; i++) {
      const r = stepMovement(map, p, step(0, 1), 1 / 60);
      p = r.player;
      if (r.arrived) arrived++;
    }
    expect(p.steps).toBe(arrived);
    expect(p.tile.y).toBe(1 + arrived);
    expect(p.tile.x).toBe(15);
  });

  it('이동 중에는 입력을 무시한다 — 한 프레임에 두 칸을 갈 수 없다', () => {
    let p = createPlayer('meadow', 15, 2);
    p = stepMovement(map, p, step(0, 1), 0.01).player;
    expect(p.target).toEqual({ x: 15, y: 3 });
    // 도중에 반대 방향을 눌러도 하던 걸음을 끝낸다
    const r = stepMovement(map, p, step(0, -1), 0.01);
    expect(r.player.target).toEqual({ x: 15, y: 3 });
  });

  it('큰 dt가 들어와도 한 프레임에 한 칸만 간다', () => {
    let p = createPlayer('meadow', 15, 1);
    const r = stepMovement(map, { ...p, target: { x: 15, y: 2 }, progress: 0 }, step(0, 1), 100);
    expect(r.player.tile).toEqual({ x: 15, y: 2 });
    expect(r.player.steps).toBe(1);
    p = r.player;
    expect(p.target).toBeNull();
  });

  it('보간 위치가 두 타일 사이에 놓인다', () => {
    const p = { ...createPlayer('meadow', 4, 4), target: { x: 5, y: 4 }, progress: 0.5 };
    expect(renderPosition(p)).toEqual({ x: 4.5, y: 4 });
  });

  it('같은 입력열은 같은 경로를 만든다', () => {
    const run = () => {
      let p = createPlayer('meadow', 15, 1);
      const path: string[] = [];
      for (let i = 0; i < 200; i++) {
        const r = stepMovement(map, p, step(i % 3 === 0 ? 1 : 0, 1), 1 / 60);
        p = r.player;
        if (r.arrived) path.push(`${p.tile.x},${p.tile.y}`);
      }
      return path;
    };
    expect(run()).toEqual(run());
  });
});

/* ─────────────── 위험도 게이지 ─────────────── */

describe('위험도 게이지', () => {
  const map = getMap('meadow');
  const inZone = { x: 5, y: 5 };
  const onPath = { x: 15, y: 5 };

  it('존 안을 걸으면 단조 증가하다가 1에서 전투가 걸린다', () => {
    const rng = createRng(1);
    let d = { gauge: 0, grace: 0 };
    let prev = 0;
    let triggered = false;
    for (let i = 0; i < 200 && !triggered; i++) {
      const r = stepDanger(map, inZone, d, rng);
      if (r.triggered) {
        triggered = true;
        expect(r.danger.gauge).toBe(0);
        expect(r.danger.grace).toBe(DEFAULT_ENCOUNTER.graceSteps);
      } else {
        expect(r.danger.gauge).toBeGreaterThan(prev);
        prev = r.danger.gauge;
      }
      d = r.danger;
    }
    expect(triggered).toBe(true);
  });

  it('존 밖에서는 절대 걸리지 않고 게이지가 가라앉는다', () => {
    const rng = createRng(2);
    let d = { gauge: 0.9, grace: 0 };
    for (let i = 0; i < 50; i++) {
      const r = stepDanger(map, onPath, d, rng);
      expect(r.triggered).toBe(false);
      expect(r.danger.gauge).toBeLessThanOrEqual(d.gauge);
      d = r.danger;
    }
    expect(d.gauge).toBe(0);
  });

  it('전투 직후 유예 동안은 걸리지 않는다', () => {
    const rng = createRng(3);
    let d = createDanger();
    for (let i = 0; i < DEFAULT_ENCOUNTER.graceSteps; i++) {
      const r = stepDanger(map, inZone, d, rng);
      expect(r.triggered).toBe(false);
      d = r.danger;
    }
    expect(d.grace).toBe(0);
  });

  it('같은 seed면 같은 걸음에서 걸린다', () => {
    const runTo = (seed: number) => {
      const rng = createRng(seed);
      let d = { gauge: 0, grace: 0 };
      for (let i = 1; i <= 500; i++) {
        const r = stepDanger(map, inZone, d, rng);
        d = r.danger;
        if (r.triggered) return i;
      }
      return -1;
    };
    expect(runTo(42)).toBe(runTo(42));
    expect(runTo(42)).toBeGreaterThan(0);
  });

  it('존이 위험할수록 빨리 걸린다', () => {
    const steps = (tile: { x: number; y: number }) => {
      const rng = createRng(7);
      let d = { gauge: 0, grace: 0 };
      let total = 0;
      for (let run = 0; run < 60; run++) {
        for (let i = 1; i <= 500; i++) {
          const r = stepDanger(map, tile, d, rng);
          d = r.danger;
          if (r.triggered) {
            total += i;
            d = { gauge: 0, grace: 0 };
            break;
          }
        }
      }
      return total / 60;
    };
    // 깊은 풀숲(rate 0.085)이 얕은 풀숲(0.055)보다 자주 걸려야 한다
    expect(steps({ x: 20, y: 5 })).toBeLessThan(steps({ x: 5, y: 5 }));
  });

  it('경고 단계가 게이지를 따라 올라간다', () => {
    expect(dangerLevel({ gauge: 0.9, grace: 0 }, false)).toBe('safe');
    expect(dangerLevel({ gauge: 0.9, grace: 3 }, true)).toBe('calm');
    expect(dangerLevel({ gauge: 0.2, grace: 0 }, true)).toBe('uneasy');
    expect(dangerLevel({ gauge: 0.9, grace: 0 }, true)).toBe('imminent');
  });
});

/* ─────────────── 야생 파티 ─────────────── */

describe('인카운터 파티', () => {
  it('존이 정한 레벨·마릿수 범위를 지킨다', () => {
    const rng = createRng(11);
    for (const m of ALL) {
      for (const zone of m.zones) {
        for (let i = 0; i < 60; i++) {
          const { pets, combatants } = rollEncounterParty(zone, rng, i);
          expect(pets.length).toBeGreaterThanOrEqual(zone.partySize[0]);
          expect(pets.length).toBeLessThanOrEqual(zone.partySize[1]);
          for (const p of pets) {
            expect(p.level).toBeGreaterThanOrEqual(zone.levelRange[0]);
            expect(p.level).toBeLessThanOrEqual(zone.levelRange[1]);
            expect(zone.speciesIds).toContain(p.speciesId);
            // 야생 개체도 상한을 넘지 않는다
            expect(growthScore(p.growth)).toBeLessThan(GROWTH_SCORE_CAP);
          }
          // 3마리 이상이면 뒤쪽이 후열로 간다 — 진형 규칙이 야생 전투에도 걸린다
          if (combatants.length >= 3) expect(combatants.some((c) => c.row === 'back')).toBe(true);
        }
      }
    }
  });

  it('전투원으로 옮길 때 능력치가 정수가 된다', () => {
    const rng = createRng(12);
    const { pets } = rollEncounterParty(getMap('meadow').zones[0]!, rng, 1);
    for (const p of pets) {
      const c = petToCombatant(p, 'front');
      for (const v of Object.values(c.stats)) expect(Number.isInteger(v)).toBe(true);
      expect(c.hp).toBe(c.stats.hp);
      expect(c.captureBaseRate).toBe(getSpecies(p.speciesId).captureBaseRate);
    }
  });
});

/* ─────────────── 로그 재생 ─────────────── */

describe('전투 로그 재생', () => {
  const build = (seed: number) => {
    const rng = createRng(seed);
    const { combatants: enemies } = rollEncounterParty(getMap('marsh').zones[1]!, rng, seed);
    const allies: Combatant[] = [
      {
        id: 'hero', name: '탐험가', kind: 'character', level: 14,
        element: { primary: 'earth', secondary: null },
        stats: { hp: 320, atk: 44, def: 32, spd: 30 }, hp: 320,
        energy: 40, maxEnergy: 40, row: 'front',
        skills: ['strike', 'gore', 'harden', 'mend'], charm: 12,
      },
      petToCombatant(
        rollEncounterParty(getMap('meadow').zones[0]!, rng, seed + 1).pets[0]!,
        'front',
      ),
    ];
    return { allies, enemies, seed };
  };

  it('로그를 끝까지 재생하면 엔진의 finalState와 정확히 같아진다', () => {
    // 이 Phase의 핵심 계약이다. 어긋나면 렌더러가 전투를 다시 계산해야 하고,
    // 그 순간 "보이는 것"과 "실제"가 갈라진다.
    for (const seed of [1, 7, 33, 404, 20260804]) {
      const { allies, enemies } = build(seed);
      const result = simulateBattle({ allies, enemies, seed });
      const state = replayBattle(allies, enemies, result.log, result.log.length);

      const expected = new Map(
        [...result.finalState.allies, ...result.finalState.enemies].map((c) => [c.id, c.hp]),
      );
      for (const u of state.units) {
        // 포획된 개체는 finalState에서 hp가 남아 있지만 전장에는 없다
        if (u.captured) continue;
        expect(u.hp, `seed ${seed} / ${u.id}`).toBe(expected.get(u.id));
      }
      expect(state.finished).toBe(true);
    }
  });

  it('쓰러진 개체는 재생에서도 쓰러져 있다', () => {
    const { allies, enemies } = build(9);
    const result = simulateBattle({ allies, enemies, seed: 9 });
    const state = replayBattle(allies, enemies, result.log, result.log.length);
    const down = new Set(
      [...result.finalState.allies, ...result.finalState.enemies].filter((c) => c.hp <= 0).map((c) => c.id),
    );
    for (const u of state.units) {
      if (u.captured) continue;
      expect(u.fainted, u.id).toBe(down.has(u.id));
    }
  });

  it('중간 시점으로 되감아도 그 시점의 상태가 나온다', () => {
    const { allies, enemies } = build(21);
    const result = simulateBattle({ allies, enemies, seed: 21 });
    const half = replayBattle(allies, enemies, result.log, Math.floor(result.log.length / 2));
    const full = replayBattle(allies, enemies, result.log, result.log.length);
    const sum = (s: typeof half) => s.units.reduce((a, u) => a + u.hp, 0);
    // 전투는 체력을 깎아나가므로 중간 시점의 총 체력이 더 많아야 한다
    expect(sum(half)).toBeGreaterThan(sum(full));
    expect(half.finished).toBe(false);
  });

  it('0에서 재생하면 전투 시작 상태다', () => {
    const { allies, enemies } = build(5);
    const result = simulateBattle({ allies, enemies, seed: 5 });
    const zero = replayBattle(allies, enemies, result.log, 0);
    for (const u of zero.units) {
      const src = [...allies, ...enemies].find((c) => c.id === u.id)!;
      expect(u.hp).toBe(src.hp);
      expect(u.fainted).toBe(false);
    }
    expect(zero.lines).toEqual([]);
  });
});

/* ─────────────── 태세 ─────────────── */

describe('전투 태세', () => {
  const setup = (seed: number) => {
    const rng = createRng(seed);
    const { combatants: enemies } = rollEncounterParty(getMap('meadow').zones[0]!, rng, seed);
    const allies: Combatant[] = [
      {
        id: 'hero', name: '탐험가', kind: 'character', level: 20,
        element: { primary: 'earth', secondary: null },
        stats: { hp: 400, atk: 60, def: 40, spd: 44 }, hp: 400,
        energy: 60, maxEnergy: 60, row: 'front',
        skills: ['strike', 'gore', 'harden', 'mend'], charm: 20,
      },
    ];
    return { allies, enemies };
  };

  const run = (stance: Parameters<typeof createStanceSource>[0], seed: number) => {
    const { allies, enemies } = setup(seed);
    const rng = createRng(seed);
    return simulateBattle({
      allies,
      enemies,
      seed,
      commandSource: createStanceSource(stance, DEFAULT_CATALOG, createDefaultAI(DEFAULT_CATALOG, rng), 'ropeCrude'),
    });
  };

  it('도주 태세는 실제로 도망친다', () => {
    let fled = 0;
    for (let seed = 0; seed < 30; seed++) if (run('flee', seed).endedBy === 'flee') fled++;
    expect(fled).toBeGreaterThan(20);
  });

  it('포획 태세는 깎은 다음에 밧줄을 던진다', () => {
    let attempts = 0;
    let capturedSomething = 0;
    for (let seed = 0; seed < 40; seed++) {
      const r = run('capture', seed);
      const tries = r.log.filter((e) => e.type === 'captureAttempt');
      attempts += tries.length;
      if (r.capturedPet) capturedSomething++;
      // 던지기 전에 반드시 피해가 먼저 들어가 있어야 한다
      for (const t of tries) {
        const at = r.log.indexOf(t);
        expect(r.log.slice(0, at).some((e) => e.type === 'damage')).toBe(true);
      }
    }
    expect(attempts).toBeGreaterThan(0);
    expect(capturedSomething).toBeGreaterThan(0);
  });

  it('공격 태세가 수비 태세보다 빨리 끝낸다', () => {
    const avg = (stance: 'aggressive' | 'defensive') => {
      let total = 0;
      for (let seed = 0; seed < 30; seed++) total += run(stance, seed).rounds;
      return total / 30;
    };
    expect(avg('aggressive')).toBeLessThan(avg('defensive'));
  });

  it('같은 태세·같은 seed면 결과가 완전히 같다', () => {
    expect(JSON.stringify(run('aggressive', 77))).toBe(JSON.stringify(run('aggressive', 77)));
  });
});

/* ─────────────── 아이소메트릭 투영 ─────────────── */

/**
 * 투영은 화면으로만 확인할 수 있는 게 아니다. 좌표 변환·깊이 순서·입력 회전은
 * 전부 순수 함수라서 여기서 붙들 수 있고, 실제로 이 셋이 어긋나면 화면에서는
 * "뭔가 이상한데"로만 보여 원인을 찾는 데 한참 걸린다.
 */
describe('아이소메트릭 투영', () => {
  it('투영과 역투영이 왕복한다', () => {
    for (const [x, y] of [[0, 0], [3, 7], [12.5, 4.25], [-2, 9]] as const) {
      const back = unproject(isoX(x, y), isoY(x, y));
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
  });

  it('타일 한 칸을 움직이면 화면에서 대각선으로 간다', () => {
    // 아이소메트릭의 정의 그 자체다. 이게 깨지면 마름모가 아니게 된다.
    expect(isoX(1, 0) - isoX(0, 0)).toBeGreaterThan(0);
    expect(isoY(1, 0) - isoY(0, 0)).toBeGreaterThan(0);
    expect(isoX(0, 1) - isoX(0, 0)).toBeLessThan(0);
    expect(isoY(0, 1) - isoY(0, 0)).toBeGreaterThan(0);
    // 폭이 높이의 두 배 — 2:1 비율
    expect(isoX(1, 0) - isoX(0, 0)).toBe(2 * (isoY(1, 0) - isoY(0, 0)));
  });

  it('깊이가 큰 쪽이 화면에서 아래에 있다', () => {
    // 그리는 순서의 근거다. y 하나로 정렬하면 대각선 이동에서 어긋난다.
    const cells: [number, number][] = [[0, 0], [1, 0], [0, 1], [3, 2], [2, 3], [5, 5]];
    for (const a of cells) {
      for (const b of cells) {
        if (depth(...a) < depth(...b)) {
          expect(isoY(...a)).toBeLessThan(isoY(...b));
        }
        // 깊이가 같으면 화면 y도 같다 — 같은 줄이다
        if (depth(...a) === depth(...b)) expect(isoY(...a)).toBe(isoY(...b));
      }
    }
  });
});

describe('화면 기준 입력', () => {
  it('화살표 넷이 화면의 상하좌우가 된다', () => {
    // 위로 가면 화면에서 위로 가야 한다. 월드 축에 그대로 꽂으면 오른쪽 위로 간다.
    const cases: [[number, number], [number, number]][] = [
      [[0, -1], [-1, -1]],
      [[0, 1], [1, 1]],
      [[-1, 0], [-1, 1]],
      [[1, 0], [1, -1]],
    ];
    for (const [[sx, sy], [dx, dy]] of cases) {
      expect(screenInputToWorld(sx, sy)).toEqual({ dx, dy });
      // 실제로 화면에서 그 방향인지 확인한다
      const mx = isoX(dx, dy);
      const my = isoY(dx, dy);
      expect(Math.sign(Math.round(mx))).toBe(sx);
      expect(Math.sign(Math.round(my))).toBe(sy);
    }
  });

  it('두 키를 같이 누르면 월드 축 넷이 나온다', () => {
    expect(screenInputToWorld(1, -1)).toEqual({ dx: 0, dy: -1 });
    expect(screenInputToWorld(-1, -1)).toEqual({ dx: -1, dy: 0 });
    expect(screenInputToWorld(1, 1)).toEqual({ dx: 1, dy: 0 });
    expect(screenInputToWorld(-1, 1)).toEqual({ dx: 0, dy: 1 });
  });

  it('여덟 방향이 빠짐없이 서로 다르게 나온다', () => {
    const seen = new Set<string>();
    for (const sx of [-1, 0, 1]) {
      for (const sy of [-1, 0, 1]) {
        if (sx === 0 && sy === 0) continue;
        const w = screenInputToWorld(sx, sy);
        seen.add(`${w.dx},${w.dy}`);
      }
    }
    expect(seen.size).toBe(8);
    expect(seen.has('0,0')).toBe(false);
  });

  it('월드 방향과 화면 방향이 45° 어긋난 채 짝을 이룬다', () => {
    // 월드 "위"는 화면에서 오른쪽 위다. 스프라이트가 이 표를 믿고 얼굴을 돌린다.
    expect(screenDir('up')).toBe('ne');
    expect(screenDir('down')).toBe('sw');
    expect(screenDir('upLeft')).toBe('n');
    expect(screenDir('downRight')).toBe('s');
    const all = new Set(
      ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'].map(screenDir),
    );
    expect(all.size).toBe(8);
  });
});

/* ─────────────── 카메라 ─────────────── */

describe('카메라', () => {
  it('맵 밖을 비추지 않는다', () => {
    const map = getMap('meadow');
    const b = mapBounds(map.width, map.height);
    for (const [x, y] of [[0, 0], [map.width - 1, map.height - 1], [15, 10]] as const) {
      const cam = focusCamera(map.width, map.height, x, y, 800, 512);
      expect(cam.x - 400).toBeGreaterThanOrEqual(b.minX - 1e-9);
      expect(cam.x + 400).toBeLessThanOrEqual(b.maxX + 1e-9);
      expect(cam.y - 256).toBeGreaterThanOrEqual(b.minY - 1e-9);
      expect(cam.y + 256).toBeLessThanOrEqual(b.maxY + 1e-9);
    }
  });

  it('맵이 화면보다 작으면 가운데 정렬한다', () => {
    const map = getMap('village');
    const b = mapBounds(map.width, map.height);
    const cam = focusCamera(map.width, map.height, 12, 11, 4000, 4000);
    expect(cam.x).toBe((b.minX + b.maxX) / 2);
    expect(cam.y).toBe((b.minY + b.maxY) / 2);
  });

  it('보이는 타일 범위가 화면에 실제로 걸리는 칸을 모두 담는다', () => {
    const map = getMap('meadow');
    const cam = focusCamera(map.width, map.height, 15, 10, 800, 512);
    const r = visibleTiles(cam, 800, 512, map.width, map.height, 0);
    // 화면 안에 중심이 들어오는 칸은 전부 범위 안에 있어야 한다. 하나라도
    // 빠지면 걸어갈 때 타일이 깜빡인다.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const sx = isoX(x, y) - cam.x;
        const sy = isoY(x, y) - cam.y;
        if (Math.abs(sx) > 400 || Math.abs(sy) > 256) continue;
        expect(x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1, `(${x},${y})`).toBe(true);
      }
    }
  });

  it('보이는 범위가 맵 밖으로 나가지 않는다', () => {
    const map = getMap('village');
    const cam = focusCamera(map.width, map.height, 0, 0, 800, 512);
    const r = visibleTiles(cam, 800, 512, map.width, map.height);
    expect(r.x0).toBeGreaterThanOrEqual(0);
    expect(r.y0).toBeGreaterThanOrEqual(0);
    expect(r.x1).toBeLessThan(map.width);
    expect(r.y1).toBeLessThan(map.height);
  });
});

/* ─────────────── 워프 ─────────────── */

describe('워프', () => {
  it('워프 칸을 밟으면 목적지를 알려준다', () => {
    const map = getMap('village');
    const w = map.warps[0]!;
    expect(warpAt(map, w.x, w.y)).toBe(w);
    expect(warpAt(map, w.x + 1, w.y + 1)).toBeUndefined();
  });

  it('워프 칸에는 인카운터 존이 없다 — 이동 중에 전투가 뜨지 않는다', () => {
    for (const m of ALL) {
      for (const w of m.warps) {
        expect(zoneAt(m, w.x, w.y), `${m.id} (${w.x},${w.y})`).toBeUndefined();
      }
    }
  });
});
