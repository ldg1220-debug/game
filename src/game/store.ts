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
import { onFaint, onVictory } from '../engine/loyalty';
import { createRng, type RngState } from '../engine/rng';
import { initialLoyalty } from '../engine/capture';
import type { PetInstance } from '../engine/types';
import { createDanger, dangerLevel, stepDanger, type DangerState } from './encounter';
import { getMap, warpAt, zoneAt } from './maps';
import type { EncounterZone } from './mapTypes';
import { createPlayer, stepMovement, type MoveInput, type PlayerState } from './movement';
import { getSpecies, makeCharacter, petToCombatant, rollEncounterParty } from './party';
import { createStanceSource, type Stance } from './stances';

const START_MAP = 'village';
const CAPTURE_TOOL = 'ropeCrude';
/** 야생 펫을 잡으면 이 경험치를 받는다. 레벨과 마릿수에 비례. */
const EXP_PER_ENEMY_LEVEL = 9;

export interface CharacterState {
  name: string;
  level: number;
  exp: number;
  charm: number;
  stats: Combatant['stats'];
  hp: number;
  skills: string[];
  spirits: string[];
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
  rewards: { exp: number; levelUps: number; captured: PetInstance | null };
  /**
   * 재생이 끝나야 반영되는 상태.
   *
   * 여기서 바로 party에 넣으면 로그가 아직 1라운드를 보여주는 동안 화면 아래
   * 파티 목록에 잡은 펫이 나타난다 — 결과를 미리 흘리는 셈이다. 재생이
   * 끝날 때 finishBattle이 적용한다.
   */
  applied: { party: PetInstance[]; box: PetInstance[]; heroHp: number };
}

export interface GameState {
  screen: 'field' | 'stance' | 'battle' | 'result';
  player: PlayerState;
  danger: DangerState;
  character: CharacterState;
  /** 보유 펫. 앞의 4마리가 전투에 나간다. */
  party: PetInstance[];
  box: PetInstance[];
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
}

function startingCharacter(): CharacterState {
  const stats = { hp: 260, atk: 34, def: 26, spd: 28 };
  return {
    name: '탐험가',
    level: 5,
    exp: 0,
    charm: 12,
    stats,
    hp: stats.hp,
    skills: ['strike', 'gore', 'harden', 'mend'],
    spirits: ['stoneSkin'],
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

export const useGame = create<GameState>((set, get) => ({
  screen: 'field',
  player: createPlayer(START_MAP, getMap(START_MAP).spawn.x, getMap(START_MAP).spawn.y),
  danger: createDanger(),
  character: startingCharacter(),
  party: start.party,
  box: [],
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
      set({
        player,
        danger: createDanger(),
        rngState: rng.getState(),
        messages: [...s.messages.slice(-4), `${getMap(warp.toMapId).name}에 들어섰다.`],
      });
      return;
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
        stats: s.character.stats,
        skills: s.character.skills,
        spirits: s.character.spirits,
      }),
      ...s.party.slice(0, 4).map((p, i) => petToCombatant(p, i >= 2 ? 'back' : 'front')),
    ];

    set({
      screen: 'stance',
      player,
      danger: step.danger,
      tick,
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
      commandSource: createStanceSource(stance, catalog, enemyAI, CAPTURE_TOOL),
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

    const heroFinal = result.finalState.allies.find((c) => c.id === 'hero');

    set({
      screen: 'battle',
      resolved: {
        ...s.pending,
        result,
        stance,
        rewards: { exp: expGain, levelUps, captured },
        applied: {
          party: captured && party.length < 4 ? [...party, captured] : party,
          box: captured && party.length >= 4 ? [...s.box, captured] : s.box,
          heroHp: Math.max(1, heroFinal?.hp ?? s.character.hp),
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
    const wiped = r.result.winner === 'enemy';
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
      character: { ...s.character, hp: wiped ? s.character.stats.hp : r.applied.heroHp },
      messages: [...s.messages.slice(-3), ...lines],
    });
  },
}));

/** UI가 쓰는 파생값. 스토어를 건드리지 않는다. */
export function currentDangerLevel(s: GameState) {
  const map = getMap(s.player.mapId);
  const inZone = zoneAt(map, s.player.tile.x, s.player.tile.y) !== undefined;
  return { level: dangerLevel(s.danger, inZone), inZone, map };
}
