/**
 * 충성도.
 *
 * 펫 전용 스탯이고, 강한 펫일수록 관리 비용이 든다는 **음의 피드백 루프**다.
 * 요즘 게임에서 거의 사라진 장치라 일부러 살린다 — 이게 없으면 강한 펫을
 * 하나 잡는 순간 그 뒤로 아무 판단도 필요 없어진다.
 *
 * 임계값: 70 미만 확률적 불복종 / 30 미만 주인 공격 / 10 미만 도주.
 * **도주는 되돌릴 수 없다.** 되돌릴 수 있으면 리스크가 아니라 불편일 뿐이다.
 */

import growthJson from '../data/growth.json';
import type { RNG } from './rng';

export interface LoyaltyConfig {
  min: number;
  max: number;
  initialBase: number;
  initialHpWeight: number;
  initialCharmWeight: number;
  faintPenalty: number;
  victoryBonus: number;
  idleDecayPerDay: number;
  charmDropWeight: number;
  disobeyThreshold: number;
  hostileThreshold: number;
  fleeThreshold: number;
  disobeyMaxChance: number;
  hostileMaxChance: number;
  fleeMaxChance: number;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = growthJson.loyalty;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 충성도는 항상 범위 안에 있다. 모든 변화가 이 문을 지난다. */
function bound(value: number, cfg: LoyaltyConfig): number {
  return clamp(Math.round(value), cfg.min, cfg.max);
}

/* ─────────────── 변화 ─────────────── */

/** 펫이 기절하면 떨어진다. 험하게 굴리면 대가가 있다. */
export function onFaint(loyalty: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  return bound(loyalty - cfg.faintPenalty, cfg);
}

/** 전투 승리로 조금씩 오른다. 회복은 느리고 하락은 빠르다. */
export function onVictory(loyalty: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  return bound(loyalty + cfg.victoryBonus, cfg);
}

/** 먹이 아이템. 회복량은 아이템 데이터에 있다. */
export function onFeed(loyalty: number, amount: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (amount < 0) throw new RangeError(`먹이가 충성도를 깎을 수는 없다: ${amount}`);
  return bound(loyalty + amount, cfg);
}

/** 오래 안 데리고 다니면 잊는다. */
export function onIdle(loyalty: number, days: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (days < 0) throw new RangeError(`날짜는 음수일 수 없다: ${days}`);
  return bound(loyalty - days * cfg.idleDecayPerDay, cfg);
}

/** 주인의 매력이 떨어지면 비례해서 떨어진다. */
export function onCharmDrop(loyalty: number, drop: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (drop < 0) throw new RangeError(`매력 하락폭은 음수일 수 없다: ${drop}`);
  return bound(loyalty - drop * cfg.charmDropWeight, cfg);
}

/* ─────────────── 판정 ─────────────── */

export type Obedience =
  /** 명령대로 움직인다 */
  | 'obey'
  /** 명령을 무시한다 — 원작의 "NO" */
  | 'disobey'
  /** 주인을 공격한다 */
  | 'hostile';

/** 임계값 아래로 갈수록 선형으로 나빠진다. 절벽이 아니라 경사여야 관리가 된다. */
export function disobeyChance(loyalty: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (loyalty >= cfg.disobeyThreshold) return 0;
  return clamp((cfg.disobeyThreshold - loyalty) / cfg.disobeyThreshold, 0, 1) * cfg.disobeyMaxChance;
}

export function hostileChance(loyalty: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (loyalty >= cfg.hostileThreshold) return 0;
  return clamp((cfg.hostileThreshold - loyalty) / cfg.hostileThreshold, 0, 1) * cfg.hostileMaxChance;
}

export function fleeChance(loyalty: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): number {
  if (loyalty >= cfg.fleeThreshold) return 0;
  return clamp((cfg.fleeThreshold - loyalty) / cfg.fleeThreshold, 0, 1) * cfg.fleeMaxChance;
}

/**
 * 한 번의 명령에 대한 판정.
 *
 * 난수를 두 번 굴리는 순서가 고정돼 있어야 리플레이가 성립한다. 불복종이
 * 아니면 적대 판정은 아예 굴리지 않는다.
 */
export function checkObedience(
  loyalty: number,
  rng: RNG,
  cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG,
): Obedience {
  if (!rng.chance(disobeyChance(loyalty, cfg))) return 'obey';
  return rng.chance(hostileChance(loyalty, cfg)) ? 'hostile' : 'disobey';
}

/**
 * 도주 판정. true면 그 개체는 사라진다.
 *
 * 호출하는 쪽은 인스턴스를 실제로 제거해야 한다. 되살리는 경로를 만들지 않는다 —
 * 복구 가능한 리스크는 리스크가 아니다.
 */
export function checkFlee(loyalty: number, rng: RNG, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): boolean {
  return rng.chance(fleeChance(loyalty, cfg));
}

/** 화면에 띄울 상태 구간. */
export type LoyaltyTier = 'devoted' | 'steady' | 'restless' | 'hostile' | 'leaving';

export function loyaltyTier(loyalty: number, cfg: LoyaltyConfig = DEFAULT_LOYALTY_CONFIG): LoyaltyTier {
  if (loyalty < cfg.fleeThreshold) return 'leaving';
  if (loyalty < cfg.hostileThreshold) return 'hostile';
  if (loyalty < cfg.disobeyThreshold) return 'restless';
  if (loyalty < cfg.max * 0.9) return 'steady';
  return 'devoted';
}
