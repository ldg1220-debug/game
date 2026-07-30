import { useGame } from '../contexts/GameContext';
import { PetSprite } from '../components/PetSprite';
import { getRegion, getShape, isEvolvedForm, REGIONS } from '../lib/petData';
import { growthTierLabel } from '../lib/petUtils';

export default function Pokedex() {
  const { state } = useGame();
  const caughtCount = state.pokedex.filter((e) => e.caught).length;
  const total = state.pokedex.length;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">포켓덱스</h1>
      <div className="panel p-3 text-center">
        <p className="text-sm">
          도감 완성도: <span className="text-gold-300 font-semibold">{caughtCount}</span> / {total}
        </p>
        <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden mt-2">
          <div className="h-full bg-gold-400 transition-all" style={{ width: `${(caughtCount / total) * 100}%` }} />
        </div>
      </div>

      {REGIONS.map((region) => {
        const entries = state.pokedex.filter((e) => getShape(e.shapeId).region === region.id);
        if (entries.length === 0) return null;
        const locked = !state.unlockedRegionIds.includes(region.id);
        return (
          <div key={region.id}>
            <h2 className="text-sm font-heading text-slate-300 mb-2">
              {getRegion(region.id).name}
              {locked && <span className="text-[10px] text-slate-600 ml-2">미개방</span>}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {entries.map((entry) => {
                const shape = getShape(entry.shapeId);
                return (
                  <div key={entry.shapeId} className="panel p-2 text-center">
                    <div className="flex justify-center">
                      <PetSprite
                        shapeId={entry.shapeId}
                        element={shape.elementBias[0]}
                        size={52}
                        silhouette={!entry.caught}
                      />
                    </div>
                    <p className={`text-[11px] mt-1 truncate ${entry.caught ? '' : 'text-slate-600'}`}>
                      {entry.caught ? shape.name : '???'}
                    </p>
                    {entry.caught ? (
                      <>
                        <p className="text-[10px] text-slate-500">×{entry.count}</p>
                        <p className="text-[9px] text-gold-300/80">
                          최고 {growthTierLabel(entry.bestGrowthRate)}
                        </p>
                      </>
                    ) : (
                      <p className="text-[9px] text-slate-700">
                        {isEvolvedForm(entry.shapeId) ? '진화형' : shape.rarity === 'boss' ? '보스' : ''}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
