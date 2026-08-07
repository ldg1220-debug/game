/**
 * 기본 전투 AI.
 *
 * 커맨드를 정하는 것뿐이고 전투 규칙은 모른다. UI가 붙으면 아군 쪽은
 * 플레이어 입력으로 교체된다. 밸런스 시뮬레이터는 양쪽 모두 이 AI로 돌린다.
 *
 * 난수는 전부 주입된 RNG를 쓴다. 여기서 Math.random을 부르면 같은 seed로
 * 같은 전투가 재현되지 않는다.
 */

import type { RNG } from '../rng';
import type { Skill } from '../types';
import type { BattleCatalog, BattleCommand, BattleView, CombatantView } from './types';

/** 체력이 이 비율 아래로 떨어지면 회복을 우선한다 */
const HEAL_THRESHOLD = 0.35;
/** 공격 대신 보조 스킬을 고를 확률 */
const SUPPORT_CHANCE = 0.25;

function affordable(unit: CombatantView, skill: Skill): boolean {
  return unit.energy >= skill.cost;
}

function known(unit: CombatantView, catalog: BattleCatalog): Skill[] {
  return unit.skills.map((id) => catalog.skills[id]).filter((s): s is Skill => s !== undefined);
}

/** 가장 체력이 적은 적을 노린다. 동점이면 배열 순서 — 결정론을 위해 난수를 쓰지 않는다. */
function weakest(units: readonly CombatantView[]): CombatantView | undefined {
  let best: CombatantView | undefined;
  for (const u of units) {
    if (u.fainted) continue;
    if (!best || u.hp < best.hp) best = u;
  }
  return best;
}

function mostHurt(units: readonly CombatantView[]): CombatantView | undefined {
  let best: CombatantView | undefined;
  let bestRatio = 1;
  for (const u of units) {
    if (u.fainted) continue;
    const ratio = u.hp / u.stats.hp;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = u;
    }
  }
  return best;
}

function decide(
  unit: CombatantView,
  allies: readonly CombatantView[],
  enemies: readonly CombatantView[],
  catalog: BattleCatalog,
  rng: RNG,
): BattleCommand {
  const skills = known(unit, catalog).filter((s) => affordable(unit, s));
  const target = weakest(enemies);
  if (!target) return { kind: 'defend' };

  // 1. 위험한 아군이 있으면 회복을 먼저 본다
  const hurt = mostHurt(allies);
  if (hurt && hurt.hp / hurt.stats.hp < HEAL_THRESHOLD) {
    const heal = skills.find((s) => s.archetype === 'heal' && s.power > 0);
    if (heal) return { kind: 'skill', skillId: heal.id, targetId: hurt.id };
  }

  // 2. 가끔 보조 스킬을 섞는다. 항상 최적 공격만 하면 버프·상태이상이
  //    시뮬레이션에서 한 번도 검증되지 않는다.
  const support = skills.filter(
    (s) => s.archetype === 'guardBuff' || s.archetype === 'ailment' || s.archetype === 'elementBuff' || s.archetype === 'taunt',
  );
  if (support.length > 0 && rng.chance(SUPPORT_CHANCE)) {
    const s = rng.pick(support);
    const to =
      s.target === 'oneEnemy' || s.target === 'allEnemies'
        ? target.id
        : s.target === 'oneAlly'
          ? (hurt?.id ?? unit.id)
          : unit.id;
    return { kind: 'skill', skillId: s.id, targetId: to };
  }

  // 3. 쓸 수 있는 공격 중 기대 위력이 가장 높은 것
  const offensive = skills.filter(
    (s) => (s.archetype === 'single' || s.archetype === 'aoe' || s.archetype === 'guardBreak') && s.power > 0,
  );
  // 전체공격 가산점은 살아 있는 적 수에 비례한다. 고정 배수를 주면 1대1에서도
  // 전체공격을 골라 손해를 본다 — 전체공격은 위력이 낮게 잡혀 있기 때문이다.
  const living = enemies.filter((e) => !e.fainted).length;
  const score = (s: Skill) => s.power * s.accuracy * (s.target === 'allEnemies' ? living : 1);
  if (offensive.length > 0) {
    const best = offensive.reduce((a, b) => (score(b) > score(a) ? b : a));
    const basic = catalog.skills['strike'];
    // 풀에 평타가 없어도 엔진은 평타를 칠 수 있다. 그게 더 세면 그걸 친다.
    if (basic && basic.power * basic.accuracy > score(best)) return { kind: 'attack', targetId: target.id };
    return { kind: 'skill', skillId: best.id, targetId: target.id };
  }

  return { kind: 'attack', targetId: target.id };
}

/** 양쪽을 모두 조작하는 기본 커맨드 소스를 만든다. */
export function createDefaultAI(catalog: BattleCatalog, rng: RNG) {
  return (view: BattleView): Record<string, BattleCommand> => {
    const out: Record<string, BattleCommand> = {};
    for (const u of view.allies) {
      if (!u.fainted) out[u.id] = decide(u, view.allies, view.enemies, catalog, rng);
    }
    for (const u of view.enemies) {
      if (!u.fainted) out[u.id] = decide(u, view.enemies, view.allies, catalog, rng);
    }
    return out;
  };
}
