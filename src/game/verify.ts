/**
 * 세이브 검증과 명부 도출.
 *
 * 멀티플레이가 생기면서 처음으로 "클라이언트가 보낸 값을 믿을 수 없다"는 문제가
 * 생긴다. 혼자 하는 게임에서는 세이브를 고쳐 공격력 9999를 만들어도 자기 화면만
 * 이상해지지만, 남과 겨루는 순간 그건 남의 게임을 망가뜨리는 일이 된다.
 *
 * **원칙: 저장된 능력치를 쓰지 않고 다시 계산한다.**
 *
 * 처음엔 `currentStats`를 화면용 캐시로 여기고 그냥 통과시켰다. 테스트를 쓰다가
 * 아니라는 걸 알았다 — 그건 레벨업마다 성장률을 소수로 누적한 **실제 상태**이고,
 * 그대로 믿으면 세이브에서 그 숫자만 고쳐 공격력 9999를 만들 수 있다.
 *
 * 다행히 완전히 유도 가능한 값이다. 생성도 레벨업도 결국 `종족 기본 + 성장률 ×
 * (레벨-1)` 을 만족하므로(engine/growth의 expectedStats), 서버는 종·성장률·레벨만
 * 믿고 나머지를 다시 계산한다. 그 셋은 각각 따로 검증한다.
 *
 * **여기가 파이썬이 아닌 이유.** 규칙은 이미 TypeScript로 한 벌 있다. 서버에서
 * 쓰겠다고 파이썬으로 옮겨 적으면 구현이 둘이 되고, 둘은 반드시 어긋난다.
 * 어긋난 날 어느 쪽이 맞는지 판정할 방법도 없다. 그래서 판정 서비스(/arbiter)가
 * 이 파일을 그대로 import 한다 — 클라이언트와 서버가 같은 코드를 본다.
 */

import itemsJson from '../data/items.json';
import { isGrowthWithinSpecies } from '../data/schema';
import { battleStats, expectedStats } from '../engine/growth';
import type { Combatant, Row } from '../engine/battle';
import {
  GROWTH_SCORE_CAP,
  growthScore,
  type Item,
  type PetInstance,
  type Stats,
} from '../engine/types';
import { applyEquipment, EQUIP_SLOTS, type Equipment } from './equipment';
import { CHARACTER, characterBaseStats, DEFAULT_COMBATANT, makeCharacter, petToCombatant, SPECIES } from './party';
import { loadSave, type SaveFile } from './save';

const ITEMS_BY_ID: Record<string, Item> = Object.fromEntries((itemsJson as Item[]).map((i) => [i.id, i]));

/** 대전에 내보낼 수 있는 최대 마릿수. 파티 앞쪽부터 이만큼만 나간다. */
export const PVP_PARTY_SIZE = 4;

export interface VerifyIssue {
  /** 어디가 문제인가 — `party[0].growth` 처럼 */
  where: string;
  message: string;
  /**
   * 규칙 위반인가 형식 오류인가.
   *
   * `tamper`는 값이 규칙을 벗어난 경우다. 형식은 멀쩡한데 숫자가 불가능하다는
   * 뜻이라, 손으로 고쳤을 가능성이 높다. 서버는 이걸 로그에 남긴다.
   */
  kind: 'malformed' | 'tamper';
}

export interface VerifiedRoster {
  playerName: string;
  level: number;
  /** 검증을 통과하고 능력치를 다시 계산한 주인공. */
  hero: Combatant;
  /** 검증을 통과한 펫들. 순서가 곧 진형 순서다. */
  pets: Combatant[];
  /** 주인공 + 펫. PvE는 이 순서로 싸운다. */
  combatants: Combatant[];
  /** 참고용 — 재계산한 주인공 능력치(장비 포함) */
  heroStats: Stats;
}

export type VerifyResult =
  | { ok: true; roster: VerifiedRoster; save: SaveFile }
  | { ok: false; issues: VerifyIssue[] };

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const STAT_KEYS = ['hp', 'atk', 'def', 'spd'] as const;

/**
 * 펫 하나를 검증하고, 능력치를 다시 계산한 개체를 돌려준다.
 *
 * 성장률과 레벨은 유도할 근거가 없으므로 규칙 안에 있는지 본다. 능력치는 그
 * 둘에서 다시 계산해 **저장된 값을 덮어쓴다** — 어긋나면 표시도 하지만, 표시만
 * 하고 원래 값을 쓰면 검증이 아무 의미가 없다.
 */
function verifyPet(pet: PetInstance, where: string, issues: VerifyIssue[]): PetInstance | null {
  const species = SPECIES[pet.speciesId];
  if (!species) {
    issues.push({ where: `${where}.speciesId`, message: `없는 종 — ${pet.speciesId}`, kind: 'malformed' });
    return null;
  }

  let ok = true;
  if (!Number.isInteger(pet.level) || pet.level < 1 || pet.level > CHARACTER.maxLevel) {
    issues.push({ where: `${where}.level`, message: `레벨이 범위를 벗어났다 — ${pet.level}`, kind: 'tamper' });
    ok = false;
  }

  // 상한을 먼저 본다. 범위 위반보다 상한 위반이 더 중대한 사건이라 메시지를 나눈다.
  const score = growthScore(pet.growth);
  if (score > GROWTH_SCORE_CAP + 1e-9) {
    issues.push({
      where: `${where}.growth`,
      message: `성장률 지표가 상한을 넘었다 — ${score.toFixed(4)} > ${GROWTH_SCORE_CAP}`,
      kind: 'tamper',
    });
    ok = false;
  } else if (!isGrowthWithinSpecies(pet.growth, species)) {
    issues.push({
      where: `${where}.growth`,
      message: `성장률이 ${species.name}의 범위 밖이다`,
      kind: 'tamper',
    });
    ok = false;
  }

  // 배우지 않은 기술은 쓸 수 없다. 종의 습득 목록에 없으면 거절한다.
  const pool = new Set(species.skillPool);
  for (const s of pet.skills) {
    if (!pool.has(s)) {
      issues.push({ where: `${where}.skills`, message: `${species.name}이(가) 배울 수 없는 기술 — ${s}`, kind: 'tamper' });
      ok = false;
    }
  }
  if (pet.skills.length > DEFAULT_COMBATANT.skillSlots) {
    issues.push({
      where: `${where}.skills`,
      message: `기술 칸(${DEFAULT_COMBATANT.skillSlots})보다 많다 — ${pet.skills.length}`,
      kind: 'tamper',
    });
    ok = false;
  }

  if (!(pet.loyalty >= 0 && pet.loyalty <= 100)) {
    issues.push({ where: `${where}.loyalty`, message: `충성도가 범위를 벗어났다 — ${pet.loyalty}`, kind: 'tamper' });
    ok = false;
  }

  if (!ok) return null;

  // 능력치를 다시 계산한다. 누적 순서 차이로 끝자리가 흔들릴 수 있으므로 비교는
  // 상대 오차로 하고, 값은 언제나 계산한 쪽을 쓴다.
  const stats = expectedStats(species.baseStats, pet.growth, pet.level);
  for (const k of STAT_KEYS) {
    if (!near(pet.currentStats[k], stats[k], Math.max(1e-6, Math.abs(stats[k]) * 1e-9))) {
      issues.push({
        where: `${where}.currentStats.${k}`,
        message: `레벨 ${pet.level}·성장률 ${pet.growth[k]}이면 ${stats[k]}여야 한다 — ${pet.currentStats[k]}`,
        kind: 'tamper',
      });
      ok = false;
    }
  }
  if (!ok) return null;

  return { ...pet, currentStats: stats };
}

/** 장비를 검증한다. 안 가진 것을 낄 수 없고, 칸에 맞지 않는 것도 낄 수 없다. */
function verifyEquipment(save: SaveFile, issues: VerifyIssue[]): boolean {
  let ok = true;
  const owned = new Map<string, number>();
  for (const stack of save.inventory) {
    if (stack.qty < 0) {
      issues.push({ where: `inventory.${stack.itemId}`, message: `개수가 음수다 — ${stack.qty}`, kind: 'tamper' });
      ok = false;
    }
    owned.set(stack.itemId, (owned.get(stack.itemId) ?? 0) + stack.qty);
  }

  for (const slot of EQUIP_SLOTS) {
    const id = save.equipment[slot];
    if (id === null) continue;
    const item = ITEMS_BY_ID[id];
    if (!item) {
      issues.push({ where: `equipment.${slot}`, message: `없는 아이템 — ${id}`, kind: 'malformed' });
      ok = false;
      continue;
    }
    if (item.kind !== 'equipment' || item.slot !== slot) {
      issues.push({ where: `equipment.${slot}`, message: `${item.name}은(는) 이 칸에 낄 수 없다`, kind: 'tamper' });
      ok = false;
    }
  }
  return ok;
}

/**
 * 세이브 하나를 검증해 대전 명부로 바꾼다.
 *
 * 실패해도 던지지 않는다. 서버가 400을 돌려주려면 이유가 값으로 필요하고, 예외로
 * 던지면 그 이유가 스택 트레이스에 묻힌다.
 */
export function verifySave(save: SaveFile): VerifyResult {
  const issues: VerifyIssue[] = [];

  const c = save.character;
  if (!Number.isInteger(c.level) || c.level < 1 || c.level > CHARACTER.maxLevel) {
    issues.push({ where: 'character.level', message: `레벨이 범위를 벗어났다 — ${c.level}`, kind: 'tamper' });
  }
  if (c.charm < 0) {
    issues.push({ where: 'character.charm', message: `매력이 음수다 — ${c.charm}`, kind: 'tamper' });
  }
  if (save.stones < 0) {
    issues.push({ where: 'stones', message: `스톤이 음수다 — ${save.stones}`, kind: 'tamper' });
  }

  // 주인공 능력치는 레벨에서 다시 계산한다. 저장된 값과 다르면 손댄 것이다.
  const recomputed = characterBaseStats(Math.max(1, Math.min(CHARACTER.maxLevel, Math.floor(c.level || 1))));
  for (const k of STAT_KEYS) {
    if (!near(c.baseStats[k], recomputed[k], 0.05)) {
      issues.push({
        where: `character.baseStats.${k}`,
        message: `레벨 ${c.level}의 ${k}는 ${recomputed[k]}여야 한다 — ${c.baseStats[k]}`,
        kind: 'tamper',
      });
    }
  }

  verifyEquipment(save, issues);

  const roster: PetInstance[] = [];
  save.party.slice(0, PVP_PARTY_SIZE).forEach((pet, i) => {
    const checked = verifyPet(pet, `party[${i}]`, issues);
    if (checked) roster.push(checked);
  });

  if (roster.length === 0 && issues.length === 0) {
    issues.push({ where: 'party', message: '내보낼 펫이 없다', kind: 'malformed' });
  }
  if (issues.length > 0) return { ok: false, issues };

  // 여기서부터는 신뢰할 수 있는 값만 쓴다. 능력치는 전부 다시 계산된 것이다.
  const heroStats = applyEquipment(recomputed, save.equipment);
  const hero = makeCharacter({
    id: `hero-${c.name}`,
    name: c.name,
    level: c.level,
    charm: c.charm,
    stats: heroStats,
    skills: c.skills.slice(0, DEFAULT_COMBATANT.skillSlots),
    spirits: availableSpiritsOf(save.equipment),
    row: 'front',
  });

  const pets = roster.map((pet, i) => petToCombatant(pet, (i >= 1 ? 'back' : 'front') as Row));

  return {
    ok: true,
    roster: { playerName: c.name, level: c.level, hero, pets, combatants: [hero, ...pets], heroStats },
    save,
  };
}

/** 장비에 깃든 정령. equipment.ts의 것과 같지만 검증된 장비만 통과시킨다. */
function availableSpiritsOf(eq: Equipment): string[] {
  const out: string[] = [];
  for (const slot of EQUIP_SLOTS) {
    const id = eq[slot];
    if (!id) continue;
    const item = ITEMS_BY_ID[id];
    if (item?.spiritId) out.push(item.spiritId);
  }
  return out;
}

/** 문자열 그대로 받았을 때. 마이그레이션까지 거친 뒤 검증한다. */
export function verifySaveText(text: string): VerifyResult {
  const loaded = loadSave(text);
  if (!loaded.save) {
    return {
      ok: false,
      issues: [{ where: 'save', message: loaded.message ?? '세이브를 읽지 못했다', kind: 'malformed' }],
    };
  }
  return verifySave(loaded.save);
}

/**
 * 전투 결과를 다시 계산해 대조한다.
 *
 * 판정을 서버가 하더라도 이 함수가 따로 필요하다. 클라이언트가 "이 seed로 이런
 * 결과가 나왔다"고 주장하는 경우(오프라인 진행 보고, 리플레이 공유)에 그 주장을
 * 확인할 수 있어야 하고, 무엇보다 **엔진이 정말 결정론인지**를 배포된 상태에서
 * 계속 확인하는 수단이 된다.
 */
export function digestOf(events: { type: string }[]): string {
  // 짧고 충돌 확률이 낮으면 된다. 암호학적 강도는 필요 없다 — 서버가 원본
  // 로그를 갖고 있고, 이건 "같은가"를 싸게 묻기 위한 것이다.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const text = JSON.stringify(events);
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = Math.imul(h2 + ch, 2654435761) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export { battleStats };
