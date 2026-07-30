import { useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { Map } from '../components/Map';
import { PetTeam } from '../components/PetTeam';
import type { LocationId, PokeballType } from '../lib/gameTypes';
import { rollDungeonEncounter, rollFieldEncounter, battleRewards } from '../lib/encounterEngine';
import { POKEBALLS } from '../lib/captureEngine';

export default function ExploreScreen() {
  const { state, setLocation, healTeamFull, buyPokeball, buyPotion } = useGame();
  const { startEncounter } = useEncounter();
  const [, navigate] = useLocation();
  const [message, setMessage] = useState<string | null>(null);

  const handleSelect = (loc: LocationId) => setLocation(loc);

  const handleExplore = () => {
    if (state.team.every((p) => p.currentHp <= 0)) {
      setMessage('모든 펫이 지쳐있습니다. 마을에서 회복하세요!');
      return;
    }
    const enemy =
      state.currentLocation === 'dungeon'
        ? rollDungeonEncounter(state.player.level)
        : rollFieldEncounter(state.player.level);
    const rewards = battleRewards(enemy);
    startEncounter({
      enemyTeam: [enemy],
      source: state.currentLocation === 'dungeon' ? 'dungeon' : 'field',
      canCapture: true,
      goldReward: rewards.gold,
      expReward: rewards.exp,
    });
    navigate('/battle');
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">{state.currentRegion}</h1>
      <Map current={state.currentLocation} onSelect={handleSelect} />

      {message && <p className="text-xs text-amber-400 text-center">{message}</p>}

      {state.currentLocation === 'town' && <TownPanel onHeal={healTeamFull} onBuyBall={buyPokeball} onBuyPotion={buyPotion} />}

      {(state.currentLocation === 'field' || state.currentLocation === 'dungeon') && (
        <div className="panel p-4 text-center space-y-3">
          <p className="text-sm text-slate-300">
            {state.currentLocation === 'field'
              ? '넓은 들판에서 야생 펫과 마주칠 수 있습니다.'
              : '위험하지만 희귀한 펫이 서식하는 동굴입니다.'}
          </p>
          <button
            onClick={handleExplore}
            className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400"
          >
            탐험하기
          </button>
        </div>
      )}

      <div>
        <h2 className="text-sm font-heading text-slate-300 mb-2">내 팀 상태</h2>
        <PetTeam team={state.team} />
      </div>
    </div>
  );
}

function TownPanel({
  onHeal,
  onBuyBall,
  onBuyPotion,
}: {
  onHeal: () => void;
  onBuyBall: (type: PokeballType, qty: number) => boolean;
  onBuyPotion: (qty: number) => boolean;
}) {
  const { state } = useGame();
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">회복 시설</span>
        <button onClick={onHeal} className="px-3 py-1.5 rounded-md bg-emerald-600/80 text-xs hover:bg-emerald-500">
          팀 전체 회복 (무료)
        </button>
      </div>
      <div className="border-t border-white/5 pt-3">
        <p className="text-sm mb-2">상점</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.values(POKEBALLS) as (typeof POKEBALLS)[PokeballType][]).map((ball) => (
            <button
              key={ball.id}
              onClick={() => onBuyBall(ball.id, 1)}
              className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60"
            >
              <span>
                {ball.name} ({state.pokeballs[ball.id] ?? 0})
              </span>
              <span className="text-gold-300">{ball.cost}G</span>
            </button>
          ))}
          <button
            onClick={() => onBuyPotion(1)}
            className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 col-span-2"
          >
            <span>회복 포션 ({state.potions})</span>
            <span className="text-gold-300">100G</span>
          </button>
        </div>
      </div>
    </div>
  );
}
