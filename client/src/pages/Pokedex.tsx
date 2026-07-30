import { useMemo, useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { PetSprite } from '../components/PetSprite';
import { PetSprite3D } from '../components/PetSprite3D';
import { getRegion, getShape, isEvolvedForm, REGIONS } from '../lib/petData';
import { growthTierLabel } from '../lib/petUtils';
import { CORE_ELEMENTS, ELEMENT_LABEL, type CoreElement } from '../lib/gameTypes';

type Filter = 'all' | CoreElement | 'caught' | 'uncaught';

export default function Pokedex() {
  const { state } = useGame();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const caughtCount = state.pokedex.filter((e) => e.caught).length;
  const total = state.pokedex.length;
  const completion = total > 0 ? (caughtCount / total) * 100 : 0;

  const visible = useMemo(() => {
    const term = search.trim();
    return state.pokedex.filter((entry) => {
      const shape = getShape(entry.shapeId);
      if (term && !(entry.caught && shape.name.includes(term))) return false;
      if (filter === 'caught') return entry.caught;
      if (filter === 'uncaught') return !entry.caught;
      if (filter !== 'all' && shape.elementBias[0] !== filter) return false;
      return true;
    });
  }, [state.pokedex, search, filter]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: '전체' },
    ...CORE_ELEMENTS.map((e) => ({ id: e as Filter, label: ELEMENT_LABEL[e] })),
    { id: 'caught', label: '포획' },
    { id: 'uncaught', label: '미포획' },
  ];

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 page-enter">
      <h1 className="text-lg font-heading text-gold-400">포켓덱스</h1>

      <div className="panel p-3 text-center">
        <p className="text-sm">
          도감 완성도 <span className="text-gold-300 font-semibold">{completion.toFixed(1)}%</span>
        </p>
        <div
          className="h-1.5 rounded-full bg-ink-700 overflow-hidden mt-2"
          role="progressbar"
          aria-label="도감 완성도"
          aria-valuenow={caughtCount}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div className="h-full bg-gold-400 transition-all" style={{ width: `${completion}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          {caughtCount} / {total}종 포획
        </p>
      </div>

      <div className="space-y-2">
        <label className="sr-only" htmlFor="dex-search">
          펫 이름 검색
        </label>
        <input
          id="dex-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="펫 이름 검색..."
          className="w-full px-3 py-2 rounded-lg bg-ink-800 border border-gold-500/25 text-sm placeholder:text-slate-500 focus:border-gold-400 outline-none"
        />
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="도감 필터">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`px-2.5 py-1 rounded-md text-xs btn-press ${
                filter === f.id ? 'bg-gold-500 text-ink-950 font-semibold' : 'panel text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {REGIONS.map((region) => {
        const entries = visible.filter((e) => getShape(e.shapeId).region === region.id);
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
                      {/* 미포획은 실루엣이라 평면 SVG가 맞고, 포획한 종만 3D로 보여준다 */}
                      {entry.caught ? (
                        <PetSprite3D
                          shapeId={entry.shapeId}
                          element={shape.elementBias[0]}
                          size={72}
                          seed={entry.shapeId}
                          animated={false}
                        />
                      ) : (
                        <PetSprite
                          shapeId={entry.shapeId}
                          element={shape.elementBias[0]}
                          size={52}
                          silhouette
                          label="미포획 펫"
                        />
                      )}
                    </div>
                    <p className={`text-[11px] mt-1 truncate ${entry.caught ? '' : 'text-slate-500'}`}>
                      {entry.caught ? shape.name : '???'}
                    </p>
                    {entry.caught ? (
                      <>
                        <p className="text-[10px] text-slate-400">×{entry.count}</p>
                        <p className="text-[9px] text-gold-300">최고 {growthTierLabel(entry.bestGrowthRate)}</p>
                      </>
                    ) : (
                      <p className="text-[9px] text-slate-600">
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

      {visible.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-10">해당하는 펫이 없습니다.</p>
      )}
    </div>
  );
}
