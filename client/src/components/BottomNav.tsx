import { Link, useLocation } from 'wouter';

const NAV_ITEMS = [
  { path: '/', label: '홈', icon: '🏠' },
  { path: '/explore', label: '탐험', icon: '🗺️' },
  { path: '/pets', label: '펫관리', icon: '🐾' },
  { path: '/pokedex', label: '도감', icon: '📖' },
  { path: '/pvp', label: 'PvP', icon: '⚔️' },
  { path: '/settings', label: '설정', icon: '⚙️' },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="sticky bottom-0 left-0 right-0 border-t border-gold-500/20 bg-ink-950/95 backdrop-blur">
      <div className="max-w-lg mx-auto grid grid-cols-6">
        {NAV_ITEMS.map((item) => {
          const active = location === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] transition ${
                active ? 'text-gold-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
