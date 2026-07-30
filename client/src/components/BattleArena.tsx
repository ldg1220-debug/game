import type { PetInstance } from '../lib/gameTypes';
import { getShape } from '../lib/petData';
import { getMaxHp } from '../lib/petUtils';
import { ElementBadge } from './ElementBadge';

function Battler({ pet, flipped }: { pet: PetInstance; flipped?: boolean }) {
  const shape = getShape(pet.shapeId);
  const maxHp = getMaxHp(pet);
  const hpPct = Math.max(0, Math.round((pet.currentHp / maxHp) * 100));

  return (
    <div className={`flex flex-col gap-1 ${flipped ? 'items-end text-right' : 'items-start'}`}>
      <div className="panel px-3 py-2 min-w-[160px]">
        <div className="flex items-center gap-1.5 justify-between">
          <span className="text-sm font-heading truncate">{pet.nickname || shape.name}</span>
          <span className="text-xs text-slate-400">Lv.{pet.level}</span>
        </div>
        <div className={`flex gap-1 mt-1 ${flipped ? 'justify-end' : ''}`}>
          <ElementBadge element={pet.elementPrimary} small />
          {pet.elementSecondary && <ElementBadge element={pet.elementSecondary} small />}
        </div>
        <div className="mt-1.5">
          <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${hpPct}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {pet.currentHp}/{maxHp}
          </div>
        </div>
      </div>
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl panel ${
          pet.currentHp <= 0 ? 'opacity-30 grayscale' : ''
        }`}
      >
        {shape.rarity === 'boss' ? '🐉' : '🐾'}
      </div>
    </div>
  );
}

export function BattleArena({ player, enemy }: { player: PetInstance; enemy: PetInstance }) {
  return (
    <div className="relative rounded-xl p-4 bg-gradient-to-b from-ink-800/60 to-ink-950/60 border border-gold-500/10 overflow-hidden">
      <div className="flex justify-between items-start">
        <div />
        <Battler pet={enemy} flipped />
      </div>
      <div className="flex justify-between items-end mt-8">
        <Battler pet={player} />
        <div />
      </div>
    </div>
  );
}
