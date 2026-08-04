/**
 * 게임 상태.
 *
 * Zustand 스토어 하나가 진실의 원본이고, 렌더러와 UI는 여기서 **읽기만** 한다.
 *
 * 필드 난수는 스토어가 상태값(숫자 하나)으로 들고 있다. 전역 RNG 객체를 두면
 * 세이브·리플레이에서 그 객체를 어떻게 복원할지가 문제가 되므로, 처음부터
 * 직렬화 가능한 형태로 둔다.
 */

import { create } from 'zustand';
import {
  DEFAULT_CATALOG,
  createDefaultAI,
  simulateBattle,
  type BattleResult,
  type Combatant,
} from '../engine/battle';
import { createPetInstance, gainExp } from '../engine/growth';
import { onFaint, onFeed, onVictory } from '../engine/loyalty';
import { createRng, type RngState } from '../engine/rng';
import { initialLoyalty } from '../engine/capture';
import { growthScore, type PetInstance } from '../engine/types';
import { createDanger, dangerLevel, stepDanger, type DangerState } from './encounter';
import { applyEquipment, availableSpirits, emptyEquipment, equip, equipmentWeight, unequip, type Equipment } from './equipment';
import { ITEMS, addItem, removeItem, weightOf, type Inventory } from './inventory';
import { CURRENCY, buy, sell, shopAt, stoneReward, type Shop } from './shop';
import { entryNode, nodeOf, npcAt, visibleChoices, type DialogueAction, type DialogueNode, type DialogueWorld, type Npc } from './dialogue';
import { emptyDex, markCaught, markSeen, type DexState } from './dex';
import {
  acceptQuest,
  applyEvents,
  initialLog,
  refreshAvailability,
  refreshCompletion,
  turnInQuest,
  QUEST_BY_ID,
  type QuestEvent,
  type QuestLog,
  type WorldView,
} from './quests';
import { canEvolve, evolve, rerollGrowth, type EvolveMode } from '../engine/growth/evolve';
import { getMap, warpAt, zoneAt } from './maps';
import type { EncounterZone } from './mapTypes';
import { createPlayer, stepMovement, type MoveInput, type PlayerState } from './movement';
import { getSpecies, makeCharacter, petToCombatant, rollEncounterParty } from './party';
import { createStanceSource, type Stance } from './stances';

const START_MAP = 'village';
/** 포획 태세가 쓰는 밧줄. 가방에 있는 것 중 가장 좋은 걸 고른다. */
const CAPTURE_TOOLS = ['ropeMaster', 'ropeFine', 'ropeCrude'] as const;
/** 야생 펫을 잡으면 이 경험치를 받는다. 레벨과 마릿수에 비례. */
const EXP_PER_ENEMY_LEVEL = 9;

export interface CharacterState {
  name: string;
  level: number;
  exp: number;
  charm: number;
  /** 장비를 빼고 순수하게 캐릭터가 가진 능력치 */
  baseStats: Combatant['stats'];
  hp: number;
  skills: string[];
}

export interface PendingBattle {
  zone: EncounterZone;
  wild: PetInstance[];
  allies: Combatant[];
  enemies: Combatant[];
  seed: number;
}

export interface ResolvedBattle extends PendingBattle {
  result: BattleResult;
  stance: Stance;
  /** 전투 후 적용될 변화. UI가 결과 화면에 쓴다. */
  rewards: { exp: number; levelUps: number; captured: PetInstance | null; stones: number };
  /**
   * 재생이 끝나야 반영되는 상태.
   *
   * 여기서 바로 party에 넣으면 로그가 아직 1라운드를 보여주는 동안 화면 아래
   * 파티 목록에 잡은 펫이 나타난다 — 결과를 미리 흘리는 셈이다. 재생이
   * 끝날 때 finishBattle이 적용한다.
   */
  applied: {
    party: PetInstance[];
    box: PetInstance[];
    heroHp: number;
    inventory: Inventory;
    stones: number;
    questLog: QuestLog;
    dex: DexState;
  };
}

export interface GameState {
  screen: 'field' | 'stance' | 'battle' | 'shop' | 'pack' | 'talk' | 'dex';
  player: PlayerState;
  danger: DangerState;
  character: CharacterState;
  /** 보유 펫. 앞의 4마리가 전투에 나간다. */
  party: PetInstance[];
  box: PetInstance[];
  inventory: Inventory;
  equipment: Equipment;
  stones: number;
  /** 지금 열려 있는 상점 */
  shop: Shop | null;
  /** 지금 대화 중인 NPC와 노드 */
  talking: { npc: Npc; node: DialogueNode } | null;
  questLog: QuestLog;
  dex: DexState;
  visited: string[];
  rngState: RngState;
  tick: number;
  messages: string[];
  pending: PendingBattle | null;
  resolved: ResolvedBattle | null;

  /** 필드 한 프레임. 렌더 루프가 부른다. */
  tickField: (dt: number, input: MoveInput) => void;
  chooseStance: (stance: Stance) => void;
  finishBattle: () => void;
  say: (text: string) => void;

  openPack: () => void;
  openDex: () => void;
  closeScreen: () => void;
  chooseDialogue: (index: number) => void;
  advanceDialogue: () => void;
  evolvePet: (uid: string, mode: EvolveMode) => void;
  rerollPet: (uid: string) => void;
  equipItem: (itemId: string) => void;
  unequipSlot: (slot: keyof Equipment) => void;
  useItem: (itemId: string) => void;
  buyItem: (itemId: string, qty: number) => void;
  sellItem: (itemId: string, qty: number) => void;
}

function startingCharacter(): CharacterState {
  const baseStats = { hp: 260, atk: 34, def: 26, spd: 28 };
  return {
    name: '탐험가',
    level: 5,
    exp: 0,
    charm: 12,
    baseStats,
    hp: baseStats.hp,
    skills: ['strike', 'gore', 'harden', 'mend'],
  };
}

/** 처음 받는 펫 하나. 필드 RNG를 소비하므로 소비 후 상태를 함께 돌려준다. */
function startingParty(seed: RngState): { party: PetInstance[]; rngState: RngState } {
  const rng = createRng(seed);
  const petSeed = rng.int(0, 2 ** 30);
  const pet = createPetInstance(getSpecies('emberfox'), {
    uid: `pet-${petSeed}`,
    level: 5,
    seed: petSeed,
    rng,
    loyalty: 70,
    capturedAt: 0,
  });
  return { party: [pet], rngState: rng.getState() };
}

const START_SEED = 20260804 >>> 0;
const start = startingParty(START_SEED);

/** 시작 소지품. 밧줄 없이 나가면 첫 포획이 불가능하다. */
function startingPack(): { inventory: Inventory; equipment: Equipment } {
  let inv: Inventory = [];
  for (const [id, qty] of [['herbSmall', 3], ['ropeCrude', 5], ['meatChunk', 2]] as const) {
    inv = addItem(inv, id, qty).inv;
  }
  const put = addItem(inv, 'clubStone', 1).inv;
  const worn = equip(emptyEquipment(), put, 'clubStone');
  return { inventory: worn.inventory, equipment: worn.equipment };
}
const pack = startingPack();

/**
 * 시작 시점의 퀘스트 상태.
 *
 * 빈 로그로 시작하면 모든 퀘스트가 locked이라, 촌장 머리 위에 느낌표가 뜨지
 * 않는다. 처음 켰을 때 어디로 가야 하는지 알 수 없다 — 실제로 그랬다.
 */
const startingQuests = refreshAvailability(initialLog(), {
  level: 5,
  itemCount: (id) => pack.inventory.reduce((n, x) => (x.itemId === id ? n + x.qty : n), 0),
  visited: new Set([START_MAP]),
  questsDone: new Set<string>(),
});

/** 퀘스트·대화가 보는 좁은 창. 두 엔진 모두 스토어 구조를 몰라도 된다. */
function worldOf(s: GameState): WorldView & DialogueWorld {
  return {
    level: s.character.level,
    itemCount: (id) => s.inventory.reduce((n, x) => (x.itemId === id ? n + x.qty : n), 0),
    visited: new Set(s.visited),
    questsDone: new Set(Object.entries(s.questLog).filter(([, p]) => p.state === 'done').map(([id]) => id)),
    questLog: s.questLog,
  };
}

/** 퀘스트 상태를 지금 세계에 맞춰 다시 접는다. 상태가 바뀔 만한 곳마다 부른다. */
function refreshed(s: GameState, log: QuestLog): QuestLog {
  const world = worldOf({ ...s, questLog: log });
  return refreshCompletion(refreshAvailability(log, world), world);
}

export const useGame = create<GameState>((set, get) => ({
  screen: 'field',
  player: createPlayer(START_MAP, getMap(START_MAP).spawn.x, getMap(START_MAP).spawn.y),
  danger: createDanger(),
  character: startingCharacter(),
  party: start.party,
  box: [],
  inventory: pack.inventory,
  equipment: pack.equipment,
  stones: CURRENCY.starting,
  shop: null,
  talking: null,
  questLog: startingQuests,
  dex: emptyDex(),
  visited: [START_MAP],
  rngState: start.rngState,
  tick: 0,
  messages: ['돌바람 마을. 남쪽 길로 나가면 초원이다.'],
  pending: null,
  resolved: null,

  say(text) {
    set((s) => ({ messages: [...s.messages.slice(-4), text] }));
  },

  tickField(dt, input) {
    const s = get();
    if (s.screen !== 'field') return;

    const map = getMap(s.player.mapId);
    const moved = stepMovement(map, s.player, input, dt);
    if (!moved.arrived) {
      if (moved.player !== s.player) set({ player: moved.player });
      return;
    }

    let player = moved.player;
    const rng = createRng(s.rngState);

    // 워프가 먼저다. 워프 칸에서 인카운터가 걸리면 맵이 바뀌는 중에 전투가 뜬다.
    const warp = warpAt(map, player.tile.x, player.tile.y);
    if (warp) {
      player = { ...player, mapId: warp.toMapId, tile: { x: warp.toX, y: warp.toY }, target: null, progress: 0 };
      const visited = s.visited.includes(warp.toMapId) ? s.visited : [...s.visited, warp.toMapId];
      const next = { ...s, visited };
      set({
        player,
        visited,
        danger: createDanger(),
        rngState: rng.getState(),
        // 방문이 퀘스트 목표일 수 있다
        questLog: refreshed(next, s.questLog),
        messages: [...s.messages.slice(-4), `${getMap(warp.toMapId).name}에 들어섰다.`],
      });
      return;
    }

    // 상점 문 앞에 서면 열린다. 문은 맵 데이터에 이미 있는 칸이라 따로 표시할
    // 게 없고, 상점 위치가 economy.json 한 곳에만 있다.
    const shop = shopAt(map.id, player.tile.x, player.tile.y);
    if (shop) {
      set({ screen: 'shop', shop, player, rngState: rng.getState(), messages: [...s.messages.slice(-4), `${shop.name} — ${shop.greeting}`] });
      return;
    }

    // NPC 앞에 서면 말을 건다
    const npc = npcAt(map.id, player.tile.x, player.tile.y);
    if (npc) {
      const log = refreshed(s, s.questLog);
      const node = entryNode(npc, worldOf({ ...s, questLog: log }));
      if (node) {
        set({ screen: 'talk', talking: { npc, node }, player, questLog: log, rngState: rng.getState() });
        return;
      }
    }

    const step = stepDanger(map, player.tile, s.danger, rng);
    if (!step.triggered || !step.zone) {
      set({ player, danger: step.danger, rngState: rng.getState() });
      return;
    }

    // 인카운터. 여기서 전투를 굴리지 않고 태세 선택 화면으로 넘긴다.
    const tick = s.tick + 1;
    const { pets, combatants } = rollEncounterParty(step.zone, rng, tick);
    const allies: Combatant[] = [
      makeCharacter({
        id: 'hero',
        name: s.character.name,
        level: s.character.level,
        charm: s.character.charm,
        // 장비 보정과 깃든 정령이 여기서 전투로 넘어간다
        stats: applyEquipment(s.character.baseStats, s.equipment),
        skills: s.character.skills,
        spirits: availableSpirits(s.equipment),
      }),
      ...s.party.slice(0, 4).map((p, i) => petToCombatant(p, i >= 2 ? 'back' : 'front')),
    ];

    set({
      screen: 'stance',
      player,
      danger: step.danger,
      tick,
      // 마주친 것만으로도 도감에 남는다. 못 잡은 종이 목록에 보여야 다시 나간다.
      dex: markSeen(s.dex, pets.map((p) => p.speciesId)),
      rngState: rng.getState(),
      pending: { zone: step.zone, wild: pets, allies, enemies: combatants, seed: rng.int(0, 2 ** 30) },
      messages: [...s.messages.slice(-4), `${step.zone.name}에서 무언가 튀어나왔다!`],
    });
  },

  chooseStance(stance) {
    const s = get();
    if (!s.pending) return;

    // 전투 seed는 미리 뽑아둔 값이다. 태세를 바꿔도 같은 야생 파티와 싸운다.
    const catalog = DEFAULT_CATALOG;
    const rng = createRng(s.pending.seed);
    const enemyAI = createDefaultAI(catalog, rng);
    const result = simulateBattle({
      allies: s.pending.allies,
      enemies: s.pending.enemies,
      seed: s.pending.seed,
      // 가진 것 중 가장 좋은 밧줄을 쓴다
      commandSource: createStanceSource(
        stance,
        catalog,
        enemyAI,
        CAPTURE_TOOLS.find((id) => s.inventory.some((x) => x.itemId === id)) ?? 'ropeCrude',
      ),
    });

    // ── 전투 결과를 개체에 반영한다 ──
    const won = result.winner === 'ally';
    const expGain = won
      ? s.pending.enemies.reduce((sum, e) => sum + e.level * EXP_PER_ENEMY_LEVEL, 0)
      : 0;

    const faintedIds = new Set(result.finalState.allies.filter((c) => c.hp <= 0).map((c) => c.id));
    let levelUps = 0;
    const party = s.party.map((pet) => {
      let next = pet;
      if (expGain > 0) {
        const g = gainExp(next, expGain);
        next = g.pet;
        levelUps += g.levelsGained;
      }
      const loyalty = faintedIds.has(pet.uid)
        ? onFaint(next.loyalty)
        : won
          ? onVictory(next.loyalty)
          : next.loyalty;
      return { ...next, loyalty };
    });

    const stones = won ? stoneReward(s.pending.enemies.map((e) => e.level)) : 0;

    // 던진 밧줄은 없어진다. 성공하든 실패하든 소모품이다.
    let nextInventory = s.inventory;
    const ropeId =
      CAPTURE_TOOLS.find((id) => s.inventory.some((x) => x.itemId === id)) ?? 'ropeCrude';
    const throws = result.log.filter((e) => e.type === 'captureAttempt').length;
    if (throws > 0) nextInventory = removeItem(nextInventory, ropeId, throws).inv;

    // ── 포획 ──
    let captured: PetInstance | null = null;
    if (result.capturedPet) {
      const caught = s.pending.wild.find((p) => p.uid === result.capturedPet!.combatantId);
      const enemy = s.pending.enemies.find((c) => c.id === result.capturedPet!.combatantId);
      if (caught && enemy) {
        captured = {
          ...caught,
          loyalty: initialLoyalty(
            {
              speciesId: caught.speciesId,
              captureBaseRate: enemy.captureBaseRate ?? 0,
              hp: result.capturedPet.hpRatioAtCapture * enemy.stats.hp,
              maxHp: enemy.stats.hp,
              level: caught.level,
            },
            { level: s.character.level, charm: s.character.charm },
          ),
          capturedAt: Date.now(),
        };
      }
    }

    // 퀘스트 사건을 만든다. 세는 곳은 퀘스트 엔진 한 곳뿐이다.
    const events: QuestEvent[] = [];
    for (const e of s.pending.enemies) {
      const final = result.finalState.enemies.find((c) => c.id === e.id);
      const wasCaptured = result.capturedPet?.combatantId === e.id;
      if (wasCaptured) {
        const sp = getSpecies(e.speciesId!);
        events.push({ kind: 'capture', speciesId: sp.id, rarity: sp.rarity });
      } else if (final && final.hp <= 0) {
        events.push({ kind: 'defeat', speciesId: e.speciesId!, element: e.element.primary });
      }
    }

    const heroFinal = result.finalState.allies.find((c) => c.id === 'hero');

    set({
      screen: 'battle',
      resolved: {
        ...s.pending,
        result,
        stance,
        rewards: { exp: expGain, levelUps, captured, stones },
        applied: {
          party: captured && party.length < 4 ? [...party, captured] : party,
          box: captured && party.length >= 4 ? [...s.box, captured] : s.box,
          heroHp: Math.max(1, heroFinal?.hp ?? s.character.hp),
          inventory: nextInventory,
          stones: s.stones + stones,
          questLog: applyEvents(s.questLog, events),
          dex: captured ? markCaught(s.dex, captured.speciesId) : s.dex,
        },
      },
      pending: null,
    });
  },

  finishBattle() {
    const s = get();
    const r = s.resolved;
    if (!r) return;
    const lines: string[] = [];
    if (r.result.winner === 'ally') lines.push(`승리. 경험치 ${r.rewards.exp}`);
    else if (r.result.endedBy === 'flee') lines.push('도망쳤다.');
    else lines.push('패배했다. 마을로 돌아간다.');
    if (r.rewards.captured) lines.push(`${getSpecies(r.rewards.captured.speciesId).name}을(를) 잡았다!`);
    if (r.rewards.levelUps > 0) lines.push(`레벨 업 ${r.rewards.levelUps}회`);

    // 전멸하면 마을로 돌려보낸다. 되돌릴 수 없는 손실을 만들지는 않는다.
    // 도주도 winner가 'enemy'다(도망친 쪽은 이기지 못한다). 그것까지 전멸로
    // 치면 도망칠 때마다 마을로 끌려가고 체력이 가득 차 버린다 — 도주가
    // 손해가 아니라 무료 귀환이 되어, 위험한 판단이라는 성격이 사라진다.
    const wiped = r.result.winner === 'enemy' && r.result.endedBy === 'defeat';
    const player = wiped
      ? createPlayer(START_MAP, getMap(START_MAP).spawn.x, getMap(START_MAP).spawn.y)
      : s.player;

    set({
      screen: 'field',
      resolved: null,
      player,
      danger: createDanger(),
      party: r.applied.party,
      box: r.applied.box,
      inventory: r.applied.inventory,
      stones: r.applied.stones,
      dex: r.applied.dex,
      questLog: refreshed({ ...s, inventory: r.applied.inventory, questLog: r.applied.questLog }, r.applied.questLog),
      character: {
        ...s.character,
        hp: wiped ? applyEquipment(s.character.baseStats, s.equipment).hp : r.applied.heroHp,
      },
      messages: [...s.messages.slice(-3), ...lines],
    });
  },

  /* ─────────────── 소지품 ─────────────── */

  openPack() {
    const s = get();
    if (s.screen === 'field') set({ screen: 'pack', questLog: refreshed(s, s.questLog) });
  },

  openDex() {
    if (get().screen === 'field') set({ screen: 'dex' });
  },

  /* ─────────────── 대화 ─────────────── */

  /**
   * 선택지를 고른다.
   *
   * 행동(퀘스트 수락·보고)은 대화 엔진이 아니라 여기서 실행한다. 엔진은 무엇을
   * 해야 하는지 알려줄 뿐이라, 대화를 미리 훑어봐도 부작용이 없다.
   */
  chooseDialogue(index) {
    const s = get();
    if (!s.talking) return;
    const choice = visibleChoices(s.talking.node, worldOf(s))[index];
    if (!choice) return;

    let log = s.questLog;
    let inventory = s.inventory;
    let stones = s.stones;
    let party = s.party;
    const lines: string[] = [];

    const act = (a: DialogueAction) => {
      if (a.kind === 'accept') {
        log = acceptQuest(log, a.questId);
        lines.push(`퀘스트 수락 — ${QUEST_BY_ID[a.questId]?.name ?? a.questId}`);
        return;
      }
      if (a.kind === 'turnIn') {
        const r = turnInQuest(log, a.questId);
        if (!r.rewards) return;
        log = r.log;
        const q = QUEST_BY_ID[a.questId];
        lines.push(`퀘스트 완료 — ${q?.name ?? a.questId}`);

        if (r.rewards.stones) {
          stones += r.rewards.stones;
          lines.push(`+${r.rewards.stones} 스톤`);
        }
        for (const it of r.rewards.items ?? []) {
          const put = addItem(inventory, it.itemId, it.qty);
          inventory = put.inv;
          if (put.added < it.qty) lines.push(`${ITEMS[it.itemId]?.name}을(를) 다 못 받았다 — 가방을 비우고 오면 된다.`);
          else lines.push(`${ITEMS[it.itemId]?.name} ×${put.added}`);
        }
        if (r.rewards.exp) {
          party = party.map((p) => gainExp(p, r.rewards!.exp!).pet);
          lines.push(`펫 경험치 +${r.rewards.exp}`);
        }
      }
    };

    if (choice.action) act(choice.action);

    const nextState = { ...s, questLog: log, inventory, stones, party };
    log = refreshed(nextState, log);

    const nextNode = choice.next ? nodeOf(s.talking.npc, choice.next) : undefined;
    set({
      questLog: log,
      inventory,
      stones,
      party,
      messages: [...s.messages, ...lines].slice(-5),
      ...(nextNode
        ? { talking: { npc: s.talking.npc, node: nextNode } }
        : { screen: 'field' as const, talking: null }),
    });
  },

  /** 선택지가 없는 노드에서 다음으로. next가 없으면 대화가 끝난다. */
  advanceDialogue() {
    const s = get();
    if (!s.talking) return;
    const nextNode = s.talking.node.next ? nodeOf(s.talking.npc, s.talking.node.next) : undefined;
    if (nextNode) set({ talking: { npc: s.talking.npc, node: nextNode } });
    else set({ screen: 'field', talking: null });
  },

  /* ─────────────── 진화 ─────────────── */

  evolvePet(uid, mode) {
    const s = get();
    const pet = s.party.find((p) => p.uid === uid) ?? s.box.find((p) => p.uid === uid);
    if (!pet) return;

    const from = getSpecies(pet.speciesId);
    const world = worldOf(s);
    // 퀘스트 진화는 주술사의 퀘스트를 끝내야 열린다
    const check = canEvolve(pet, from, {
      hasItem: (id) => world.itemCount(id) > 0,
      questDone: world.questsDone.has('boundOfGrowth'),
      mode,
    });
    if (!check.ok) {
      const why = {
        noEvolution: '이 펫은 진화하지 않는다.',
        level: `${check.requiredLevel}레벨이 되어야 한다.`,
        item: `${ITEMS[check.requiredItemId ?? '']?.name ?? '재료'}가 필요하다.`,
        questIncomplete: '주술사에게 배운 뒤에야 가능하다.',
      }[check.reason ?? 'noEvolution'];
      set({ messages: [...s.messages.slice(-4), why] });
      return;
    }

    const rng = createRng(s.rngState);
    const to = getSpecies(check.toSpeciesId!);
    const r = evolve(pet, from, to, mode, rng);
    const swap = (list: PetInstance[]) => list.map((p) => (p.uid === uid ? r.pet : p));

    set({
      party: swap(s.party),
      box: swap(s.box),
      inventory: removeItem(s.inventory, check.requiredItemId!, 1).inv,
      dex: markCaught(s.dex, to.id),
      rngState: rng.getState(),
      messages: [
        ...s.messages.slice(-3),
        `${from.name}이(가) ${to.name}(으)로 진화했다.`,
        `성장률 ${growthScore(r.before).toFixed(2)} → ${growthScore(r.after).toFixed(2)}`,
      ],
    });
  },

  rerollPet(uid) {
    const s = get();
    const pet = s.party.find((p) => p.uid === uid) ?? s.box.find((p) => p.uid === uid);
    const world = worldOf(s);
    if (!pet) return;
    if (world.itemCount('rerollDraught') <= 0) {
      set({ messages: [...s.messages.slice(-4), '재추첨의 물약이 없다.'] });
      return;
    }

    const rng = createRng(s.rngState);
    const r = rerollGrowth(pet, getSpecies(pet.speciesId), rng);
    const swap = (list: PetInstance[]) => list.map((p) => (p.uid === uid ? r.pet : p));

    set({
      party: swap(s.party),
      box: swap(s.box),
      inventory: removeItem(s.inventory, 'rerollDraught', 1).inv,
      rngState: rng.getState(),
      messages: [
        ...s.messages.slice(-4),
        // 상한은 오르지 않는다. 같은 범위에서 다시 뽑을 뿐이다.
        `성장률 재추첨 ${growthScore(r.before).toFixed(2)} → ${growthScore(r.after).toFixed(2)}`,
      ],
    });
  },

  closeScreen() {
    const s = get();
    if (s.screen === 'shop' || s.screen === 'pack' || s.screen === 'dex' || s.screen === 'talk') {
      set({ screen: 'field', shop: null, talking: null });
    }
  },

  equipItem(itemId) {
    const s = get();
    const r = equip(s.equipment, s.inventory, itemId);
    if (!r.ok) return;
    // 장비가 최대 체력을 바꾸므로 현재 체력이 그 위로 튀지 않게 맞춘다
    const maxHp = applyEquipment(s.character.baseStats, r.equipment).hp;
    set({
      equipment: r.equipment,
      inventory: r.inventory,
      character: { ...s.character, hp: Math.min(s.character.hp, maxHp) },
    });
  },

  unequipSlot(slot) {
    const s = get();
    const r = unequip(s.equipment, s.inventory, slot);
    if (!r.ok) return;
    const maxHp = applyEquipment(s.character.baseStats, r.equipment).hp;
    set({
      equipment: r.equipment,
      inventory: r.inventory,
      character: { ...s.character, hp: Math.min(s.character.hp, maxHp) },
    });
  },

  useItem(itemId) {
    const s = get();
    const item = ITEMS[itemId];
    if (!item || s.inventory.every((x) => x.itemId !== itemId)) return;

    if (item.kind === 'heal' && item.heal && item.heal > 0) {
      const maxHp = applyEquipment(s.character.baseStats, s.equipment).hp;
      if (s.character.hp >= maxHp) {
        set({ messages: [...s.messages.slice(-4), '체력이 이미 가득하다.'] });
        return;
      }
      const healed = Math.min(maxHp, s.character.hp + item.heal);
      set({
        inventory: removeItem(s.inventory, itemId, 1).inv,
        character: { ...s.character, hp: healed },
        messages: [...s.messages.slice(-4), `${item.name} — ${healed - s.character.hp} 회복`],
      });
      return;
    }

    if (item.kind === 'food' && item.loyalty) {
      // 가장 충성도가 낮은 펫에게 준다. 관리가 필요한 쪽부터 챙기는 게 자연스럽다.
      const target = s.party.reduce<PetInstance | null>(
        (a, b) => (a === null || b.loyalty < a.loyalty ? b : a),
        null,
      );
      if (!target) return;
      set({
        inventory: removeItem(s.inventory, itemId, 1).inv,
        party: s.party.map((p) =>
          p.uid === target.uid ? { ...p, loyalty: onFeed(p.loyalty, item.loyalty!) } : p,
        ),
        messages: [
          ...s.messages.slice(-4),
          `${getSpecies(target.speciesId).name}에게 ${item.name}을(를) 줬다.`,
        ],
      });
      return;
    }

    set({ messages: [...s.messages.slice(-4), '지금은 쓸 수 없다.'] });
  },

  buyItem(itemId, qty) {
    const s = get();
    if (!s.shop) return;
    const r = buy(s.shop, s.inventory, s.stones, itemId, qty);
    const item = ITEMS[itemId];
    const note =
      r.bought > 0
        ? `${item?.name} ${r.bought}개 샀다.`
        : r.reason === 'money'
          ? '스톤이 모자란다.'
          : r.reason === 'weight'
            ? '더 들 수 없다.'
            : '가방이 꽉 찼다.';
    set({ inventory: r.inventory, stones: r.stones, messages: [...s.messages.slice(-4), note] });
  },

  sellItem(itemId, qty) {
    const s = get();
    const r = sell(s.inventory, s.stones, itemId, qty);
    if (r.sold === 0) return;
    set({
      inventory: r.inventory,
      stones: r.stones,
      messages: [...s.messages.slice(-4), `${ITEMS[itemId]?.name} ${r.sold}개 팔았다. +${r.stones - s.stones}`],
    });
  },
}));

/**
 * UI가 쓰는 파생값. 스토어를 건드리지 않는다.
 *
 * 장비 보정을 여러 컴포넌트가 각자 계산하면 언젠가 한 곳이 어긋난다. 한 곳에서
 * 만들어 내려보낸다.
 *
 * **이걸 Zustand 셀렉터로 직접 넘기지 말 것.** 매번 새 객체를 돌려주므로
 * 참조 비교가 항상 실패해 무한 렌더 루프가 된다. UI는 useCharacterView()로
 * 감싸 쓴다.
 */
export function characterView(
  character: CharacterState,
  equipment: Equipment,
  inventory: Inventory,
) {
  const stats = applyEquipment(character.baseStats, equipment);
  return {
    stats,
    maxHp: stats.hp,
    spirits: availableSpirits(equipment),
    /** 가방 + 장비. 끼고 있는 물건도 몸에 얹혀 있다. */
    carriedWeight: weightOf(inventory) + equipmentWeight(equipment),
  };
}

export function currentDangerLevel(s: GameState) {
  const map = getMap(s.player.mapId);
  const inZone = zoneAt(map, s.player.tile.x, s.player.tile.y) !== undefined;
  return { level: dangerLevel(s.danger, inZone), inZone, map };
}
