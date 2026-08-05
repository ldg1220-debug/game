/**
 * 엔진 공용 타입.
 *
 * 헌장 절대규칙 2에 따라 이 파일에는 **구조**만 둔다. 밸런스 수치는 전부
 * /src/data/*.json 에 있고, 코드는 그걸 읽을 뿐이다. 예외는 GROWTH_SCORE_CAP
 * 하나인데, 그건 밸런스 값이 아니라 시스템 불변식이라 코드에 박는다.
 */

/* ─────────────── 속성 ─────────────── */

export const ELEMENTS = ['earth', 'water', 'fire', 'wind'] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * 상성 순환: 지 > 수 > 화 > 풍 > 지
 *
 * ADVANTAGE[a] === b 는 "a가 b에게 강하다"는 뜻이다. 순환이라 어느 속성도
 * 일방적으로 유리하지 않다 — 원작이 4속성으로 균형을 잡은 방식이다.
 */
export const ADVANTAGE: Readonly<Record<Element, Element>> = {
  earth: 'water',
  water: 'fire',
  fire: 'wind',
  wind: 'earth',
};

/** 주속성 + 부속성. 부속성이 없으면 단일속성. */
export interface ElementPair {
  primary: Element;
  secondary: Element | null;
}

/* ─────────────── 능력치 ─────────────── */

export const STAT_KEYS = ['hp', 'atk', 'def', 'spd'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** 4스탯 고정. 원작이 이 넷으로 성장률 지표를 만들었기 때문에 늘리지 않는다. */
export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

/* ─────────────── 성장률 ─────────────── */

/**
 * 성장률 지표 — 원작 공식 계승.
 *
 * HP만 5로 나누는 건 HP 성장 폭이 다른 스탯보다 한 자릿수 크기 때문이다.
 * 이 값 하나로 개체의 가치를 비교할 수 있어야 게임이 성립한다.
 */
export function growthScore(g: Stats): number {
  return g.hp / 5 + g.atk + g.def + g.spd;
}

/**
 * 성장률 상한. **시스템 상수다.**
 *
 * 원작은 캐시펫이 이 상한을 넘어선 순간 코어 루프가 무너졌다. 유저가 수백
 * 시간 굴려 얻은 개체가 결제 몇 번으로 대체 가능해졌기 때문이다.
 *
 * 그래서 이 값은 어떤 아이템·결제·이벤트로도 초과할 수 없다. 결제로는
 * "추첨 시도 횟수"만 살 수 있고 "상한"은 살 수 없다. 이 규칙을 우회하는
 * 코드는 작성하지 않는다.
 */
export const GROWTH_SCORE_CAP = 5.1;

/** 상한을 넘는 성장률이 시스템에 들어오는 걸 막는다. */
export function assertWithinCap(g: Stats, context: string): void {
  const score = growthScore(g);
  if (score > GROWTH_SCORE_CAP + 1e-9) {
    throw new RangeError(
      `성장률 상한 초과: ${context} — score=${score.toFixed(4)} > cap=${GROWTH_SCORE_CAP}`,
    );
  }
}

/* ─────────────── 펫 ─────────────── */

/**
 * 외형 골격.
 *
 * 밸런스에는 전혀 들어가지 않는다 — 렌더러가 몸통을 어떻게 조립할지만 정한다.
 * 그래도 데이터에 두는 이유는, 이게 종의 성질이기 때문이다. 렌더러 안에 id→외형
 * 표를 숨겨두면 종을 추가할 때 데이터 검증이 잡아주지 못하고 조용히 기본 모양으로
 * 나온다.
 */
export const PET_FORMS = ['beast', 'horned', 'shell', 'saurian', 'serpent', 'ray', 'bird', 'golem'] as const;
export type PetForm = (typeof PET_FORMS)[number];

/** 종 정의. 데이터 파일에서 읽는 정적 값이다. */
export interface PetSpecies {
  id: string;
  name: string;
  element: ElementPair;
  baseStats: Stats;
  /** 개체 성장률을 추첨할 범위. 희귀도가 높은 종은 이 범위 자체가 높다. */
  growthRange: { min: Stats; max: Stats };
  skillPool: string[];
  /** 기본 포획률 0~1 */
  captureBaseRate: number;
  rarity: Rarity;
  /** 그림용 골격. 능력치에는 영향이 없다. */
  form: PetForm;
  evolveTo?: { speciesId: string; requiredLevel: number; itemId: string };
}

/** 실제로 굴러다니는 개체. */
export interface PetInstance {
  uid: string;
  speciesId: string;
  nickname: string | null;
  level: number;
  exp: number;
  /** 개체 고정 성장률. 진화 시에만 재추첨되고 그 외에는 절대 변하지 않는다. */
  growth: Stats;
  currentStats: Stats;
  /** 0~100. 낮으면 불복종하고, 더 낮으면 도주한다. */
  loyalty: number;
  skills: string[];
  capturedAt: number;
  /** 재현용. 이 개체가 어떤 seed로 추첨됐는지 남긴다. */
  seedUsed: number;
}

/* ─────────────── 스킬 ─────────────── */

export type SkillArchetype =
  | 'single'        // 단일 공격
  | 'aoe'           // 전체 공격
  | 'guardBuff'     // 방어 버프 (배수의 진류 계열: 공↑방↓)
  | 'taunt'         // 탱킹 유도 — 아군 대신 피해를 받는다
  | 'ailment'       // 상태이상
  | 'heal'          // 회복
  | 'elementBuff'   // 속성 강화
  | 'guardBreak';   // 가드 브레이크

export type Ailment = 'paralysis' | 'sleep' | 'poison' | 'confusion';

export type SkillTarget = 'oneEnemy' | 'allEnemies' | 'oneAlly' | 'allAllies' | 'self';

export interface Skill {
  id: string;
  name: string;
  archetype: SkillArchetype;
  element: Element | null;
  target: SkillTarget;
  /** 피해 계수. 공격 계열이 아니면 0. */
  power: number;
  /** 기력 소모 */
  cost: number;
  accuracy: number;
  /** 상태이상 계열이면 어떤 것을 거는지 */
  ailment?: Ailment;
  /** 버프/디버프/상태이상 지속 턴 */
  duration?: number;
  /** 버프 배율 — guardBuff는 [공격배율, 방어배율] 3단계 중 하나를 가리킨다 */
  modifiers?: { atk?: number; def?: number; spd?: number };
  description: string;
}

/* ─────────────── 정령(주술) ─────────────── */

/**
 * 정령은 캐릭터가 아니라 **아이템에 깃든다.**
 *
 * 장비한 아이템이 가진 정령만 전투에서 쓸 수 있다. 이게 원작 마법 시스템의
 * 핵심 구조라, 캐릭터에 스킬을 붙이는 흔한 방식으로 바꾸지 않는다.
 */
/**
 * 정령이 전투에서 하는 일.
 *
 * 설명문이나 수치로는 추론할 수 없다 — 방어 버프·공격 버프·속도 버프가 전부
 * `power: 0, target: 'oneAlly'` 로 똑같이 생겼기 때문이다. 그래서 명시한다.
 */
export type SpiritEffectKind = 'damage' | 'heal' | 'buff' | 'ailment' | 'loyaltyGuard';

export interface SpiritEffect {
  kind: SpiritEffectKind;
  ailment?: Ailment;
  modifiers?: { atk?: number; def?: number; spd?: number };
}

export interface Spirit {
  id: string;
  name: string;
  element: Element | null;
  target: SkillTarget;
  effect: SpiritEffect;
  /** 레벨 1~5. 인덱스 0이 레벨 1이다. */
  levels: {
    cost: number;
    successRate: number;
    duration: number;
    power: number;
  }[];
  description: string;
}

/* ─────────────── 아이템 ─────────────── */

export type ItemKind = 'heal' | 'captureTool' | 'evolution' | 'equipment' | 'food';
export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  price: number;
  weight: number;
  /** 회복량 (heal) */
  heal?: number;
  /** 포획률 배수 (captureTool) */
  captureMultiplier?: number;
  /** 장비 슬롯과 능력치 보정 (equipment). 펫은 장비를 낄 수 없다. */
  slot?: EquipSlot;
  bonus?: Partial<Stats>;
  /** 이 장비에 깃든 정령 */
  spiritId?: string;
  /** 충성도 회복량 (food) */
  loyalty?: number;
  description: string;
}
