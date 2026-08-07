import { describe, it, expect } from 'vitest';
import petsJson from '../src/data/pets.json';
import { createRng } from '../src/engine/rng';
import { createPetInstance } from '../src/engine/growth';
import {
  CATALYST_WEIGHT,
  canEvolve,
  evolve,
  rerollGrowth,
  rollGrowthWithPrior,
} from '../src/engine/growth/evolve';
import { GROWTH_SCORE_CAP, growthScore, type PetSpecies } from '../src/engine/types';
import { NPCS, entryNode, getNpc, meetsCondition, nodeOf, npcAt, visibleChoices } from '../src/game/dialogue';
import { emptyDex, entryState, markCaught, markSeen, summarize } from '../src/game/dex';
import { getMap } from '../src/game/maps';
import {
  QUESTS,
  acceptQuest,
  activeQuests,
  applyEvents,
  getQuest,
  initialLog,
  objectiveProgress,
  objectiveTarget,
  questState,
  questsFor,
  refreshAvailability,
  refreshCompletion,
  turnInQuest,
  type QuestLog,
  type WorldView,
} from '../src/game/quests';

/**
 * 퀘스트 · 대화 · 진화 · 도감 테스트.
 *
 * 가장 중요한 건 진화다. 헌장이 두 종류를 나눠 놓았고, 그 차이가 실제로
 * 결과에 나타나야 한다. 그리고 어느 경로로도 성장률 상한을 넘을 수 없어야 한다 —
 * 진화는 상한을 여는 문이 아니다.
 */

const SPECIES = petsJson as PetSpecies[];
const byId = (id: string) => SPECIES.find((s) => s.id === id)!;

function world(over: Partial<WorldView> = {}): WorldView {
  return {
    level: 1,
    itemCount: () => 0,
    visited: new Set(),
    questsDone: new Set(),
    ...over,
  };
}

/* ─────────────── 진화 ─────────────── */

describe('진화', () => {
  const from = SPECIES.find((s) => s.evolveTo)!;
  const to = byId(from.evolveTo!.speciesId);

  const makePet = (seed: number, level = 60) =>
    createPetInstance(from, { uid: 'p', level, seed, rng: createRng(seed), loyalty: 70, capturedAt: 0 });

  it('진화 대상과 조건이 데이터에서 나온다', () => {
    const pet = makePet(1, 10);
    const c = canEvolve(pet, from, { hasItem: () => true, questDone: true, mode: 'quest' });
    expect(c.toSpeciesId).toBe(from.evolveTo!.speciesId);
    expect(c.requiredLevel).toBe(from.evolveTo!.requiredLevel);
  });

  it('레벨·재료·퀘스트가 모자라면 이유를 알려준다', () => {
    const low = makePet(1, 5);
    expect(canEvolve(low, from, { hasItem: () => true, questDone: true, mode: 'quest' }).reason).toBe('level');

    const ready = makePet(1, 60);
    expect(canEvolve(ready, from, { hasItem: () => false, questDone: true, mode: 'quest' }).reason).toBe('item');
    expect(canEvolve(ready, from, { hasItem: () => true, questDone: false, mode: 'quest' }).reason).toBe('questIncomplete');
    // 촉진 진화는 퀘스트를 요구하지 않는다 — 돈으로 시간을 사는 경로다
    expect(canEvolve(ready, from, { hasItem: () => true, questDone: false, mode: 'catalyst' }).ok).toBe(true);
  });

  it('진화하지 않는 종은 진화하지 않는다', () => {
    const plain = SPECIES.find((s) => !s.evolveTo)!;
    const pet = createPetInstance(plain, { uid: 'x', level: 99, seed: 1, rng: createRng(1), loyalty: 70, capturedAt: 0 });
    expect(canEvolve(pet, plain, { hasItem: () => true, questDone: true, mode: 'quest' }).reason).toBe('noEvolution');
  });

  it('어떤 경로로도 성장률 상한을 넘지 않는다', () => {
    // 최고 성장률 개체를 억지로 만들어 촉진 진화를 반복해도 상한 아래여야 한다
    const rng = createRng(7);
    for (let i = 0; i < 3000; i++) {
      const pet = { ...makePet(i), growth: { ...from.growthRange.max } };
      for (const mode of ['quest', 'catalyst'] as const) {
        const r = evolve(pet, from, to, mode, rng);
        expect(growthScore(r.after)).toBeLessThan(GROWTH_SCORE_CAP);
      }
    }
  });

  it('결과는 항상 진화체의 범위 안에 있다', () => {
    const rng = createRng(9);
    for (let i = 0; i < 2000; i++) {
      const pet = { ...makePet(i), growth: { ...from.growthRange.max } };
      const r = evolve(pet, from, to, 'catalyst', rng);
      for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
        expect(r.after[k]).toBeGreaterThanOrEqual(to.growthRange.min[k] - 1e-9);
        expect(r.after[k]).toBeLessThanOrEqual(to.growthRange.max[k] + 1e-9);
      }
    }
  });

  it('촉진 진화는 좋은 개체를 좋게 물려준다 — 퀘스트 진화는 그렇지 않다', () => {
    // 이게 두 경로의 유일한 차이이자 촉진제가 더 비싼 이유다.
    const mean = (mode: 'quest' | 'catalyst', growth: typeof from.growthRange.max) => {
      const rng = createRng(2024);
      let sum = 0;
      const N = 4000;
      for (let i = 0; i < N; i++) {
        const pet = { ...makePet(i), growth: { ...growth } };
        sum += growthScore(evolve(pet, from, to, mode, rng).after);
      }
      return sum / N;
    };

    const best = mean('catalyst', from.growthRange.max);
    const worst = mean('catalyst', from.growthRange.min);
    expect(best).toBeGreaterThan(worst);

    // 퀘스트 진화는 이전 성장률과 무관하다
    const qBest = mean('quest', from.growthRange.max);
    const qWorst = mean('quest', from.growthRange.min);
    expect(Math.abs(qBest - qWorst)).toBeLessThan(0.02);

    console.log(
      `\n진화 결과 평균 성장률\n` +
        `  촉진제  이전 최상 ${best.toFixed(3)} / 이전 최하 ${worst.toFixed(3)}  (차이 ${(best - worst).toFixed(3)})\n` +
        `  진화의돌 이전 최상 ${qBest.toFixed(3)} / 이전 최하 ${qWorst.toFixed(3)}  (차이 ${Math.abs(qBest - qWorst).toFixed(3)})`,
    );
  });

  it('가중치가 헌장이 정한 0.5다', () => {
    expect(CATALYST_WEIGHT).toBe(0.5);
    // 상한 개체(상대 위치 1.0)로 촉진 진화하면 기대 위치는 0.5*1 + 0.5*0.5 = 0.75
    const rng = createRng(11);
    let sum = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const g = rollGrowthWithPrior(to, rng, { species: from, growth: from.growthRange.max, weight: CATALYST_WEIGHT });
      sum += (g.atk - to.growthRange.min.atk) / (to.growthRange.max.atk - to.growthRange.min.atk);
    }
    expect(sum / N).toBeCloseTo(0.75, 1);
  });

  it('입력 개체를 건드리지 않고 종·능력치·스킬이 바뀐다', () => {
    const pet = makePet(3);
    const snapshot = JSON.stringify(pet);
    const r = evolve(pet, from, to, 'quest', createRng(3));
    expect(JSON.stringify(pet)).toBe(snapshot);
    expect(r.pet.speciesId).toBe(to.id);
    expect(r.pet.level).toBe(pet.level);
    // 능력치는 진화체 기본치에서 다시 쌓는다
    expect(r.pet.currentStats.atk).toBeCloseTo(to.baseStats.atk + r.after.atk * (pet.level - 1), 6);
    for (const s of r.pet.skills) expect(to.skillPool).toContain(s);
  });

  it('같은 seed면 같은 진화 결과가 나온다', () => {
    const run = () => evolve(makePet(5), from, to, 'catalyst', createRng(999)).after;
    expect(run()).toEqual(run());
  });

  it('prior 유무와 무관하게 난수 소비량이 같다', () => {
    // 소비량이 다르면 같은 seed에서 두 경로의 이후 시퀀스가 갈린다
    const a = createRng(1234);
    rollGrowthWithPrior(to, a);
    const b = createRng(1234);
    rollGrowthWithPrior(to, b, { species: from, growth: from.growthRange.max, weight: 0.5 });
    expect(a.getState()).toBe(b.getState());
  });
});

describe('성장률 재추첨', () => {
  const sp = SPECIES[0]!;
  const pet = () => createPetInstance(sp, { uid: 'r', level: 30, seed: 5, rng: createRng(5), loyalty: 70, capturedAt: 0 });

  it('종은 그대로고 성장률만 바뀐다', () => {
    const before = pet();
    const r = rerollGrowth(before, sp, createRng(77));
    expect(r.pet.speciesId).toBe(before.speciesId);
    expect(r.pet.level).toBe(before.level);
  });

  it('상한은 오르지 않는다 — 같은 범위에서 다시 뽑을 뿐이다', () => {
    const rng = createRng(1);
    for (let i = 0; i < 5000; i++) {
      const r = rerollGrowth(pet(), sp, rng);
      expect(growthScore(r.after)).toBeLessThan(GROWTH_SCORE_CAP);
      for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
        expect(r.after[k]).toBeGreaterThanOrEqual(sp.growthRange.min[k] - 1e-9);
        expect(r.after[k]).toBeLessThanOrEqual(sp.growthRange.max[k] + 1e-9);
      }
    }
  });

  it('나빠질 수도 있다 — 도박성이 남아야 의미가 있다', () => {
    const rng = createRng(2);
    const start = { ...pet(), growth: { ...sp.growthRange.max } };
    let worse = 0;
    for (let i = 0; i < 200; i++) {
      if (growthScore(rerollGrowth(start, sp, rng).after) < growthScore(start.growth)) worse++;
    }
    expect(worse).toBeGreaterThan(150);
  });
});

/* ─────────────── 퀘스트 ─────────────── */

describe('퀘스트 진행', () => {
  const q = getQuest('firstSteps');

  it('선행 조건을 만족해야 받을 수 있다', () => {
    const later = getQuest('firstCatch');
    let log = refreshAvailability(initialLog(), world());
    expect(questState(log, q.id)).toBe('available');
    expect(questState(log, later.id)).toBe('locked');

    log = refreshAvailability(log, world({ questsDone: new Set([q.id]) }));
    expect(questState(log, later.id)).toBe('available');
  });

  it('레벨 조건도 걸린다', () => {
    const lv = QUESTS.find((x) => x.requires?.level)!;
    let log = refreshAvailability(initialLog(), world({ questsDone: new Set(QUESTS.map((x) => x.id)) }));
    expect(questState(log, lv.id)).toBe('locked');
    log = refreshAvailability(log, world({ level: 99, questsDone: new Set(QUESTS.map((x) => x.id)) }));
    expect(questState(log, lv.id)).toBe('available');
  });

  it('받지 않은 퀘스트는 진행되지 않는다', () => {
    const log = applyEvents(initialLog(), [{ kind: 'defeat', speciesId: 'meadowhare', element: 'wind' }]);
    expect(log[q.id]).toBeUndefined();
  });

  it('사건이 목표를 올리고 다 채우면 보고 가능이 된다', () => {
    let log = acceptQuest(refreshAvailability(initialLog(), world()), q.id);
    expect(questState(log, q.id)).toBe('active');

    for (let i = 0; i < 3; i++) {
      log = applyEvents(log, [{ kind: 'defeat', speciesId: 'meadowhare', element: 'wind' }]);
    }
    log = refreshCompletion(log, world());
    expect(questState(log, q.id)).toBe('ready');
  });

  it('목표치를 넘겨 세지 않는다', () => {
    let log = acceptQuest(refreshAvailability(initialLog(), world()), q.id);
    for (let i = 0; i < 20; i++) {
      log = applyEvents(log, [{ kind: 'defeat', speciesId: 'meadowhare', element: 'wind' }]);
    }
    expect(log[q.id]!.counts[0]).toBe(3);
  });

  it('속성 조건이 붙은 목표는 그 속성만 센다', () => {
    const errand = getQuest('marshErrand');
    let log = acceptQuest(
      refreshAvailability(initialLog(), world({ level: 99, questsDone: new Set(['firstSteps']) })),
      errand.id,
    );
    log = applyEvents(log, [
      { kind: 'defeat', speciesId: 'emberfox', element: 'fire' },
      { kind: 'defeat', speciesId: 'brookotter', element: 'water' },
    ]);
    const waterIdx = errand.objectives.findIndex((o) => o.kind === 'defeat');
    expect(log[errand.id]!.counts[waterIdx]).toBe(1);
  });

  it('희귀도 조건이 붙은 포획 목표는 그 등급만 센다', () => {
    const deep = getQuest('deepEcho');
    let log = acceptQuest(
      refreshAvailability(initialLog(), world({ level: 99, questsDone: new Set(['firstSteps', 'firstCatch']) })),
      deep.id,
    );
    log = applyEvents(log, [
      { kind: 'capture', speciesId: 'meadowhare', rarity: 'common' },
      { kind: 'capture', speciesId: 'granitewarden', rarity: 'rare' },
    ]);
    const idx = deep.objectives.findIndex((o) => o.kind === 'capture');
    expect(log[deep.id]!.counts[idx]).toBe(1);
  });

  it('collect·reach·visit은 지금 세계를 본다 — 아이템을 써도 되돌아간다', () => {
    const rite = getQuest('spiritRite');
    const o = rite.objectives[0]!;
    expect(objectiveProgress(o, 0, world({ itemCount: () => 0 }))).toBe(0);
    expect(objectiveProgress(o, 0, world({ itemCount: () => 1 }))).toBe(1);

    const bound = getQuest('boundOfGrowth').objectives[0]!;
    expect(objectiveProgress(bound, 0, world({ level: 19 }))).toBe(0);
    expect(objectiveProgress(bound, 0, world({ level: 20 }))).toBe(1);

    const visit = getQuest('marshErrand').objectives.find((x) => x.kind === 'visit')!;
    expect(objectiveProgress(visit, 0, world())).toBe(0);
    expect(objectiveProgress(visit, 0, world({ visited: new Set(['marsh']) }))).toBe(1);
  });

  it('보고는 ready 상태에서만 되고 한 번만 된다', () => {
    let log = acceptQuest(refreshAvailability(initialLog(), world()), q.id);
    expect(turnInQuest(log, q.id).rewards).toBeNull(); // 아직 active

    log = refreshCompletion(applyEvents(log, Array.from({ length: 3 }, () => ({ kind: 'defeat' as const, speciesId: 'meadowhare', element: 'wind' as const }))), world());
    const first = turnInQuest(log, q.id);
    expect(first.rewards).not.toBeNull();
    expect(questState(first.log, q.id)).toBe('done');

    // 두 번째는 보상이 없다
    expect(turnInQuest(first.log, q.id).rewards).toBeNull();
  });

  it('완료된 퀘스트는 목표가 흔들려도 되돌아가지 않는다', () => {
    let log: QuestLog = { firstSteps: { state: 'done', counts: [3] } };
    log = refreshCompletion(refreshAvailability(log, world()), world());
    expect(questState(log, 'firstSteps')).toBe('done');
  });

  it('진행 중 목록에 active와 ready만 뜬다', () => {
    let log = acceptQuest(refreshAvailability(initialLog(), world()), q.id);
    expect(activeQuests(log).map((x) => x.quest.id)).toEqual([q.id]);
    log = { ...log, [q.id]: { ...log[q.id]!, state: 'done' } };
    expect(activeQuests(log)).toEqual([]);
  });

  it('모든 퀘스트가 목표와 보상을 갖는다', () => {
    for (const quest of QUESTS) {
      expect(quest.objectives.length).toBeGreaterThan(0);
      for (const o of quest.objectives) expect(objectiveTarget(o)).toBeGreaterThan(0);
      const r = quest.rewards;
      expect((r.stones ?? 0) + (r.exp ?? 0) + (r.items ?? []).length).toBeGreaterThan(0);
    }
  });
});

/* ─────────────── 대화 ─────────────── */

describe('대화', () => {
  const world2 = (over: Partial<Parameters<typeof meetsCondition>[1]> = {}) => ({
    level: 1,
    itemCount: () => 0,
    questLog: initialLog(),
    ...over,
  });

  it('NPC는 맵 위 걸어갈 수 있는 칸에 있다', () => {
    for (const npc of NPCS) {
      const map = getMap(npc.mapId);
      expect(map.layers.collision[npc.y * map.width + npc.x], npc.id).toBe(0);
      expect(npcAt(npc.mapId, npc.x, npc.y)).toBe(npc);
    }
  });

  it('조건을 만족하는 첫 진입 노드가 선택된다', () => {
    const elder = getNpc('elder');
    // 아직 퀘스트를 못 받았으면 idle (available 조건이 안 맞는다)
    expect(entryNode(elder, world2())?.id).toBe('idle');

    // 받을 수 있으면 offer
    const available = { ...world2(), questLog: refreshAvailability(initialLog(), world()) };
    expect(entryNode(elder, available)?.id).toBe('offer');

    // 보고할 게 있으면 report가 offer보다 먼저다
    const ready = { ...world2(), questLog: { firstSteps: { state: 'ready' as const, counts: [3] } } };
    expect(entryNode(elder, ready)?.id).toBe('report');
  });

  it('조건을 만족하지 않는 선택지는 아예 안 보인다', () => {
    const elder = getNpc('elder');
    const idle = nodeOf(elder, 'idle')!;
    // 아무 퀘스트도 열리지 않았으면 "그럼 이만"만 남는다
    expect(visibleChoices(idle, world2()).length).toBe(1);

    const withCatch = { ...world2(), questLog: { firstCatch: { state: 'available' as const, counts: [0] } } };
    expect(visibleChoices(idle, withCatch).length).toBe(2);
  });

  it('레벨·아이템 조건이 걸린다', () => {
    expect(meetsCondition({ minLevel: 10 }, world2({ level: 9 }))).toBe(false);
    expect(meetsCondition({ minLevel: 10 }, world2({ level: 10 }))).toBe(true);
    expect(meetsCondition({ hasItem: 'herbSmall' }, world2())).toBe(false);
    expect(meetsCondition({ hasItem: 'herbSmall' }, world2({ itemCount: () => 2 }))).toBe(true);
  });

  it('모든 퀘스트를 받고 보고할 수 있는 대화 경로가 있다', () => {
    // 데이터 검증기도 보지만, 여기서도 확인한다 — 받을 수 없는 퀘스트는
    // 존재하지 않는 퀘스트와 같다.
    for (const q of QUESTS) {
      const npc = getNpc(q.giver);
      const all = npc.nodes.flatMap((n) => n.choices ?? []);
      expect(all.some((c) => c.action?.kind === 'accept' && c.action.questId === q.id), `${q.id} 수락`).toBe(true);
      expect(all.some((c) => c.action?.kind === 'turnIn' && c.action.questId === q.id), `${q.id} 보고`).toBe(true);
    }
  });

  it('NPC마다 퀘스트 목록을 뽑을 수 있다', () => {
    const rows = questsFor(initialLog(), 'elder');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.quest.giver).toBe('elder');
  });
});

/* ─────────────── 도감 ─────────────── */

describe('도감', () => {
  it('본 것과 잡은 것을 따로 센다', () => {
    let dex = emptyDex();
    dex = markSeen(dex, ['emberfox', 'dewtail']);
    expect(entryState(dex, 'emberfox')).toBe('seen');
    expect(entryState(dex, 'cragox')).toBe('unknown');

    dex = markCaught(dex, 'emberfox');
    expect(entryState(dex, 'emberfox')).toBe('caught');
    expect(entryState(dex, 'dewtail')).toBe('seen');
  });

  it('잡으면 본 것에도 들어간다 — 안 보고 잡을 수는 없다', () => {
    const dex = markCaught(emptyDex(), 'cragox');
    expect(dex.seen).toContain('cragox');
  });

  it('같은 종을 여러 번 기록해도 늘지 않는다', () => {
    let dex = emptyDex();
    for (let i = 0; i < 10; i++) dex = markSeen(dex, ['emberfox']);
    for (let i = 0; i < 10; i++) dex = markCaught(dex, 'emberfox');
    expect(dex.seen.length).toBe(1);
    expect(dex.caught.length).toBe(1);
  });

  it('입력을 바꾸지 않는다', () => {
    const dex = markSeen(emptyDex(), ['emberfox']);
    const before = JSON.stringify(dex);
    markSeen(dex, ['dewtail']);
    markCaught(dex, 'dewtail');
    expect(JSON.stringify(dex)).toBe(before);
  });

  it('요약이 희귀도별로 맞는다', () => {
    let dex = emptyDex();
    const epic = SPECIES.find((s) => s.rarity === 'epic')!;
    dex = markCaught(dex, epic.id);
    const sum = summarize(dex, SPECIES);
    expect(sum.total).toBe(SPECIES.length);
    expect(sum.caught).toBe(1);
    expect(sum.byRarity.epic.caught).toBe(1);
    expect(sum.byRarity.common.caught).toBe(0);
    const totals = Object.values(sum.byRarity).reduce((n, r) => n + r.total, 0);
    expect(totals).toBe(SPECIES.length);
  });
});
