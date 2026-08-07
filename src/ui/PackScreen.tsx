import { canEvolve } from '../engine/growth/evolve';
import { growthScore } from '../engine/types';
import { EQUIP_SLOTS, SLOT_LABEL } from '../game/equipment';
import { getSpecies } from '../game/party';
import { activeQuests, objectiveProgress, objectiveTarget, objectiveText } from '../game/quests';
import { describeSave, saveFileName, serializeSave } from '../game/save';
import { useWorldView } from './useCharacterView';
import { useRef, useState } from 'react';
import { ITEMS as ITEMS_INDEX, getItem, inventoryStatus, sortForDisplay } from '../game/inventory';
import { MAPS } from '../game/maps';
import { SPIRITS_BY_ID } from '../game/party';
import { sellPrice } from '../game/shop';
import { useGame } from '../game/store';
import { useCharacterView } from './useCharacterView';

/**
 * 소지품 화면 — 가방과 장비.
 *
 * 무게와 슬롯을 항상 보여준다. 제한이 보이지 않으면 제한이 없는 것과 같고,
 * 그러면 "무엇을 들고 갈까"라는 선택이 사라진다.
 */

const MAP_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(MAPS).map((m) => [m.id, m.name]),
);

const KIND_LABEL: Record<string, string> = {
  heal: '회복',
  captureTool: '포획',
  food: '먹이',
  equipment: '장비',
  evolution: '진화',
};

function BonusText({ bonus }: { bonus?: Partial<Record<'hp' | 'atk' | 'def' | 'spd', number>> }) {
  if (!bonus) return null;
  const parts = (['hp', 'atk', 'def', 'spd'] as const)
    .filter((k) => bonus[k] !== undefined && bonus[k] !== 0)
    .map((k) => `${{ hp: 'HP', atk: '공', def: '방', spd: '순' }[k]} ${bonus[k]! > 0 ? '+' : ''}${bonus[k]}`);
  if (parts.length === 0) return null;
  return <span className="tiny" style={{ color: 'var(--ok)' }}>{parts.join(' ')}</span>;
}

/** 펫 목록 — 성장률과 진화. 진화가 안 되면 왜 안 되는지 그 자리에 적는다. */
function PetList() {
  const party = useGame((s) => s.party);
  const box = useGame((s) => s.box);
  const world = useWorldView();
  const evolvePet = useGame((s) => s.evolvePet);
  const rerollPet = useGame((s) => s.rerollPet);

  const all = [...party, ...box];
  if (all.length === 0) return <p className="info small">동료가 없다.</p>;

  return (
    <>
      {all.map((pet) => {
        const sp = getSpecies(pet.speciesId);
        const has = (id: string) => world.itemCount(id) > 0;
        const questDone = world.questsDone.has('boundOfGrowth');
        const quest = canEvolve(pet, sp, { hasItem: has, questDone, mode: 'quest' });
        const cat = canEvolve(pet, sp, { hasItem: has, questDone, mode: 'catalyst' });
        const why = {
          noEvolution: '진화하지 않는 종',
          level: `${quest.requiredLevel}레벨 필요`,
          item: '재료 없음',
          questIncomplete: '주술사에게 배워야 한다',
        };
        return (
          <div key={pet.uid} className="row spread" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="small">{pet.nickname ?? sp.name}</span>
              <span className="tiny muted"> L{pet.level} · 성장률 {growthScore(pet.growth).toFixed(2)} · 충성 {pet.loyalty}</span>
              {quest.toSpeciesId && (
                <div className="tiny muted">
                  진화 → {getSpecies(quest.toSpeciesId).name}
                  {!quest.ok && !cat.ok && <span> · {why[quest.reason ?? 'noEvolution']}</span>}
                </div>
              )}
            </div>
            <div className="row">
              {quest.ok && (
                <button className="small" onClick={() => evolvePet(pet.uid, 'quest')}>
                  진화의 돌
                </button>
              )}
              {cat.ok && (
                <button className="small" onClick={() => evolvePet(pet.uid, 'catalyst')} title="이전 성장률이 절반 반영된다">
                  촉진제
                </button>
              )}
              {has('rerollDraught') && (
                <button className="small" onClick={() => rerollPet(pet.uid)} title="같은 종 안에서 성장률만 다시 뽑는다. 상한은 오르지 않는다.">
                  재추첨
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** 진행 중인 퀘스트. 목표를 보려고 마을까지 돌아가는 동선을 없앤다. */
function QuestList() {
  const questLog = useGame((s) => s.questLog);
  const world = useWorldView();
  const rows = activeQuests(questLog);
  if (rows.length === 0) return <p className="info small">받은 의뢰가 없다.</p>;

  return (
    <>
      {rows.map(({ quest, state, counts }) => (
        <div key={quest.id} style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="small">
            <strong>{quest.name}</strong>
            <span className="tiny muted"> · {state === 'ready' ? '보고 가능' : '진행 중'}</span>
          </div>
          <div className="tiny muted">{quest.summary}</div>
          {quest.objectives.map((o, i) => {
            const now = objectiveProgress(o, counts[i] ?? 0, world);
            const target = objectiveTarget(o);
            return (
              <div key={i} className="tiny" style={{ color: now >= target ? 'var(--ok)' : 'var(--muted)' }}>
                {now >= target ? '✓' : '·'} {objectiveText(o, nameOf)} ({now}/{target})
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function nameOf(id: string): string {
  if (ITEMS_INDEX[id]) return ITEMS_INDEX[id]!.name;
  try {
    return getSpecies(id).name;
  } catch {
    return MAP_NAMES[id] ?? id;
  }
}

/**
 * 세이브 — 파일로 내려받고 올린다.
 *
 * 브라우저 저장소가 아니라 파일이다. localStorage는 캐시를 지우면 같이 날아가고,
 * 유저는 그게 세이브인 줄 모른다. 파일이면 어디에 있는지 눈에 보이고 백업도
 * 유저가 직접 할 수 있다. (서버 보관은 /saves API에 있다.)
 */
function SaveRow() {
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    const save = exportSave();
    const blob = new Blob([serializeSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveFileName(save);
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    importSave(await file.text());
    // 같은 파일을 다시 고를 수 있게 비운다
    if (fileRef.current) fileRef.current.value = '';
  };

  const current = exportSave();
  return (
    <div className="row spread" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      <span className="tiny muted">{describeSave(current)}</span>
      <div className="row">
        <button className="small" onClick={download}>
          세이브 내려받기
        </button>
        <button className="small" onClick={() => fileRef.current?.click()}>
          불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}

export function PackScreen() {
  const inventory = useGame((s) => s.inventory);
  const equipment = useGame((s) => s.equipment);
  const view = useCharacterView();
  const equipItem = useGame((s) => s.equipItem);
  const unequipSlot = useGame((s) => s.unequipSlot);
  const useItem = useGame((s) => s.useItem);
  const close = useGame((s) => s.closeScreen);

  const status = inventoryStatus(inventory);
  const rows = sortForDisplay(inventory);
  const [tab, setTab] = useState<'items' | 'pets' | 'quests'>('items');

  return (
    <div className="overlay">
      <div className="card" style={{ width: 'min(720px, 94%)', textAlign: 'left' }}>
        <div className="row spread" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>소지품</h2>
          <button className="small" onClick={close}>
            닫기 <kbd>Esc</kbd>
          </button>
        </div>

        {/* ── 장비 ── */}
        <div className="row" style={{ alignItems: 'stretch', marginBottom: 10 }}>
          {EQUIP_SLOTS.map((slot) => {
            const id = equipment[slot];
            const item = id ? getItem(id) : null;
            return (
              <div className="unit" key={slot} style={{ flex: 1 }}>
                <div className="tiny muted">{SLOT_LABEL[slot]}</div>
                {item ? (
                  <>
                    <div className="small" style={{ margin: '2px 0' }}>{item.name}</div>
                    <BonusText bonus={item.bonus} />
                    {item.spiritId && (
                      <div className="tiny" style={{ color: 'var(--gold)' }}>
                        정령 · {SPIRITS_BY_ID[item.spiritId]?.name ?? item.spiritId}
                      </div>
                    )}
                    <button className="small" style={{ marginTop: 6, width: '100%' }} onClick={() => unequipSlot(slot)}>
                      벗기
                    </button>
                  </>
                ) : (
                  <div className="small muted" style={{ margin: '2px 0' }}>비어 있음</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="row spread small" style={{ marginBottom: 6 }}>
          <span className="muted">
            무게 {view.carriedWeight.toFixed(1)} / {status.maxWeight} · 칸 {status.slots} / {status.maxSlots}
          </span>
          <div className="gauge" style={{ maxWidth: 180, flex: '0 0 180px' }}>
            <i
              style={{
                width: `${Math.min(100, (view.carriedWeight / status.maxWeight) * 100)}%`,
                background: view.carriedWeight / status.maxWeight > 0.9 ? 'var(--danger)' : 'var(--gold)',
              }}
            />
          </div>
        </div>

        <div className="row" style={{ marginBottom: 6 }}>
          {([['items', '가방'], ['pets', '펫'], ['quests', '의뢰']] as const).map(([k, label]) => (
            <button key={k} className="small" onClick={() => setTab(k)} disabled={tab === k}>
              {label}
            </button>
          ))}
        </div>

        <div className="log" style={{ height: 240 }}>
          {tab === 'pets' && <PetList />}
          {tab === 'quests' && <QuestList />}
          {tab === 'items' && rows.length === 0 && <p className="info">가방이 비었다.</p>}
          {tab === 'items' && rows.map((stack) => {
            const item = getItem(stack.itemId);
            const canEquip = item.kind === 'equipment';
            const canUse = (item.kind === 'heal' && (item.heal ?? 0) > 0) || (item.kind === 'food' && !!item.loyalty);
            return (
              <div
                key={stack.itemId}
                className="row spread"
                style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="small">{item.name}</span>
                  <span className="tiny muted"> ×{stack.qty} · {KIND_LABEL[item.kind]} · {item.weight}kg</span>
                  <div className="tiny muted">{item.description}</div>
                  <BonusText bonus={item.bonus} />
                </div>
                <div className="row">
                  <span className="tiny muted">{sellPrice(item.id)}스톤</span>
                  {canEquip && (
                    <button className="small" onClick={() => equipItem(item.id)}>
                      착용
                    </button>
                  )}
                  {canUse && (
                    <button className="small" onClick={() => useItem(item.id)}>
                      사용
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <SaveRow />
      </div>
    </div>
  );
}
