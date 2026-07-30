import { useGame } from '../contexts/GameContext';
import { ElementBadge } from '../components/ElementBadge';
import { PetSprite } from '../components/PetSprite';
import { getShape } from '../lib/petData';

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
          <div className="h-full bg-gold-400" style={{ width: `${(caughtCount / total) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {state.pokedex.map((entry) => {
          const shape = getShape(entry.shapeId);
          return (
            <div key={`${entry.shapeId}-${entry.elementPrimary}`} className="panel p-2 text-center">
              <div className="flex justify-center">
                <PetSprite
                  shapeId={entry.shapeId}
                  element={entry.elementPrimary}
                  size={52}
                  silhouette={!entry.caught}
                />
              </div>
              <div className="flex justify-center mt-0.5">
                {entry.caught ? (
                  <ElementBadge element={entry.elementPrimary} small />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-ink-700" />
                )}
              </div>
              <p className={`text-[11px] mt-1 truncate ${entry.caught ? '' : 'text-slate-600'}`}>
                {entry.caught ? shape.name : '???'}
              </p>
              <p className="text-[10px] text-slate-500">{entry.caught ? `x${entry.count}` : ''}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
