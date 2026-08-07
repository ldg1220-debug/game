/**
 * 상점 — 사고 팔기.
 *
 * 파는 값이 사는 값보다 싸다. 차익이 0이면 상점을 왕복하는 것만으로 무한히
 * 돈을 벌 수 있고, 그러면 필드에 나갈 이유가 사라진다.
 *
 * 전부 순수 함수다. 실패는 예외가 아니라 이유가 담긴 결과로 돌려준다 — 실패가
 * 흔한 일(돈 부족·가방 참)이라 호출하는 쪽이 화면에 그대로 띄울 수 있어야 한다.
 */

import economyJson from '../data/economy.json';
import { addItem, countOf, getItem, removeItem, type Inventory, type InventoryLimits } from './inventory';

export interface Shop {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  greeting: string;
  stock: string[];
}

export interface TradeConfig {
  sellRatio: number;
}

export const SHOPS: Shop[] = economyJson.shops;
export const DEFAULT_TRADE: TradeConfig = economyJson.trade;
export const CURRENCY = economyJson.currency;

export function shopAt(mapId: string, x: number, y: number): Shop | undefined {
  return SHOPS.find((s) => s.mapId === mapId && s.x === x && s.y === y);
}

export function buyPrice(itemId: string): number {
  return getItem(itemId).price;
}

/** 팔 때는 정가의 일부만 받는다. 최소 1스톤은 준다 — 0이면 판다는 행위가 무의미하다. */
export function sellPrice(itemId: string, cfg: TradeConfig = DEFAULT_TRADE): number {
  return Math.max(1, Math.floor(getItem(itemId).price * cfg.sellRatio));
}

export type BuyFailure = 'notStocked' | 'money' | 'weight' | 'slots';

export interface BuyResult {
  inventory: Inventory;
  stones: number;
  bought: number;
  reason?: BuyFailure;
}

/**
 * 산다.
 *
 * 가방에 안 들어가면 그만큼만 사고 돈도 그만큼만 낸다. 돈만 빠지고 물건이
 * 사라지는 경우를 만들지 않는다.
 */
export function buy(
  shop: Shop,
  inv: Inventory,
  stones: number,
  itemId: string,
  qty: number,
  limits?: InventoryLimits,
): BuyResult {
  if (qty <= 0) return { inventory: inv, stones, bought: 0 };
  if (!shop.stock.includes(itemId)) {
    return { inventory: inv, stones, bought: 0, reason: 'notStocked' };
  }

  const unit = buyPrice(itemId);
  const affordable = unit > 0 ? Math.floor(stones / unit) : qty;
  if (affordable <= 0) return { inventory: inv, stones, bought: 0, reason: 'money' };

  const want = Math.min(qty, affordable);
  const put = addItem(inv, itemId, want, limits);
  if (put.added === 0) {
    return { inventory: inv, stones, bought: 0, reason: put.reason ?? 'slots' };
  }

  return {
    inventory: put.inv,
    stones: stones - put.added * unit,
    bought: put.added,
    // 원하는 만큼 못 샀으면 왜인지 알려준다
    ...(put.added < qty ? { reason: put.added < want ? (put.reason ?? 'slots') : 'money' } : {}),
  };
}

export type SellFailure = 'notOwned' | 'equipped';

export interface SellResult {
  inventory: Inventory;
  stones: number;
  sold: number;
  reason?: SellFailure;
}

/**
 * 판다.
 *
 * 끼고 있는 장비는 가방에 없으므로 자동으로 팔리지 않는다 — 벗어야 팔 수 있다.
 * 실수로 입고 있는 갑옷을 파는 사고가 구조적으로 불가능하다.
 */
export function sell(
  inv: Inventory,
  stones: number,
  itemId: string,
  qty: number,
  cfg: TradeConfig = DEFAULT_TRADE,
): SellResult {
  if (qty <= 0) return { inventory: inv, stones, sold: 0 };
  if (countOf(inv, itemId) === 0) {
    return { inventory: inv, stones, sold: 0, reason: 'notOwned' };
  }
  const taken = removeItem(inv, itemId, qty);
  return {
    inventory: taken.inv,
    stones: stones + taken.removed * sellPrice(itemId, cfg),
    sold: taken.removed,
  };
}

/** 전투 보상. 레벨이 높은 상대일수록 많이 준다. */
export function stoneReward(enemyLevels: readonly number[]): number {
  return enemyLevels.reduce((sum, lv) => sum + lv * CURRENCY.perEnemyLevel, 0);
}
