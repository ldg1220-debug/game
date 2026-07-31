import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useGame } from '../contexts/GameContext';
import { useEncounter } from '../contexts/EncounterContext';
import { BattleArena } from '../components/BattleArena';
import { PetArt } from '../components/PetArt';
import { StatusBadge } from '../components/ElementBadge';
import {
  chooseEnemyAction,
  executeTurn,
  getCombatantSkills,
  initializeBattle,
  petToCombatant,
  playerFront,
  tamerToCombatant,
  type BattleAction,
  type BattleState,
} from '../lib/battleEngine';
import { attemptCapture, POKEBALLS } from '../lib/captureEngine';
import {
  dominantElement,
  ELEMENT_LABEL,
  formatElementPoints,
  type Element,
  type PetInstance,
  type PokeballType,
} from '../lib/gameTypes';
import { elementAffinity, skillAffinity } from '../lib/typeChart';
import { getShape } from '../lib/petData';
import { getSkill } from '../lib/skillData';
import { audio } from '../lib/audio';
import type { AiLevel } from '../lib/battleEngine';
import type { BattlePhase } from '../components/BattleArena';

type Mode = 'battle' | 'switching' | 'capturing' | 'result';

export default function BattleScreen() {
  const {
    state,
    syncBattleResult,
    awardBattleRewards,
    addCapturedPet,
    spendGold,
    healAll,
    consumePokeball,
    adjustPvpRanking,
    unlockRegion,
  } = useGame();
  const { encounter, clearEncounter } = useEncounter();
  const [, navigate] = useLocation();

  const [battle, setBattle] = useState<BattleState | null>(null);
  const [mode, setMode] = useState<Mode>('battle');
  const [resultText, setResultText] = useState('');
  const [captured, setCaptured] = useState<PetInstance | null>(null);
  // 연출이 재생되는 동안 입력을 막는다
  const [busy, setBusy] = useState(false);
  const [lastSkill, setLastSkill] = useState<Element>('none');
  // 가이드 4.5: 공격 연출 → 임팩트(데미지 표시) → 대기
  const [phase, setPhase] = useState<BattlePhase>('idle');
  const settled = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  // 야생 펫 원본을 보관해 포획 시 그대로 넘긴다
  const wildRef = useRef<PetInstance[]>([]);

  useEffect(() => {
    if (!encounter) {
      navigate('/explore');
      return;
    }
    wildRef.current = encounter.enemyTeam;
    setBattle(
      initializeBattle(
        state.team.map(petToCombatant),
        encounter.enemyTeam.map(petToCombatant),
        tamerToCombatant(state.player.name, state.player.level, state.player.currentHp),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [battle?.log.length]);

  // 전투 BGM. 보스는 별도 트랙.
  useEffect(() => {
    if (!encounter) return;
    audio.playBGM(encounter.source === 'boss' ? 'boss' : 'battle');
    return () => audio.stopBGM();
  }, [encounter]);

  /** 지역 진행도와 보스 여부로 AI 난이도를 정한다 (가이드 4.4) */
  const aiLevel: AiLevel =
    encounter?.source === 'boss' || encounter?.source === 'pvp'
      ? 'hard'
      : state.unlockedRegionIds.length > 1
        ? 'normal'
        : state.player.level < 5
          ? 'easy'
          : 'normal';

  /** 이번 턴 효과에 맞춰 효과음을 낸다 */
  const playTurnSounds = (next: BattleState, playerSkillId?: string) => {
    const fx = next.effects;
    if (fx.some((e) => e.kind === 'crit')) audio.critical();
    else if (fx.some((e) => e.effectiveness === 'super')) audio.superEffective();
    if (fx.some((e) => e.kind === 'status')) audio.status();
    if (playerSkillId) audio.attack(getSkill(playerSkillId).element);
    else if (fx.some((e) => e.kind === 'hit')) audio.hurt();
  };

  if (!encounter || !battle) {
    return <div className="p-4 text-center text-slate-400">전투를 준비하는 중...</div>;
  }

  const front = playerFront(battle);
  const enemy = battle.enemyTeam[battle.enemyActiveIndex];
  const benchAvailable = battle.playerTeam.some((c) => c.hp > 0 && c.id !== front.id);

  const persist = (b: BattleState) => {
    const hpMap: Record<string, number> = {};
    b.playerTeam.forEach((c) => c.petId && (hpMap[c.petId] = c.hp));
    syncBattleResult(hpMap, b.tamer.hp);
  };

  const settle = (b: BattleState) => {
    if (settled.current) return;
    settled.current = true;
    persist(b);

    if (b.status === 'won') {
      const survivors = b.playerTeam.filter((c) => c.hp > 0 && c.petId).map((c) => c.petId!);
      const leveled = awardBattleRewards(survivors, encounter.goldReward, encounter.expReward);
      if (encounter.source === 'pvp') adjustPvpRanking(20);
      if (encounter.source === 'boss' && encounter.unlocksRegionId) {
        unlockRegion(encounter.unlocksRegionId);
      }
      let text = `승리! 골드 +${encounter.goldReward}, 경험치 +${encounter.expReward}`;
      if (leveled.length > 0) text += ` · 레벨업!`;
      if (encounter.source === 'boss' && encounter.unlocksRegionId) {
        text += ' 새로운 지역이 열렸습니다!';
      }
      setResultText(text);
    } else if (b.status === 'lost') {
      if (encounter.source === 'pvp') {
        adjustPvpRanking(-10);
        healAll();
        setResultText('아쉽게 패배했습니다. 팀을 회복했습니다.');
      } else {
        const penalty = Math.min(state.player.gold, Math.round(state.player.gold * 0.1));
        spendGold(penalty);
        healAll();
        setResultText(`모두 쓰러져 마을로 돌아왔습니다. 골드 -${penalty}`);
      }
    } else {
      setResultText('무사히 도망쳤습니다.');
    }
    setMode('result');
  };

  const runTurn = (action: BattleAction) => {
    if (busy) return;
    const next = executeTurn(battle, action, chooseEnemyAction(battle, aiLevel));
    setBattle(next);
    playTurnSounds(next, action.type === 'attack' ? action.skillId : undefined);
    setLastSkill(action.type === 'attack' ? getSkill(action.skillId).element : 'none');

    // 공격 모션(380ms) → 임팩트·데미지(520ms) 순으로 재생한다
    setBusy(true);
    setPhase('attack');
    window.setTimeout(() => setPhase('impact'), 380);

    if (next.status !== 'ongoing') {
      window.setTimeout(() => setPhase('idle'), 900);
      window.setTimeout(() => setBusy(false), 900);
    } else {
      window.setTimeout(() => setPhase('idle'), 900);
      window.setTimeout(() => setBusy(false), 900);
    }

    if (next.status !== 'ongoing') {
      // 승패 연출(victory/faint)을 보고 나서 결과 화면으로 넘어간다
      if (next.status === 'won') audio.victory();
      else if (next.status === 'lost') audio.defeat();
      window.setTimeout(() => settle(next), 1400);
    }
  };

  const handleCapture = (ballType: PokeballType) => {
    if ((state.pokeballs[ballType] ?? 0) <= 0) return;
    consumePokeball(ballType);

    const wild = wildRef.current[battle.enemyActiveIndex];
    const { success, rate } = attemptCapture(
      {
        shapeId: enemy.shapeId!,
        level: enemy.level,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        status: enemy.status?.effect ?? null,
      },
      POKEBALLS[ballType],
      state.player.level,
    );

    if (success) {
      settled.current = true;
      audio.capture();
      persist(battle);
      const caught: PetInstance = { ...wild, currentHp: enemy.hp };
      addCapturedPet(caught);
      setCaptured(caught);
      setResultText(`${getShape(caught.shapeId).name}을(를) 포획했습니다! (성공률 ${Math.round(rate * 100)}%)`);
      setMode('result');
      return;
    }

    setMode('battle');
    const next = executeTurn(battle, { type: 'wait' }, chooseEnemyAction(battle, aiLevel));
    next.log.push(`포획 실패... (성공률 ${Math.round(rate * 100)}%)`);
    setBattle(next);
    playTurnSounds(next);
    if (next.status !== 'ongoing') settle(next);
  };

  const exit = () => {
    clearEncounter();
    navigate(encounter.source === 'pvp' ? '/pvp' : '/explore');
  };

  if (mode === 'result') {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="panel p-6 text-center space-y-4">
          {captured && (
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl bg-ink-800/60 border border-gold-500/30 p-2">
                <PetArt
                  shapeId={captured.shapeId}
                  element={dominantElement(captured.elementPoints)}
                  size={104}
                  pose="victory"
                  seed={captured.shapeId}
                />
              </div>
              <p className="text-xs text-gold-300">
                성장률 {captured.averageGrowthRate.toFixed(3)}x · 원소{' '}
                {Object.entries(captured.elementPoints)
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => `${ELEMENT_LABEL[k as keyof typeof ELEMENT_LABEL]}${v}`)
                  .join(' ')}
              </p>
            </div>
          )}
          <p className="text-sm">{resultText}</p>
          <button
            onClick={exit}
            className="w-full py-3 rounded-lg bg-gold-500 text-ink-950 font-heading font-semibold hover:bg-gold-400"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-3">
      <BattleArena
        player={front}
        enemy={enemy}
        effects={battle.effects}
        turn={battle.turn}
        regionId={encounter.source === 'pvp' ? 'plains' : state.currentRegionId}
        playerSkillElement={lastSkill}
        outcome={battle.status === 'won' ? 'won' : battle.status === 'lost' ? 'lost' : null}
        phase={phase}
      />

      <div ref={logRef} className="panel p-2 h-24 overflow-y-auto text-xs space-y-1 text-slate-300">
        {battle.log.slice(-30).map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {mode === 'battle' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {getCombatantSkills(front).map((skill) => {
              // 스킬을 고르기 전에 상성 결과를 미리 보여준다
              const mult =
                skill.element === 'none'
                  ? elementAffinity(front.elementPoints, enemy.elementPoints)
                  : skillAffinity(skill.element, enemy.elementPoints);
              const tag =
                mult >= 1.5 ? { text: '효과 굉장', cls: 'text-emerald-400' }
                : mult >= 1.15 ? { text: '유리', cls: 'text-emerald-500/80' }
                : mult <= 0.75 ? { text: '효과 미미', cls: 'text-red-400' }
                : mult <= 0.9 ? { text: '불리', cls: 'text-red-400/70' }
                : null;
              return (
                <button
                  key={skill.id}
                  onClick={() => runTurn({ type: 'attack', skillId: skill.id })}
                  disabled={busy}
                  className="panel py-2 px-2 text-xs hover:border-gold-400/60 text-left btn-press"
                  title={skill.description}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate">{skill.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {skill.element === 'none' ? '무' : ELEMENT_LABEL[skill.element]}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
                    <span>
                      위력 {skill.power}
                      {skill.inflicts && ' · 상태'}
                    </span>
                    {tag && <span className={`${tag.cls} font-semibold shrink-0`}>{tag.text}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => runTurn({ type: 'defend' })} disabled={busy} className="panel py-2 text-xs hover:border-gold-400/60 btn-press">
              방어
            </button>
            <button
              onClick={() => setMode('switching')}
              disabled={!benchAvailable || busy}
              className="panel py-2 text-xs hover:border-gold-400/60 disabled:opacity-30"
            >
              교체
            </button>
            <button
              onClick={() => runTurn({ type: 'tamer' })}
              disabled={battle.tamerCooldown > 0 || battle.tamer.hp <= 0 || busy}
              className="panel py-2 text-xs hover:border-gold-400/60 disabled:opacity-30"
              title="테이머가 직접 공격합니다"
            >
              테이머
              {battle.tamerCooldown > 0 && (
                <span className="block text-[9px] text-slate-500">{battle.tamerCooldown}턴</span>
              )}
            </button>
            {encounter.canCapture ? (
              <button onClick={() => setMode('capturing')} disabled={busy} className="panel py-2 text-xs hover:border-gold-400/60 btn-press">
                포획
              </button>
            ) : (
              <button onClick={() => runTurn({ type: 'flee' })} disabled={busy} className="panel py-2 text-xs hover:border-gold-400/60 btn-press">
                도망
              </button>
            )}
          </div>

          {encounter.canCapture && (
            <button
              onClick={() => runTurn({ type: 'flee' })}
              disabled={busy}
              className="w-full panel py-2 text-xs hover:border-gold-400/60 text-slate-400 btn-press"
            >
              도망치기
            </button>
          )}

          <div className="panel px-2 py-1.5 flex items-center justify-between text-[10px] text-slate-500 flex-wrap gap-1">
            <span>
              테이머 HP {battle.tamer.hp}/{battle.tamer.maxHp}
            </span>
            <span>
              상대 {getShape(enemy.shapeId!).name} · {formatElementPoints(enemy.elementPoints)}
            </span>
            {enemy.status && <StatusBadge effect={enemy.status.effect} small />}
            {front.status && (
              <span className="flex items-center gap-1">
                내 펫 <StatusBadge effect={front.status.effect} small />
              </span>
            )}
          </div>
        </div>
      )}

      {mode === 'switching' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">교체할 펫을 선택하세요</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {battle.playerTeam.map((c, index) => (
              <button
                key={c.id}
                disabled={c.hp <= 0 || c.id === front.id}
                onClick={() => {
                  setMode('battle');
                  runTurn({ type: 'switch', index });
                }}
                className="panel shrink-0 w-24 p-2 text-center disabled:opacity-30"
              >
                <div className="flex justify-center">
                  <PetArt shapeId={c.shapeId!} element={dominantElement(c.elementPoints)} size={56} seed={c.shapeId!} animated={false} />
                </div>
                <div className="text-[11px] truncate">{getShape(c.shapeId!).name}</div>
                <div className="text-[10px] text-slate-400">
                  {c.hp}/{c.maxHp}
                </div>
              </button>
            ))}
          </div>
          <button onClick={() => setMode('battle')} className="text-xs text-slate-500 underline">
            취소
          </button>
        </div>
      )}

      {mode === 'capturing' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            상대 HP가 낮을수록, 상태이상일수록 포획률이 올라갑니다.
          </p>
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
