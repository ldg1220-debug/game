/**
 * 종별 실루엣 특징.
 *
 * 골격(form)만으로는 부족하다는 게 스프라이트 시트를 뽑아 보고 드러났다. 24종 중
 * 7종이 `beast` 골격을 쓰는데, 화면에 늘어놓으니 색만 다른 여우 일곱 마리였다.
 * 두더지와 멧돼지와 토끼가 같은 실루엣이면 종을 모으는 게임에서 모을 이유가
 * 사라진다.
 *
 * 그래서 골격 아래에 **직교하는 특징**을 둔다. 귀 모양, 꼬리 모양, 주둥이,
 * 체격, 그리고 종을 상징하는 부속 하나. 조합이 곧 실루엣이라, 특징 표에 한 줄
 * 더 쓰는 것으로 새 종이 다르게 생기게 된다.
 *
 * ## 왜 데이터(pets.json)가 아닌가
 *
 * `form`은 데이터에 뒀다. 도감에 표시되고 종의 성질이기 때문이다. 특징은 다르다 —
 * 순수하게 그리는 방법이고 게임 어디에도 드러나지 않는다. 밸런스 데이터 파일에
 * "귀 모양" 여섯 필드를 24줄 추가하면 그 파일이 무엇을 위한 것인지가 흐려진다.
 *
 * 대신 누락은 막아야 한다. 새 종을 추가하고 여기 안 적으면 조용히 기본 모양으로
 * 나오는데, 그건 처음에 골격을 렌더러에 숨겨뒀을 때와 똑같은 실수다. 그래서
 * `tests/data.test.ts` 가 pets.json의 모든 종이 여기 있는지 확인한다.
 */

import type { PetForm } from '../engine/types';

/** 귀. 실루엣에서 가장 먼저 눈에 들어오는 부분이다. */
export type Ear = 'point' | 'long' | 'round' | 'tiny' | 'fin';
/** 꼬리. 두 번째로 눈에 들어온다. */
export type Tail = 'bush' | 'tuft' | 'flat' | 'puff' | 'stub' | 'long';
/** 주둥이. */
export type Snout = 'short' | 'long' | 'tusk' | 'shovel';
/** 체격. 다리 길이와 몸통 두께를 함께 움직인다. */
export type Build = 'slim' | 'normal' | 'stocky' | 'massive';

export interface Traits {
  form: PetForm;
  ear: Ear;
  tail: Tail;
  snout: Snout;
  build: Build;
  /** 등의 갈기·가시. 멧돼지와 늑대를 가른다. */
  crest?: 'mane' | 'spine' | null;
  /** 뿔 */
  horn?: 'ox' | 'antler' | 'single' | null;
  /** 앞발 발톱. 파는 종에게 준다. */
  claws?: boolean;
  /** 날개를 펼친 새인가 접은 새인가 */
  wing?: 'folded' | 'spread';
  /** 부리 길이 */
  beak?: 'short' | 'hooked' | 'long';
  /** 등딱지 모양 */
  shell?: 'dome' | 'spiral' | 'spiked';
  /** 목 길이 배수 — saurian 전용 */
  neck?: number;
  /** 등판 */
  plate?: 'spike' | 'sail' | 'none';
}

/**
 * 종 → 특징.
 *
 * 이름이 곧 근거다. 흙두더지는 삽 같은 주둥이에 발톱이 있고 꼬리가 거의 없다.
 * 불씨여우는 큰 귀에 풍성한 꼬리. 화염멧돼지는 엄니와 갈기. 회오리사슴은 뿔.
 * 실제 동물을 떠올렸을 때 제일 먼저 생각나는 두세 가지를 적으면 된다.
 */
export const TRAITS: Record<string, Traits> = {
  /* ── 지(earth) ── */
  bouldershell: { form: 'shell', ear: 'tiny', tail: 'stub', snout: 'short', build: 'stocky', shell: 'dome' },
  dustmole: { form: 'beast', ear: 'tiny', tail: 'stub', snout: 'shovel', build: 'stocky', claws: true },
  cragox: { form: 'beast', ear: 'round', tail: 'tuft', snout: 'short', build: 'massive', horn: 'ox' },
  vinecarapace: { form: 'shell', ear: 'tiny', tail: 'long', snout: 'short', build: 'normal', shell: 'spiked' },
  granitewarden: { form: 'golem', ear: 'tiny', tail: 'stub', snout: 'short', build: 'massive' },
  terrasovereign: { form: 'saurian', ear: 'tiny', tail: 'long', snout: 'short', build: 'massive', neck: 1.15, plate: 'spike' },

  /* ── 수(water) ── */
  dewtail: { form: 'beast', ear: 'round', tail: 'puff', snout: 'short', build: 'slim' },
  brookotter: { form: 'beast', ear: 'round', tail: 'flat', snout: 'short', build: 'normal' },
  abyssray: { form: 'ray', ear: 'fin', tail: 'long', snout: 'short', build: 'normal' },
  frostscale: { form: 'serpent', ear: 'fin', tail: 'long', snout: 'short', build: 'slim', crest: 'spine' },
  currentwyrm: { form: 'serpent', ear: 'fin', tail: 'long', snout: 'long', build: 'normal', horn: 'single' },
  abysslord: { form: 'saurian', ear: 'fin', tail: 'long', snout: 'long', build: 'massive', neck: 1.35, plate: 'sail' },

  /* ── 화(fire) ── */
  emberfox: { form: 'beast', ear: 'point', tail: 'bush', snout: 'long', build: 'slim' },
  ashnewt: { form: 'serpent', ear: 'fin', tail: 'long', snout: 'short', build: 'stocky', crest: 'spine' },
  blazeboar: { form: 'beast', ear: 'round', tail: 'stub', snout: 'tusk', build: 'massive', crest: 'mane' },
  magmasnail: { form: 'shell', ear: 'tiny', tail: 'stub', snout: 'short', build: 'stocky', shell: 'spiral' },
  plumewing: { form: 'bird', ear: 'point', tail: 'long', snout: 'short', build: 'slim', wing: 'spread', beak: 'short' },
  pyrarch: { form: 'saurian', ear: 'point', tail: 'long', snout: 'long', build: 'massive', neck: 0.85, plate: 'spike', horn: 'ox' },

  /* ── 풍(wind) ── */
  breezefinch: { form: 'bird', ear: 'tiny', tail: 'tuft', snout: 'short', build: 'slim', wing: 'folded', beak: 'short' },
  meadowhare: { form: 'beast', ear: 'long', tail: 'puff', snout: 'short', build: 'slim' },
  gustwolf: { form: 'beast', ear: 'point', tail: 'bush', snout: 'long', build: 'normal', crest: 'mane' },
  whirlstag: { form: 'beast', ear: 'long', tail: 'tuft', snout: 'long', build: 'normal', horn: 'antler' },
  stormfalcon: { form: 'bird', ear: 'tiny', tail: 'tuft', snout: 'short', build: 'normal', wing: 'spread', beak: 'hooked' },
  skysuzerain: { form: 'bird', ear: 'point', tail: 'long', snout: 'short', build: 'massive', wing: 'spread', beak: 'hooked' },
};

/** 표에 없는 종이 와도 화면이 비지 않게 하는 최소값. 테스트가 이게 쓰이지 않는 걸 지킨다. */
export const FALLBACK_TRAITS: Traits = {
  form: 'beast',
  ear: 'point',
  tail: 'bush',
  snout: 'short',
  build: 'normal',
};

export function traitsOf(speciesId: string): Traits {
  return TRAITS[speciesId] ?? FALLBACK_TRAITS;
}

/** 체격 → 몸통 두께·다리 길이 배수. 한 곳에서 정해야 골격끼리 어긋나지 않는다. */
export const BUILD_SCALE: Record<Build, { bulk: number; legs: number }> = {
  slim: { bulk: 0.86, legs: 1.06 },
  normal: { bulk: 1.0, legs: 1.0 },
  stocky: { bulk: 1.16, legs: 0.76 },
  massive: { bulk: 1.3, legs: 0.94 },
};
