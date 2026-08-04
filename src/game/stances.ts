/**
 * 전투 태세.
 *
 * 전투 엔진은 한 번 부르면 끝까지 굴러간다(결정론과 서버 검증을 위해 그렇게
 * 설계했다 — 헌장 Phase 8은 클라이언트가 seed와 로그만 받아 재생한다고 못박는다).
 * 그래서 플레이어의 선택은 **라운드마다의 커맨드가 아니라 태세**로 들어간다.
 *
 * 태세는 CommandSource 정책이다. 특히 포획 태세는 "충분히 깎일 때까지 때리다가
 * 임계 아래로 떨어지면 밧줄을 던진다"로 구현해, 원작의 "지금 잡을까 더 깎을까"
 * 긴장을 한 전투 안에 남긴다.
 */

import type { BattleCatalog, BattleCommand, BattleView, CombatantView, CommandSource } from '../engine/battle';
import type { createDefaultAI } from '../engine/battle';
import type { Skill } from '../engine/types';

export type Stance = 'aggressive' | 'defensive' | 'capture' | 'flee';

export const STANCE_LABEL: Record<Stance, string> = {
  aggressive: '공격',
  defensive: '수비',
  capture: '포획',
  flee: '도주',
};

export const STANCE_HINT: Record<Stance, string> = {
  aggressive: '가장 센 스킬로 몰아친다. 기력이 빨리 마른다.',
  capture: '체력을 깎다가 충분히 약해지면 밧줄을 던진다.',
  defensive: '방어와 회복을 섞는다. 오래 버티지만 오래 걸린다.',
  flee: '싸우지 않고 빠져나간다. 순발력이 낮으면 실패한다.',
};

/** 이 비율 아래로 떨어지면 포획을 시도한다. */
const CAPTURE_HP_THRESHOLD = 0.4;
/** 이 비율 아래면 수비 태세에서 회복을 우선한다. */
const HEAL_HP_THRESHOLD = 0.55;

function alive(units: readonly CombatantView[]): CombatantView[] {
  return units.filter((u) => !u.fainted);
}

function weakestPet(units: readonly CombatantView[]): CombatantView | undefined {
  let best: CombatantView | undefined;
  for (const u of alive(units)) {
    if (u.kind !== 'pet' || !u.speciesId) continue;
    if (!best || u.hp / u.stats.hp < best.hp / best.stats.hp) best = u;
  }
  return best;
}

function known(unit: CombatantView, catalog: BattleCatalog): Skill[] {
  return unit.skills
    .map((id) => catalog.skills[id])
    .filter((s): s is Skill => s !== undefined && unit.energy >= s.cost);
}

function bestOffensive(unit: CombatantView, catalog: BattleCatalog): Skill | undefined {
  const rows = known(unit, catalog).filter(
    (s) => (s.archetype === 'single' || s.archetype === 'aoe' || s.archetype === 'guardBreak') && s.power > 0,
  );
  if (rows.length === 0) return undefined;
  return rows.reduce((a, b) => {
    const score = (s: Skill) => s.power * s.accuracy * (s.target === 'allEnemies' ? 1.6 : 1);
    return score(b) > score(a) ? b : a;
  });
}

/**
 * 아군 쪽 커맨드를 태세로 정하고, 적군은 기본 AI에 맡긴다.
 *
 * enemyAI는 createDefaultAI로 만든 것을 받는다 — 같은 RNG를 공유해야 전투 전체가
 * 하나의 seed로 재현된다.
 */
export function createStanceSource(
  stance: Stance,
  catalog: BattleCatalog,
  enemyAI: ReturnType<typeof createDefaultAI>,
  captureItemId: string,
): CommandSource {
  return (view: BattleView): Record<string, BattleCommand> => {
    // 적군 커맨드를 먼저 뽑아 RNG 소비 순서를 고정한다
    const out = { ...enemyAI(view) };
    for (const u of view.allies) delete out[u.id];

    const enemies = alive(view.enemies);
    const target = weakestPet(view.enemies) ?? enemies[0];

    for (const u of alive(view.allies)) {
      out[u.id] = decide(u, view, target, stance, catalog, captureItemId);
    }
    return out;
  };
}

function decide(
  u: CombatantView,
  view: BattleView,
  target: CombatantView | undefined,
  stance: Stance,
  catalog: BattleCatalog,
  captureItemId: string,
): BattleCommand {
  if (!target) return { kind: 'defend' };

  if (stance === 'flee') {
    // 가장 빠른 한 명만 굴린다. 전원이 굴리면 사실상 확정 도주가 된다.
    const fastest = alive(view.allies).reduce((a, b) => (b.effectiveStats.spd > a.effectiveStats.spd ? b : a));
    return u.id === fastest.id ? { kind: 'flee' } : { kind: 'defend' };
  }

  if (stance === 'capture') {
    const catcher = alive(view.allies).find((a) => a.kind === 'character');
    const weak = weakestPet(view.enemies);
    if (u.kind === 'character' && catcher?.id === u.id && weak && weak.hp / weak.stats.hp <= CAPTURE_HP_THRESHOLD) {
      return { kind: 'capture', targetId: weak.id, itemId: captureItemId };
    }
    // 나머지는 계속 깎되, 한 방에 눕히지 않도록 단일 대상만 노린다
    const single = known(u, catalog).find((s) => s.archetype === 'single' && s.power > 0);
    return single
      ? { kind: 'skill', skillId: single.id, targetId: target.id }
      : { kind: 'attack', targetId: target.id };
  }

  if (stance === 'defensive') {
    const hurt = alive(view.allies).reduce((a, b) => (b.hp / b.stats.hp < a.hp / a.stats.hp ? b : a));
    if (hurt.hp / hurt.stats.hp < HEAL_HP_THRESHOLD) {
      const heal = known(u, catalog).find((s) => s.archetype === 'heal' && s.power > 0);
      if (heal) return { kind: 'skill', skillId: heal.id, targetId: hurt.id };
    }
    const guard = known(u, catalog).find((s) => s.archetype === 'guardBuff' && (s.modifiers?.def ?? 0) > 1);
    if (guard && !u.modifiers.some((m) => m.sourceId === guard.id)) {
      return { kind: 'skill', skillId: guard.id, targetId: u.id };
    }
    const atk = bestOffensive(u, catalog);
    return atk ? { kind: 'skill', skillId: atk.id, targetId: target.id } : { kind: 'defend' };
  }

  // aggressive
  const atk = bestOffensive(u, catalog);
  return atk ? { kind: 'skill', skillId: atk.id, targetId: target.id } : { kind: 'attack', targetId: target.id };
}
