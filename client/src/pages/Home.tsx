import { useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { PetTeam } from '../components/PetTeam';
import { generateStarterPet } from '../lib/petUtils';
import { getShape } from '../lib/petData';
import type { Element, PetInstance } from '../lib/gameTypes';
import { PetCard } from '../components/PetCard';

const STARTER_OPTIONS: { shapeId: number; element: Element }[] = [
  { shapeId: 1, element: 'none' },
  { shapeId: 2, element: 'fire' },
  { shapeId: 3, element: 'water' },
];

function StarterSelect() {
  const { addStarterPet } = useGame();
  const [choices] = useState(() =>
    STARTER_OPTIONS.map((opt) => generateStarterPet(opt.shapeId, opt.element, null)),
  );
  const [selected, setSelected] = useState<PetInstance | null>(null);

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl text-center text-gold-400 mb-1">첫 파트너를 선택하세요</h1>
      <p className="text-center text-sm text-slate-400 mb-4">
        같은 종이라도 개체마다 성장률이 다릅니다. 신중하게 선택하세요!
      </p>
      <div className="grid grid-cols-1 gap-3">
        {choices.map((pet) => (
          <PetCard key={pet.id} pet={pet} onClick={() => setSelected(pet)} selected={selected?.id === pet.id} />
        ))}
      </div>
      <button
        disabled={!selected}
        onClick={() => selected && addStarterPet(selected)}
        className="w-full mt-4 py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
      >
        이 펫과 함께 모험을 시작합니다
      </button>
    </div>
  );
}

export default function Home() {
  const { state, needsStarter, playerExpToNext } = useGame();
  const [, navigate] = useLocation();

  if (needsStarter) return <StarterSelect />;

  const expPct = Math.min(100, Math.round((state.player.experience / playerExpToNext) * 100));

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-lg text-gold-400">{state.player.name}</h1>
            <p className="text-xs text-slate-400">테이머 Lv.{state.player.level}</p>
          </div>
          <div className="text-right">
            <p className="text-gold-300 font-semibold">💰 {state.player.gold.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">{state.currentRegion}</p>
          </div>
        </div>
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
            <div className="h-full bg-gold-400" style={{ width: `${expPct}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            EXP {state.player.experience}/{playerExpToNext}
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-heading text-slate-300 mb-2">내 팀</h2>
        <PetTeam team={state.team} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/explore')} className="panel p-4 text-center hover:border-gold-400/60">
          <div className="text-2xl mb-1">🗺️</div>
          <div className="text-sm font-heading">탐험하기</div>
        </button>
        <button onClick={() => navigate('/pets')} className="panel p-4 text-center hover:border-gold-400/60">
          <div className="text-2xl mb-1">🐾</div>
          <div className="text-sm font-heading">펫 관리</div>
        </button>
        <button onClick={() => navigate('/pokedex')} className="panel p-4 text-center hover:border-gold-400/60">
          <div className="text-2xl mb-1">📖</div>
          <div className="text-sm font-heading">포켓덱스</div>
        </button>
        <button onClick={() => navigate('/pvp')} className="panel p-4 text-center hover:border-gold-400/60">
          <div className="text-2xl mb-1">⚔️</div>
          <div className="text-sm font-heading">PvP 아레나</div>
        </button>
      </div>

      <p className="text-center text-[10px] text-slate-600">
        {getShape(state.team[0]?.shapeId ?? 1).region} 지역을 탐험하며 더 강한 펫을 포획해보세요.
      </p>
    </div>
  );
}
