import { dominantElement, type PetInstance } from '../lib/gameTypes';
import { getShape } from '../lib/petData';
import { getMaxHp, growthTierLabel } from '../lib/petUtils';
import { ElementPointsBadge } from './ElementBadge';
import { PetSprite3D } from './PetSprite3D';

function growthTierClass(avg: number, isLegendary: boolean): string {
  if (isLegendary) return 'text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-pink-300 to-gold-400';
  if (avg >= 1.1) return 'text-gold-400';
  if (avg >= 1.05) return 'text-gold-300';
  if (avg >= 1.0) return 'text-slate-200';
  if (avg >= 0.95) return 'text-slate-400';
  return 'text-slate-500';
}

export function PetCard({
  pet,
  onClick,
  selected,
  compact,
}: {
  pet: PetInstance;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}) {
  const shape = getShape(pet.shapeId);
  const maxHp = getMaxHp(pet);
  const hpPct = Math.round((pet.currentHp / maxHp) * 100);

  return (
    <button
      onClick={onClick}
      className={`panel text-left p-3 w-full transition hover:border-gold-400/60 ${
        selected ? 'border-gold-400 ring-1 ring-gold-400' : ''
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex gap-3">
        <div
          className={`shrink-0 self-start rounded-lg bg-ink-800/60 border border-white/5 ${
            pet.currentHp <= 0 ? 'opacity-30 grayscale' : ''
          }`}
        >
          <PetSprite3D
            shapeId={pet.shapeId}
            element={dominantElement(pet.elementPoints)}
            size={compact ? 52 : 68}
            seed={pet.shapeId}
            animated={false}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-heading text-sm truncate">{pet.nickname || shape.name}</span>
              {pet.isLegendary && <span className="text-[10px] text-gold-400">★</span>}
            </div>
            <span className="text-xs text-slate-400 shrink-0">Lv.{pet.level}</span>
          </div>

          <div className="flex items-center gap-1 mt-1.5">
            <ElementPointsBadge points={pet.elementPoints} small />
            <span
              className={`text-[10px] ml-auto font-semibold ${growthTierClass(pet.averageGrowthRate, pet.isLegendary)}`}
            >
              {growthTierLabel(pet.averageGrowthRate)} ({pet.averageGrowthRate.toFixed(2)}x)
            </span>
          </div>

          <div className="mt-2">
            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
              <span>HP</span>
              <span>
                {pet.currentHp}/{maxHp}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  hpPct > 50 ? 'bg-emerald-500' : hpPct > 20 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.max(0, hpPct)}%` }}
              />
            </div>
          </div>

          {!compact && (
            <div className="mt-2 text-[10px] text-slate-400">
              {shape.name} · {pet.nature} · {pet.personality}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
