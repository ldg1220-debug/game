import { useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { PetTeam } from '../components/PetTeam';
import type { LocationId, PokeballType } from '../lib/gameTypes';
import { getRegion, REGIONS } from '../lib/petData';
import {
  battleRewards,
  rollBossEncounter,
  rollDungeonEncounter,
  rollFieldEncounter,
} from '../lib/encounterEngine';
import { POKEBALLS } from '../lib/captureEngine';
import { tamerMaxHp } from '../lib/petUtils';

export default function ExploreScreen() {
  const { state, setLocation, setRegion, healAll, buyPokeball, buyPotion, buyEvolutionStone } = useGame();
  const { startEncounter } = useEncounter();
  const [, navigate] = useLocation();
  const [message, setMessage] = useState<string | null>(null);

  const region = getRegion(state.currentRegionId);
  const nextRegion = REGIONS.find((r) => !state.unlockedRegionIds.includes(r.id));

  const canFight = state.team.some((p) => p.currentHp > 0) || state.player.currentHp > 0;

  const spots: { id: LocationId; name: string; desc: string; icon: string }[] = [
    { id: 'town', name: region.townName, desc: '상점 · 회복 · 보관소', icon: '🏘️' },
    { id: 'field', name: region.fieldName, desc: '야생 펫 출현', icon: '🌾' },
    { id: 'dungeon', name: region.dungeonName, desc: '희귀 펫 · 보스', icon: '🕳️' },
  ];

  const startBattle = (kind: 'field' | 'dungeon' | 'boss') => {
    if (!canFight) {
      setMessage('모두 지쳐 있습니다. 마을에서 회복하세요!');
      return;
    }
    setMessage(null);

    if (kind === 'boss') {
      const boss = rollBossEncounter(state.currentRegionId, state.player.level);
      if (!boss) {
        setMessage('이 지역에는 보스가 없습니다.');
        return;
      }
      const rewards = battleRewards([boss]);
      startEncounter({
        enemyTeam: [boss],
        source: 'boss',
        canCapture: true,
        goldReward: rewards.gold * 2,
        expReward: rewards.exp * 2,
        unlocksRegionId: nextRegion?.id,
      });
      navigate('/battle');
      return;
    }

    const enemy =
      kind === 'dungeon'
        ? rollDungeonEncounter(state.currentRegionId, state.player.level)
        : rollFieldEncounter(state.currentRegionId, state.player.level);
    const rewards = battleRewards([enemy]);
    startEncounter({
      enemyTeam: [enemy],
      source: kind,
      canCapture: true,
      goldReward: rewards.gold,
      expReward: rewards.exp,
    });
    navigate('/battle');
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-heading text-gold-400">{region.name}</h1>
        <span className="text-[10px] text-slate-500">
          권장 Lv.{region.levelRange[0]}~{region.levelRange[1]}
        </span>
      </div>
      <p className="text-xs text-slate-400 -mt-2">{region.description}</p>

      {state.unlockedRegionIds.length > 1 && (
        <div className="flex gap-2">
          {REGIONS.filter((r) => state.unlockedRegionIds.includes(r.id)).map((r) => (
            <button
              key={r.id}
              onClick={() => setRegion(r.id)}
              className={`flex-1 py-2 rounded-lg text-xs ${
                r.id === state.currentRegionId ? 'bg-gold-500 text-ink-950 font-semibold' : 'panel'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {spots.map((spot) => (
          <button
            key={spot.id}
            onClick={() => setLocation(spot.id)}
            className={`panel p-3 text-center transition hover:border-gold-400/60 ${
              state.currentLocation === spot.id ? 'border-gold-400 ring-1 ring-gold-400' : ''
            }`}
          >
            <div className="text-2xl mb-1">{spot.icon}</div>
            <div className="text-xs font-heading">{spot.name}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{spot.desc}</div>
          </button>
        ))}
      </div>

      {message && <p className="text-xs text-amber-400 text-center">{message}</p>}

      {state.currentLocation === 'town' && (
        <TownPanel
          onHeal={healAll}
          onBuyBall={buyPokeball}
          onBuyPotion={buyPotion}
          onBuyStone={buyEvolutionStone}
        />
      )}

      {state.currentLocation === 'field' && (
        <div className="panel p-4 text-center space-y-3">
          <p className="text-sm text-slate-300">넓은 들판에서 야생 펫과 마주칠 수 있습니다.</p>
          <button
            onClick={() => startBattle('field')}
            className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400"
          >
            탐험하기
          </button>
        </div>
      )}

      {state.currentLocation === 'dungeon' && (
        <div className="panel p-4 text-center space-y-3">
          <p className="text-sm text-slate-300">희귀한 펫이 서식하는 위험한 곳입니다.</p>
          <button
            onClick={() => startBattle('dungeon')}
            className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400"
          >
            깊이 들어가기
          </button>
          <button
            onClick={() => startBattle('boss')}
            className="w-full py-2.5 rounded-lg border border-red-500/40 bg-red-900/25 text-sm hover:bg-red-900/40"
          >
            보스에게 도전
            {nextRegion && <span className="block text-[10px] text-slate-400">승리 시 {nextRegion.name} 개방</span>}
          </button>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-heading text-slate-300">내 팀</h2>
          <span className="text-[10px] text-slate-500">
            테이머 HP {state.player.currentHp}/{tamerMaxHp(state.player.level)}
          </span>
        </div>
        <PetTeam team={state.team} />
      </div>
    </div>
  );
}

function TownPanel({
  onHeal,
  onBuyBall,
  onBuyPotion,
  onBuyStone,
}: {
  onHeal: () => void;
  onBuyBall: (type: PokeballType, qty: number) => boolean;
  onBuyPotion: (qty: number) => boolean;
  onBuyStone: (qty: number) => boolean;
}) {
  const { state } = useGame();
  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">회복 시설</span>
        <button onClick={onHeal} className="px-3 py-1.5 rounded-md bg-emerald-600/80 text-xs hover:bg-emerald-500">
          펫 · 테이머 전체 회복 (무료)
        </button>
      </div>
      <div className="border-t border-white/5 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm">상점</p>
          <p className="text-xs text-gold-300">💰 {state.player.gold.toLocaleString()}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.values(POKEBALLS) as (typeof POKEBALLS)[PokeballType][]).map((ball) => (
            <button
              key={ball.id}
              onClick={() => onBuyBall(ball.id, 1)}
              disabled={state.player.gold < ball.cost}
              className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 disabled:opacity-40"
            >
              <span className="truncate">
                {ball.name} ({state.pokeballs[ball.id] ?? 0})
              </span>
              <span className="text-gold-300 shrink-0">{ball.cost}G</span>
            </button>
          ))}
          <button
            onClick={() => onBuyPotion(1)}
            disabled={state.player.gold < 100}
            className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 disabled:opacity-40"
          >
            <span>회복 포션 ({state.potions})</span>
            <span className="text-gold-300">100G</span>
          </button>
          <button
            onClick={() => onBuyStone(1)}
            disabled={state.player.gold < 1200}
            className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 disabled:opacity-40"
          >
            <span>진화석 ({state.evolutionStones})</span>
            <span className="text-gold-300">1200G</span>
          </button>
        </div>
      </div>
    </div>
  );
}
