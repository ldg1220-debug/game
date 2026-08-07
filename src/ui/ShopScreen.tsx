import { useState } from 'react';
import { countOf, getItem, inventoryStatus, sortForDisplay } from '../game/inventory';
import { SPIRITS_BY_ID } from '../game/party';
import { buyPrice, sellPrice } from '../game/shop';
import { useGame } from '../game/store';
import { useCharacterView } from './useCharacterView';

/**
 * 상점 — 사기와 팔기.
 *
 * 파는 값이 사는 값보다 싸다는 걸 화면에 그대로 보여준다. 숨기면 유저가
 * 왕복 거래로 돈을 벌려다 손해를 보고, 그건 재미가 아니라 함정이다.
 *
 * 끼고 있는 장비는 가방에 없으므로 목록에 뜨지 않는다 — 실수로 입고 있는
 * 갑옷을 파는 사고가 구조적으로 불가능하다.
 */

export function ShopScreen() {
  const shop = useGame((s) => s.shop);
  const inventory = useGame((s) => s.inventory);
  const stones = useGame((s) => s.stones);
  const view = useCharacterView();
  const buyItem = useGame((s) => s.buyItem);
  const sellItem = useGame((s) => s.sellItem);
  const close = useGame((s) => s.closeScreen);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');

  if (!shop) return null;
  const status = inventoryStatus(inventory);
  const sellable = sortForDisplay(inventory);

  return (
    <div className="overlay">
      <div className="card" style={{ width: 'min(720px, 94%)', textAlign: 'left' }}>
        <div className="row spread" style={{ marginBottom: 2 }}>
          <h2 style={{ margin: 0 }}>{shop.name}</h2>
          <button className="small" onClick={close}>
            나가기 <kbd>Esc</kbd>
          </button>
        </div>
        <p className="tiny muted" style={{ margin: '0 0 10px' }}>{shop.greeting}</p>

        <div className="row spread" style={{ marginBottom: 8 }}>
          <div className="row">
            <button className={`small ${tab === 'buy' ? '' : 'muted'}`} onClick={() => setTab('buy')} disabled={tab === 'buy'}>
              사기
            </button>
            <button className={`small ${tab === 'sell' ? '' : 'muted'}`} onClick={() => setTab('sell')} disabled={tab === 'sell'}>
              팔기
            </button>
          </div>
          <span className="small">
            <span style={{ color: 'var(--gold)' }}>{stones.toLocaleString()} 스톤</span>
            <span className="tiny muted">
              {' '}· 무게 {view.carriedWeight.toFixed(1)}/{status.maxWeight} · 칸 {status.slots}/{status.maxSlots}
            </span>
          </span>
        </div>

        <div className="log" style={{ height: 268 }}>
          {tab === 'buy' &&
            shop.stock.map((id) => {
              const item = getItem(id);
              const price = buyPrice(id);
              const owned = countOf(inventory, id);
              return (
                <div key={id} className="row spread" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="small">{item.name}</span>
                    {owned > 0 && <span className="tiny muted"> (보유 {owned})</span>}
                    <div className="tiny muted">{item.description}</div>
                    {item.spiritId && (
                      <div className="tiny" style={{ color: 'var(--gold)' }}>
                        정령 · {SPIRITS_BY_ID[item.spiritId]?.name ?? item.spiritId}
                      </div>
                    )}
                  </div>
                  <div className="row">
                    <span className="small" style={{ color: stones >= price ? 'var(--text)' : 'var(--danger)' }}>
                      {price}
                    </span>
                    <button className="small" onClick={() => buyItem(id, 1)} disabled={stones < price}>
                      1개
                    </button>
                    <button className="small" onClick={() => buyItem(id, 5)} disabled={stones < price}>
                      5개
                    </button>
                  </div>
                </div>
              );
            })}

          {tab === 'sell' && sellable.length === 0 && <p className="info">팔 물건이 없다.</p>}
          {tab === 'sell' &&
            sellable.map((stack) => {
              const item = getItem(stack.itemId);
              return (
                <div key={stack.itemId} className="row spread" style={{ padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="small">{item.name}</span>
                    <span className="tiny muted"> ×{stack.qty}</span>
                    <div className="tiny muted">
                      정가 {item.price} · 매입 {sellPrice(item.id)}
                    </div>
                  </div>
                  <div className="row">
                    <button className="small" onClick={() => sellItem(item.id, 1)}>
                      1개
                    </button>
                    <button className="small" onClick={() => sellItem(item.id, stack.qty)}>
                      전부
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
