import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { PetTeam } from '../components/PetTeam';
import { wildShapesFor, REGIONS } from '../lib/petData';
import { generatePetInstance } from '../lib/petUtils';
import type { PetInstance } from '../lib/gameTypes';

function buildAiTeam(size: number, avgLevel: number, unlockedRegionIds: string[]): PetInstance[] {
  const pool = REGIONS.filter((r) => unlockedRegionIds.includes(r.id))
    .flatMap((r) => wildShapesFor(r.id))
    .filter((s) => s.rarity !== 'boss');
  const team: PetInstance[] = [];
  for (let i = 0; i < size; i++) {
    const shape = pool[Math.floor(Math.random() * pool.length)];
    const level = Math.max(1, avgLevel + Math.floor(Math.random() * 5) - 2);
    team.push(generatePetInstance(shape.id, level));
  }
  return team;
}

export default function PvP() {
  const { state } = useGame();
  const { startEncounter } = useEncounter();
  const [, navigate] = useLocation();

  const alive = state.team.filter((p) => p.currentHp > 0);
  const avgLevel =
    alive.length > 0 ? Math.round(alive.reduce((sum, p) => sum + p.level, 0) / alive.length) : 1;

  const handleMatch = () => {
    if (alive.length === 0) return;
    const enemyTeam = buildAiTeam(Math.max(1, alive.length), avgLevel, state.unlockedRegionIds);
    startEncounter({
      enemyTeam,
      source: 'pvp',
      canCapture: false,
      goldReward: avgLevel * 25,
      expReward: avgLevel * 12,
    });
    navigate('/battle');
  };

  const tier =
    state.pvpRanking >= 1400
      ? '다이아몬드'
      : state.pvpRanking >= 1200
        ? '골드'
        : state.pvpRanking >= 1000
          ? '실버'
          : '브론즈';

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">PvP 아레나</h1>

      <div className="panel p-4 text-center">
        <p className="text-xs text-slate-400">랭킹 점수</p>
        <p className="text-3xl font-heading text-gold-300">{state.pvpRanking}</p>
        <p className="text-xs text-slate-400 mt-1">{tier} 티어</p>
        <p className="text-[10px] text-slate-600 mt-2">승리 +20 · 패배 -10</p>
      </div>

      <div>
        <h2 className="text-sm font-heading text-slate-300 mb-2">출전 팀 (전투 가능 {alive.length}마리)</h2>
        <PetTeam team={state.team} />
      </div>

      <button
        onClick={handleMatch}
        disabled={alive.length === 0}
        className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400 disabled:opacity-30"
      >
        매치 찾기
      </button>
      {alive.length === 0 && (
        <p className="text-xs text-center text-amber-400">건강한 펫이 없습니다. 마을에서 회복하세요.</p>
      )}
      <p className="text-[10px] text-center text-slate-600">
        상대는 내 팀 규모와 평균 레벨에 맞춰 구성됩니다. PvP 패배 시에는 골드를 잃지 않습니다.
      </p>
    </div>
  );
}
