import { describe, it, expect } from 'vitest';
import { createRng } from '../src/engine/rng';

/**
 * RNG 결정론성 테스트.
 *
 * 헌장 절대규칙 1이 실제로 지켜지는지 검증한다. 이 테스트가 깨지면 리플레이·
 * 서버 검증·밸런스 시뮬레이션이 전부 성립하지 않으므로, 여기서 막아야 한다.
 */

describe('createRng — 결정론성', () => {
  it('같은 seed로 1000회 실행하면 시퀀스가 완전히 동일하다', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 1000; i++) {
      seqA.push(a.next());
      seqB.push(b.next());
    }
    expect(seqA).toEqual(seqB);
  });

  it('다른 seed는 다른 시퀀스를 낸다', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('int·chance·pick·shuffle을 섞어 써도 시퀀스가 재현된다', () => {
    const run = (seed: number) => {
      const r = createRng(seed);
      const out: unknown[] = [];
      for (let i = 0; i < 300; i++) {
        out.push(r.int(1, 100));
        out.push(r.chance(0.37));
        out.push(r.pick(['가', '나', '다', '라']));
        out.push(r.shuffle([1, 2, 3, 4, 5]));
        out.push(r.float(-2, 2));
      }
      return out;
    };
    expect(run(99)).toEqual(run(99));
  });
});

describe('createRng — 상태 직렬화', () => {
  it('getState/setState로 시퀀스를 되감을 수 있다', () => {
    const r = createRng(777);
    for (let i = 0; i < 10; i++) r.next();

    const saved = r.getState();
    const after = Array.from({ length: 20 }, () => r.next());

    r.setState(saved);
    const replay = Array.from({ length: 20 }, () => r.next());

    expect(replay).toEqual(after);
  });

  it('상태는 숫자 하나라 JSON에 그대로 담긴다', () => {
    const r = createRng(4242);
    r.next();
    const state = r.getState();
    const revived = createRng(0);
    revived.setState(JSON.parse(JSON.stringify(state)));
    expect(revived.next()).toBe(createRng(0) && (() => {
      const t = createRng(4242);
      t.next();
      return t.next();
    })());
  });
});

describe('createRng — 값 범위', () => {
  it('next()는 [0,1) 안에 있다', () => {
    const r = createRng(5);
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min,max)는 양끝을 포함하고 벗어나지 않는다', () => {
    const r = createRng(6);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i++) {
      const v = r.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    // 양끝이 실제로 나오는지 — off-by-one이면 여기서 걸린다
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it('int()는 min>max면 던진다', () => {
    const r = createRng(7);
    expect(() => r.int(5, 2)).toThrow(RangeError);
  });

  it('pick()은 빈 배열이면 던진다', () => {
    const r = createRng(8);
    expect(() => r.pick([])).toThrow(RangeError);
  });
});

describe('createRng — 분포', () => {
  it('chance(p)의 실제 비율이 p에 수렴한다', () => {
    const r = createRng(9);
    const N = 100000;
    for (const p of [0.1, 0.25, 0.5, 0.9]) {
      let hit = 0;
      for (let i = 0; i < N; i++) if (r.chance(p)) hit++;
      expect(Math.abs(hit / N - p)).toBeLessThan(0.01);
    }
  });

  it('chance(0)과 chance(1)은 난수를 소비하지 않는다', () => {
    // 확률이 0/1인 분기가 시퀀스를 밀면, 조건 하나 바뀔 때마다 이후 전투가
    // 통째로 달라진다. 경계는 난수를 건드리지 않아야 한다.
    const r = createRng(10);
    const before = r.getState();
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    expect(r.getState()).toBe(before);
  });

  it('int()가 특정 값에 치우치지 않는다', () => {
    const r = createRng(11);
    const N = 60000;
    const counts = new Array(6).fill(0) as number[];
    for (let i = 0; i < N; i++) counts[r.int(0, 5)]!++;
    const expected = N / 6;
    for (const c of counts) {
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('shuffle()은 원본을 바꾸지 않고 같은 원소를 유지한다', () => {
    const r = createRng(12);
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out.slice().sort((a, b) => a - b)).toEqual(src);
  });
});
