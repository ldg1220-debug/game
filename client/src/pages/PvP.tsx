import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { PetTeam } from '../components/PetTeam';
import { PET_SHAPES } from '../lib/petData';
import { generatePetInstance } from '../lib/petUtils';

function buildAiTeam(size: number, avgLevel: number) {
  const pool = PET_SHAPES.filter((s) => s.rarity !== 'boss');
  const team = [];
  for (let i = 0; i < size; i++) {
    const shape = pool[Math.floor(Math.random() * pool.length)];
    const primary = shape.elements[Math.floor(Math.random() * shape.elements.length)];
    const secondary = shape.elements.find((e) => e !== primary) ?? null;
    const level = Math.max(1, avgLevel + Math.floor(Math.random() * 5) - 2);
    team.push(generatePetInstance(shape.id, primary, secondary, level));
  }
  return team;
}

export default function PvP() {
  const { state } = useGame();
  const { startEncounter } = useEncounter();
  const [, navigate] = useLocation();

  const aliveTeam = state.team.filter((p) => p.currentHp > 0);
  const avgLevel =
    aliveTeam.length > 0 ? Math.round(aliveTeam.reduce((sum, p) => sum + p.level, 0) / aliveTeam.length) : 1;

  const handleMatch = () => {
    if (aliveTeam.length === 0) return;
    const enemyTeam = buildAiTeam(aliveTeam.length, avgLevel);
    startEncounter({
      enemyTeam,
      source: 'pvp',
      canCapture: false,
      goldReward: avgLevel * 25,
      expReward: avgLevel * 12,
    });
    navigate('/battle');
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">PvP 아레나</h1>

      <div className="panel p-4 text-center">
        <p className="text-xs text-slate-400">현재 랭킹 점수</p>
        <p className="text-3xl font-heading text-gold-300">{state.pvpRanking}</p>
      </div>

      <div>
        <h2 className="text-sm font-heading text-slate-300 mb-2">출전 팀</h2>
        <PetTeam team={state.team} />
      </div>

      <button
        onClick={handleMatch}
        disabled={aliveTeam.length === 0}
        className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400 disabled:opacity-30"
      >
        매치 찾기
      </button>
      {aliveTeam.length === 0 && (
        <p className="text-xs text-center text-amber-400">건강한 펫이 없습니다. 마을에서 회복하세요.</p>
      )}
    </div>
  );
}
