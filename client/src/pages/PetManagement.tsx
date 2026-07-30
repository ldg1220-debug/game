import { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { PetCard } from '../components/PetCard';
import { ElementBadge } from '../components/ElementBadge';
import { PetSprite } from '../components/PetSprite';
import { getShape } from '../lib/petData';
import { getCurrentAbility, getCurrentStat, getMaxHp, growthTierLabel } from '../lib/petUtils';
import { STAT_KEYS, type PetInstance } from '../lib/gameTypes';

export default function PetManagement() {
  const { state, moveToTeam, moveToBox, releasePet, applyPotionToPet } = useGame();
  const [selected, setSelected] = useState<PetInstance | null>(null);
  const [tab, setTab] = useState<'team' | 'box'>('team');

  const list = tab === 'team' ? state.team : state.box;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-heading text-gold-400">펫 관리</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('team')}
          className={`flex-1 py-2 rounded-lg text-sm ${tab === 'team' ? 'bg-gold-500 text-ink-950' : 'panel'}`}
        >
          팀 ({state.team.length}/5)
        </button>
        <button
          onClick={() => setTab('box')}
          className={`flex-1 py-2 rounded-lg text-sm ${tab === 'box' ? 'bg-gold-500 text-ink-950' : 'panel'}`}
        >
          보관함 ({state.box.length})
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {list.length === 0 && <p className="text-sm text-slate-500 text-center py-8">펫이 없습니다.</p>}
        {list.map((pet) => (
          <PetCard key={pet.id} pet={pet} onClick={() => setSelected(pet)} selected={selected?.id === pet.id} />
        ))}
      </div>

      {selected && (
        <PetDetail
          pet={selected}
          inTeam={tab === 'team'}
          canMoveToTeam={state.team.length < 5}
          potions={state.potions}
          onClose={() => setSelected(null)}
          onMoveToTeam={() => {
            moveToTeam(selected.id);
            setSelected(null);
          }}
          onMoveToBox={() => {
            moveToBox(selected.id);
            setSelected(null);
          }}
          onRelease={() => {
            releasePet(selected.id);
            setSelected(null);
          }}
          onUsePotion={() => applyPotionToPet(selected.id)}
        />
      )}
    </div>
  );
}

function PetDetail({
  pet,
  inTeam,
  canMoveToTeam,
  potions,
  onClose,
  onMoveToTeam,
  onMoveToBox,
  onRelease,
  onUsePotion,
}: {
  pet: PetInstance;
  inTeam: boolean;
  canMoveToTeam: boolean;
  potions: number;
  onClose: () => void;
  onMoveToTeam: () => void;
  onMoveToBox: () => void;
  onRelease: () => void;
  onUsePotion: () => void;
}) {
  const shape = getShape(pet.shapeId);
  const stat = getCurrentStat(pet);
  const ability = getCurrentAbility(pet);
  const maxHp = getMaxHp(pet);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="panel w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-ink-800/60 border border-white/5 p-1">
              <PetSprite shapeId={pet.shapeId} element={pet.elementPrimary} size={72} />
            </div>
            <div>
              <h2 className="font-heading text-lg">{pet.nickname || shape.name}</h2>
              {pet.isLegendary && <p className="text-[10px] text-gold-400">★ 서버 전설 개체</p>}
              <div className="flex gap-1 mt-1">
                <ElementBadge element={pet.elementPrimary} />
                {pet.elementSecondary && <ElementBadge element={pet.elementSecondary} />}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 text-sm shrink-0">
            닫기 ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoRow label="레벨" value={`Lv.${pet.level}`} />
          <InfoRow label="경험치" value={`${pet.experience}`} />
          <InfoRow label="성향" value={pet.nature} />
          <InfoRow label="개성" value={pet.personality} />
          <InfoRow
            label="평균 성장률"
            value={`${growthTierLabel(pet.averageGrowthRate)} (${pet.averageGrowthRate.toFixed(3)}x)`}
          />
          <InfoRow label="HP" value={`${pet.currentHp}/${maxHp}`} />
        </div>

        <div>
          <h3 className="text-xs text-slate-400 mb-1">개체별 성장률 (Stat / 성장률)</h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {STAT_KEYS.map((key) => (
              <div key={key} className="panel px-2 py-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">{key}</span>
                  <span>{stat[key]}</span>
                </div>
                <div className="text-[10px] text-gold-300">{pet.growthRates[key].toFixed(2)}x</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs text-slate-400 mb-1">전투 능력치</h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <InfoRow label="공격력" value={ability.ATK} />
            <InfoRow label="방어력" value={ability.DEF} />
            <InfoRow label="특공" value={ability.SPA} />
            <InfoRow label="특방" value={ability.SPD} />
            <InfoRow label="속도" value={ability.SPE} />
            <InfoRow label="크리티컬" value={`${ability.CRI}%`} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {inTeam ? (
            <button onClick={onMoveToBox} className="px-3 py-2 rounded-lg panel text-xs hover:border-gold-400/60">
              보관함으로 이동
            </button>
          ) : (
            <button
              onClick={onMoveToTeam}
              disabled={!canMoveToTeam}
              className="px-3 py-2 rounded-lg panel text-xs hover:border-gold-400/60 disabled:opacity-30"
            >
              팀으로 이동
            </button>
          )}
          <button
            onClick={onUsePotion}
            disabled={potions <= 0 || pet.currentHp >= maxHp}
            className="px-3 py-2 rounded-lg panel text-xs hover:border-gold-400/60 disabled:opacity-30"
          >
            포션 사용 ({potions})
          </button>
          <button onClick={onRelease} className="px-3 py-2 rounded-lg bg-red-900/50 text-xs hover:bg-red-900/70">
            방생하기
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel px-2 py-1.5 flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
