/**
 * 장비와 정령.
 *
 * 두 가지 원작 규칙을 코드로 붙든다.
 *
 * 1. **펫은 장비를 낄 수 없다.** 펫은 능력치가 캐릭터보다 높은 대신 장비가 없다.
 *    이 균형이 깨지면 캐릭터가 파티에 있을 이유가 사라진다.
 * 2. **정령은 캐릭터가 아니라 아이템에 깃든다.** 장비한 아이템이 가진 정령만
 *    전투에서 쓸 수 있다. 캐릭터에 스킬을 붙이는 흔한 방식으로 바꾸지 않는다 —
 *    "무엇을 끼느냐"가 곧 "무슨 주술을 쓰느냐"가 되는 게 이 시스템의 핵심이다.
 */

import type { EquipSlot, Item, Stats } from '../engine/types';
import { getItem, type Inventory } from './inventory';

export const EQUIP_SLOTS = ['weapon', 'armor', 'accessory'] as const;

export const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};

/** 슬롯마다 아이템 하나. 비었으면 null. */
export type Equipment = Record<EquipSlot, string | null>;

export function emptyEquipment(): Equipment {
  return { weapon: null, armor: null, accessory: null };
}

export function equippedItems(eq: Equipment): Item[] {
  return EQUIP_SLOTS.map((s) => eq[s]).filter((id): id is string => id !== null).map(getItem);
}

/** 장비 무게도 몸에 얹혀 있다. 끼면 가벼워지는 가방은 말이 안 된다. */
export function equipmentWeight(eq: Equipment): number {
  return equippedItems(eq).reduce((w, i) => w + i.weight, 0);
}

/** 기본 능력치 + 장비 보정. 보정은 음수일 수 있다(무거운 갑옷은 순발력을 깎는다). */
export function applyEquipment(base: Stats, eq: Equipment): Stats {
  const out = { ...base };
  for (const item of equippedItems(eq)) {
    if (!item.bonus) continue;
    out.hp += item.bonus.hp ?? 0;
    out.atk += item.bonus.atk ?? 0;
    out.def += item.bonus.def ?? 0;
    out.spd += item.bonus.spd ?? 0;
  }
  // 장비 때문에 능력치가 0 이하로 내려가면 전투 수식이 이상해진다
  out.hp = Math.max(1, out.hp);
  out.atk = Math.max(0, out.atk);
  out.def = Math.max(0, out.def);
  out.spd = Math.max(1, out.spd);
  return out;
}

/**
 * 지금 쓸 수 있는 정령.
 *
 * 장비를 벗으면 그 정령도 같이 사라진다. 전투 중에 장비를 바꿀 수 없으므로,
 * 무엇을 끼고 나갈지가 곧 전투 전 준비가 된다.
 */
export function availableSpirits(eq: Equipment): string[] {
  const out: string[] = [];
  for (const item of equippedItems(eq)) {
    if (item.spiritId && !out.includes(item.spiritId)) out.push(item.spiritId);
  }
  return out;
}

export type EquipFailure = 'notEquipment' | 'notOwned';

export interface EquipResult {
  equipment: Equipment;
  inventory: Inventory;
  ok: boolean;
  reason?: EquipFailure;
  /** 교체로 가방에 돌아온 아이템 */
  swappedOut: string | null;
}

/**
 * 장비를 낀다. 낀 물건은 가방에서 빠지고, 원래 끼고 있던 건 가방으로 돌아온다.
 *
 * 교체가 원자적이어야 한다. 벗기고 끼우는 두 단계로 나누면 중간에 가방이 꽉 차서
 * 벗은 물건이 사라지는 경우가 생긴다. 여기서는 슬롯 수가 늘지 않으므로
 * (하나 나가고 하나 들어온다) 그 상황 자체가 없다.
 */
export function equip(eq: Equipment, inv: Inventory, itemId: string): EquipResult {
  const item = getItem(itemId);
  if (item.kind !== 'equipment' || !item.slot) {
    return { equipment: eq, inventory: inv, ok: false, reason: 'notEquipment', swappedOut: null };
  }
  const owned = inv.some((s) => s.itemId === itemId && s.qty > 0);
  if (!owned) {
    return { equipment: eq, inventory: inv, ok: false, reason: 'notOwned', swappedOut: null };
  }

  const previous = eq[item.slot];
  let next: Inventory = inv
    .map((s) => (s.itemId === itemId ? { ...s, qty: s.qty - 1 } : { ...s }))
    .filter((s) => s.qty > 0);

  if (previous) {
    const open = next.find((s) => s.itemId === previous);
    if (open) open.qty += 1;
    else next = [...next, { itemId: previous, qty: 1 }];
  }

  return {
    equipment: { ...eq, [item.slot]: itemId },
    inventory: next,
    ok: true,
    swappedOut: previous,
  };
}

/** 벗어서 가방에 넣는다. 슬롯이 비므로 자리는 반드시 있다. */
export function unequip(eq: Equipment, inv: Inventory, slot: EquipSlot): EquipResult {
  const itemId = eq[slot];
  if (!itemId) return { equipment: eq, inventory: inv, ok: false, swappedOut: null };

  const next = inv.map((s) => ({ ...s }));
  const open = next.find((s) => s.itemId === itemId);
  if (open) open.qty += 1;
  else next.push({ itemId, qty: 1 });

  return { equipment: { ...eq, [slot]: null }, inventory: next, ok: true, swappedOut: itemId };
}
