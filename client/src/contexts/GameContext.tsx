import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  MAX_SKILL_SLOTS,
  SAVE_VERSION,
  type GameState,
  type LocationId,
  type PetInstance,
  type PokeballType,
} from '../lib/gameTypes';
import { PET_SHAPES } from '../lib/petData';
import { addExperience, evolvePet, evolutionTarget, expToNextLevel, getMaxHp, tamerMaxHp } from '../lib/petUtils';
import { POKEBALLS } from '../lib/captureEngine';
import { loadGame, saveGame, clearSave } from '../lib/storage';

function buildInitialPokedex() {
  return PET_SHAPES.map((shape) => ({
    shapeId: shape.id,
    caught: false,
    count: 0,
    bestGrowthRate: 0,
  }));
}

function defaultState(): GameState {
  return {
    version: SAVE_VERSION,
    player: { name: '테이머', level: 1, experience: 0, gold: 500, currentHp: tamerMaxHp(1) },
    team: [],
    box: [],
    pokedex: buildInitialPokedex(),
    currentLocation: 'town',
    currentRegionId: 'plains',
    unlockedRegionIds: ['plains'],
    pokeballs: { normal: 5, good: 1, super: 0, master: 0 },
    potions: 3,
    antidotes: 2,
    evolutionStones: 1,
    pvpRanking: 1000,
  };
}

/** 세이브에 없는 필드를 기본값으로 채우고 도감 항목을 최신 종 목록에 맞춘다. */
function hydrate(loaded: GameState): GameState {
  const base = defaultState();
  const merged: GameState = { ...base, ...loaded, player: { ...base.player, ...loaded.player } };

  const byId = new Map(merged.pokedex.map((e) => [e.shapeId, e]));
  merged.pokedex = PET_SHAPES.map(
    (s) => byId.get(s.id) ?? { shapeId: s.id, caught: false, count: 0, bestGrowthRate: 0 },
  );

  const maxHp = tamerMaxHp(merged.player.level);
  if (!merged.player.currentHp || merged.player.currentHp > maxHp) merged.player.currentHp = maxHp;

  return merged;
}

interface GameContextValue {
  state: GameState;
  needsStarter: boolean;
  saveMigrated: boolean;
  dismissMigrationNotice: () => void;
  addStarterPet: (pet: PetInstance) => void;
  addCapturedPet: (pet: PetInstance) => 'team' | 'box';
  releasePet: (id: string) => void;
  renamePet: (id: string, nickname: string) => void;
  moveToTeam: (id: string) => void;
  moveToBox: (id: string) => void;
  reorderTeam: (from: number, to: number) => void;
  setEquippedSkills: (id: string, skillIds: string[]) => void;
  evolve: (id: string) => boolean;
  healAll: () => void;
  applyPotionToPet: (id: string) => void;
  applyAntidoteToPet: (id: string) => void;
  syncBattleResult: (petHp: Record<string, number>, tamerHp: number) => void;
  awardBattleRewards: (petIds: string[], gold: number, exp: number) => string[];
  spendGold: (amount: number) => boolean;
  buyPokeball: (type: PokeballType, qty: number) => boolean;
  consumePokeball: (type: PokeballType) => boolean;
  buyPotion: (qty: number) => boolean;
  buyEvolutionStone: (qty: number) => boolean;
  setLocation: (loc: LocationId) => void;
  setRegion: (regionId: string) => void;
  unlockRegion: (regionId: string) => void;
  adjustPvpRanking: (delta: number) => void;
  resetGame: () => void;
  playerExpToNext: number;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => loadGame());
  const [state, setState] = useState<GameState>(() =>
    initial.state ? hydrate(initial.state) : defaultState(),
  );
  const [saveMigrated, setSaveMigrated] = useState(initial.migrated);

  useEffect(() => {
    saveGame(state);
  }, [state]);

  const needsStarter = state.team.length === 0 && state.box.length === 0;

  const updatePetEverywhere = (id: string, fn: (p: PetInstance) => PetInstance) =>
    setState((s) => ({
      ...s,
      team: s.team.map((p) => (p.id === id ? fn(p) : p)),
      box: s.box.map((p) => (p.id === id ? fn(p) : p)),
    }));

  const addStarterPet = (pet: PetInstance) => {
    setState((s) => ({
      ...s,
      team: [pet],
      pokedex: s.pokedex.map((e) =>
        e.shapeId === pet.shapeId
          ? { ...e, caught: true, count: e.count + 1, bestGrowthRate: Math.max(e.bestGrowthRate, pet.averageGrowthRate) }
          : e,
      ),
    }));
  };

  const addCapturedPet = (pet: PetInstance): 'team' | 'box' => {
    let destination: 'team' | 'box' = 'box';
    setState((s) => {
      const pokedex = s.pokedex.map((e) =>
        e.shapeId === pet.shapeId
          ? {
              ...e,
              caught: true,
              count: e.count + 1,
              bestGrowthRate: Math.max(e.bestGrowthRate, pet.averageGrowthRate),
            }
          : e,
      );
      if (s.team.length < 5) {
        destination = 'team';
        return { ...s, team: [...s.team, pet], pokedex };
      }
      return { ...s, box: [...s.box, pet], pokedex };
    });
    return destination;
  };

  const releasePet = (id: string) =>
    setState((s) => ({
      ...s,
      team: s.team.filter((p) => p.id !== id),
      box: s.box.filter((p) => p.id !== id),
    }));

  const renamePet = (id: string, nickname: string) =>
    updatePetEverywhere(id, (p) => ({ ...p, nickname: nickname.trim() || undefined }));

  const moveToTeam = (id: string) =>
    setState((s) => {
      if (s.team.length >= 5) return s;
      const found = s.box.find((p) => p.id === id);
      if (!found) return s;
      return { ...s, team: [...s.team, found], box: s.box.filter((p) => p.id !== id) };
    });

  const moveToBox = (id: string) =>
    setState((s) => {
      const found = s.team.find((p) => p.id === id);
      if (!found) return s;
      return { ...s, box: [...s.box, found], team: s.team.filter((p) => p.id !== id) };
    });

  const reorderTeam = (from: number, to: number) =>
    setState((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.team.length || to >= s.team.length) return s;
      const team = [...s.team];
      const [moved] = team.splice(from, 1);
      team.splice(to, 0, moved);
      return { ...s, team };
    });

  const setEquippedSkills = (id: string, skillIds: string[]) =>
    updatePetEverywhere(id, (p) => ({ ...p, skillIds: skillIds.slice(0, MAX_SKILL_SLOTS) }));

  const evolve = (id: string): boolean => {
    let ok = false;
    setState((s) => {
      const target = [...s.team, ...s.box].find((p) => p.id === id);
      if (!target || !evolutionTarget(target) || s.evolutionStones <= 0) return s;
      ok = true;
      const evolved = evolvePet(target);
      return {
        ...s,
        evolutionStones: s.evolutionStones - 1,
        team: s.team.map((p) => (p.id === id ? evolved : p)),
        box: s.box.map((p) => (p.id === id ? evolved : p)),
        pokedex: s.pokedex.map((e) =>
          e.shapeId === evolved.shapeId
            ? {
                ...e,
                caught: true,
                count: e.count + 1,
                bestGrowthRate: Math.max(e.bestGrowthRate, evolved.averageGrowthRate),
              }
            : e,
        ),
      };
    });
    return ok;
  };

  const healAll = () =>
    setState((s) => ({
      ...s,
      player: { ...s.player, currentHp: tamerMaxHp(s.player.level) },
      team: s.team.map((p) => ({ ...p, currentHp: getMaxHp(p) })),
      box: s.box.map((p) => ({ ...p, currentHp: getMaxHp(p) })),
    }));

  const applyPotionToPet = (id: string) =>
    setState((s) => {
      if (s.potions <= 0) return s;
      const target = [...s.team, ...s.box].find((p) => p.id === id);
      if (!target || target.currentHp >= getMaxHp(target)) return s;
      const heal = (p: PetInstance) => ({
        ...p,
        currentHp: Math.min(getMaxHp(p), p.currentHp + Math.round(getMaxHp(p) * 0.5)),
      });
      return {
        ...s,
        potions: s.potions - 1,
        team: s.team.map((p) => (p.id === id ? heal(p) : p)),
        box: s.box.map((p) => (p.id === id ? heal(p) : p)),
      };
    });

  // 상태이상은 전투 중에만 유지되므로, 전투 밖에서 해독제는 예비 자원으로만 둔다.
  const applyAntidoteToPet = (_id: string) =>
    setState((s) => (s.antidotes <= 0 ? s : { ...s, antidotes: s.antidotes - 1 }));

  const syncBattleResult = (petHp: Record<string, number>, tamerHp: number) =>
    setState((s) => {
      const apply = (p: PetInstance) => (p.id in petHp ? { ...p, currentHp: petHp[p.id] } : p);
      return {
        ...s,
        player: { ...s.player, currentHp: tamerHp },
        team: s.team.map(apply),
        box: s.box.map(apply),
      };
    });

  const awardBattleRewards = (petIds: string[], gold: number, exp: number): string[] => {
    const leveled: string[] = [];
    setState((s) => {
      let playerExp = s.player.experience + exp;
      let playerLevel = s.player.level;
      while (playerLevel < 100 && playerExp >= expToNextLevel(playerLevel)) {
        playerExp -= expToNextLevel(playerLevel);
        playerLevel += 1;
      }

      const share = petIds.length > 0 ? Math.ceil(exp / petIds.length) : 0;
      const apply = (p: PetInstance) => {
        if (!petIds.includes(p.id)) return p;
        const result = addExperience(p, share);
        if (result.leveledUp) leveled.push(result.pet.nickname ?? String(result.pet.shapeId));
        return result.pet;
      };

      return {
        ...s,
        player: {
          ...s.player,
          gold: s.player.gold + gold,
          experience: playerExp,
          level: playerLevel,
        },
        team: s.team.map(apply),
        box: s.box.map(apply),
      };
    });
    return leveled;
  };

  const spendGold = (amount: number): boolean => {
    let ok = false;
    setState((s) => {
      if (s.player.gold < amount) return s;
      ok = true;
      return { ...s, player: { ...s.player, gold: s.player.gold - amount } };
    });
    return ok;
  };

  const buyPokeball = (type: PokeballType, qty: number): boolean => {
    const cost = POKEBALLS[type].cost * qty;
    let ok = false;
    setState((s) => {
      if (s.player.gold < cost) return s;
      ok = true;
      return {
        ...s,
        player: { ...s.player, gold: s.player.gold - cost },
        pokeballs: { ...s.pokeballs, [type]: (s.pokeballs[type] ?? 0) + qty },
      };
    });
    return ok;
  };

  const consumePokeball = (type: PokeballType): boolean => {
    let ok = false;
    setState((s) => {
      if ((s.pokeballs[type] ?? 0) <= 0) return s;
      ok = true;
      return { ...s, pokeballs: { ...s.pokeballs, [type]: s.pokeballs[type] - 1 } };
    });
    return ok;
  };

  const buyPotion = (qty: number): boolean => {
    const cost = 100 * qty;
    let ok = false;
    setState((s) => {
      if (s.player.gold < cost) return s;
      ok = true;
      return { ...s, player: { ...s.player, gold: s.player.gold - cost }, potions: s.potions + qty };
    });
    return ok;
  };

  const buyEvolutionStone = (qty: number): boolean => {
    const cost = 1200 * qty;
    let ok = false;
    setState((s) => {
      if (s.player.gold < cost) return s;
      ok = true;
      return {
        ...s,
        player: { ...s.player, gold: s.player.gold - cost },
        evolutionStones: s.evolutionStones + qty,
      };
    });
    return ok;
  };

  const setLocation = (loc: LocationId) => setState((s) => ({ ...s, currentLocation: loc }));

  const setRegion = (regionId: string) =>
    setState((s) =>
      s.unlockedRegionIds.includes(regionId)
        ? { ...s, currentRegionId: regionId, currentLocation: 'town' }
        : s,
    );

  const unlockRegion = (regionId: string) =>
    setState((s) =>
      s.unlockedRegionIds.includes(regionId)
        ? s
        : { ...s, unlockedRegionIds: [...s.unlockedRegionIds, regionId] },
    );

  const adjustPvpRanking = (delta: number) =>
    setState((s) => ({ ...s, pvpRanking: Math.max(0, s.pvpRanking + delta) }));

  const resetGame = () => {
    clearSave();
    setState(defaultState());
    setSaveMigrated(false);
  };

  const playerExpToNext = useMemo(() => expToNextLevel(state.player.level), [state.player.level]);

  const value: GameContextValue = {
    state,
    needsStarter,
    saveMigrated,
    dismissMigrationNotice: () => setSaveMigrated(false),
    addStarterPet,
    addCapturedPet,
    releasePet,
    renamePet,
    moveToTeam,
    moveToBox,
    reorderTeam,
    setEquippedSkills,
    evolve,
    healAll,
    applyPotionToPet,
    applyAntidoteToPet,
    syncBattleResult,
    awardBattleRewards,
    spendGold,
    buyPokeball,
    consumePokeball,
    buyPotion,
    buyEvolutionStone,
    setLocation,
    setRegion,
    unlockRegion,
    adjustPvpRanking,
    resetGame,
    playerExpToNext,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
