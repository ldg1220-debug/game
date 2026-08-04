/**
 * 인카운터 — 위험도 게이지.
 *
 * 원작의 순수 랜덤 인카운터는 피로하다. 언제 걸릴지 모르니 필드를 지나는 내내
 * 긴장을 유지해야 하고, 그 긴장은 정보가 없어서 생긴 것이라 재미가 아니라 소음이다.
 *
 * 그래서 걸음마다 게이지를 올리고 그 게이지를 **화면에 보여준다**. 언제 걸릴지
 * 대략 알 수 있으니 "지금 마을로 돌아갈까, 한 판 더 할까"라는 판단이 생긴다.
 * 무작위성은 유지하되(걸음당 상승분에 흔들림을 준다) 예측 불가능은 없앤다.
 */

import fieldJson from '../data/field.json';
import type { RNG } from '../engine/rng';
import { zoneAt } from './maps';
import type { EncounterZone, TileMap } from './mapTypes';

export interface EncounterConfig {
  jitterMin: number;
  jitterMax: number;
  /** 전투 직후 이만큼 걸음은 절대 안 걸린다 */
  graceSteps: number;
  /** 안전 지대를 걸으면 게이지가 이만큼씩 내려간다 */
  safeDecayPerStep: number;
  /** 이 값을 넘으면 화면에 경고를 띄운다 */
  warnThreshold: number;
}
export const DEFAULT_ENCOUNTER: EncounterConfig = fieldJson.encounter;

export interface DangerState {
  /** 0~1. 1에 닿으면 전투가 걸린다. */
  gauge: number;
  /** 남은 유예 걸음 수 */
  grace: number;
}

export function createDanger(cfg: EncounterConfig = DEFAULT_ENCOUNTER): DangerState {
  return { gauge: 0, grace: cfg.graceSteps };
}

export type DangerLevel = 'safe' | 'calm' | 'uneasy' | 'imminent';

export function dangerLevel(d: DangerState, inZone: boolean, cfg: EncounterConfig = DEFAULT_ENCOUNTER): DangerLevel {
  if (!inZone) return 'safe';
  if (d.grace > 0) return 'calm';
  return d.gauge >= cfg.warnThreshold ? 'imminent' : 'uneasy';
}

export interface DangerStep {
  danger: DangerState;
  triggered: boolean;
  zone?: EncounterZone;
}

/**
 * 한 걸음.
 *
 * 도착한 프레임에만 부른다. 프레임마다 부르면 프레임률이 높은 기기에서 전투가
 * 더 자주 걸린다.
 */
export function stepDanger(
  map: TileMap,
  tile: { x: number; y: number },
  danger: DangerState,
  rng: RNG,
  cfg: EncounterConfig = DEFAULT_ENCOUNTER,
): DangerStep {
  const zone = zoneAt(map, tile.x, tile.y);

  if (!zone) {
    // 안전 지대에서는 가라앉는다. 마을을 들렀다 나오면 다시 여유가 생긴다.
    return {
      danger: { gauge: Math.max(0, danger.gauge - cfg.safeDecayPerStep), grace: danger.grace },
      triggered: false,
    };
  }

  if (danger.grace > 0) {
    return { danger: { gauge: danger.gauge, grace: danger.grace - 1 }, triggered: false, zone };
  }

  const gauge = danger.gauge + zone.encounterRate * rng.float(cfg.jitterMin, cfg.jitterMax);
  if (gauge < 1) return { danger: { gauge, grace: 0 }, triggered: false, zone };

  return { danger: { gauge: 0, grace: cfg.graceSteps }, triggered: true, zone };
}
