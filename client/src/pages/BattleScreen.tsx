import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { BattleArena } from '../components/BattleArena';
import { PetTeam } from '../components/PetTeam';
import {
  chooseEnemyAction,
  executeTurn,
  getPetMoves,
  initializeBattle,
  type BattleState,
} from '../lib/battleEngine';
import { attemptCapture, POKEBALLS } from '../lib/captureEngine';
import type { PetInstance, PokeballType } from '../lib/gameTypes';

type ScreenMode = 'battle' | 'switching' | 'capturing' | 'result';

export default function BattleScreen() {
  const {
    state,
    awardBattleRewards,
    updatePetHp,
    addCapturedPet,
    spendGold,
    healTeamFull,
    consumePokeball,
    adjustPvpRanking,
  } = useGame();
  const { encounter, clearEncounter } = useEncounter();
  const [, navigate] = useLocation();

  const [battle, setBattle] = useState<BattleState | null>(null);
  const [mode, setMode] = useState<ScreenMode>('battle');
  const [resultText, setResultText] = useState<string>('');
  const [capturedPet, setCapturedPet] = useState<PetInstance | null>(null);

  useEffect(() => {
    if (!encounter) {
      navigate('/explore');
      return;
    }
    const startIndex = state.team.findIndex((p) => p.currentHp > 0);
    const initial = initializeBattle([...state.team], [...encounter.enemyTeam]);
    initial.playerActiveIndex = startIndex === -1 ? 0 : startIndex;
    setBattle(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const player = battle?.playerTeam[battle.playerActiveIndex];
  const enemy = battle?.enemyTeam[battle.enemyActiveIndex];
  const aliveTeammates = useMemo(
    () => battle?.playerTeam.filter((p) => p.currentHp > 0 && p.id !== player?.id) ?? [],
    [battle, player],
  );

  const syncAndFinish = (finalBattle: BattleState, text: string) => {
    finalBattle.playerTeam.forEach((p) => updatePetHp(p.id, p.currentHp));
    setResultText(text);
    setMode('result');
  };

  const finishOnWin = (finalBattle: BattleState) => {
    if (!encounter) return;
    const alive = finalBattle.playerTeam.filter((p) => p.currentHp > 0);
    const share = alive.length > 0 ? Math.ceil(encounter.expReward / alive.length) : 0;
    let leveledNames: string[] = [];
    alive.forEach((p) => {
      const { leveledUp } = awardBattleRewards(p.id, Math.floor(encounter.goldReward / alive.length), share);
      if (leveledUp) leveledNames.push(p.nickname ?? String(p.shapeId));
    });
    const suffix = leveledNames.length > 0 ? ' 레벨업한 펫이 있습니다!' : '';
    if (encounter.source === 'pvp') adjustPvpRanking(20);
    syncAndFinish(finalBattle, `승리했습니다! 골드 +${encounter.goldReward}, 경험치 +${encounter.expReward}${suffix}`);
  };

  const finishOnLose = (finalBattle: BattleState) => {
    finalBattle.playerTeam.forEach((p) => updatePetHp(p.id, p.currentHp));
    if (encounter?.source === 'pvp') {
      adjustPvpRanking(-10);
      healTeamFull();
      setResultText('아쉽게 패배했습니다. 팀을 회복했습니다.');
      setMode('result');
      return;
    }
    const penalty = Math.min(state.player.gold, Math.round(state.player.gold * 0.1));
    spendGold(penalty);
    healTeamFull();
    setResultText(`모든 펫이 쓰러져 마을로 돌아왔습니다. 골드 -${penalty}`);
    setMode('result');
  };

  const runTurn = (playerAction: Parameters<typeof executeTurn>[1]) => {
    if (!battle) return;
    const enemyAction = chooseEnemyAction(battle);
    const next = executeTurn(battle, playerAction, enemyAction);
    setBattle(next);
    if (next.status === 'won') finishOnWin(next);
    else if (next.status === 'lost') finishOnLose(next);
    else if (next.status === 'fled') syncAndFinish(next, '무사히 도망쳤습니다.');
  };

  const handleCapture = (ballType: PokeballType) => {
    if (!battle || !enemy) return;
    const owned = state.pokeballs[ballType] ?? 0;
    if (owned <= 0) return;
    consumePokeball(ballType);

    const { success, rate } = attemptCapture(enemy, POKEBALLS[ballType], state.player.level);

    if (success) {
      addCapturedPet({ ...enemy });
      battle.playerTeam.forEach((p) => updatePetHp(p.id, p.currentHp));
      setCapturedPet(enemy);
      setResultText(`포획 성공! (성공률 ${Math.round(rate * 100)}%)`);
      setMode('result');
      return;
    }

    setMode('battle');
    const enemyAction = chooseEnemyAction(battle);
    const next = executeTurn(battle, { type: 'wait' }, enemyAction);
    next.log.push(`포획 실패... (성공률 ${Math.round(rate * 100)}%)`);
    setBattle(next);
    if (next.status === 'lost') finishOnLose(next);
  };

  const handleExit = () => {
    clearEncounter();
    navigate('/explore');
  };

  if (!encounter || !battle || !player || !enemy) {
    return <div className="p-4 text-center text-slate-400">전투를 준비하는 중...</div>;
  }

  if (mode === 'result') {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="panel p-6 text-center space-y-3">
          {capturedPet && <div className="text-4xl">🎉</div>}
          <p className="text-sm">{resultText}</p>
          <button
            onClick={handleExit}
            className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400"
          >
            탐험으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3">
      <BattleArena player={player} enemy={enemy} />

      <div className="panel p-2 h-24 overflow-y-auto text-xs space-y-1 text-slate-300">
        {battle.log.slice(-8).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {mode === 'battle' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {getPetMoves(player).map((skill) => (
              <button
                key={skill.id}
                onClick={() => runTurn({ type: 'attack', skillId: skill.id })}
                className="panel py-2 text-xs hover:border-gold-400/60"
              >
                {skill.name}
                <span className="block text-[10px] text-slate-500">위력 {skill.power}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => runTurn({ type: 'defend' })} className="panel py-2 text-xs hover:border-gold-400/60">
              방어
            </button>
            <button
              onClick={() => setMode('switching')}
              disabled={aliveTeammates.length === 0}
              className="panel py-2 text-xs hover:border-gold-400/60 disabled:opacity-30"
            >
              교체
            </button>
            {encounter.canCapture ? (
              <button onClick={() => setMode('capturing')} className="panel py-2 text-xs hover:border-gold-400/60">
                포획
              </button>
            ) : (
              <button onClick={() => runTurn({ type: 'flee' })} className="panel py-2 text-xs hover:border-gold-400/60">
                도망
              </button>
            )}
          </div>
          {encounter.canCapture && (
            <button
              onClick={() => runTurn({ type: 'flee' })}
              className="w-full panel py-2 text-xs hover:border-gold-400/60 text-slate-400"
            >
              도망치기
            </button>
          )}
        </div>
      )}

      {mode === 'switching' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">교체할 펫을 선택하세요</p>
          <PetTeam
            team={battle.playerTeam}
            activeId={player.id}
            onSelect={(pet) => {
              const index = battle.playerTeam.findIndex((p) => p.id === pet.id);
              setMode('battle');
              runTurn({ type: 'switch', index });
            }}
          />
          <button onClick={() => setMode('battle')} className="text-xs text-slate-500 underline">
            취소
          </button>
        </div>
      )}

      {mode === 'capturing' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">사용할 포켓볼을 선택하세요</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.values(POKEBALLS) as (typeof POKEBALLS)[PokeballType][]).map((ball) => (
              <button
                key={ball.id}
                onClick={() => handleCapture(ball.id)}
                disabled={(state.pokeballs[ball.id] ?? 0) <= 0}
                className="panel py-2 text-xs hover:border-gold-400/60 disabled:opacity-30"
              >
                {ball.name} ({state.pokeballs[ball.id] ?? 0})
              </button>
            ))}
          </div>
          <button onClick={() => setMode('battle')} className="text-xs text-slate-500 underline">
            취소
          </button>
        </div>
      )}
    </div>
  );
}
