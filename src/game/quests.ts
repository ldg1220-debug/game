/**
 * 퀘스트 엔진.
 *
 * 조건(레벨/아이템/처치/포획) → 보상. 전부 순수 함수다.
 *
 * 진행도를 이벤트로 올린다. 화면이나 스토어가 "지금 몇 마리 잡았지?"를 세지
 * 않고, 전투가 끝날 때 사건 하나를 흘려보내면 여기서 해당하는 목표만 오른다.
 * 세는 곳이 하나뿐이라 어긋날 자리가 없다.
 */

import questsJson from '../data/quests.json';
import type { Element, Rarity } from '../engine/types';

export type Objective =
  /** 특정 종/속성을 쓰러뜨린다 */
  | { kind: 'defeat'; count: number; speciesId?: string; element?: Element }
  /** 특정 종/희귀도를 포획한다 */
  | { kind: 'capture'; count: number; speciesId?: string; rarity?: Rarity }
  /** 아이템을 모은다 — 소지 개수를 본다(소모되지 않는다) */
  | { kind: 'collect'; count: number; itemId: string }
  /** 캐릭터 레벨 도달 */
  | { kind: 'reach'; level: number }
  /** 특정 맵 방문 */
  | { kind: 'visit'; mapId: string };

export interface QuestReward {
  stones?: number;
  exp?: number;
  items?: { itemId: string; qty: number }[];
}

export interface Quest {
  id: string;
  name: string;
  /** 이 NPC에게 받고 이 NPC에게 보고한다 */
  giver: string;
  summary: string;
  /** 완료 시 NPC가 하는 말 */
  completion: string;
  requires?: { level?: number; quests?: string[] };
  objectives: Objective[];
  rewards: QuestReward;
}

export const QUESTS: Quest[] = questsJson as Quest[];
export const QUEST_BY_ID: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export function getQuest(id: string): Quest {
  const q = QUEST_BY_ID[id];
  if (!q) throw new RangeError(`없는 퀘스트: ${id}`);
  return q;
}

/* ─────────────── 진행도 ─────────────── */

export type QuestState =
  /** 아직 안 받았다 */
  | 'locked'
  /** 받을 수 있다 */
  | 'available'
  /** 진행 중 */
  | 'active'
  /** 목표를 다 채웠고 보고만 남았다 */
  | 'ready'
  /** 보상까지 받았다 */
  | 'done';

export interface QuestProgress {
  state: QuestState;
  /** objectives와 같은 길이. collect·reach·visit은 매번 다시 계산한다. */
  counts: number[];
}

export type QuestLog = Record<string, QuestProgress>;

export function initialLog(): QuestLog {
  return {};
}

function progressOf(log: QuestLog, quest: Quest): QuestProgress {
  return log[quest.id] ?? { state: 'locked', counts: quest.objectives.map(() => 0) };
}

export function questState(log: QuestLog, questId: string): QuestState {
  return log[questId]?.state ?? 'locked';
}

/* ─────────────── 세계 상태 ─────────────── */

/**
 * 퀘스트가 참조하는 바깥 상태.
 *
 * 인벤토리나 스토어를 직접 들여다보지 않고 이 좁은 창으로만 본다. 그래야
 * 퀘스트 엔진이 게임 구조를 몰라도 되고, 테스트가 가짜 세계로 돌 수 있다.
 */
export interface WorldView {
  level: number;
  itemCount: (itemId: string) => number;
  visited: ReadonlySet<string>;
  questsDone: ReadonlySet<string>;
}

/** 누적으로 세는 목표(처치·포획)만 진행도를 저장한다. 나머지는 지금 세계를 본다. */
function isCumulative(o: Objective): boolean {
  return o.kind === 'defeat' || o.kind === 'capture';
}

export function objectiveProgress(o: Objective, stored: number, world: WorldView): number {
  switch (o.kind) {
    case 'defeat':
    case 'capture':
      return stored;
    case 'collect':
      return Math.min(o.count, world.itemCount(o.itemId));
    case 'reach':
      return world.level >= o.level ? 1 : 0;
    case 'visit':
      return world.visited.has(o.mapId) ? 1 : 0;
  }
}

export function objectiveTarget(o: Objective): number {
  return o.kind === 'reach' || o.kind === 'visit' ? 1 : o.count;
}

export function objectiveText(o: Objective, nameOf: (id: string) => string): string {
  switch (o.kind) {
    case 'defeat':
      return `${o.speciesId ? nameOf(o.speciesId) : o.element ? `${ELEMENT_LABEL[o.element]} 속성` : '야생 펫'} ${o.count}마리 쓰러뜨리기`;
    case 'capture':
      return `${o.speciesId ? nameOf(o.speciesId) : o.rarity ? `${RARITY_LABEL[o.rarity]} 등급` : '야생 펫'} ${o.count}마리 포획하기`;
    case 'collect':
      return `${nameOf(o.itemId)} ${o.count}개 모으기`;
    case 'reach':
      return `${o.level}레벨 도달하기`;
    case 'visit':
      return `${nameOf(o.mapId)} 다녀오기`;
  }
}

const ELEMENT_LABEL: Record<Element, string> = { earth: '지', water: '수', fire: '화', wind: '풍' };
const RARITY_LABEL: Record<Rarity, string> = { common: '흔한', uncommon: '드문', rare: '희귀', epic: '전설' };

/* ─────────────── 상태 갱신 ─────────────── */

/** 선행 조건을 만족하면 locked → available. */
export function refreshAvailability(log: QuestLog, world: WorldView): QuestLog {
  const out = { ...log };
  for (const q of QUESTS) {
    const p = progressOf(out, q);
    if (p.state !== 'locked') continue;
    const okLevel = q.requires?.level === undefined || world.level >= q.requires.level;
    const okQuests = (q.requires?.quests ?? []).every((id) => world.questsDone.has(id));
    if (okLevel && okQuests) out[q.id] = { ...p, state: 'available' };
  }
  return out;
}

/** 목표를 다 채웠으면 active → ready. 되돌아가지는 않는다. */
export function refreshCompletion(log: QuestLog, world: WorldView): QuestLog {
  const out = { ...log };
  for (const q of QUESTS) {
    const p = out[q.id];
    if (!p || p.state !== 'active') continue;
    const all = q.objectives.every(
      (o, i) => objectiveProgress(o, p.counts[i] ?? 0, world) >= objectiveTarget(o),
    );
    if (all) out[q.id] = { ...p, state: 'ready' };
  }
  return out;
}

export function acceptQuest(log: QuestLog, questId: string): QuestLog {
  const q = getQuest(questId);
  if (questState(log, questId) !== 'available') return log;
  return { ...log, [questId]: { state: 'active', counts: q.objectives.map(() => 0) } };
}

export interface TurnInResult {
  log: QuestLog;
  rewards: QuestReward | null;
}

export function turnInQuest(log: QuestLog, questId: string): TurnInResult {
  const q = getQuest(questId);
  if (questState(log, questId) !== 'ready') return { log, rewards: null };
  return {
    log: { ...log, [questId]: { ...log[questId]!, state: 'done' } },
    rewards: q.rewards,
  };
}

/* ─────────────── 사건 ─────────────── */

export type QuestEvent =
  | { kind: 'defeat'; speciesId: string; element: Element }
  | { kind: 'capture'; speciesId: string; rarity: Rarity };

function matches(o: Objective, e: QuestEvent): boolean {
  if (o.kind !== e.kind) return false;
  if (o.kind === 'defeat' && e.kind === 'defeat') {
    if (o.speciesId && o.speciesId !== e.speciesId) return false;
    if (o.element && o.element !== e.element) return false;
    return true;
  }
  if (o.kind === 'capture' && e.kind === 'capture') {
    if (o.speciesId && o.speciesId !== e.speciesId) return false;
    if (o.rarity && o.rarity !== e.rarity) return false;
    return true;
  }
  return false;
}

/**
 * 사건 하나를 진행 중인 모든 퀘스트에 흘려보낸다.
 *
 * 목표치를 넘겨서 세지 않는다. 5마리 퀘스트에 7이 기록되면 화면에 "7/5"가 뜬다.
 */
export function applyEvents(log: QuestLog, events: readonly QuestEvent[]): QuestLog {
  if (events.length === 0) return log;
  const out = { ...log };

  for (const q of QUESTS) {
    const p = out[q.id];
    if (!p || p.state !== 'active') continue;

    let changed = false;
    const counts = [...p.counts];
    q.objectives.forEach((o, i) => {
      if (!isCumulative(o)) return;
      const target = objectiveTarget(o);
      for (const e of events) {
        if (matches(o, e) && (counts[i] ?? 0) < target) {
          counts[i] = (counts[i] ?? 0) + 1;
          changed = true;
        }
      }
    });
    if (changed) out[q.id] = { ...p, counts };
  }

  return out;
}

/** 화면에 띄울 요약. */
export function questsFor(log: QuestLog, npcId: string) {
  return QUESTS.filter((q) => q.giver === npcId).map((q) => ({
    quest: q,
    state: questState(log, q.id),
    counts: progressOf(log, q).counts,
  }));
}

export function activeQuests(log: QuestLog) {
  return QUESTS.filter((q) => {
    const s = questState(log, q.id);
    return s === 'active' || s === 'ready';
  }).map((q) => ({ quest: q, state: questState(log, q.id), counts: progressOf(log, q).counts }));
}
