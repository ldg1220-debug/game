import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameState, LocationId, PetInstance, PokeballType } from '../lib/gameTypes';
import { PET_SHAPES } from '../lib/petData';
import { addExperience, expToNextLevel, getMaxHp } from '../lib/petUtils';
import { POKEBALLS } from '../lib/captureEngine';
import { loadGame, saveGame, clearSave } from '../lib/storage';

function buildInitialPokedex() {
  return PET_SHAPES.flatMap((shape) =>
    shape.elements.map((elementPrimary) => ({
      shapeId: shape.id,
      elementPrimary,
      caught: false,
      count: 0,
    })),
  );
}

function defaultState(): GameState {
  return {
    player: { name: '테이머', level: 1, experience: 0, gold: 500 },
    team: [],
    box: [],
    pokedex: buildInitialPokedex(),
    currentLocation: 'town',
    currentRegion: '푸른 초원',
    pokeballs: { normal: 5, good: 1, super: 0, master: 0 },
    potions: 3,
    pvpRanking: 1000,
  };
}

interface GameContextValue {
  state: GameState;
  needsStarter: boolean;
  addStarterPet: (pet: PetInstance) => void;
  addCapturedPet: (pet: PetInstance) => 'team' | 'box';
  releasePet: (id: string) => void;
  moveToTeam: (id: string) => void;
  moveToBox: (id: string) => void;
  healTeamFull: () => void;
  applyPotionToPet: (id: string) => void;
  awardBattleRewards: (petId: string, gold: number, exp: number) => { leveledUp: boolean; levelsGained: number };
  spendGold: (amount: number) => boolean;
  addGold: (amount: number) => void;
  buyPokeball: (type: PokeballType, qty: number) => boolean;
  consumePokeball: (type: PokeballType) => boolean;
  buyPotion: (qty: number) => boolean;
  setLocation: (loc: LocationId) => void;
  updatePetHp: (id: string, hp: number) => void;
  resetGame: () => void;
  playerExpToNext: number;
  adjustPvpRanking: (delta: number) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

function findPet(state: GameState, id: string): { pet: PetInstance; from: 'team' | 'box' } | null {
  const inTeam = state.team.find((p) => p.id === id);
  if (inTeam) return { pet: inTeam, from: 'team' };
  const inBox = state.box.find((p) => p.id === id);
  if (inBox) return { pet: inBox, from: 'box' };
  return null;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(() => loadGame() ?? defaultState());

  useEffect(() => {
    saveGame(state);
  }, [state]);

  const needsStarter = state.team.length === 0 && state.box.length === 0;

  const addStarterPet = (pet: PetInstance) => {
    setState((s) => ({ ...s, team: [pet] }));
  };

  const addCapturedPet = (pet: PetInstance): 'team' | 'box' => {
    let destination: 'team' | 'box' = 'box';
    setState((s) => {
      const pokedex = s.pokedex.map((entry) =>
        entry.shapeId === pet.shapeId && entry.elementPrimary === pet.elementPrimary
          ? { ...entry, caught: true, count: entry.count + 1 }
          : entry,
      );
      if (s.team.length < 5) {
        destination = 'team';
        return { ...s, team: [...s.team, pet], pokedex };
      }
      destination = 'box';
      return { ...s, box: [...s.box, pet], pokedex };
    });
    return destination;
  };

  const releasePet = (id: string) => {
    setState((s) => ({
      ...s,
      team: s.team.filter((p) => p.id !== id),
      box: s.box.filter((p) => p.id !== id),
    }));
  };

  const moveToTeam = (id: string) => {
    setState((s) => {
      if (s.team.length >= 5) return s;
      const found = s.box.find((p) => p.id === id);
      if (!found) return s;
      return { ...s, team: [...s.team, found], box: s.box.filter((p) => p.id !== id) };
    });
  };

  const moveToBox = (id: string) => {
    setState((s) => {
      const found = s.team.find((p) => p.id === id);
      if (!found) return s;
      return { ...s, box: [...s.box, found], team: s.team.filter((p) => p.id !== id) };
    });
  };

  const healTeamFull = () => {
    setState((s) => ({
      ...s,
      team: s.team.map((p) => ({ ...p, currentHp: getMaxHp(p) })),
    }));
  };

  const applyPotionToPet = (id: string) => {
    setState((s) => {
      if (s.potions <= 0) return s;
      const target = findPet(s, id);
      if (!target) return s;
      const maxHp = getMaxHp(target.pet);
      const healed = { ...target.pet, currentHp: Math.min(maxHp, target.pet.currentHp + Math.round(maxHp * 0.5)) };
      const apply = (list: PetInstance[]) => list.map((p) => (p.id === id ? healed : p));
      return {
        ...s,
        potions: s.potions - 1,
        team: target.from === 'team' ? apply(s.team) : s.team,
        box: target.from === 'box' ? apply(s.box) : s.box,
      };
    });
  };

  const updatePetHp = (id: string, hp: number) => {
    setState((s) => {
      const apply = (list: PetInstance[]) => list.map((p) => (p.id === id ? { ...p, currentHp: hp } : p));
      return { ...s, team: apply(s.team), box: apply(s.box) };
    });
  };

  const awardBattleRewards = (petId: string, gold: number, exp: number) => {
    let leveledUp = false;
    let levelsGained = 0;
    setState((s) => {
      let playerExp = s.player.experience + exp;
      let playerLevel = s.player.level;
      while (playerLevel < 100 && playerExp >= expToNextLevel(playerLevel)) {
        playerExp -= expToNextLevel(playerLevel);
        playerLevel += 1;
      }

      const apply = (list: PetInstance[]) =>
        list.map((p) => {
          if (p.id !== petId) return p;
          const result = addExperience(p, exp);
          leveledUp = result.leveledUp;
          levelsGained = result.levelsGained;
          return result.pet;
        });

      return {
        ...s,
        player: { ...s.player, gold: s.player.gold + gold, experience: playerExp, level: playerLevel },
        team: apply(s.team),
        box: apply(s.box),
      };
    });
    return { leveledUp, levelsGained };
  };

  const spendGold = (amount: number): boolean => {
    let success = false;
    setState((s) => {
      if (s.player.gold < amount) return s;
      success = true;
      return { ...s, player: { ...s.player, gold: s.player.gold - amount } };
    });
    return success;
  };

  const addGold = (amount: number) => {
    setState((s) => ({ ...s, player: { ...s.player, gold: s.player.gold + amount } }));
  };

  const buyPokeball = (type: PokeballType, qty: number): boolean => {
    const cost = POKEBALLS[type].cost * qty;
    let success = false;
    setState((s) => {
      if (s.player.gold < cost) return s;
      success = true;
      return {
        ...s,
        player: { ...s.player, gold: s.player.gold - cost },
        pokeballs: { ...s.pokeballs, [type]: (s.pokeballs[type] ?? 0) + qty },
      };
    });
    return success;
  };

  const consumePokeball = (type: PokeballType): boolean => {
    let success = false;
    setState((s) => {
      if ((s.pokeballs[type] ?? 0) <= 0) return s;
      success = true;
      return { ...s, pokeballs: { ...s.pokeballs, [type]: s.pokeballs[type] - 1 } };
    });
    return success;
  };

  const buyPotion = (qty: number): boolean => {
    const cost = 100 * qty;
    let success = false;
    setState((s) => {
      if (s.player.gold < cost) return s;
      success = true;
      return { ...s, player: { ...s.player, gold: s.player.gold - cost }, potions: s.potions + qty };
    });
    return success;
  };

  const setLocation = (loc: LocationId) => {
    setState((s) => ({ ...s, currentLocation: loc }));
  };

  const adjustPvpRanking = (delta: number) => {
    setState((s) => ({ ...s, pvpRanking: Math.max(0, s.pvpRanking + delta) }));
  };

  const resetGame = () => {
    clearSave();
    setState(defaultState());
  };

  const playerExpToNext = useMemo(() => expToNextLevel(state.player.level), [state.player.level]);

  const value: GameContextValue = {
    state,
    needsStarter,
    addStarterPet,
    addCapturedPet,
    releasePet,
    moveToTeam,
    moveToBox,
    healTeamFull,
    applyPotionToPet,
    awardBattleRewards,
    spendGold,
    addGold,
    buyPokeball,
    consumePokeball,
    buyPotion,
    setLocation,
    updatePetHp,
    resetGame,
    playerExpToNext,
    adjustPvpRanking,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
