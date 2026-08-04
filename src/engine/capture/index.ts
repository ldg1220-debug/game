/**
 * 포획.
 *
 * 포획이 전투 커맨드 안에 들어와 있다는 게 원작 설계의 묘수다 — "지금 잡을까,
 * 더 깎을까"라는 판단이 전투 중에 실시간으로 생긴다. 그 판단이 의미를 가지려면
 * 확률이 HP와 레벨차에 대해 **단조**여야 한다. 더 깎았는데 확률이 떨어지면
 * 플레이어는 그냥 규칙을 못 믿게 된다.
 *
 * Phase 2가 전투에 남겨둔 CaptureResolver 자리를 이 모듈이 채운다.
 */

import growthJson from '../../data/growth.json';
import type { RNG } from '../rng';

export interface CaptureConfig {
  hpExponent: number;
  charmWeight: number;
  levelDecayPerLevel: number;
  levelPenaltyMin: number;
  min: number;
  max: number;
}

export interface LoyaltyInitConfig {
  min: number;
  max: number;
  initialBase: number;
  initialHpWeight: number;
  initialCharmWeight: number;
}

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = growthJson.capture;
export const DEFAULT_LOYALTY_INIT: LoyaltyInitConfig = growthJson.loyalty;

/** 포획 대상. 전투 유닛이든 필드 조우든 이만큼만 있으면 된다. */
export interface CaptureTarget {
  speciesId: string;
  captureBaseRate: number;
  hp: number;
  maxHp: number;
  level: number;
}

export interface Capturer {
  level: number;
  /** 캐릭터 매력. 펫은 포획할 수 없으므로 항상 캐릭터다. */
  charm: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 레벨 역전 페널티.
 *
 * 자기보다 높은 레벨을 잡으려 하면 급감한다. 선형이 아니라 지수로 떨어뜨리는
 * 이유는, 선형이면 "고레벨 필드에서 저레벨 캐릭터로 밧줄만 던지는" 전략이
 * 성립해서 육성 루프를 통째로 건너뛸 수 있기 때문이다.
 */
export function levelPenalty(
  capturerLevel: number,
  targetLevel: number,
  cfg: CaptureConfig = DEFAULT_CAPTURE_CONFIG,
): number {
  const diff = targetLevel - capturerLevel;
  if (diff <= 0) return 1;
  return clamp(Math.pow(cfg.levelDecayPerLevel, diff), cfg.levelPenaltyMin, 1);
}

/**
 * p = 기본포획률 * (1 - HP비율)^1.5 * 레벨페널티 * 도구배수 * (1 + 매력*0.002)
 * p = clamp(p, 0.01, 0.95)
 *
 * 상한 0.95는 규칙이다 — 확실한 포획이 존재하면 "깎을까 잡을까"의 긴장이 사라진다.
 */
export function captureChance(
  target: CaptureTarget,
  capturer: Capturer,
  toolMultiplier: number,
  cfg: CaptureConfig = DEFAULT_CAPTURE_CONFIG,
): number {
  const hpRatio = clamp(target.maxHp > 0 ? target.hp / target.maxHp : 1, 0, 1);
  const p =
    target.captureBaseRate *
    Math.pow(1 - hpRatio, cfg.hpExponent) *
    levelPenalty(capturer.level, target.level, cfg) *
    toolMultiplier *
    (1 + capturer.charm * cfg.charmWeight);
  return clamp(p, cfg.min, cfg.max);
}

/**
 * 포획 성공 시 초기 충성도 = 50 + (1 - HP비율) * 20 + 매력 보정
 *
 * 깎아서 잡을수록 처음부터 잘 따른다. 반대로 만피에서 운으로 잡은 개체는
 * 관리 비용이 크다 — 이게 원작의 음의 피드백 루프다.
 */
export function initialLoyalty(
  target: CaptureTarget,
  capturer: Capturer,
  cfg: LoyaltyInitConfig = DEFAULT_LOYALTY_INIT,
): number {
  const hpRatio = clamp(target.maxHp > 0 ? target.hp / target.maxHp : 1, 0, 1);
  const raw =
    cfg.initialBase + (1 - hpRatio) * cfg.initialHpWeight + capturer.charm * cfg.initialCharmWeight;
  return Math.round(clamp(raw, cfg.min, cfg.max));
}

export interface CaptureAttempt {
  success: boolean;
  /** 실제로 쓰인 확률. 로그와 재현 검증용이다. */
  chance: number;
  /** 성공 시 초기 충성도. 실패면 0. */
  loyalty: number;
}

export function tryCapture(
  target: CaptureTarget,
  capturer: Capturer,
  tool: { captureMultiplier?: number },
  rng: RNG,
  cfg: CaptureConfig = DEFAULT_CAPTURE_CONFIG,
  loyaltyCfg: LoyaltyInitConfig = DEFAULT_LOYALTY_INIT,
): CaptureAttempt {
  const chance = captureChance(target, capturer, tool.captureMultiplier ?? 1, cfg);
  const success = rng.chance(chance);
  return {
    success,
    chance,
    loyalty: success ? initialLoyalty(target, capturer, loyaltyCfg) : 0,
  };
}

/* ─────────────── 전투 엔진 연결 ─────────────── */

/**
 * 전투의 CaptureResolver로 쓸 함수. 전투 유닛을 CaptureTarget으로 옮겨준다.
 *
 * 전투 엔진은 이 모듈의 구조를 모르고, 이 모듈은 전투 상태를 모른다. 둘을
 * 잇는 어댑터가 여기 하나뿐이라 어느 쪽을 바꿔도 다른 쪽이 흔들리지 않는다.
 */
export function createCaptureResolver(cfg: CaptureConfig = DEFAULT_CAPTURE_CONFIG) {
  return (ctx: {
    target: { hp: number; level: number; stats: { hp: number }; captureBaseRate?: number; speciesId?: string };
    capturer: { level: number; charm?: number };
    toolMultiplier: number;
  }): number =>
    captureChance(
      {
        speciesId: ctx.target.speciesId ?? '',
        captureBaseRate: ctx.target.captureBaseRate ?? 0,
        hp: ctx.target.hp,
        maxHp: ctx.target.stats.hp,
        level: ctx.target.level,
      },
      { level: ctx.capturer.level, charm: ctx.capturer.charm ?? 0 },
      ctx.toolMultiplier,
      cfg,
    );
}
