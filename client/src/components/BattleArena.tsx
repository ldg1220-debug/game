import { dominantElement } from '../lib/gameTypes';
import { getShape } from '../lib/petData';
import type { BattleEffect, Combatant } from '../lib/battleEngine';
import { ElementPointsBadge, StatusBadge } from './ElementBadge';
import { PetSprite } from './PetSprite';

function TamerSprite({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden="true">
      <ellipse cx="32" cy="58" rx="16" ry="4" fill="#000" opacity={0.25} />
      <path d="M22 58V38a10 10 0 0 1 20 0v20z" fill="#5b7fb5" />
      <path d="M26 58V40a6 6 0 0 1 12 0v18z" fill="#7d9fd4" opacity={0.5} />
      <path d="M42 40l8 6-3 4-7-6z" fill="#c8a06a" />
      <rect x="47" y="20" width="3.5" height="28" rx="1.5" fill="#8a6a44" transform="rotate(18 48 34)" />
      <path d="M52 18l5 5-6 2z" fill="#d0d4de" />
      <circle cx="32" cy="26" r="10" fill="#e0b48c" />
      <path d="M22 24a10 10 0 0 1 20 0c0-7-4-10-10-10s-10 3-10 10z" fill="#4a3a2c" />
      <path d="M24 20q8-6 16 0-8-3-16 0z" fill="#5c4936" />
      <circle cx="28" cy="27" r="1.7" fill="#1a1526" />
      <circle cx="36" cy="27" r="1.7" fill="#1a1526" />
      <path d="M29 32q3 2 6 0" stroke="#1a1526" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Battler({
  unit,
  flipped,
  effects,
  attacking,
  turnKey,
}: {
  unit: Combatant;
  flipped?: boolean;
  effects: BattleEffect[];
  attacking: boolean;
  turnKey: number;
}) {
  const hpPct = Math.max(0, Math.round((unit.hp / unit.maxHp) * 100));
  const displayName =
    unit.kind === 'tamer' ? unit.name : unit.name || getShape(unit.shapeId!).name;
  const wasHit = effects.some((e) => e.kind === 'hit' || e.kind === 'crit');
  const damage = effects.find((e) => e.amount != null)?.amount;
  const missed = effects.some((e) => e.kind === 'miss');
  const statusApplied = effects.find((e) => e.kind === 'status');

  // 같은 애니메이션을 연속 턴에 다시 재생시키려면 key가 바뀌어야 한다
  const motion = unit.hp <= 0 ? '' : wasHit ? 'animate-hit' : attacking ? 'animate-lunge' : 'animate-idle';

  return (
    <div className={`flex flex-col gap-1 ${flipped ? 'items-end text-right' : 'items-start'}`}>
      <div className="panel px-3 py-2 min-w-[168px]">
        <div className="flex items-center gap-1.5 justify-between">
          <span className="text-sm font-heading truncate">{displayName}</span>
          <span className="text-xs text-slate-400">Lv.{unit.level}</span>
        </div>
        <div className={`flex gap-1 mt-1 items-center ${flipped ? 'justify-end' : ''}`}>
          {unit.kind === 'pet' ? (
            <ElementPointsBadge points={unit.elementPoints} small />
          ) : (
            <span className="text-[10px] text-slate-400">테이머</span>
          )}
          {unit.status && <StatusBadge effect={unit.status.effect} small />}
        </div>
        <div className="mt-1.5">
          <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {unit.hp}/{unit.maxHp}
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          key={`${turnKey}-${motion}`}
          className={`w-24 h-24 rounded-full flex items-center justify-center panel ${
            unit.hp <= 0 ? 'opacity-25 grayscale' : ''
          } ${flipped ? '-scale-x-100' : ''} ${motion}`}
        >
          {unit.kind === 'tamer' ? (
            <TamerSprite size={80} />
          ) : (
            <PetSprite shapeId={unit.shapeId!} element={dominantElement(unit.elementPoints)} size={80} />
          )}
        </div>
        {damage != null && (
          <span
            key={`dmg-${turnKey}`}
            className="absolute -top-1 left-1/2 text-lg font-heading font-bold text-red-400 animate-pop drop-shadow"
          >
            -{damage}
          </span>
        )}
        {missed && (
          <span key={`miss-${turnKey}`} className="absolute -top-1 left-1/2 text-sm font-heading text-slate-300 animate-pop">
            MISS
          </span>
        )}
        {statusApplied && (
          <span
            key={`st-${turnKey}`}
            className="absolute -bottom-1 left-1/2 text-[11px] font-semibold text-purple-300 animate-pop"
          >
            {statusApplied.label}!
          </span>
        )}
      </div>
    </div>
  );
}

const REGION_BACKDROP: Record<string, string> = {
  plains: 'from-emerald-900/30 to-ink-950/70',
  forest: 'from-green-950/50 to-ink-950/80',
  mountain: 'from-stone-700/30 to-ink-950/80',
  volcano: 'from-red-950/45 to-ink-950/85',
  glacier: 'from-sky-900/35 to-ink-950/80',
};

export function BattleArena({
  player,
  enemy,
  effects,
  turn,
  regionId = 'plains',
}: {
  player: Combatant;
  enemy: Combatant;
  effects: BattleEffect[];
  turn: number;
  regionId?: string;
}) {
  const forSide = (side: 'player' | 'enemy') =>
    effects.filter((e) =>
      side === 'player' ? e.side === 'player' || e.side === 'tamer' : e.side === side,
    );

  // 상대가 맞았으면 내가 공격한 것이고, 그 반대도 마찬가지다
  const playerAttacked = forSide('enemy').some((e) => e.kind === 'hit' || e.kind === 'crit');
  const enemyAttacked = forSide('player').some((e) => e.kind === 'hit' || e.kind === 'crit');
  const bigHit = effects.some((e) => e.kind === 'crit');

  return (
    <div
      className={`relative rounded-xl p-4 bg-gradient-to-b ${
        REGION_BACKDROP[regionId] ?? REGION_BACKDROP.plains
      } border border-gold-500/10 overflow-hidden`}
    >
      {bigHit && <div key={`flash-${turn}`} className="absolute inset-0 animate-flash pointer-events-none" />}
      <div className="flex justify-between items-start">
        <div />
        <Battler unit={enemy} flipped effects={forSide('enemy')} attacking={enemyAttacked} turnKey={turn} />
      </div>
      <div className="flex justify-between items-end mt-8">
        <Battler unit={player} effects={forSide('player')} attacking={playerAttacked} turnKey={turn} />
        <div />
      </div>
      <span className="absolute top-2 left-3 text-[10px] text-slate-500">TURN {turn}</span>
    </div>
  );
}
