/**
 * 대화 시스템.
 *
 * JSON 스크립트를 따라 노드를 걸어간다. 조건 분기가 있고, 선택지에 행동이
 * 붙는다. 대화 엔진 자체는 게임을 모른다 — 조건은 좁은 창(WorldView)으로만
 * 보고, 행동은 실행하지 않고 **어떤 행동을 해야 하는지 알려주기만** 한다.
 *
 * 그래야 대화를 미리 훑어보거나 되감아도 부작용이 없다. 실제로 아이템을 주는
 * 건 스토어가 한다.
 */

import dialogueJson from '../data/dialogue.json';
import { questState, type QuestLog, type QuestState } from './quests';

export interface DialogueCondition {
  minLevel?: number;
  hasItem?: string;
  /** 이 퀘스트가 지정한 상태여야 보인다 */
  quest?: { id: string; state: QuestState | QuestState[] };
}

export type DialogueAction =
  | { kind: 'accept'; questId: string }
  | { kind: 'turnIn'; questId: string }
  | { kind: 'end' };

export interface DialogueChoice {
  text: string;
  next?: string;
  action?: DialogueAction;
  condition?: DialogueCondition;
}

export interface DialogueNode {
  id: string;
  text: string;
  next?: string;
  choices?: DialogueChoice[];
  condition?: DialogueCondition;
}

export interface Npc {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  /** 위에서부터 조건을 만족하는 첫 노드에서 대화가 시작된다 */
  entry: string[];
  nodes: DialogueNode[];
}

export const NPCS: Npc[] = dialogueJson as Npc[];

export function npcAt(mapId: string, x: number, y: number): Npc | undefined {
  return NPCS.find((n) => n.mapId === mapId && n.x === x && n.y === y);
}

export function getNpc(id: string): Npc {
  const n = NPCS.find((x) => x.id === id);
  if (!n) throw new RangeError(`없는 NPC: ${id}`);
  return n;
}

export function nodeOf(npc: Npc, id: string): DialogueNode | undefined {
  return npc.nodes.find((n) => n.id === id);
}

/** 대화가 참조하는 바깥 상태. 퀘스트 엔진과 같은 방식으로 좁게 본다. */
export interface DialogueWorld {
  level: number;
  itemCount: (itemId: string) => number;
  questLog: QuestLog;
}

export function meetsCondition(c: DialogueCondition | undefined, w: DialogueWorld): boolean {
  if (!c) return true;
  if (c.minLevel !== undefined && w.level < c.minLevel) return false;
  if (c.hasItem !== undefined && w.itemCount(c.hasItem) <= 0) return false;
  if (c.quest) {
    const want = Array.isArray(c.quest.state) ? c.quest.state : [c.quest.state];
    if (!want.includes(questState(w.questLog, c.quest.id))) return false;
  }
  return true;
}

/**
 * 대화를 시작할 노드.
 *
 * entry 목록을 위에서부터 훑어 조건을 만족하는 첫 노드를 쓴다. "퀘스트 보고가
 * 있으면 그 말부터" 같은 우선순위를 데이터 순서로 표현할 수 있다.
 */
export function entryNode(npc: Npc, w: DialogueWorld): DialogueNode | undefined {
  for (const id of npc.entry) {
    const node = nodeOf(npc, id);
    if (node && meetsCondition(node.condition, w)) return node;
  }
  return undefined;
}

/** 지금 보여줄 선택지. 조건을 만족하지 않는 건 아예 안 보인다. */
export function visibleChoices(node: DialogueNode, w: DialogueWorld): DialogueChoice[] {
  return (node.choices ?? []).filter((c) => meetsCondition(c.condition, w));
}
