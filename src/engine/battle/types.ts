/**
 * 전투 엔진 타입.
 *
 * 헌장: 전투 엔진은 순수 TypeScript다. React/DOM/브라우저 API 의존성이 0이고,
 * 입력을 mutate 하지 않으며, 모든 난수는 주입된 seeded RNG를 거친다.
 *
 * 렌더러는 이 파일의 BattleEvent 배열을 **재생만** 한다. 렌더러가 전투 상태를
 * 계산하기 시작하면 밸런싱이 불가능해지므로, 화면에 필요한 모든 정보는
 * 이벤트에 담겨 있어야 한다.
 */

import type { Ailment, Element, ElementPair, Item, Skill, Spirit, Stats } from '../types';

export type Side = 'ally' | 'enemy';
/** 전열/후열. 후열은 받는 물리 피해가 줄고, 주는 근접 피해도 줄어든다. */
export type Row = 'front' | 'back';

/**
 * 전투에 들어오는 개체.
 *
 * 성장률·경험치 같은 육성 정보는 들어오지 않는다. 전투는 "지금 이 능력치로
 * 싸운다"만 알면 되고, 그래야 밸런스 시뮬레이터가 가짜 개체로도 돌릴 수 있다.
 */
export interface Combatant {
  id: string;
  name: string;
  /** 펫도 캐릭터와 동등한 전투원이다. 다만 펫만 포획 대상이 되고 장비를 못 낀다. */
  kind: 'character' | 'pet';
  level: number;
  element: ElementPair;
  /** 장비 보정까지 반영된 최종 기본 능력치. stats.hp가 최대 체력이다. */
  stats: Stats;
  hp: number;
  /** 기력 — 스킬과 정령의 자원 */
  energy: number;
  maxEnergy: number;
  row: Row;
  skills: string[];
  /** 장비에 깃든 정령. 정령은 캐릭터가 아니라 아이템에 붙는다(원작 구조). */
  spirits?: string[];
  /** 펫 전용. 포획 대상이 되려면 필요하다. */
  speciesId?: string;
  captureBaseRate?: number;
  loyalty?: number;
  /** 캐릭터 전용. 포획률에 들어간다. */
  charm?: number;
}

/* ─────────────── 커맨드 ─────────────── */

export type BattleCommand =
  | { kind: 'attack'; targetId?: string }
  | { kind: 'defend' }
  | { kind: 'skill'; skillId: string; targetId?: string }
  | { kind: 'spirit'; spiritId: string; level: number; targetId?: string }
  | { kind: 'item'; itemId: string; targetId?: string }
  | { kind: 'capture'; targetId: string; itemId: string }
  | { kind: 'flee' };

/** 라운드 시작 시 전원의 커맨드를 정한다. UI는 여기에 플레이어 입력을 꽂는다. */
export type CommandSource = (view: BattleView, round: number) => Record<string, BattleCommand>;

/* ─────────────── 진행 중 상태 ─────────────── */

export interface ActiveAilment {
  ailment: Ailment;
  /** 남은 턴 */
  turns: number;
}

export interface ActiveModifier {
  /** 어떤 스킬/정령에서 왔는지 — 로그와 해제 처리에 쓴다 */
  sourceId: string;
  atk?: number;
  def?: number;
  spd?: number;
  turns: number;
}

/** 커맨드를 정할 때 볼 수 있는 읽기 전용 상태. */
export interface CombatantView extends Readonly<Combatant> {
  readonly side: Side;
  readonly fainted: boolean;
  readonly ailments: readonly ActiveAilment[];
  readonly modifiers: readonly ActiveModifier[];
  /** 버프/디버프까지 반영된 실제 능력치 */
  readonly effectiveStats: Readonly<Stats>;
}

export interface BattleView {
  readonly allies: readonly CombatantView[];
  readonly enemies: readonly CombatantView[];
}

/* ─────────────── 이벤트 ─────────────── */

/**
 * 전투 로그. 이 배열만으로 전투 전체를 재생할 수 있어야 한다.
 * 새 이벤트를 추가할 때는 "렌더러가 이걸로 화면을 그릴 수 있는가"를 기준으로 한다.
 */
export type BattleEvent =
  | { type: 'battleStart'; allies: string[]; enemies: string[] }
  | { type: 'roundStart'; round: number }
  | { type: 'order'; round: number; actorIds: string[] }
  | { type: 'command'; round: number; actorId: string; command: BattleCommand }
  | { type: 'defend'; round: number; actorId: string }
  | { type: 'skipped'; round: number; actorId: string; reason: 'paralysis' | 'sleep' | 'fainted' }
  | { type: 'confused'; round: number; actorId: string; targetId: string }
  | { type: 'attack'; round: number; actorId: string; targetId: string; skillId: string }
  | { type: 'miss'; round: number; actorId: string; targetId: string; skillId: string }
  | {
      type: 'damage';
      round: number;
      actorId: string;
      targetId: string;
      skillId: string;
      amount: number;
      crit: boolean;
      elementMultiplier: number;
      /** 도발/감싸기로 대상이 바뀌었으면 원래 대상 */
      redirectedFrom?: string;
      hpAfter: number;
    }
  | { type: 'heal'; round: number; actorId: string; targetId: string; amount: number; hpAfter: number }
  | { type: 'ailmentApplied'; round: number; actorId: string; targetId: string; ailment: Ailment; turns: number }
  | { type: 'ailmentResisted'; round: number; actorId: string; targetId: string; ailment: Ailment }
  | { type: 'ailmentTick'; round: number; targetId: string; ailment: Ailment; amount: number; hpAfter: number }
  | { type: 'ailmentCleared'; round: number; targetId: string; ailment: Ailment; reason: 'expired' | 'woken' | 'cured' }
  | { type: 'modifierApplied'; round: number; actorId: string; targetId: string; sourceId: string; atk?: number; def?: number; spd?: number; turns: number }
  | { type: 'modifierExpired'; round: number; targetId: string; sourceId: string }
  | { type: 'tauntSet'; round: number; actorId: string; protectedId: string; turns: number }
  | { type: 'spiritUsed'; round: number; actorId: string; spiritId: string; level: number; success: boolean }
  | { type: 'itemUsed'; round: number; actorId: string; itemId: string; targetId: string }
  | { type: 'noEnergy'; round: number; actorId: string; skillId: string; cost: number; energy: number }
  | { type: 'captureAttempt'; round: number; actorId: string; targetId: string; itemId: string; chance: number }
  | { type: 'captureSuccess'; round: number; actorId: string; targetId: string }
  | { type: 'captureFailed'; round: number; actorId: string; targetId: string; escaped: boolean }
  | { type: 'fleeAttempt'; round: number; actorId: string; chance: number; success: boolean }
  | { type: 'faint'; round: number; targetId: string }
  | { type: 'energyRegen'; round: number; actorId: string; amount: number }
  | { type: 'battleEnd'; round: number; winner: Winner; endedBy: EndReason };

export type Winner = 'ally' | 'enemy' | 'draw';
export type EndReason = 'defeat' | 'capture' | 'flee' | 'roundLimit';

/* ─────────────── 입출력 ─────────────── */

/** 전투가 참조하는 데이터. 주입식이라 테스트에서 가짜 카탈로그를 쓸 수 있다. */
export interface BattleCatalog {
  skills: Record<string, Skill>;
  spirits: Record<string, Spirit>;
  items: Record<string, Item>;
  formula: FormulaConfig;
}

export interface FormulaConfig {
  battle: { maxRounds: number; maxPartySize: number; energyRegenPerRound: number };
  order: { jitterMin: number; jitterMax: number };
  hit: { base: number; spdWeight: number; min: number; max: number };
  damage: { defFactor: number; varianceMin: number; varianceMax: number; floor: number };
  element: {
    advantage: number;
    neutral: number;
    disadvantage: number;
    primaryWeight: number;
    secondaryWeight: number;
  };
  crit: { base: number; spdWeight: number; multiplier: number; max: number };
  row: { backTakenPhysical: number; backDealtMelee: number };
  defend: { damageTaken: number };
  ailment: {
    resistBase: number;
    resistSpdWeight: number;
    resistMax: number;
    paralysisMinTurns: number;
    paralysisMaxTurns: number;
    poisonMaxHpRatio: number;
  };
  flee: { base: number; spdWeight: number; min: number; max: number };
  /** 포획 확률 공식은 /src/engine/capture 에 있다. 여기 남는 건 전투 흐름 규칙뿐이다. */
  capture: { escapeOnFail: number };
}

/**
 * 포획 확률 계산을 밖에서 갈아끼우는 자리.
 *
 * 기본값은 /src/engine/capture 의 공식이다. 전투 엔진은 포획 공식을 모르고,
 * 포획 모듈은 전투 상태를 모른다 — 둘을 잇는 어댑터가 거기 하나뿐이라
 * 어느 쪽을 바꿔도 다른 쪽이 흔들리지 않는다.
 */
export interface CaptureContext {
  target: CombatantView;
  capturer: CombatantView;
  toolMultiplier: number;
  formula: FormulaConfig;
}
export type CaptureResolver = (ctx: CaptureContext) => number;

export interface BattleInput {
  allies: Combatant[];
  enemies: Combatant[];
  seed: number;
  /** 없으면 기본 AI가 양쪽을 조작한다 */
  commandSource?: CommandSource;
  catalog?: Partial<BattleCatalog>;
  captureResolver?: CaptureResolver;
}

export interface BattleResult {
  log: BattleEvent[];
  winner: Winner;
  endedBy: EndReason;
  rounds: number;
  /** 입력과 같은 순서. 입력 객체는 건드리지 않은 복사본이다. */
  finalState: { allies: Combatant[]; enemies: Combatant[] };
  /** 포획 성공 시. 충성도 산정은 Phase 3 몫이라 여기선 근거만 넘긴다. */
  capturedPet?: {
    combatantId: string;
    speciesId: string;
    hpRatioAtCapture: number;
    capturerId: string;
  };
}

/** 속성 계산에 쓰는 좁은 타입. 스킬 속성이 없으면 시전자 속성을 쓴다. */
export type AttackElement = Element | ElementPair | null;
