/**
 * 인벤토리 — 무게와 슬롯 제한.
 *
 * 제한이 있어야 "무엇을 들고 갈까"가 선택이 된다. 무제한 가방은 상점도 회복
 * 아이템도 의미 없게 만든다 — 그냥 다 사서 다 들고 다니면 되기 때문이다.
 *
 * 전부 순수 함수다. 입력 인벤토리를 바꾸지 않고 새 것을 돌려준다.
 */

import economyJson from '../data/economy.json';
import itemsJson from '../data/items.json';
import type { Item } from '../engine/types';

export interface InventoryLimits {
  maxSlots: number;
  maxWeight: number;
  maxStack: number;
}
export const DEFAULT_LIMITS: InventoryLimits = economyJson.inventory;

export const ITEMS: Record<string, Item> = Object.fromEntries(
  (itemsJson as Item[]).map((i) => [i.id, i]),
);

export function getItem(id: string): Item {
  const i = ITEMS[id];
  if (!i) throw new RangeError(`없는 아이템: ${id}`);
  return i;
}

/** 같은 아이템은 한 칸에 쌓인다. maxStack을 넘으면 새 칸을 쓴다. */
export interface ItemStack {
  itemId: string;
  qty: number;
}
export type Inventory = ItemStack[];

export function countOf(inv: Inventory, itemId: string): number {
  return inv.reduce((n, s) => (s.itemId === itemId ? n + s.qty : n), 0);
}

export function usedSlots(inv: Inventory): number {
  return inv.length;
}

export function weightOf(inv: Inventory): number {
  return inv.reduce((w, s) => w + getItem(s.itemId).weight * s.qty, 0);
}

/** 소수점 무게가 쌓이면 39.99999가 40을 넘는지로 갈린다. 살짝 여유를 둔다. */
const WEIGHT_EPSILON = 1e-9;

export type AddFailure = 'weight' | 'slots';

export interface AddResult {
  inv: Inventory;
  /** 실제로 들어간 개수. 요청보다 적을 수 있다. */
  added: number;
  /** 다 못 넣었으면 그 이유 */
  reason?: AddFailure;
}

/**
 * 하나씩 넣어 본다.
 *
 * 한 번에 검사하지 않고 개수만큼 반복하는 이유는, 부분적으로 들어가는 경우를
 * 정확히 세기 위해서다. "가방이 꽉 차서 3개 중 1개만 넣었다"가 조용히
 * "아무것도 안 넣었다"가 되면 유저는 아이템을 잃었다고 느낀다.
 */
export function addItem(
  inv: Inventory,
  itemId: string,
  qty: number,
  limits: InventoryLimits = DEFAULT_LIMITS,
): AddResult {
  if (qty < 0) throw new RangeError(`개수는 음수일 수 없다: ${qty}`);
  const item = getItem(itemId);
  let out = inv.map((s) => ({ ...s }));
  let weight = weightOf(out);
  let added = 0;
  let reason: AddFailure | undefined;

  for (let i = 0; i < qty; i++) {
    if (weight + item.weight > limits.maxWeight + WEIGHT_EPSILON) {
      reason = 'weight';
      break;
    }
    const open = out.find((s) => s.itemId === itemId && s.qty < limits.maxStack);
    if (open) {
      open.qty += 1;
    } else {
      if (out.length >= limits.maxSlots) {
        reason = 'slots';
        break;
      }
      out.push({ itemId, qty: 1 });
    }
    weight += item.weight;
    added += 1;
  }

  return { inv: out, added, ...(reason ? { reason } : {}) };
}

export interface RemoveResult {
  inv: Inventory;
  removed: number;
}

/** 없는 만큼은 못 뺀다. 빈 칸은 정리한다. */
export function removeItem(inv: Inventory, itemId: string, qty: number): RemoveResult {
  if (qty < 0) throw new RangeError(`개수는 음수일 수 없다: ${qty}`);
  let left = Math.min(qty, countOf(inv, itemId));
  const removed = left;
  const out: Inventory = [];

  for (const s of inv) {
    if (s.itemId !== itemId || left === 0) {
      out.push({ ...s });
      continue;
    }
    const take = Math.min(left, s.qty);
    left -= take;
    if (s.qty > take) out.push({ itemId: s.itemId, qty: s.qty - take });
  }

  return { inv: out, removed };
}

export function hasRoom(
  inv: Inventory,
  itemId: string,
  qty = 1,
  limits: InventoryLimits = DEFAULT_LIMITS,
): boolean {
  return addItem(inv, itemId, qty, limits).added === qty;
}

/** 무게·슬롯 상태를 화면에 보여주기 위한 요약. */
export function inventoryStatus(inv: Inventory, limits: InventoryLimits = DEFAULT_LIMITS) {
  const weight = weightOf(inv);
  return {
    weight,
    maxWeight: limits.maxWeight,
    slots: usedSlots(inv),
    maxSlots: limits.maxSlots,
    /** 0~1. 화면 게이지용 */
    weightRatio: Math.min(1, weight / limits.maxWeight),
    full: usedSlots(inv) >= limits.maxSlots,
  };
}

/** 목록 화면용 정렬 — 종류별로 묶고 그 안에서 이름순. */
const KIND_ORDER: Record<Item['kind'], number> = {
  heal: 0,
  captureTool: 1,
  food: 2,
  equipment: 3,
  evolution: 4,
};

export function sortForDisplay(inv: Inventory): Inventory {
  return inv
    .map((s) => ({ ...s }))
    .sort((a, b) => {
      const ia = getItem(a.itemId);
      const ib = getItem(b.itemId);
      return KIND_ORDER[ia.kind] - KIND_ORDER[ib.kind] || ia.name.localeCompare(ib.name, 'ko');
    });
}
