/**
 * 세이브 · 로드.
 *
 * 게임 상태 전체를 JSON 하나로 직렬화한다. 버전 필드가 있고, 옛 세이브는
 * 마이그레이션을 거쳐 올라온다.
 *
 * 두 가지 원칙이 있다.
 *
 * 1. **일시적인 것은 저장하지 않는다.** 열려 있던 상점·대화 노드·진행 중인
 *    전투는 담지 않는다. 담으면 로드 직후 어중간한 화면에서 시작하고, 그
 *    화면이 참조하던 객체가 사라져 있을 수 있다.
 * 2. **깨진 세이브는 게임을 깨뜨리지 않는다.** 로드는 던지지 않고 이유를
 *    돌려준다. 남의 파일을 올렸거나 손으로 고쳐 망가뜨렸을 때, 화면에 그대로
 *    띄울 수 있어야 한다.
 */

import { z } from 'zod';
import type { DangerState } from './encounter';
import type { Equipment } from './equipment';
import type { Inventory } from './inventory';
import type { QuestLog } from './quests';
import type { DexState } from './dex';
import type { PlayerState } from './movement';
import type { CharacterState } from './store';
import type { PetInstance } from '../engine/types';

/**
 * 세이브 스키마 버전.
 *
 * 1 — Phase 4 시절. 캐릭터가 `stats`를 들고 있었고 가방·장비·스톤·퀘스트·도감이
 *     아예 없었다.
 * 2 — Phase 5~6. 장비 보정을 분리하면서 `stats` → `baseStats`가 되었고,
 *     소지품·경제·퀘스트·도감이 들어왔다.
 */
export const SAVE_VERSION = 2;

export interface SaveFile {
  version: number;
  savedAt: number;
  player: PlayerState;
  character: CharacterState;
  party: PetInstance[];
  box: PetInstance[];
  inventory: Inventory;
  equipment: Equipment;
  stones: number;
  questLog: QuestLog;
  dex: DexState;
  visited: string[];
  danger: DangerState;
  rngState: number;
  tick: number;
}

/* ─────────────── 스키마 ─────────────── */

const StatsSchema = z.object({
  hp: z.number(),
  atk: z.number(),
  def: z.number(),
  spd: z.number(),
});

const PetSchema = z.object({
  uid: z.string(),
  speciesId: z.string(),
  nickname: z.string().nullable(),
  level: z.number().int().min(1),
  exp: z.number().min(0),
  growth: StatsSchema,
  currentStats: StatsSchema,
  loyalty: z.number(),
  skills: z.array(z.string()),
  capturedAt: z.number(),
  seedUsed: z.number(),
});

const SaveSchema = z.object({
  version: z.number().int().min(1),
  savedAt: z.number(),
  player: z.object({
    mapId: z.string(),
    tile: z.object({ x: z.number().int(), y: z.number().int() }),
    target: z.object({ x: z.number().int(), y: z.number().int() }).nullable(),
    progress: z.number(),
    facing: z.string(),
    steps: z.number().int().min(0),
  }),
  character: z.object({
    name: z.string(),
    level: z.number().int().min(1),
    exp: z.number().min(0),
    charm: z.number(),
    baseStats: StatsSchema,
    hp: z.number(),
    skills: z.array(z.string()),
  }),
  party: z.array(PetSchema),
  box: z.array(PetSchema),
  inventory: z.array(z.object({ itemId: z.string(), qty: z.number().int().min(1) })),
  equipment: z.object({
    weapon: z.string().nullable(),
    armor: z.string().nullable(),
    accessory: z.string().nullable(),
  }),
  stones: z.number().min(0),
  questLog: z.record(
    z.string(),
    z.object({
      state: z.enum(['locked', 'available', 'active', 'ready', 'done']),
      counts: z.array(z.number().int().min(0)),
    }),
  ),
  dex: z.object({ seen: z.array(z.string()), caught: z.array(z.string()) }),
  visited: z.array(z.string()),
  danger: z.object({ gauge: z.number(), grace: z.number().int().min(0) }),
  rngState: z.number().int(),
  tick: z.number().int().min(0),
});

/* ─────────────── 마이그레이션 ─────────────── */

/**
 * 한 버전을 올리는 함수들.
 *
 * 버전을 건너뛰지 않고 한 칸씩 올린다. 1→3 같은 지름길을 만들면 중간 버전이
 * 추가될 때마다 조합이 늘고, 언젠가 하나가 어긋난다.
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2: 장비를 도입하면서 캐릭터 능력치가 baseStats로 갈라졌고,
  // 소지품·경제·퀘스트·도감이 생겼다.
  1: (raw) => {
    const character = { ...(raw['character'] as Record<string, unknown>) };
    if (character['stats'] !== undefined && character['baseStats'] === undefined) {
      character['baseStats'] = character['stats'];
      delete character['stats'];
    }
    // 옛 세이브의 spirits는 캐릭터가 직접 들고 있었다. 이제 장비에 깃들므로 버린다.
    delete character['spirits'];

    return {
      ...raw,
      version: 2,
      character,
      inventory: raw['inventory'] ?? [],
      equipment: raw['equipment'] ?? { weapon: null, armor: null, accessory: null },
      stones: raw['stones'] ?? 0,
      questLog: raw['questLog'] ?? {},
      dex: raw['dex'] ?? { seen: [], caught: [] },
      visited: raw['visited'] ?? [(raw['player'] as { mapId?: string })?.mapId ?? 'village'],
    };
  },
};

export type LoadFailure = 'notJson' | 'notSave' | 'tooNew' | 'noMigration' | 'invalid';

export interface LoadResult {
  save: SaveFile | null;
  error?: LoadFailure;
  /** 화면에 그대로 띄울 수 있는 문장 */
  message?: string;
  /** 옛 버전을 올려서 읽었으면 그 버전 */
  migratedFrom?: number;
}

const MESSAGES: Record<LoadFailure, string> = {
  notJson: '세이브 파일이 아니다 — JSON으로 읽히지 않는다.',
  notSave: '이 게임의 세이브 파일이 아니다.',
  tooNew: '더 새로운 버전에서 만든 세이브다. 게임을 최신으로 올려야 읽을 수 있다.',
  noMigration: '너무 오래된 세이브라 올릴 방법이 없다.',
  invalid: '세이브 내용이 손상됐다.',
};

/**
 * 문자열을 세이브로 읽는다. 던지지 않는다.
 *
 * 마이그레이션은 스키마 검증 **전에** 돈다. 옛 세이브는 지금 스키마를 만족하지
 * 않는 게 당연하기 때문이다.
 */
export function loadSave(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { save: null, error: 'notJson', message: MESSAGES.notJson };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { save: null, error: 'notSave', message: MESSAGES.notSave };
  }
  let obj = raw as Record<string, unknown>;

  const version = obj['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { save: null, error: 'notSave', message: MESSAGES.notSave };
  }
  if (version > SAVE_VERSION) {
    return { save: null, error: 'tooNew', message: MESSAGES.tooNew };
  }

  const from = version;
  for (let v = version; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { save: null, error: 'noMigration', message: MESSAGES.noMigration };
    obj = step(obj);
  }

  const parsed = SaveSchema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      save: null,
      error: 'invalid',
      message: `${MESSAGES.invalid} (${first ? `${first.path.join('.')}: ${first.message}` : '알 수 없음'})`,
    };
  }

  return {
    save: parsed.data as SaveFile,
    ...(from < SAVE_VERSION ? { migratedFrom: from } : {}),
  };
}

/** 세이브를 문자열로. 사람이 열어볼 수 있게 들여쓴다 — 디버깅이 훨씬 쉬워진다. */
export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save, null, 1);
}

/** 파일 이름. 언제 만든 세이브인지 이름만 보고 알 수 있어야 한다. */
export function saveFileName(save: SaveFile): string {
  const d = new Date(save.savedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `stoneage-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** 세이브 요약 — 불러오기 전에 무엇인지 보여준다. */
export function describeSave(save: SaveFile): string {
  const caught = save.dex.caught.length;
  const done = Object.values(save.questLog).filter((q) => q.state === 'done').length;
  return `Lv.${save.character.level} · 펫 ${save.party.length + save.box.length} · 도감 ${caught} · 의뢰 ${done} · ${save.stones.toLocaleString()} 스톤`;
}
