import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { PetTeam } from '../components/PetTeam';
import { FieldMap } from '../components/FieldMap';
import type { PokeballType } from '../lib/gameTypes';
import { getRegion, REGIONS } from '../lib/petData';
import { getRegionMap, treasureLoot, type MapObject } from '../lib/mapData';
import {
  battleRewards,
  rollBossEncounter,
  rollDungeonEncounter,
  rollFieldEncounter,
} from '../lib/encounterEngine';
import { POKEBALLS } from '../lib/captureEngine';
import { tamerMaxHp } from '../lib/petUtils';
import { audio } from '../lib/audio';

type Panel = 'field' | 'town' | 'dungeon';

export default function ExploreScreen() {
  const {
    state,
    setRegion,
    healAll,
    buyPokeball,
    buyPotion,
    buyEvolutionStone,
    setFieldPos,
    openTreasure,
  } = useGame();
  const { startEncounter } = useEncounter();
  const [, navigate] = useLocation();

  const [panel, setPanel] = useState<Panel>('field');
  const [dialog, setDialog] = useState<{ title: string; body: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const region = getRegion(state.currentRegionId);
  const regionMap = getRegionMap(state.currentRegionId);
  const nextRegion = REGIONS.find((r) => !state.unlockedRegionIds.includes(r.id));
  const start = state.fieldPos[state.currentRegionId] ?? regionMap.spawn;
  const canFight = state.team.some((p) => p.currentHp > 0) || state.player.currentHp > 0;

  useEffect(() => {
    audio.playBGM(state.currentRegionId);
    return () => audio.stopBGM();
  }, [state.currentRegionId]);

  const goBattle = useCallback(
    (kind: 'field' | 'dungeon' | 'boss') => {
      if (!canFight) {
        setMessage('모두 지쳐 있습니다. 마을에서 회복하세요!');
        return;
      }
      setMessage(null);

      if (kind === 'boss') {
        const boss = rollBossEncounter(state.currentRegionId, state.player.level);
        if (!boss) return;
        const r = battleRewards([boss]);
        startEncounter({
          enemyTeam: [boss],
          source: 'boss',
          canCapture: true,
          goldReward: r.gold * 2,
          expReward: r.exp * 2,
          unlocksRegionId: nextRegion?.id,
        });
      } else {
        const enemy =
          kind === 'dungeon'
            ? rollDungeonEncounter(state.currentRegionId, state.player.level)
            : rollFieldEncounter(state.currentRegionId, state.player.level);
        const r = battleRewards([enemy]);
        startEncounter({
          enemyTeam: [enemy],
          source: kind,
          canCapture: true,
          goldReward: r.gold,
          expReward: r.exp,
        });
      }
      navigate('/battle');
    },
    [canFight, state.currentRegionId, state.player.level, nextRegion, startEncounter, navigate],
  );

  const handleInteract = useCallback(
    (obj: MapObject) => {
      audio.click();
      if (obj.kind === 'treasure') {
        const index = Number(obj.id.split('-').pop() ?? 0);
        const loot = treasureLoot(index + regionMap.seed);
        openTreasure(obj.id, loot);
        audio.treasure();
        setDialog({ title: '보물상자', body: loot.message });
      } else if (obj.kind === 'npc') {
        setDialog({ title: '주민', body: obj.message ?? '...' });
      } else if (obj.kind === 'town') {
        setPanel('town');
      } else if (obj.kind === 'dungeon') {
        setPanel('dungeon');
      }
    },
    [openTreasure, regionMap.seed],
  );

  const treasuresLeft =
    regionMap.treasureCount -
    state.openedTreasures.filter((id) => id.startsWith(`${state.currentRegionId}-treasure`)).length;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-heading text-gold-400">{region.name}</h1>
        <span className="text-[10px] text-slate-500">
          권장 Lv.{region.levelRange[0]}~{region.levelRange[1]} · {regionMap.cols * 32}×{regionMap.rows * 32}px
        </span>
      </div>

      {state.unlockedRegionIds.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {REGIONS.filter((r) => state.unlockedRegionIds.includes(r.id)).map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setRegion(r.id);
                setPanel('field');
              }}
              className={`flex-1 min-w-[80px] py-2 rounded-lg text-xs btn-press ${
                r.id === state.currentRegionId ? 'bg-gold-500 text-ink-950 font-semibold' : 'panel'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      <FieldMap
        regionId={state.currentRegionId}
        start={start}
        openedTreasures={state.openedTreasures}
        onMove={(p) => setFieldPos(state.currentRegionId, p)}
        onEncounter={() => goBattle('field')}
        onInteract={handleInteract}
        paused={!!dialog || panel !== 'field'}
      />

      <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
        <span>수풀을 걸으면 야생 펫이 나타납니다</span>
        <span>남은 보물 {Math.max(0, treasuresLeft)}개</span>
      </div>

      {message && <p className="text-xs text-amber-400 text-center">{message}</p>}

      {dialog && (
        <div className="panel p-4 space-y-3 page-enter">
          <p className="text-xs text-gold-400 font-heading">{dialog.title}</p>
          <p className="text-sm text-slate-200">{dialog.body}</p>
          <button
            onClick={() => setDialog(null)}
            className="w-full py-2 rounded-lg bg-gold-500 text-ink-950 text-sm font-semibold btn-press"
          >
            닫기
          </button>
        </div>
      )}

      {panel === 'town' && (
        <TownPanel
          onHeal={healAll}
          onBuyBall={buyPokeball}
          onBuyPotion={buyPotion}
          onBuyStone={buyEvolutionStone}
          onClose={() => setPanel('field')}
        />
      )}

      {panel === 'dungeon' && (
        <div className="panel p-4 space-y-3 page-enter">
          <div className="flex items-center justify-between">
            <p className="text-sm font-heading text-gold-400">{region.dungeonName}</p>
            <button onClick={() => setPanel('field')} className="text-xs text-slate-400">
              나가기 ✕
            </button>
          </div>
          <p className="text-xs text-slate-400">희귀한 펫이 서식하는 위험한 곳입니다.</p>
          <button
            onClick={() => goBattle('dungeon')}
            className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold btn-press"
          >
            깊이 들어가기
          </button>
          <button
            onClick={() => goBattle('boss')}
            className="w-full py-2.5 rounded-lg border border-red-500/40 bg-red-900/25 text-sm hover:bg-red-900/40 btn-press"
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
  onClose,
}: {
  onHeal: () => void;
  onBuyBall: (type: PokeballType, qty: number) => boolean;
  onBuyPotion: (qty: number) => boolean;
  onBuyStone: (qty: number) => boolean;
  onClose: () => void;
}) {
  const { state } = useGame();
  const region = getRegion(state.currentRegionId);

  return (
    <div className="panel p-4 space-y-3 page-enter">
      <div className="flex items-center justify-between">
        <span className="text-sm font-heading text-gold-400">{region.townName}</span>
        <button onClick={onClose} className="text-xs text-slate-400">
          나가기 ✕
        </button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">회복 시설</span>
        <button
          onClick={() => {
            onHeal();
            audio.fanfare();
          }}
          className="px-3 py-1.5 rounded-md bg-emerald-600 text-xs hover:bg-emerald-500 btn-press"
        >
          전체 회복 (무료)
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
              onClick={() => {
                if (onBuyBall(ball.id, 1)) audio.click();
              }}
              disabled={state.player.gold < ball.cost}
              className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 disabled:opacity-40 btn-press"
            >
              <span className="truncate">
                {ball.name} ({state.pokeballs[ball.id] ?? 0})
              </span>
              <span className="text-gold-300 shrink-0">{ball.cost}G</span>
            </button>
          ))}
          <button
            onClick={() => {
              if (onBuyPotion(1)) audio.click();
            }}
            disabled={state.player.gold < 100}
            className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 disabled:opacity-40 btn-press"
          >
            <span>회복 포션 ({state.potions})</span>
            <span className="text-gold-300">100G</span>
          </button>
          <button
            onClick={() => {
              if (onBuyStone(1)) audio.click();
            }}
            disabled={state.player.gold < 1200}
            className="panel px-2 py-2 text-xs flex items-center justify-between hover:border-gold-400/60 disabled:opacity-40 btn-press"
          >
            <span>진화석 ({state.evolutionStones})</span>
            <span className="text-gold-300">1200G</span>
          </button>
        </div>
      </div>
    </div>
  );
}
