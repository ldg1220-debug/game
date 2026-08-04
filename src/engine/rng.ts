/**
 * 결정론적 난수 생성기.
 *
 * 헌장 절대규칙 1: 모든 난수는 이 모듈을 통해서만 발생한다. Math.random()을
 * 직접 부르면 같은 입력이 같은 결과를 내지 않게 되고, 그 순간 리플레이도
 * 서버 검증도 밸런스 시뮬레이션도 전부 불가능해진다.
 *
 * 알고리즘은 mulberry32다. 상태가 32비트 정수 하나뿐이라 직렬화가 간단하고,
 * 주기(2^32)와 분포 품질이 게임 난수로 충분하다. 암호용으로는 쓰지 않는다.
 */

/** 직렬화 가능한 RNG 상태. 세이브·리플레이에 그대로 담긴다. */
export type RngState = number;

export interface RNG {
  /** [0, 1) 균등분포 */
  next(): number;
  /** [min, max] 정수 균등분포. min > max면 던진다. */
  int(min: number, max: number): number;
  /** [min, max) 실수 균등분포 */
  float(min: number, max: number): number;
  /** 확률 p로 true. p<=0이면 항상 false, p>=1이면 항상 true. */
  chance(p: number): boolean;
  /** 배열에서 하나 고른다. 빈 배열이면 던진다. */
  pick<T>(arr: readonly T[]): T;
  /** 배열을 섞은 새 배열을 돌려준다. 원본은 건드리지 않는다. */
  shuffle<T>(arr: readonly T[]): T[];
  /** 현재 상태. 이 값으로 이후 시퀀스가 완전히 결정된다. */
  getState(): RngState;
  /** 상태를 되돌린다. 같은 상태에서 이어가면 같은 시퀀스가 나온다. */
  setState(state: RngState): void;
}

/**
 * seed로 RNG를 만든다.
 *
 * seed는 32비트로 잘린다. 같은 seed는 언제나 같은 시퀀스를 낸다.
 */
export function createRng(seed: number): RNG {
  let state = seed >>> 0;

  const next = (): number => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: RNG = {
    next,

    int(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new RangeError(`int(): 유한한 값이어야 한다 (min=${min}, max=${max})`);
      }
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (lo > hi) throw new RangeError(`int(): min이 max보다 크다 (${min} > ${max})`);
      return lo + Math.floor(next() * (hi - lo + 1));
    },

    float(min, max) {
      return min + next() * (max - min);
    },

    chance(p) {
      // 경계를 먼저 처리해 난수를 소비하지 않는다 — 확률 0/1인 분기가
      // 시퀀스를 밀어 결과가 갈리는 걸 막는다.
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },

    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new RangeError('pick(): 빈 배열');
      return arr[rng.int(0, arr.length - 1)] as T;
    },

    shuffle<T>(arr: readonly T[]): T[] {
      // Fisher-Yates. 뒤에서부터 훑어야 균등하다.
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const a = out[i] as T;
        out[i] = out[j] as T;
        out[j] = a;
      }
      return out;
    },

    getState() {
      return state;
    },

    setState(s) {
      state = s >>> 0;
    },
  };

  return rng;
}
