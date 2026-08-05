/**
 * 데이터 스키마 검증.
 *
 * 헌장 절대규칙 2에 따라 밸런스 수치는 전부 JSON에 있다. 그러면 코드가 아니라
 * 데이터가 게임을 망가뜨릴 수 있게 되므로, 그 데이터를 막는 관문이 필요하다.
 * 이 파일이 그 관문이다.
 *
 * 검사는 세 층이다.
 *   1. 스키마 — 필드 이름·타입·범위 (zod)
 *   2. 불변식 — 성장률 상한, min≤max, 아키타입별 필수 필드
 *   3. 참조 무결성 — skillPool·evolveTo·spiritId가 실제로 존재하는지
 *
 * 셋 중 하나라도 깨지면 빌드가 실패한다(tools/validate-data.ts).
 */

import { z } from 'zod';
import {
  ELEMENTS,
  GROWTH_SCORE_CAP,
  growthScore,
  PET_FORMS,
  type Item,
  type PetSpecies,
  type Skill,
  type Spirit,
  type Stats,
} from '../engine/types';

/* ─────────────── 스키마 ─────────────── */

const ElementSchema = z.enum(ELEMENTS);
const RaritySchema = z.enum(['common', 'uncommon', 'rare', 'epic']);
const TargetSchema = z.enum(['oneEnemy', 'allEnemies', 'oneAlly', 'allAllies', 'self']);
const AilmentSchema = z.enum(['paralysis', 'sleep', 'poison', 'confusion']);
const PetFormSchema = z.enum(PET_FORMS);

/** 능력치는 음수가 될 수 없다. 성장률도 같은 모양을 쓰므로 실수를 허용한다. */
const StatsSchema = z.strictObject({
  hp: z.number().finite().nonnegative(),
  atk: z.number().finite().nonnegative(),
  def: z.number().finite().nonnegative(),
  spd: z.number().finite().nonnegative(),
});

const ModifiersSchema = z.strictObject({
  atk: z.number().positive().optional(),
  def: z.number().positive().optional(),
  spd: z.number().positive().optional(),
});

export const PetSpeciesSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  element: z.strictObject({
    primary: ElementSchema,
    secondary: ElementSchema.nullable(),
  }),
  baseStats: StatsSchema,
  growthRange: z.strictObject({ min: StatsSchema, max: StatsSchema }),
  skillPool: z.array(z.string().min(1)).min(1),
  captureBaseRate: z.number().gt(0).max(1),
  rarity: RaritySchema,
  form: PetFormSchema,
  evolveTo: z
    .strictObject({
      speciesId: z.string().min(1),
      requiredLevel: z.number().int().min(1).max(99),
      itemId: z.string().min(1),
    })
    .optional(),
});

export const SkillSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: z.enum([
    'single',
    'aoe',
    'guardBuff',
    'taunt',
    'ailment',
    'heal',
    'elementBuff',
    'guardBreak',
  ]),
  element: ElementSchema.nullable(),
  target: TargetSchema,
  power: z.number().finite().nonnegative(),
  cost: z.number().int().nonnegative(),
  accuracy: z.number().gt(0).max(1),
  ailment: AilmentSchema.optional(),
  duration: z.number().int().min(1).max(10).optional(),
  modifiers: ModifiersSchema.optional(),
  description: z.string().min(1),
});

export const SpiritSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  element: ElementSchema.nullable(),
  target: TargetSchema,
  effect: z.strictObject({
    kind: z.enum(['damage', 'heal', 'buff', 'ailment', 'loyaltyGuard']),
    ailment: AilmentSchema.optional(),
    modifiers: ModifiersSchema.optional(),
  }),
  levels: z
    .array(
      z.strictObject({
        cost: z.number().int().positive(),
        successRate: z.number().gt(0).max(1),
        duration: z.number().int().nonnegative(),
        power: z.number().finite().nonnegative(),
      }),
    )
    .length(5),
  description: z.string().min(1),
});

export const ItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['heal', 'captureTool', 'evolution', 'equipment', 'food']),
  price: z.number().int().nonnegative(),
  weight: z.number().nonnegative(),
  heal: z.number().nonnegative().optional(),
  captureMultiplier: z.number().positive().optional(),
  slot: z.enum(['weapon', 'armor', 'accessory']).optional(),
  bonus: z
    .strictObject({
      hp: z.number().optional(),
      atk: z.number().optional(),
      def: z.number().optional(),
      spd: z.number().optional(),
    })
    .optional(),
  spiritId: z.string().min(1).optional(),
  loyalty: z.number().int().positive().optional(),
  description: z.string().min(1),
});

/* ─────────────── 전투 수식 상수 ─────────────── */

const ratio = z.number().positive().finite();

/**
 * formula.json — 전투 수식의 모든 상수.
 *
 * 코드에는 식의 모양만 있고 숫자는 전부 여기 있으므로, 이 파일이 깨지면 전투가
 * 통째로 이상해진다. 그래서 다른 데이터와 같은 관문을 통과시킨다.
 */
export const FormulaSchema = z.strictObject({
  battle: z.strictObject({
    maxRounds: z.number().int().min(1),
    maxPartySize: z.number().int().min(1),
    energyRegenPerRound: z.number().int().nonnegative(),
  }),
  order: z.strictObject({ jitterMin: ratio, jitterMax: ratio }),
  hit: z.strictObject({
    base: z.number().gt(0).max(1),
    spdWeight: z.number().nonnegative(),
    min: z.number().gt(0).max(1),
    max: z.number().gt(0).max(1),
  }),
  damage: z.strictObject({
    defFactor: z.number().nonnegative(),
    varianceMin: ratio,
    varianceMax: ratio,
    floor: z.number().min(1),
  }),
  element: z.strictObject({
    advantage: ratio,
    neutral: ratio,
    disadvantage: ratio,
    primaryWeight: z.number().gt(0).lt(1),
    secondaryWeight: z.number().gt(0).lt(1),
  }),
  crit: z.strictObject({
    base: z.number().min(0).max(1),
    spdWeight: z.number().nonnegative(),
    multiplier: z.number().min(1),
    max: z.number().gt(0).max(1),
  }),
  row: z.strictObject({ backTakenPhysical: ratio, backDealtMelee: ratio }),
  defend: z.strictObject({ damageTaken: ratio }),
  ailment: z.strictObject({
    resistBase: z.number().min(0).max(1),
    resistSpdWeight: z.number().nonnegative(),
    resistMax: z.number().min(0).lt(1),
    paralysisMinTurns: z.number().int().min(1),
    paralysisMaxTurns: z.number().int().min(1),
    poisonMaxHpRatio: z.number().gt(0).lt(1),
  }),
  flee: z.strictObject({
    base: z.number().min(0).max(1),
    spdWeight: z.number().nonnegative(),
    min: z.number().min(0).max(1),
    max: z.number().gt(0).max(1),
  }),
  capture: z.strictObject({ escapeOnFail: z.number().min(0).max(1) }),
});

/** 스키마만으로는 못 잡는 관계식. min>max 같은 건 게임을 조용히 망가뜨린다. */
function checkFormula(raw: unknown, errors: string[]): void {
  const parsed = FormulaSchema.safeParse(raw);
  if (!parsed.success) {
    errors.push(...formatIssues('formula', parsed.error));
    return;
  }
  const c = parsed.data;
  const pairs: [string, number, number][] = [
    ['order.jitter', c.order.jitterMin, c.order.jitterMax],
    ['hit', c.hit.min, c.hit.max],
    ['damage.variance', c.damage.varianceMin, c.damage.varianceMax],
    ['flee', c.flee.min, c.flee.max],
    ['ailment.paralysisTurns', c.ailment.paralysisMinTurns, c.ailment.paralysisMaxTurns],
  ];
  for (const [name, lo, hi] of pairs) {
    if (lo > hi) errors.push(`formula.${name}: min(${lo})이 max(${hi})보다 크다`);
  }
  if (Math.abs(c.element.primaryWeight + c.element.secondaryWeight - 1) > 1e-9) {
    errors.push('formula.element: primaryWeight + secondaryWeight가 1이 아니다');
  }
  if (!(c.element.disadvantage < c.element.neutral && c.element.neutral < c.element.advantage)) {
    errors.push('formula.element: 불리 < 동일 < 유리 순서가 아니다');
  }
  if (c.defend.damageTaken >= 1) {
    errors.push('formula.defend: 방어 커맨드가 피해를 줄이지 않는다');
  }
  if (c.row.backTakenPhysical >= 1 || c.row.backDealtMelee >= 1) {
    errors.push('formula.row: 후열 보정이 감소가 아니다');
  }
}

/* ─────────────── 성장·포획·충성도 상수 ─────────────── */

/**
 * growth.json — 육성 쪽 상수.
 *
 * 전투와 분리한 이유는 튜닝 주기가 다르기 때문이다. 전투 수식은 거의 안 건드리고,
 * 성장 곡선과 포획률은 밸런스 시뮬레이터를 돌릴 때마다 움직인다.
 */
export const GrowthSchema = z.strictObject({
  exp: z.strictObject({
    coefficient: z.number().positive(),
    exponent: z.number().positive(),
    maxLevel: z.number().int().min(2).max(999),
  }),
  capture: z.strictObject({
    hpExponent: z.number().positive(),
    charmWeight: z.number().nonnegative(),
    levelDecayPerLevel: z.number().gt(0).lt(1),
    levelPenaltyMin: z.number().gt(0).max(1),
    min: z.number().gt(0).max(1),
    max: z.number().gt(0).max(1),
  }),
  loyalty: z.strictObject({
    min: z.number().int().min(0),
    max: z.number().int().min(1),
    initialBase: z.number().nonnegative(),
    initialHpWeight: z.number().nonnegative(),
    initialCharmWeight: z.number().nonnegative(),
    faintPenalty: z.number().positive(),
    victoryBonus: z.number().positive(),
    idleDecayPerDay: z.number().nonnegative(),
    charmDropWeight: z.number().nonnegative(),
    disobeyThreshold: z.number().positive(),
    hostileThreshold: z.number().positive(),
    fleeThreshold: z.number().positive(),
    disobeyMaxChance: z.number().gt(0).max(1),
    hostileMaxChance: z.number().gt(0).max(1),
    fleeMaxChance: z.number().gt(0).max(1),
  }),
});

function checkGrowthConfig(raw: unknown, errors: string[]): void {
  const parsed = GrowthSchema.safeParse(raw);
  if (!parsed.success) {
    errors.push(...formatIssues('growth', parsed.error));
    return;
  }
  const c = parsed.data;
  if (c.capture.min > c.capture.max) {
    errors.push(`growth.capture: min(${c.capture.min})이 max(${c.capture.max})보다 크다`);
  }
  if (c.capture.max >= 1) {
    // 확실한 포획이 존재하면 "더 깎을까 지금 잡을까"의 긴장이 사라진다
    errors.push('growth.capture: 포획 확률 상한이 1 이상이다');
  }
  const l = c.loyalty;
  if (!(l.fleeThreshold < l.hostileThreshold && l.hostileThreshold < l.disobeyThreshold)) {
    errors.push('growth.loyalty: 도주 < 적대 < 불복종 임계값 순서가 아니다');
  }
  if (l.disobeyThreshold > l.max) {
    errors.push('growth.loyalty: 불복종 임계값이 최대 충성도보다 크다');
  }
  // 만피 포획이 곧바로 불복종 구간이면, 잡자마자 못 쓰는 펫이 된다
  const worstInitial = l.initialBase;
  if (worstInitial <= l.hostileThreshold) {
    errors.push(`growth.loyalty: 초기 충성도(${worstInitial})가 적대 임계값 이하다`);
  }
  if (l.victoryBonus >= l.faintPenalty) {
    // 회복이 하락보다 빠르면 관리라는 행위 자체가 사라진다
    errors.push('growth.loyalty: 승리 회복량이 기절 하락폭 이상이다');
  }
}

/* ─────────────── 필드 상수 ─────────────── */

/** field.json — 이동 속도와 인카운터 게이지. */
export const FieldSchema = z.strictObject({
  movement: z.strictObject({ tilesPerSecond: z.number().positive() }),
  encounter: z.strictObject({
    jitterMin: ratio,
    jitterMax: ratio,
    graceSteps: z.number().int().nonnegative(),
    safeDecayPerStep: z.number().gt(0).max(1),
    warnThreshold: z.number().gt(0).lt(1),
  }),
  combatant: z.strictObject({
    energyBase: z.number().nonnegative(),
    energyPerLevel: z.number().nonnegative(),
    skillSlots: z.number().int().min(1).max(8),
  }),
});

function checkField(raw: unknown, errors: string[]): void {
  const parsed = FieldSchema.safeParse(raw);
  if (!parsed.success) {
    errors.push(...formatIssues('field', parsed.error));
    return;
  }
  const c = parsed.data;
  if (c.encounter.jitterMin > c.encounter.jitterMax) {
    errors.push('field.encounter: jitterMin이 jitterMax보다 크다');
  }
  // 유예가 너무 길면 인카운터가 사실상 사라지고, 게이지를 보여줄 이유도 없어진다
  if (c.encounter.graceSteps > 60) {
    errors.push(`field.encounter: 유예 걸음(${c.encounter.graceSteps})이 지나치게 길다`);
  }
}

/* ─────────────── 경제 ─────────────── */

/** economy.json — 화폐·가방 제한·상점. */
export const EconomySchema = z.strictObject({
  currency: z.strictObject({
    name: z.string().min(1),
    starting: z.number().int().nonnegative(),
    perEnemyLevel: z.number().nonnegative(),
  }),
  inventory: z.strictObject({
    maxSlots: z.number().int().min(1),
    maxWeight: z.number().positive(),
    maxStack: z.number().int().min(1),
  }),
  trade: z.strictObject({ sellRatio: z.number().gt(0).lt(1) }),
  shops: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        name: z.string().min(1),
        mapId: z.string().min(1),
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        greeting: z.string().min(1),
        stock: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

function checkEconomy(raw: unknown, items: Item[], errors: string[]): void {
  const parsed = EconomySchema.safeParse(raw);
  if (!parsed.success) {
    errors.push(...formatIssues('economy', parsed.error));
    return;
  }
  const c = parsed.data;
  const itemIds = new Set(items.map((i) => i.id));
  const seen = new Set<string>();

  for (const shop of c.shops) {
    if (seen.has(shop.id)) errors.push(`economy.shops: id 중복 — ${shop.id}`);
    seen.add(shop.id);
    for (const id of shop.stock) {
      if (!itemIds.has(id)) errors.push(`economy.shops(${shop.id}): 없는 아이템 — ${id}`);
    }
  }

  // 파는 값이 사는 값 이상이면 상점 왕복만으로 무한히 돈이 는다
  if (c.trade.sellRatio >= 1) errors.push('economy.trade: 매입가가 정가 이상이다');

  // 가장 싼 물건도 팔 때 1스톤은 받아야 판다는 행위가 의미를 가진다
  for (const item of items) {
    if (item.price > 0 && Math.floor(item.price * c.trade.sellRatio) < 1 && item.price >= 2) {
      errors.push(`economy.trade: ${item.id}의 매입가가 0이 된다`);
    }
  }
}

/* ─────────────── 퀘스트 · 대화 ─────────────── */

const ObjectiveSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('defeat'), count: z.number().int().min(1), speciesId: z.string().optional(), element: ElementSchema.optional() }),
  z.strictObject({ kind: z.literal('capture'), count: z.number().int().min(1), speciesId: z.string().optional(), rarity: RaritySchema.optional() }),
  z.strictObject({ kind: z.literal('collect'), count: z.number().int().min(1), itemId: z.string().min(1) }),
  z.strictObject({ kind: z.literal('reach'), level: z.number().int().min(1).max(99) }),
  z.strictObject({ kind: z.literal('visit'), mapId: z.string().min(1) }),
]);

export const QuestSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  giver: z.string().min(1),
  summary: z.string().min(1),
  completion: z.string().min(1),
  requires: z
    .strictObject({ level: z.number().int().min(1).optional(), quests: z.array(z.string()).optional() })
    .optional(),
  objectives: z.array(ObjectiveSchema).min(1),
  rewards: z.strictObject({
    stones: z.number().int().nonnegative().optional(),
    exp: z.number().int().nonnegative().optional(),
    items: z.array(z.strictObject({ itemId: z.string().min(1), qty: z.number().int().min(1) })).optional(),
  }),
});

const QuestStateSchema = z.enum(['locked', 'available', 'active', 'ready', 'done']);

const ConditionSchema = z.strictObject({
  minLevel: z.number().int().min(1).optional(),
  hasItem: z.string().min(1).optional(),
  quest: z
    .strictObject({ id: z.string().min(1), state: z.union([QuestStateSchema, z.array(QuestStateSchema)]) })
    .optional(),
});

export const NpcSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  mapId: z.string().min(1),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  entry: z.array(z.string().min(1)).min(1),
  nodes: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        text: z.string().min(1),
        next: z.string().optional(),
        condition: ConditionSchema.optional(),
        choices: z
          .array(
            z.strictObject({
              text: z.string().min(1),
              next: z.string().optional(),
              condition: ConditionSchema.optional(),
              action: z
                .union([
                  z.strictObject({ kind: z.literal('accept'), questId: z.string().min(1) }),
                  z.strictObject({ kind: z.literal('turnIn'), questId: z.string().min(1) }),
                  z.strictObject({ kind: z.literal('end') }),
                ])
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
});

function checkQuestsAndDialogue(
  rawQuests: unknown,
  rawDialogue: unknown,
  items: Item[],
  pets: PetSpecies[],
  errors: string[],
): void {
  const quests = z.array(QuestSchema).safeParse(rawQuests);
  if (!quests.success) {
    errors.push(...formatIssues('quests', quests.error));
    return;
  }
  const npcs = z.array(NpcSchema).safeParse(rawDialogue);
  if (!npcs.success) {
    errors.push(...formatIssues('dialogue', npcs.error));
    return;
  }

  const itemIds = new Set(items.map((i) => i.id));
  const petIds = new Set(pets.map((p) => p.id));
  const questIds = new Set(quests.data.map((q) => q.id));
  const npcIds = new Set(npcs.data.map((n) => n.id));

  for (const q of quests.data) {
    if (!npcIds.has(q.giver)) errors.push(`quests(${q.id}): 없는 NPC — ${q.giver}`);
    for (const id of q.requires?.quests ?? []) {
      if (!questIds.has(id)) errors.push(`quests(${q.id}).requires: 없는 퀘스트 — ${id}`);
      if (id === q.id) errors.push(`quests(${q.id}): 자기 자신을 선행 조건으로 삼는다`);
    }
    for (const o of q.objectives) {
      if (o.kind === 'collect' && !itemIds.has(o.itemId)) errors.push(`quests(${q.id}): 없는 아이템 — ${o.itemId}`);
      if ((o.kind === 'defeat' || o.kind === 'capture') && o.speciesId && !petIds.has(o.speciesId)) {
        errors.push(`quests(${q.id}): 없는 종 — ${o.speciesId}`);
      }
    }
    for (const it of q.rewards.items ?? []) {
      if (!itemIds.has(it.itemId)) errors.push(`quests(${q.id}).rewards: 없는 아이템 — ${it.itemId}`);
    }
    // 보상이 아예 없으면 받을 이유가 없는 퀘스트가 된다
    const empty = !q.rewards.stones && !q.rewards.exp && (q.rewards.items ?? []).length === 0;
    if (empty) errors.push(`quests(${q.id}): 보상이 없다`);
  }

  for (const npc of npcs.data) {
    const nodeIds = new Set(npc.nodes.map((n) => n.id));
    for (const id of npc.entry) {
      if (!nodeIds.has(id)) errors.push(`dialogue(${npc.id}).entry: 없는 노드 — ${id}`);
    }
    for (const node of npc.nodes) {
      // 막다른 노드가 되면 대화가 닫히지 않는다
      if (node.next && !nodeIds.has(node.next)) errors.push(`dialogue(${npc.id}.${node.id}): 없는 노드 — ${node.next}`);
      for (const c of node.choices ?? []) {
        if (c.next && !nodeIds.has(c.next)) errors.push(`dialogue(${npc.id}.${node.id}): 없는 노드 — ${c.next}`);
        if (c.action && c.action.kind !== 'end' && !questIds.has(c.action.questId)) {
          errors.push(`dialogue(${npc.id}.${node.id}): 없는 퀘스트 — ${c.action.questId}`);
        }
        if (!c.next && !c.action) {
          errors.push(`dialogue(${npc.id}.${node.id}): 선택지 "${c.text}"가 아무 데도 가지 않는다`);
        }
      }
      if (node.condition?.quest && !questIds.has(node.condition.quest.id)) {
        errors.push(`dialogue(${npc.id}.${node.id}): 없는 퀘스트 — ${node.condition.quest.id}`);
      }
    }
  }

  // 받을 수 있는 퀘스트는 반드시 대화로 받을 수 있어야 한다
  const accepted = new Set(
    npcs.data.flatMap((n) => n.nodes.flatMap((d) => (d.choices ?? []).map((c) => (c.action?.kind === 'accept' ? c.action.questId : '')))),
  );
  const turnedIn = new Set(
    npcs.data.flatMap((n) => n.nodes.flatMap((d) => (d.choices ?? []).map((c) => (c.action?.kind === 'turnIn' ? c.action.questId : '')))),
  );
  for (const q of quests.data) {
    if (!accepted.has(q.id)) errors.push(`quests(${q.id}): 대화로 받을 수 없다`);
    if (!turnedIn.has(q.id)) errors.push(`quests(${q.id}): 대화로 보고할 수 없다`);
  }
}

/* ─────────────── 스키마 ↔ 타입 동기화 ───────────────
 *
 * 스키마와 types.ts가 따로 놀면 검증은 통과하는데 코드가 터진다. 아래 단언이
 * 컴파일 타임에 둘의 상호 대입 가능성을 확인한다. 한쪽만 필드를 추가하면
 * tsc가 여기서 멈춘다. */

type Assert<T extends true> = T;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type PetParity = Assert<Mutual<z.infer<typeof PetSpeciesSchema>, PetSpecies>>;
export type SkillParity = Assert<Mutual<z.infer<typeof SkillSchema>, Skill>>;
export type SpiritParity = Assert<Mutual<z.infer<typeof SpiritSchema>, Spirit>>;
export type ItemParity = Assert<Mutual<z.infer<typeof ItemSchema>, Item>>;

/* ─────────────── 검증 ─────────────── */

export interface ValidationResult {
  errors: string[];
  pets: PetSpecies[];
  skills: Skill[];
  spirits: Spirit[];
  items: Item[];
}

/** zod 이슈를 "pets[3].baseStats.hp: 메시지" 형태의 한 줄로 편다. */
function formatIssues(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const path = i.path.length > 0 ? `.${i.path.join('.')}`.replace(/\.(\d+)/g, '[$1]') : '';
    return `${file}${path}: ${i.message}`;
  });
}

function parseList<T>(file: string, schema: z.ZodType<T>, raw: unknown, errors: string[]): T[] {
  if (!Array.isArray(raw)) {
    errors.push(`${file}: 최상위가 배열이 아니다`);
    return [];
  }
  const out: T[] = [];
  raw.forEach((entry, idx) => {
    const parsed = schema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
    else errors.push(...formatIssues(`${file}[${idx}]`, parsed.error));
  });
  return out;
}

function checkDuplicateIds(file: string, rows: { id: string }[], errors: string[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`${file}: id 중복 — ${row.id}`);
    seen.add(row.id);
  }
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spd'] as const;

/** 성장률 상한과 범위 정합성. 이 게임의 코어 루프를 지키는 검사다. */
function checkGrowth(pets: PetSpecies[], errors: string[]): void {
  for (const p of pets) {
    const { min, max } = p.growthRange;

    for (const k of STAT_KEYS) {
      if (min[k] > max[k]) {
        errors.push(`pets(${p.id}).growthRange: ${k}의 min(${min[k]})이 max(${max[k]})보다 크다`);
      }
      if (min[k] <= 0) {
        errors.push(`pets(${p.id}).growthRange.min.${k}: 성장률은 0보다 커야 한다`);
      }
    }

    // 상한 검사는 max 조합에 대해서만 하면 충분하다. 개체 추첨은 min~max
    // 사이에서만 나오므로, max가 상한 아래면 어떤 개체도 상한을 넘지 못한다.
    const top = growthScore(max);
    if (top > GROWTH_SCORE_CAP + 1e-9) {
      errors.push(
        `pets(${p.id}): 성장률 상한 초과 — max 지표 ${top.toFixed(4)} > 상한 ${GROWTH_SCORE_CAP}`,
      );
    }
  }
}

/** 아키타입마다 반드시 있어야 할 필드가 있다. 없으면 전투 엔진이 조용히 무행동한다. */
function checkSkillShape(skills: Skill[], errors: string[]): void {
  for (const s of skills) {
    const at = s.archetype;
    if ((at === 'single' || at === 'aoe') && s.power <= 0) {
      errors.push(`skills(${s.id}): ${at}인데 power가 0이다`);
    }
    if (at === 'ailment' && !s.ailment) {
      errors.push(`skills(${s.id}): ailment 계열인데 걸 상태이상이 없다`);
    }
    if ((at === 'guardBuff' || at === 'elementBuff') && !s.modifiers) {
      errors.push(`skills(${s.id}): ${at}인데 modifiers가 없다`);
    }
    if ((at === 'guardBuff' || at === 'elementBuff' || at === 'taunt') && s.duration === undefined) {
      errors.push(`skills(${s.id}): ${at}인데 duration이 없다`);
    }
    if (s.ailment && s.duration === undefined) {
      errors.push(`skills(${s.id}): 상태이상을 거는데 duration이 없다`);
    }
    // 배수의 진 계열은 반드시 대가가 있어야 한다. 공격만 올리는 버프는
    // 선택의 여지가 없는 무조건 사용 스킬이 되어 전투를 납작하게 만든다.
    if (at === 'guardBuff' && s.modifiers?.atk !== undefined && s.modifiers.atk > 1) {
      const cost = (s.modifiers.def ?? 1) < 1 || (s.modifiers.spd ?? 1) < 1;
      if (!cost) errors.push(`skills(${s.id}): 공격 버프에 대가(방어/속도 하락)가 없다`);
    }
  }
}

/** 정령 레벨은 올릴수록 나아져야 한다. 아니면 레벨업이 손해가 된다. */
function checkSpiritLevels(spirits: Spirit[], errors: string[]): void {
  for (const sp of spirits) {
    const e = sp.effect;
    if (e.kind === 'ailment' && !e.ailment) {
      errors.push(`spirits(${sp.id}): ailment 정령인데 걸 상태이상이 없다`);
    }
    if (e.kind === 'buff' && !e.modifiers) {
      errors.push(`spirits(${sp.id}): buff 정령인데 modifiers가 없다`);
    }
    if ((e.kind === 'damage' || e.kind === 'heal') && sp.levels.some((l) => l.power <= 0)) {
      errors.push(`spirits(${sp.id}): ${e.kind} 정령인데 위력이 0인 레벨이 있다`);
    }

    for (let i = 1; i < sp.levels.length; i++) {
      const prev = sp.levels[i - 1]!;
      const cur = sp.levels[i]!;
      if (cur.cost < prev.cost) {
        errors.push(`spirits(${sp.id}).levels[${i}]: 기력 소모가 이전 레벨보다 적다`);
      }
      if (cur.successRate < prev.successRate) {
        errors.push(`spirits(${sp.id}).levels[${i}]: 성공률이 이전 레벨보다 낮다`);
      }
      if (cur.power < prev.power) {
        errors.push(`spirits(${sp.id}).levels[${i}]: 위력이 이전 레벨보다 낮다`);
      }
    }
  }
}

/** kind마다 있어야 할 필드가 다르다. */
function checkItemShape(items: Item[], errors: string[]): void {
  for (const it of items) {
    if (it.kind === 'captureTool' && it.captureMultiplier === undefined) {
      errors.push(`items(${it.id}): 포획 도구인데 captureMultiplier가 없다`);
    }
    if (it.kind === 'equipment') {
      if (!it.slot) errors.push(`items(${it.id}): 장비인데 slot이 없다`);
      if (!it.bonus) errors.push(`items(${it.id}): 장비인데 bonus가 없다`);
    }
    if (it.kind === 'food' && it.loyalty === undefined) {
      errors.push(`items(${it.id}): 먹이인데 충성도 회복량이 없다`);
    }
    if (it.slot && it.kind !== 'equipment') {
      errors.push(`items(${it.id}): 장비가 아닌데 slot이 있다`);
    }
    if (it.spiritId && it.kind !== 'equipment') {
      // 정령은 장비에 깃든다. 소모품에 붙이면 원작 마법 시스템의 구조가 무너진다.
      errors.push(`items(${it.id}): 정령은 장비에만 깃들 수 있다`);
    }
  }
}

function checkReferences(r: ValidationResult): void {
  const skillIds = new Set(r.skills.map((s) => s.id));
  const itemIds = new Set(r.items.map((i) => i.id));
  const petIds = new Set(r.pets.map((p) => p.id));
  const spiritIds = new Set(r.spirits.map((s) => s.id));

  for (const p of r.pets) {
    for (const s of p.skillPool) {
      if (!skillIds.has(s)) r.errors.push(`pets(${p.id}).skillPool: 없는 스킬 — ${s}`);
    }
    if (p.evolveTo) {
      if (!petIds.has(p.evolveTo.speciesId)) {
        r.errors.push(`pets(${p.id}).evolveTo: 없는 종 — ${p.evolveTo.speciesId}`);
      }
      if (!itemIds.has(p.evolveTo.itemId)) {
        r.errors.push(`pets(${p.id}).evolveTo: 없는 아이템 — ${p.evolveTo.itemId}`);
      }
      if (p.evolveTo.speciesId === p.id) {
        r.errors.push(`pets(${p.id}).evolveTo: 자기 자신으로 진화한다`);
      }
    }
  }
  for (const it of r.items) {
    if (it.spiritId && !spiritIds.has(it.spiritId)) {
      r.errors.push(`items(${it.id}).spiritId: 없는 정령 — ${it.spiritId}`);
    }
  }
}

/** 원본(파싱 전) JSON을 받아 전부 검증한다. 던지지 않고 에러 목록을 돌려준다. */
export function validateData(raw: {
  pets: unknown;
  skills: unknown;
  spirits: unknown;
  items: unknown;
  formula?: unknown;
  growth?: unknown;
  field?: unknown;
  economy?: unknown;
  quests?: unknown;
  dialogue?: unknown;
}): ValidationResult {
  const errors: string[] = [];
  const result: ValidationResult = {
    errors,
    pets: parseList('pets', PetSpeciesSchema, raw.pets, errors),
    skills: parseList('skills', SkillSchema, raw.skills, errors),
    spirits: parseList('spirits', SpiritSchema, raw.spirits, errors),
    items: parseList('items', ItemSchema, raw.items, errors),
  };

  checkDuplicateIds('pets', result.pets, errors);
  checkDuplicateIds('skills', result.skills, errors);
  checkDuplicateIds('spirits', result.spirits, errors);
  checkDuplicateIds('items', result.items, errors);

  checkGrowth(result.pets, errors);
  checkSkillShape(result.skills, errors);
  checkSpiritLevels(result.spirits, errors);
  checkItemShape(result.items, errors);
  checkReferences(result);
  if (raw.formula !== undefined) checkFormula(raw.formula, errors);
  if (raw.growth !== undefined) checkGrowthConfig(raw.growth, errors);
  if (raw.field !== undefined) checkField(raw.field, errors);
  if (raw.economy !== undefined) checkEconomy(raw.economy, result.items, errors);
  if (raw.quests !== undefined && raw.dialogue !== undefined) {
    checkQuestsAndDialogue(raw.quests, raw.dialogue, result.items, result.pets, errors);
  }

  return result;
}

/** 개체 성장률이 종의 범위 안에 있고 상한을 넘지 않는지. 추첨 코드가 쓴다. */
export function isGrowthWithinSpecies(growth: Stats, species: PetSpecies): boolean {
  if (growthScore(growth) > GROWTH_SCORE_CAP + 1e-9) return false;
  return STAT_KEYS.every(
    (k) => growth[k] >= species.growthRange.min[k] - 1e-9 && growth[k] <= species.growthRange.max[k] + 1e-9,
  );
}
