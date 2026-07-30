import { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { PetCard } from '../components/PetCard';
import { ElementPointsBadge, ElementPointsBar } from '../components/ElementBadge';
import { PetSprite3D } from '../components/PetSprite3D';
import { getShape } from '../lib/petData';
import {
  availableSkillIds,
  equippedSkillIds,
  evolutionInfo,
  evolutionTarget,
  getCurrentAbility,
  getCurrentStat,
  getMaxHp,
  growthTierLabel,
} from '../lib/petUtils';
import { getSkill } from '../lib/skillData';
import {
  dominantElement,
  ELEMENT_LABEL,
  MAX_SKILL_SLOTS,
  STAT_KEYS,
  formatElementPoints,
  type PetInstance,
} from '../lib/gameTypes';

export default function PetManagement() {
  const { state } = useGame();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'team' | 'box'>('team');

  const list = tab === 'team' ? state.team : state.box;
  // 진화·스킬 변경 후에도 최신 상태를 보도록 id로 다시 찾는다
  const selected = [...state.team, ...state.box].find((p) => p.id === selectedId) ?? null;

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
          <PetCard key={pet.id} pet={pet} onClick={() => setSelectedId(pet.id)} selected={selectedId === pet.id} />
        ))}
      </div>

      {selected && <PetDetail pet={selected} inTeam={state.team.some((p) => p.id === selected.id)} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function PetDetail({ pet, inTeam, onClose }: { pet: PetInstance; inTeam: boolean; onClose: () => void }) {
  const { state, moveToTeam, moveToBox, releasePet, applyPotionToPet, setEquippedSkills, evolve, renamePet } =
    useGame();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(pet.nickname ?? '');
  const [notice, setNotice] = useState<string | null>(null);

  const shape = getShape(pet.shapeId);
  const stat = getCurrentStat(pet);
  const ability = getCurrentAbility(pet);
  const maxHp = getMaxHp(pet);
  const equipped = equippedSkillIds(pet);
  const learned = availableSkillIds(pet);
  const evo = evolutionInfo(pet);
  const canEvolveNow = evolutionTarget(pet) !== null;

  const toggleSkill = (id: string) => {
    if (equipped.includes(id)) {
      if (equipped.length <= 1) {
        setNotice('스킬은 최소 하나는 있어야 합니다.');
        return;
      }
      setEquippedSkills(pet.id, equipped.filter((s) => s !== id));
    } else {
      if (equipped.length >= MAX_SKILL_SLOTS) {
        setNotice(`스킬은 최대 ${MAX_SKILL_SLOTS}개까지 장착할 수 있습니다. 하나를 해제하세요.`);
        return;
      }
      setEquippedSkills(pet.id, [...equipped, id]);
    }
    setNotice(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="panel w-full max-w-lg max-h-[88vh] overflow-y-auto p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl bg-ink-800/60 border border-white/5 p-1 shrink-0">
              <PetSprite3D shapeId={pet.shapeId} element={dominantElement(pet.elementPoints)} size={96} seed={pet.shapeId} />
            </div>
            <div className="min-w-0">
              {renaming ? (
                <div className="flex gap-1">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={12}
                    placeholder={shape.name}
                    className="bg-ink-800 border border-gold-500/30 rounded px-2 py-1 text-sm w-28"
                  />
                  <button
                    onClick={() => {
                      renamePet(pet.id, nameDraft);
                      setRenaming(false);
                    }}
                    className="text-xs px-2 rounded bg-gold-500 text-ink-950"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <h2 className="font-heading text-lg truncate">
                  {pet.nickname || shape.name}
                  <button onClick={() => setRenaming(true)} className="ml-2 text-[10px] text-slate-500 underline">
                    이름
                  </button>
                </h2>
              )}
              <p className="text-[10px] text-slate-500">{shape.name}</p>
              {pet.isLegendary && <p className="text-[10px] text-gold-400">★ 서버 전설 개체</p>}
              <div className="mt-1">
                <ElementPointsBadge points={pet.elementPoints} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 text-sm shrink-0">
            닫기 ✕
          </button>
        </div>

        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>원소 배분</span>
            <span>{formatElementPoints(pet.elementPoints)}</span>
          </div>
          <ElementPointsBar points={pet.elementPoints} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <InfoRow label="레벨" value={`Lv.${pet.level}`} />
          <InfoRow label="경험치" value={pet.experience} />
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

        <div>
          <h3 className="text-xs text-slate-400 mb-1">
            스킬 ({equipped.length}/{MAX_SKILL_SLOTS}) · 눌러서 장착/해제
          </h3>
          <div className="grid grid-cols-1 gap-1.5">
            {learned.map((id) => {
              const skill = getSkill(id);
              const on = equipped.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleSkill(id)}
                  className={`panel px-2 py-1.5 text-left text-xs ${on ? 'border-gold-400/70' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate">
                      {on && <span className="text-gold-400 mr-1">●</span>}
                      {skill.name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {skill.element === 'none' ? '무' : ELEMENT_LABEL[skill.element]} · 위력 {skill.power}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{skill.description}</p>
                </button>
              );
            })}
          </div>
          {shape.learnset.some((l) => l.level > pet.level) && (
            <p className="text-[10px] text-slate-600 mt-1">
              다음 습득: Lv.{shape.learnset.find((l) => l.level > pet.level)!.level}{' '}
              {getSkill(shape.learnset.find((l) => l.level > pet.level)!.skillId).name}
            </p>
          )}
        </div>

        {evo && (
          <div className="panel p-3 space-y-2">
            <div className="flex items-center gap-2">
              <PetSprite3D shapeId={evo.target} element={dominantElement(pet.elementPoints)} size={56} seed={evo.target} animated={false} />
              <div className="text-xs">
                <p className="font-semibold">{getShape(evo.target).name}(으)로 진화</p>
                <p className="text-[10px] text-slate-500">
                  Lv.{evo.requiredLevel} 이상 · 진화석 1개 (보유 {state.evolutionStones})
                </p>
              </div>
            </div>
            <button
              disabled={!canEvolveNow || state.evolutionStones <= 0}
              onClick={() => {
                if (evolve(pet.id)) setNotice('진화했습니다! 성장률은 그대로 유지됩니다.');
              }}
              className="w-full py-2 rounded-lg bg-gold-500 text-ink-950 text-xs font-semibold disabled:opacity-30"
            >
              {canEvolveNow ? '진화하기' : `Lv.${evo.requiredLevel} 필요`}
            </button>
          </div>
        )}

        {notice && <p className="text-[11px] text-amber-400">{notice}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          {inTeam ? (
            <button onClick={() => moveToBox(pet.id)} className="px-3 py-2 rounded-lg panel text-xs">
              보관함으로
            </button>
          ) : (
            <button
              onClick={() => moveToTeam(pet.id)}
              disabled={state.team.length >= 5}
              className="px-3 py-2 rounded-lg panel text-xs disabled:opacity-30"
            >
              팀으로
            </button>
          )}
          <button
            onClick={() => applyPotionToPet(pet.id)}
            disabled={state.potions <= 0 || pet.currentHp >= maxHp}
            className="px-3 py-2 rounded-lg panel text-xs disabled:opacity-30"
          >
            포션 사용 ({state.potions})
          </button>
          <button
            onClick={() => {
              releasePet(pet.id);
              onClose();
            }}
            className="px-3 py-2 rounded-lg bg-red-900/50 text-xs hover:bg-red-900/70"
          >
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
