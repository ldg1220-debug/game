import type { PetInstance } from '../lib/gameTypes';
import { getShape } from '../lib/petData';
import { getMaxHp } from '../lib/petUtils';
import { ElementBadge } from './ElementBadge';

export function PetTeam({
  team,
  activeId,
  onSelect,
}: {
  team: PetInstance[];
  activeId?: string;
  onSelect?: (pet: PetInstance) => void;
}) {
  if (team.length === 0) {
    return <div className="text-sm text-slate-500 panel p-4 text-center">팀에 펫이 없습니다.</div>;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {team.map((pet) => {
        const shape = getShape(pet.shapeId);
        const maxHp = getMaxHp(pet);
        const hpPct = Math.max(0, Math.round((pet.currentHp / maxHp) * 100));
        const fainted = pet.currentHp <= 0;
        return (
          <button
            key={pet.id}
            onClick={() => onSelect?.(pet)}
            disabled={!onSelect || fainted}
            className={`panel shrink-0 w-24 p-2 text-center ${activeId === pet.id ? 'border-gold-400 ring-1 ring-gold-400' : ''} ${
              fainted ? 'opacity-40' : ''
            }`}
          >
            <div className="flex justify-center gap-0.5 mb-1">
              <ElementBadge element={pet.elementPrimary} small />
              {pet.elementSecondary && <ElementBadge element={pet.elementSecondary} small />}
            </div>
            <div className="text-xs truncate">{pet.nickname || shape.name}</div>
            <div className="text-[10px] text-slate-400">Lv.{pet.level}</div>
            <div className="h-1 rounded-full bg-ink-700 overflow-hidden mt-1">
              <div
                className={`h-full ${hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
