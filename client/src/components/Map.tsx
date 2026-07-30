import type { LocationId } from '../lib/gameTypes';

const SPOTS: { id: LocationId; name: string; desc: string; icon: string }[] = [
  { id: 'town', name: '초록빛 마을', desc: '상점, 회복, 펫 보관소', icon: '🏘️' },
  { id: 'field', name: '푸른 초원', desc: '야생 펫이 출현하는 들판', icon: '🌾' },
  { id: 'dungeon', name: '초원의 동굴', desc: '강력한 펫과 희귀 아이템', icon: '🕳️' },
];

export function Map({
  current,
  onSelect,
}: {
  current: LocationId;
  onSelect: (loc: LocationId) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {SPOTS.map((spot) => (
        <button
          key={spot.id}
          onClick={() => onSelect(spot.id)}
          className={`panel p-3 text-center transition hover:border-gold-400/60 ${
            current === spot.id ? 'border-gold-400 ring-1 ring-gold-400' : ''
          }`}
        >
          <div className="text-2xl mb-1">{spot.icon}</div>
          <div className="text-xs font-heading">{spot.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{spot.desc}</div>
        </button>
      ))}
    </div>
  );
}
