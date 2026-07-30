import type { GameState } from './gameTypes';

const STORAGE_KEY = 'stoneage-chronicles-save';

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
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
