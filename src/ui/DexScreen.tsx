import petsJson from '../data/pets.json';
import type { PetSpecies, Rarity } from '../engine/types';
import { entryState, summarize } from '../game/dex';
import { useGame } from '../game/store';

/**
 * 도감.
 *
 * 못 잡은 종도 자리를 차지한다. 빈칸이 보여야 다시 나갈 이유가 생긴다 —
 * 잡은 것만 보여주는 도감은 성취 기록일 뿐 목표가 되지 못한다.
 */

const SPECIES = petsJson as PetSpecies[];

const RARITY_LABEL: Record<Rarity, string> = {
  common: '흔함',
  uncommon: '드묾',
  rare: '희귀',
  epic: '전설',
};
const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8e8e99',
  uncommon: '#6bbf6b',
  rare: '#5a8fd6',
  epic: '#c98fe0',
};
const ELEMENT_LABEL = { earth: '지', water: '수', fire: '화', wind: '풍' } as const;

export function DexScreen() {
  const dex = useGame((s) => s.dex);
  const close = useGame((s) => s.closeScreen);
  const sum = summarize(dex, SPECIES);

  return (
    <div className="overlay">
      <div className="card" style={{ width: 'min(760px, 95%)', textAlign: 'left' }}>
        <div className="row spread" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>도감</h2>
          <button className="small" onClick={close}>
            닫기 <kbd>Esc</kbd>
          </button>
        </div>

        <div className="row spread small" style={{ marginBottom: 8 }}>
          <span className="muted">
            포획 {sum.caught} / {sum.total} · 조우 {sum.seen}
          </span>
          <span className="tiny muted">
            {(['common', 'uncommon', 'rare', 'epic'] as Rarity[]).map((r) => (
              <span key={r} style={{ marginLeft: 10, color: RARITY_COLOR[r] }}>
                {RARITY_LABEL[r]} {sum.byRarity[r].caught}/{sum.byRarity[r].total}
              </span>
            ))}
          </span>
        </div>

        <div
          className="log"
          style={{ height: 320, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 6 }}
        >
          {SPECIES.map((sp) => {
            const st = entryState(dex, sp.id);
            return (
              <div
                key={sp.id}
                className="unit"
                style={{ minWidth: 0, opacity: st === 'unknown' ? 0.35 : 1 }}
              >
                <div className="name">
                  <span>{st === 'unknown' ? '???' : sp.name}</span>
                  <span className="tiny" style={{ color: RARITY_COLOR[sp.rarity] }}>
                    {RARITY_LABEL[sp.rarity]}
                  </span>
                </div>
                <div className="tiny muted" style={{ marginTop: 3 }}>
                  {st === 'unknown' ? (
                    '아직 만나지 못했다'
                  ) : (
                    <>
                      {ELEMENT_LABEL[sp.element.primary]}
                      {sp.element.secondary ? `/${ELEMENT_LABEL[sp.element.secondary]}` : ''} ·{' '}
                      <span style={{ color: st === 'caught' ? 'var(--ok)' : 'var(--gold)' }}>
                        {st === 'caught' ? '포획' : '조우'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
