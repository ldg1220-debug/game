import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PetInstance } from '../lib/gameTypes';

export type EncounterSource = 'field' | 'dungeon' | 'boss' | 'pvp';

export interface Encounter {
  enemyTeam: PetInstance[];
  source: EncounterSource;
  canCapture: boolean;
  goldReward: number;
  expReward: number;
  /** 보스 처치 시 해금되는 지역 */
  unlocksRegionId?: string;
}

interface EncounterContextValue {
  encounter: Encounter | null;
  startEncounter: (encounter: Encounter) => void;
  clearEncounter: () => void;
}

const EncounterContext = createContext<EncounterContextValue | null>(null);

export function EncounterProvider({ children }: { children: ReactNode }) {
  const [encounter, setEncounter] = useState<Encounter | null>(null);

  return (
    <EncounterContext.Provider
      value={{
        encounter,
        startEncounter: setEncounter,
        clearEncounter: () => setEncounter(null),
      }}
    >
      {children}
    </EncounterContext.Provider>
  );
}

export function useEncounter(): EncounterContextValue {
  const ctx = useContext(EncounterContext);
  if (!ctx) throw new Error('useEncounter must be used within EncounterProvider');
  return ctx;
}
