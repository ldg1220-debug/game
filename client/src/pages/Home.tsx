import { useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { PetTeam } from '../components/PetTeam';
import { PetCard } from '../components/PetCard';
import { generateStarterPet, tamerMaxHp } from '../lib/petUtils';
import { getRegion } from '../lib/petData';
import type { PetInstance } from '../lib/gameTypes';

const STARTER_SHAPE_IDS = [1, 2, 3];

function StarterSelect() {
  const { addStarterPet } = useGame();
  const [choices] = useState(() => STARTER_SHAPE_IDS.map((id) => generateStarterPet(id)));
  const [selected, setSelected] = useState<PetInstance | null>(null);

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl text-center font-heading text-gold-400 mb-1">첫 파트너를 선택하세요</h1>
      <p className="text-center text-xs text-slate-400 mb-4">
        같은 종이라도 개체마다 성장률과 원소 배분이 다릅니다. 신중하게 고르세요.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {choices.map((pet) => (
          <PetCard key={pet.id} pet={pet} onClick={() => setSelected(pet)} selected={selected?.id === pet.id} />
        ))}
      </div>
      <button
        disabled={!selected}
        onClick={() => selected && addStarterPet(selected)}
        className="w-full mt-4 py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold disabled:opacity-30"
      >
        이 펫과 함께 모험을 시작합니다
      </button>
    </div>
  );
}

export default function Home() {
  const { state, needsStarter, playerExpToNext, saveMigrated, dismissMigrationNotice } = useGame();
  const [, navigate] = useLocation();

  if (needsStarter) {
    return (
      <>
        {saveMigrated && (
          <div className="max-w-lg mx-auto p-3">
            <div className="panel p-3 text-xs text-amber-300 flex items-start justify-between gap-2">
              <span>
                저장 데이터 구조가 바뀌어 펫 정보를 이어받지 못했습니다. 진행도와 아이템은 유지되었습니다.
              </span>
              <button onClick={dismissMigrationNotice} className="text-slate-400 shrink-0">
                ✕
              </button>
            </div>
          </div>
        )}
        <StarterSelect />
      </>
    );
  }

  const expPct = Math.min(100, Math.round((state.player.experience / playerExpToNext) * 100));
  const maxHp = tamerMaxHp(state.player.level);
  const hpPct = Math.round((state.player.currentHp / maxHp) * 100);
  const region = getRegion(state.currentRegionId);
  const dexCount = state.pokedex.filter((e) => e.caught).length;

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
            <p className="text-[10px] text-slate-500">{region.name}</p>
          </div>
        </div>

        <div className="mt-2 space-y-1.5">
          <div>
            <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
              <div className="h-full bg-gold-400 transition-all" style={{ width: `${expPct}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              EXP {state.player.experience}/{playerExpToNext}
            </p>
          </div>
          <div>
            <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
              <div
                className={`h-full transition-all ${hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.max(0, hpPct)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              테이머 HP {state.player.currentHp}/{maxHp}
            </p>
          </div>
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
          <div className="text-[10px] text-slate-500">
            팀 {state.team.length} · 보관 {state.box.length}
          </div>
        </button>
        <button onClick={() => navigate('/pokedex')} className="panel p-4 text-center hover:border-gold-400/60">
          <div className="text-2xl mb-1">📖</div>
          <div className="text-sm font-heading">포켓덱스</div>
          <div className="text-[10px] text-slate-500">
            {dexCount}/{state.pokedex.length}
          </div>
        </button>
        <button onClick={() => navigate('/pvp')} className="panel p-4 text-center hover:border-gold-400/60">
          <div className="text-2xl mb-1">⚔️</div>
          <div className="text-sm font-heading">PvP 아레나</div>
          <div className="text-[10px] text-slate-500">{state.pvpRanking}점</div>
        </button>
      </div>
    </div>
  );
}
