import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATALOG,
  createDefaultAI,
  simulateBattle,
  type Combatant,
} from '../src/engine/battle';
import { createRng } from '../src/engine/rng';
import {
  DEFAULT_LIMITS,
  addItem,
  countOf,
  getItem,
  hasRoom,
  inventoryStatus,
  removeItem,
  sortForDisplay,
  weightOf,
  type Inventory,
} from '../src/game/inventory';
import {
  EQUIP_SLOTS,
  applyEquipment,
  availableSpirits,
  emptyEquipment,
  equip,
  equipmentWeight,
  unequip,
} from '../src/game/equipment';
import { SHOPS, buy, buyPrice, sell, sellPrice, shopAt, stoneReward } from '../src/game/shop';
import { getMap } from '../src/game/maps';
import { createStanceSource } from '../src/game/stances';

/**
 * 인벤토리 · 장비 · 정령 · 상점 테스트.
 *
 * 이 Phase가 지켜야 할 규칙은 셋이다.
 *   1. 제한이 실제로 걸린다 (무게·슬롯이 없으면 상점도 회복약도 의미가 없다)
 *   2. 펫은 장비를 못 끼고, 정령은 장비에 깃든다 (원작 구조)
 *   3. 사고 파는 것으로 돈이 늘지 않는다 (왕복 거래가 곧 무한 수익이면 필드가 죽는다)
 */

const empty: Inventory = [];

/* ─────────────── 인벤토리 ─────────────── */

describe('인벤토리', () => {
  it('같은 아이템은 한 칸에 쌓인다', () => {
    const inv = addItem(empty, 'herbSmall', 5).inv;
    expect(inv.length).toBe(1);
    expect(countOf(inv, 'herbSmall')).toBe(5);
  });

  it('무게 제한을 넘으면 넣던 만큼만 들어간다', () => {
    // shellPlate 6kg × 7 = 42kg > 40kg
    const r = addItem(empty, 'shellPlate', 7);
    expect(r.added).toBe(6);
    expect(r.reason).toBe('weight');
    expect(weightOf(r.inv)).toBeLessThanOrEqual(DEFAULT_LIMITS.maxWeight);
  });

  it('슬롯 제한을 넘으면 더 못 넣는다', () => {
    // 서로 다른 가벼운 아이템으로 칸만 채운다
    const light = ['herbSmall', 'herbLarge', 'antidote', 'rerollDraught', 'featherCharm', 'tideAmulet'];
    let inv: Inventory = [];
    const limits = { ...DEFAULT_LIMITS, maxSlots: 3, maxWeight: 999 };
    for (const id of light) inv = addItem(inv, id, 1, limits).inv;
    expect(inv.length).toBe(3);
    expect(addItem(inv, 'meatChunk', 1, limits).reason).toBe('slots');
  });

  it('maxStack을 넘으면 새 칸을 쓴다', () => {
    const limits = { ...DEFAULT_LIMITS, maxStack: 3, maxWeight: 999 };
    const inv = addItem(empty, 'antidote', 7, limits).inv;
    expect(inv.length).toBe(3);
    expect(countOf(inv, 'antidote')).toBe(7);
  });

  it('없는 만큼은 못 뺀다', () => {
    const inv = addItem(empty, 'herbSmall', 2).inv;
    const r = removeItem(inv, 'herbSmall', 5);
    expect(r.removed).toBe(2);
    expect(countOf(r.inv, 'herbSmall')).toBe(0);
    expect(r.inv.length).toBe(0); // 빈 칸은 정리된다
  });

  it('입력을 바꾸지 않는다', () => {
    const inv = addItem(empty, 'herbSmall', 3).inv;
    const before = JSON.stringify(inv);
    addItem(inv, 'herbSmall', 2);
    removeItem(inv, 'herbSmall', 1);
    expect(JSON.stringify(inv)).toBe(before);
  });

  it('음수 개수는 던진다', () => {
    expect(() => addItem(empty, 'herbSmall', -1)).toThrow(RangeError);
    expect(() => removeItem(empty, 'herbSmall', -1)).toThrow(RangeError);
  });

  it('없는 아이템은 던진다', () => {
    expect(() => addItem(empty, 'nope', 1)).toThrow(RangeError);
  });

  it('hasRoom이 실제 결과와 일치한다', () => {
    let inv: Inventory = [];
    for (let i = 0; i < 30; i++) {
      const fits = hasRoom(inv, 'shellPlate', 1);
      const r = addItem(inv, 'shellPlate', 1);
      expect(fits).toBe(r.added === 1);
      inv = r.inv;
    }
  });

  it('상태 요약이 실제 값과 맞는다', () => {
    const inv = addItem(empty, 'hideArmor', 3).inv;
    const st = inventoryStatus(inv);
    expect(st.weight).toBeCloseTo(getItem('hideArmor').weight * 3, 9);
    expect(st.slots).toBe(1);
    expect(st.weightRatio).toBeCloseTo(st.weight / st.maxWeight, 9);
  });

  it('정렬은 종류별로 묶고 원본을 건드리지 않는다', () => {
    let inv: Inventory = [];
    for (const id of ['clubStone', 'herbSmall', 'meatChunk', 'ropeCrude']) inv = addItem(inv, id, 1).inv;
    const before = JSON.stringify(inv);
    const sorted = sortForDisplay(inv);
    expect(JSON.stringify(inv)).toBe(before);
    expect(sorted.map((s) => getItem(s.itemId).kind)).toEqual(['heal', 'captureTool', 'food', 'equipment']);
  });
});

/* ─────────────── 장비 ─────────────── */

describe('장비', () => {
  const base = { hp: 200, atk: 30, def: 20, spd: 25 };

  it('낀 물건은 가방에서 빠진다', () => {
    const inv = addItem(empty, 'clubStone', 2).inv;
    const r = equip(emptyEquipment(), inv, 'clubStone');
    expect(r.ok).toBe(true);
    expect(r.equipment.weapon).toBe('clubStone');
    expect(countOf(r.inventory, 'clubStone')).toBe(1);
  });

  it('같은 슬롯을 다시 끼면 원래 것이 가방으로 돌아온다', () => {
    let inv = addItem(empty, 'clubStone', 1).inv;
    inv = addItem(inv, 'spearBone', 1).inv;
    const first = equip(emptyEquipment(), inv, 'clubStone');
    const second = equip(first.equipment, first.inventory, 'spearBone');
    expect(second.equipment.weapon).toBe('spearBone');
    expect(second.swappedOut).toBe('clubStone');
    expect(countOf(second.inventory, 'clubStone')).toBe(1);
  });

  it('안 가진 물건이나 장비가 아닌 물건은 못 낀다', () => {
    expect(equip(emptyEquipment(), empty, 'clubStone').reason).toBe('notOwned');
    const inv = addItem(empty, 'herbSmall', 1).inv;
    expect(equip(emptyEquipment(), inv, 'herbSmall').reason).toBe('notEquipment');
  });

  it('능력치 보정이 더해지고, 음수 보정도 반영된다', () => {
    const inv = addItem(empty, 'shellPlate', 1).inv;
    const r = equip(emptyEquipment(), inv, 'shellPlate');
    const stats = applyEquipment(base, r.equipment);
    const bonus = getItem('shellPlate').bonus!;
    expect(stats.def).toBe(base.def + bonus.def!);
    expect(stats.hp).toBe(base.hp + bonus.hp!);
    expect(stats.spd).toBe(base.spd + bonus.spd!); // -2
    expect(stats.spd).toBeLessThan(base.spd);
  });

  it('보정 때문에 능력치가 0 이하로 내려가지 않는다', () => {
    const inv = addItem(empty, 'shellPlate', 1).inv;
    const r = equip(emptyEquipment(), inv, 'shellPlate');
    const stats = applyEquipment({ hp: 1, atk: 0, def: 0, spd: 1 }, r.equipment);
    expect(stats.hp).toBeGreaterThan(0);
    expect(stats.spd).toBeGreaterThan(0);
  });

  it('장비 무게도 몸에 얹혀 있다', () => {
    const inv = addItem(empty, 'shellPlate', 1).inv;
    const before = weightOf(inv) + equipmentWeight(emptyEquipment());
    const r = equip(emptyEquipment(), inv, 'shellPlate');
    const after = weightOf(r.inventory) + equipmentWeight(r.equipment);
    // 끼었다고 가벼워지지 않는다
    expect(after).toBeCloseTo(before, 9);
  });

  it('벗으면 가방으로 돌아온다', () => {
    const inv = addItem(empty, 'hideArmor', 1).inv;
    const on = equip(emptyEquipment(), inv, 'hideArmor');
    const off = unequip(on.equipment, on.inventory, 'armor');
    expect(off.equipment.armor).toBeNull();
    expect(countOf(off.inventory, 'hideArmor')).toBe(1);
  });

  it('빈 슬롯을 벗으려 하면 아무 일도 없다', () => {
    const r = unequip(emptyEquipment(), empty, 'weapon');
    expect(r.ok).toBe(false);
    expect(r.inventory).toEqual(empty);
  });

  it('슬롯은 셋뿐이고 각각 하나만 낀다', () => {
    let inv: Inventory = [];
    for (const id of ['clubStone', 'spearBone', 'hideArmor', 'featherCharm']) inv = addItem(inv, id, 1).inv;
    let eq = emptyEquipment();
    for (const id of ['clubStone', 'spearBone', 'hideArmor', 'featherCharm']) {
      const r = equip(eq, inv, id);
      eq = r.equipment;
      inv = r.inventory;
    }
    expect(EQUIP_SLOTS.length).toBe(3);
    expect(eq.weapon).toBe('spearBone'); // 나중에 낀 게 남는다
    expect(eq.armor).toBe('hideArmor');
    expect(eq.accessory).toBe('featherCharm');
    expect(countOf(inv, 'clubStone')).toBe(1); // 밀려난 무기는 가방에
  });
});

/* ─────────────── 정령 ─────────────── */

describe('정령은 장비에 깃든다', () => {
  it('낀 장비의 정령만 쓸 수 있다', () => {
    let inv = addItem(empty, 'spearBone', 1).inv;
    inv = addItem(inv, 'tideAmulet', 1).inv;

    expect(availableSpirits(emptyEquipment())).toEqual([]);

    const a = equip(emptyEquipment(), inv, 'spearBone');
    expect(availableSpirits(a.equipment)).toEqual(['emberBrand']);

    const b = equip(a.equipment, a.inventory, 'tideAmulet');
    expect(availableSpirits(b.equipment).sort()).toEqual(['emberBrand', 'healingSpring']);
  });

  it('벗으면 정령도 같이 사라진다', () => {
    const inv = addItem(empty, 'spearBone', 1).inv;
    const on = equip(emptyEquipment(), inv, 'spearBone');
    const off = unequip(on.equipment, on.inventory, 'weapon');
    expect(availableSpirits(off.equipment)).toEqual([]);
  });

  it('정령 없는 장비는 아무것도 주지 않는다', () => {
    const inv = addItem(empty, 'clubStone', 1).inv;
    const r = equip(emptyEquipment(), inv, 'clubStone');
    expect(availableSpirits(r.equipment)).toEqual([]);
  });

  it('같은 정령이 두 번 들어가지 않는다', () => {
    const eq = { weapon: 'spearBone', armor: 'spearBone', accessory: null } as const;
    expect(availableSpirits({ ...eq })).toEqual(['emberBrand']);
  });
});

/* ─────────────── 전투에서 정령이 실제로 발동하는가 ─────────────── */

describe('전투 spirit 커맨드', () => {
  const hero = (spirits: string[]): Combatant => ({
    id: 'hero',
    name: '탐험가',
    kind: 'character',
    level: 20,
    element: { primary: 'earth', secondary: null },
    stats: { hp: 400, atk: 50, def: 34, spd: 40 },
    hp: 400,
    energy: 90,
    maxEnergy: 90,
    row: 'front',
    skills: ['strike', 'gore', 'harden', 'mend'],
    spirits,
    charm: 12,
  });

  const wolf = (): Combatant => ({
    id: 'wolf',
    name: '늑대',
    kind: 'pet',
    level: 18,
    element: { primary: 'wind', secondary: null },
    stats: { hp: 320, atk: 40, def: 24, spd: 34 },
    hp: 320,
    energy: 30,
    maxEnergy: 30,
    row: 'front',
    skills: ['strike', 'gale'],
    speciesId: 'gustwolf',
    captureBaseRate: 0.3,
  });

  const run = (spirits: string[], stance: 'aggressive' | 'defensive', seed: number) => {
    const rng = createRng(seed);
    return simulateBattle({
      allies: [hero(spirits)],
      enemies: [wolf()],
      seed,
      commandSource: createStanceSource(stance, DEFAULT_CATALOG, createDefaultAI(DEFAULT_CATALOG, rng), 'ropeCrude'),
    });
  };

  it('공격 정령을 낀 채 공격 태세면 실제로 발동한다', () => {
    let used = 0;
    let damaged = 0;
    for (let seed = 0; seed < 20; seed++) {
      const r = run(['gaiaGrasp'], 'aggressive', seed);
      const uses = r.log.filter((e) => e.type === 'spiritUsed');
      used += uses.length;
      damaged += r.log.filter((e) => e.type === 'damage' && e.skillId === 'gaiaGrasp').length;
    }
    expect(used).toBeGreaterThan(0);
    expect(damaged).toBeGreaterThan(0);
  });

  it('상점에서 파는 정령 장비가 전투에서 실제로 발동한다', () => {
    // 정령이 깃든 무기를 사고도 전투에서 아무 일이 없으면 그 물건은 사기다.
    // 실제로 그렇게 만들어 본 적이 있어서 상점 재고 전체를 훑는다.
    const spiritItems = SHOPS.flatMap((s) => s.stock)
      .map((id) => getItem(id))
      .filter((i) => i.spiritId);
    expect(spiritItems.length).toBeGreaterThan(0);

    for (const item of spiritItems) {
      let fired = 0;
      for (let seed = 0; seed < 25 && fired === 0; seed++) {
        for (const stance of ['aggressive', 'defensive'] as const) {
          fired += run([item.spiritId!], stance, seed).log.filter((e) => e.type === 'spiritUsed').length;
        }
      }
      expect(fired, `${item.name}(${item.spiritId})이 한 번도 발동하지 않는다`).toBeGreaterThan(0);
    }
  });

  it('안 낀 정령은 쓰이지 않는다', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(run([], 'aggressive', seed).log.some((e) => e.type === 'spiritUsed')).toBe(false);
    }
  });

  it('수비 태세는 회복·방어 정령을 쓴다', () => {
    let used = 0;
    for (let seed = 0; seed < 20; seed++) {
      used += run(['healingSpring', 'stoneSkin'], 'defensive', seed).log.filter((e) => e.type === 'spiritUsed').length;
    }
    expect(used).toBeGreaterThan(0);
  });

  it('정령은 기력을 소모한다', () => {
    const r = run(['gaiaGrasp'], 'aggressive', 3);
    const heroFinal = r.finalState.allies.find((c) => c.id === 'hero')!;
    expect(heroFinal.energy).toBeLessThan(hero(['gaiaGrasp']).energy);
  });

  it('정령을 낀 쪽이 안 낀 쪽보다 잘 싸운다', () => {
    const wins = (spirits: string[]) => {
      let n = 0;
      for (let seed = 0; seed < 60; seed++) if (run(spirits, 'aggressive', seed).winner === 'ally') n++;
      return n;
    };
    expect(wins(['gaiaGrasp'])).toBeGreaterThanOrEqual(wins([]));
  });
});

/* ─────────────── 상점 ─────────────── */

describe('상점', () => {
  const shop = SHOPS[0]!;

  it('상점은 걸어갈 수 있는 칸에 있다', () => {
    for (const s of SHOPS) {
      const map = getMap(s.mapId);
      expect(map.layers.collision[s.y * map.width + s.x], `${s.id}`).toBe(0);
      expect(shopAt(s.mapId, s.x, s.y)).toBe(s);
    }
  });

  it('파는 값이 사는 값보다 싸다 — 왕복 거래로 돈이 늘지 않는다', () => {
    for (const id of shop.stock) {
      expect(sellPrice(id)).toBeLessThan(buyPrice(id));
    }
  });

  it('사고 바로 팔면 손해다', () => {
    let stones = 5000;
    let inv: Inventory = [];
    const before = stones;
    for (let i = 0; i < 20; i++) {
      const b = buy(shop, inv, stones, 'herbSmall', 1);
      const s = sell(b.inventory, b.stones, 'herbSmall', 1);
      inv = s.inventory;
      stones = s.stones;
    }
    expect(stones).toBeLessThan(before);
    expect(inv.length).toBe(0);
  });

  it('스톤이 모자라면 살 수 있는 만큼만 산다', () => {
    const price = buyPrice('herbLarge');
    const r = buy(shop, empty, price * 2 + 5, 'herbLarge', 10);
    expect(r.bought).toBe(2);
    expect(r.stones).toBe(5);
    expect(r.reason).toBe('money');
  });

  it('돈이 아예 없으면 아무것도 안 사고 아무것도 안 낸다', () => {
    const r = buy(shop, empty, 0, 'herbSmall', 3);
    expect(r.bought).toBe(0);
    expect(r.stones).toBe(0);
    expect(r.inventory).toEqual(empty);
    expect(r.reason).toBe('money');
  });

  it('가방이 꽉 차면 들어가는 만큼만 사고 그만큼만 낸다', () => {
    const limits = { ...DEFAULT_LIMITS, maxWeight: 12 }; // shellPlate 6kg → 2개
    const smith = SHOPS.find((s) => s.stock.includes('shellPlate'))!;
    const r = buy(smith, empty, 999999, 'shellPlate', 5, limits);
    expect(r.bought).toBe(2);
    expect(r.stones).toBe(999999 - 2 * buyPrice('shellPlate'));
    expect(r.reason).toBe('weight');
  });

  it('안 파는 물건은 못 산다', () => {
    const r = buy(shop, empty, 99999, 'evolveStone', 1);
    expect(r.bought).toBe(0);
    expect(r.reason).toBe('notStocked');
  });

  it('없는 물건은 못 판다', () => {
    const r = sell(empty, 100, 'herbSmall', 1);
    expect(r.sold).toBe(0);
    expect(r.stones).toBe(100);
    expect(r.reason).toBe('notOwned');
  });

  it('가진 것보다 많이 팔 수는 없다', () => {
    const inv = addItem(empty, 'herbSmall', 2).inv;
    const r = sell(inv, 0, 'herbSmall', 10);
    expect(r.sold).toBe(2);
    expect(r.stones).toBe(2 * sellPrice('herbSmall'));
  });

  it('끼고 있는 장비는 가방에 없으므로 실수로 팔리지 않는다', () => {
    const inv = addItem(empty, 'shellPlate', 1).inv;
    const worn = equip(emptyEquipment(), inv, 'shellPlate');
    expect(sell(worn.inventory, 0, 'shellPlate', 1).reason).toBe('notOwned');
    expect(worn.equipment.armor).toBe('shellPlate');
  });

  it('전투 보상은 상대 레벨에 비례한다', () => {
    expect(stoneReward([10, 10])).toBeGreaterThan(stoneReward([10]));
    expect(stoneReward([20])).toBeGreaterThan(stoneReward([10]));
    expect(stoneReward([])).toBe(0);
  });

  it('초반 필드 보상으로 기본 장비를 감당할 수 있다', () => {
    // 벌이가 물건값을 전혀 못 따라가면 상점이 장식이 된다
    const perFight = stoneReward([6, 7]);
    expect(perFight * 25).toBeGreaterThan(buyPrice('hideArmor'));
  });
});
