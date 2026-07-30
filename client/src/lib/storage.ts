import { SAVE_VERSION, type GameState } from './gameTypes';

const STORAGE_KEY = 'stoneage-chronicles-save';

/**
 * v1 → v2 마이그레이션.
 * v1은 펫이 elementPrimary/elementSecondary/secondaryRatio를 들고 있었고,
 * 도감이 (형상 × 속성) 단위였으며, 스킬·테이머 HP·지역 개념이 없었다.
 * 구조가 근본적으로 달라 안전하게 되살릴 수 없는 부분이 많으므로,
 * 되살릴 수 있는 것(플레이어 진행도·보유 아이템)만 옮기고 펫은 새로 시작한다.
 */
function migrate(raw: Record<string, unknown>): GameState | null {
  const player = raw.player as Record<string, unknown> | undefined;
  if (!player) return null;

  return {
    version: SAVE_VERSION,
    player: {
      name: typeof player.name === 'string' ? player.name : '테이머',
      level: typeof player.level === 'number' ? player.level : 1,
      experience: typeof player.experience === 'number' ? player.experience : 0,
      gold: typeof player.gold === 'number' ? player.gold : 500,
      currentHp: 0, // 로드 시 최대치로 채운다
    },
    team: [],
    box: [],
    pokedex: [],
    currentLocation: 'town',
    currentRegionId: 'plains',
    unlockedRegionIds: ['plains'],
    pokeballs: (raw.pokeballs as Record<string, number>) ?? { normal: 5, good: 1, super: 0, master: 0 },
    potions: typeof raw.potions === 'number' ? raw.potions : 3,
    antidotes: 2,
    evolutionStones: 1,
    pvpRanking: typeof raw.pvpRanking === 'number' ? raw.pvpRanking : 1000,
  };
}

export function loadGame(): { state: GameState | null; migrated: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: null, migrated: false };

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const version = typeof parsed.version === 'number' ? parsed.version : 1;

    if (version === SAVE_VERSION) return { state: parsed as unknown as GameState, migrated: false };
    return { state: migrate(parsed), migrated: true };
  } catch {
    return { state: null, migrated: false };
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota) - ignore silently
  }
}

export function clearSave(): void {
  localStorage.removeItem(STORAGE_KEY);
}
