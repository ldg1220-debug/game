import { EQUIP_SLOTS, SLOT_LABEL } from '../game/equipment';
import { getItem, inventoryStatus, sortForDisplay } from '../game/inventory';
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

        {/* ── 가방 ── */}
        <div className="log" style={{ height: 240 }}>
          {rows.length === 0 && <p className="info">가방이 비었다.</p>}
          {rows.map((stack) => {
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
      </div>
    </div>
  );
}
