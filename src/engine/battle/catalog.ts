/**
 * 기본 카탈로그 — 저장소의 밸런스 데이터를 전투 엔진이 쓰는 모양으로 편다.
 *
 * 엔진 코드가 JSON을 직접 import 하는 건 여기 한 곳뿐이다. simulateBattle은
 * 카탈로그를 인자로 받으므로, 테스트와 밸런스 시뮬레이터는 가짜 데이터를
 * 넣어 돌릴 수 있다.
 */

import itemsJson from '../../data/items.json';
import skillsJson from '../../data/skills.json';
import spiritsJson from '../../data/spirits.json';
import formulaJson from '../../data/formula.json';
import type { Item, Skill, Spirit } from '../types';
import type { BattleCatalog, FormulaConfig } from './types';

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

export const DEFAULT_FORMULA = formulaJson as FormulaConfig;

export const DEFAULT_CATALOG: BattleCatalog = {
  skills: byId(skillsJson as Skill[]),
  spirits: byId(spiritsJson as Spirit[]),
  items: byId(itemsJson as Item[]),
  formula: DEFAULT_FORMULA,
};

/** 기본 커맨드. 어떤 개체든 기력 없이 쓸 수 있어야 전투가 멈추지 않는다. */
export const BASIC_ATTACK_ID = 'strike';

export function resolveCatalog(partial?: Partial<BattleCatalog>): BattleCatalog {
  if (!partial) return DEFAULT_CATALOG;
  return {
    skills: partial.skills ?? DEFAULT_CATALOG.skills,
    spirits: partial.spirits ?? DEFAULT_CATALOG.spirits,
    items: partial.items ?? DEFAULT_CATALOG.items,
    formula: partial.formula ?? DEFAULT_CATALOG.formula,
  };
}
