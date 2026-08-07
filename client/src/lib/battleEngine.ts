import {
  MAX_SKILL_SLOTS,
  STATUS_LABEL,
  type ActiveStatus,
  type ElementPoints,
  type PetAbility,
  type PetInstance,
  type Element,
  type Skill,
  type StatusEffect,
} from './gameTypes';
import { equippedSkillIds, getCurrentAbility, getMaxHp, tamerAbility, tamerMaxHp } from './petUtils';
import { getShape } from './petData';
import { getSkill, SKILLS } from './skillData';
import { elementAffinity, sameElementBonus, skillAffinity } from './typeChart';

export type BattleAction =
  | { type: 'attack'; skillId: string }
  | { type: 'defend' }
  | { type: 'switch'; index: number }
  | { type: 'flee' }
  | { type: 'tamer' }
  | { type: 'wait' };

export type Side = 'player' | 'enemy';

/** 전투에 참여하는 단위. 펫이거나 테이머다. */
export interface Combatant {
  kind: 'pet' | 'tamer';
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  ability: PetAbility;
  elementPoints: ElementPoints;
  skillIds: string[];
  status: ActiveStatus | null;
  defending: boolean;
  /** 펫일 때만 채워진다. 전투 후 원본에 HP를 되돌리기 위한 참조. */
  petId?: string;
  shapeId?: number;
}

export interface BattleState {
  playerTeam: Combatant[];
  enemyTeam: Combatant[];
  tamer: Combatant;
  /** 테이머가 이번 전투에서 이미 공격했는지 (매 턴 1회가 아니라 쿨다운제) */
  tamerCooldown: number;
  playerActiveIndex: number;
  enemyActiveIndex: number;
  turn: number;
  log: string[];
  status: 'ongoing' | 'won' | 'lost' | 'fled';
  /** 이번 턴에 발생한 연출용 이벤트 */
  effects: BattleEffect[];
}

export interface BattleEffect {
  side: Side | 'tamer';
  kind: 'hit' | 'crit' | 'miss' | 'status' | 'heal';
  amount?: number;
  label?: string;
  /** 상성 결과. SUPER EFFECTIVE / RESISTED 표시와 사운드에 쓴다. */
  effectiveness?: 'super' | 'neutral' | 'weak';
  /** 사용된 스킬 속성. 입자 이펙트와 효과음 선택에 쓴다. */
  element?: Element;
}

const TAMER_COOLDOWN_TURNS = 3;

export function petToCombatant(pet: PetInstance): Combatant {
  return {
    kind: 'pet',
    id: pet.id,
    // 별명이 없으면 종 이름을 쓴다. shapeId를 그대로 넣으면 로그와 HP바에 숫자가 노출된다.
    name: pet.nickname || getShape(pet.shapeId).name,
    level: pet.level,
    hp: pet.currentHp,
    maxHp: getMaxHp(pet),
    ability: getCurrentAbility(pet),
    elementPoints: pet.elementPoints,
    skillIds: equippedSkillIds(pet),
    status: null,
    defending: false,
    petId: pet.id,
    shapeId: pet.shapeId,
  };
}

export function tamerToCombatant(name: string, level: number, currentHp: number): Combatant {
  return {
    kind: 'tamer',
    id: 'tamer',
    name,
    level,
    hp: currentHp,
    maxHp: tamerMaxHp(level),
    ability: tamerAbility(level),
    // 테이머는 특정 원소에 치우치지 않는다
    elementPoints: { fire: 3, water: 3, earth: 2, wind: 2 },
    skillIds: ['tackle'],
    status: null,
    defending: false,
  };
}

export function getCombatantSkills(c: Combatant): Skill[] {
  const ids = c.skillIds.length > 0 ? c.skillIds : ['tackle'];
  return ids.slice(0, MAX_SKILL_SLOTS).map(getSkill);
}

export function initializeBattle(
  playerTeam: Combatant[],
  enemyTeam: Combatant[],
  tamer: Combatant,
): BattleState {
  const startIndex = playerTeam.findIndex((c) => c.hp > 0);
  return {
    playerTeam,
    enemyTeam,
    tamer,
    tamerCooldown: 0,
    playerActiveIndex: startIndex === -1 ? 0 : startIndex,
    enemyActiveIndex: 0,
    turn: 1,
    log: ['전투 시작!'],
    status: 'ongoing',
    effects: [],
  };
}

export function calculateDamage(
  attacker: Combatant,
  defender: Combatant,
  skill: Skill,
): { damage: number; isCrit: boolean; multiplier: number } {
  const attackStat = skill.category === 'physical' ? attacker.ability.ATK : attacker.ability.SPA;
  const defenseStat = skill.category === 'physical' ? defender.ability.DEF : defender.ability.SPD;

  // 설계 문서 5.4의 `공격력 × 위력 / 방어력`을 그대로 쓰면 Lv.1 기준 95 데미지가 나와
  // 최대 HP 40인 펫이 한 방에 쓰러진다. 레벨 스케일링 항과 정규화 상수를 넣어
  // 공방 성장이 상쇄되도록 하고, 전투가 레벨 구간과 무관하게 6~8턴 유지되게 한다.
  const levelFactor = (2 * attacker.level) / 5 + 2;
  const power = skill.power * sameElementBonus(attacker.elementPoints, skill.element);
  let base = (levelFactor * power * attackStat) / Math.max(1, defenseStat) / 50 + 2;

  // 무속성 스킬은 공격자의 원소 배분으로 상성을 계산한다(문서 5.3 방식).
  // 속성이 붙은 스킬은 그 속성으로 계산한다.
  const multiplier =
    skill.element === 'none'
      ? elementAffinity(attacker.elementPoints, defender.elementPoints)
      : skillAffinity(skill.element, defender.elementPoints);

  // 화상은 물리 공격력을 절반으로 떨어뜨린다
  if (attacker.status?.effect === 'burn' && skill.category === 'physical') base *= 0.5;

  const isCrit = Math.random() * 100 < attacker.ability.CRI;
  const damage = Math.max(1, Math.round(base * multiplier * (isCrit ? 1.5 : 1)));

  return { damage, isCrit, multiplier };
}

function activeOf(state: BattleState, side: Side): Combatant {
  return side === 'player'
    ? state.playerTeam[state.playerActiveIndex]
    : state.enemyTeam[state.enemyActiveIndex];
}

/** AI 난이도 (가이드 4.4). 지역 난이도와 보스 여부로 결정한다. */
export type AiLevel = 'easy' | 'normal' | 'hard';

/**
 * 적 AI. 가이드 4.4의 세 단계를 구현한다.
 * - easy : 항상 위력이 낮은 기술
 * - normal: 체력이 절반 이하면 방어, 아니면 상성이 좋은 기술 (가끔 무작위)
 * - hard  : 항상 기대 데미지가 최대인 기술, 상태이상 기회도 노린다
 */
export function chooseEnemyAction(state: BattleState, level: AiLevel = 'normal'): BattleAction {
  const enemy = activeOf(state, 'enemy');
  const skills = getCombatantSkills(enemy);
  const target = playerFront(state);

  const affinity = (s: Skill) =>
    s.element === 'none'
      ? elementAffinity(enemy.elementPoints, target.elementPoints)
      : skillAffinity(s.element, target.elementPoints);

  // 방어/특방 중 낮은 쪽을 노리는지까지 반영한 기대 데미지
  const expected = (s: Skill) => {
    const atk = s.category === 'physical' ? enemy.ability.ATK : enemy.ability.SPA;
    const def = s.category === 'physical' ? target.ability.DEF : target.ability.SPD;
    return (s.power * atk) / Math.max(1, def) * affinity(s) * (s.accuracy / 100);
  };

  if (level === 'easy') {
    const weakest = skills.reduce((a, b) => (b.power < a.power ? b : a));
    return { type: 'attack', skillId: weakest.id };
  }

  if (level === 'normal') {
    if (enemy.hp <= enemy.maxHp / 2 && Math.random() < 0.25) return { type: 'defend' };
    if (Math.random() < 0.75) {
      const best = skills.reduce((a, b) => (expected(b) > expected(a) ? b : a));
      return { type: 'attack', skillId: best.id };
    }
    return { type: 'attack', skillId: skills[Math.floor(Math.random() * skills.length)].id };
  }

  // hard: 상대가 멀쩡하면 상태이상을 먼저 노리고, 그 외에는 최대 기대 데미지
  const statusMove = skills.find((s) => s.inflicts && s.inflicts.chance >= 0.3);
  if (statusMove && !target.status && target.hp > target.maxHp * 0.6 && Math.random() < 0.45) {
    return { type: 'attack', skillId: statusMove.id };
  }
  const best = skills.reduce((a, b) => (expected(b) > expected(a) ? b : a));
  return { type: 'attack', skillId: best.id };
}

/** 행동 직전 상태이상 판정. 행동 불가면 false. */
function resolveStatusBeforeAction(state: BattleState, c: Combatant): boolean {
  if (!c.status) return true;
  const label = STATUS_LABEL[c.status.effect];

  if (c.status.effect === 'sleep') {
    state.log.push(`${c.name}은(는) ${label} 상태다. 움직일 수 없다!`);
    return false;
  }
  if (c.status.effect === 'freeze') {
    if (Math.random() < 0.3) {
      state.log.push(`${c.name}의 ${label}이(가) 풀렸다!`);
      c.status = null;
      return true;
    }
    state.log.push(`${c.name}은(는) 얼어붙어 움직일 수 없다!`);
    return false;
  }
  if (c.status.effect === 'paralysis' && Math.random() < 0.3) {
    state.log.push(`${c.name}은(는) ${label}되어 움직이지 못했다!`);
    return false;
  }
  return true;
}

/** 턴 종료 시 지속 피해와 지속시간 감소 */
function tickStatus(state: BattleState, c: Combatant, side: Side | 'tamer'): void {
  if (!c.status || c.hp <= 0) return;
  const { effect } = c.status;

  if (effect === 'poison' || effect === 'burn') {
    const damage = Math.max(1, Math.round(c.maxHp * (effect === 'poison' ? 0.07 : 0.06)));
    c.hp = Math.max(0, c.hp - damage);
    state.log.push(`${c.name}은(는) ${STATUS_LABEL[effect]} 피해를 입었다! (-${damage})`);
    state.effects.push({ side, kind: 'hit', amount: damage });
  }

  c.status.turnsLeft -= 1;
  if (c.status.turnsLeft <= 0) {
    state.log.push(`${c.name}의 ${STATUS_LABEL[effect]}이(가) 회복되었다.`);
    c.status = null;
  }
}

function applyStatus(state: BattleState, target: Combatant, effect: StatusEffect, side: Side | 'tamer'): void {
  if (target.status || target.hp <= 0) return;
  const turns = effect === 'sleep' ? 2 : effect === 'freeze' ? 2 : 4;
  target.status = { effect, turnsLeft: turns };
  state.log.push(`${target.name}은(는) ${STATUS_LABEL[effect]} 상태가 되었다!`);
  state.effects.push({ side, kind: 'status', label: STATUS_LABEL[effect] });
}

function performAttack(
  state: BattleState,
  attacker: Combatant,
  defender: Combatant,
  skill: Skill,
  defenderSide: Side | 'tamer',
): void {
  if (attacker.hp <= 0 || defender.hp <= 0) return;

  if (Math.random() * 100 > skill.accuracy) {
    state.log.push(`${attacker.name}의 ${skill.name}은(는) 빗나갔다!`);
    state.effects.push({ side: defenderSide, kind: 'miss' });
    return;
  }

  const { damage, isCrit, multiplier } = calculateDamage(attacker, defender, skill);
  const final = defender.defending ? Math.max(1, Math.round(damage * 0.5)) : damage;
  defender.hp = Math.max(0, defender.hp - final);

  let message = `${attacker.name}의 ${skill.name}! ${final} 데미지`;
  if (isCrit) message += ' (급소!)';
  if (multiplier >= 1.5) message += ' 효과가 굉장했다!';
  else if (multiplier <= 0.75) message += ' 효과가 별로였다...';
  state.log.push(message);
  state.effects.push({
    side: defenderSide,
    kind: isCrit ? 'crit' : 'hit',
    amount: final,
    effectiveness: multiplier >= 1.5 ? 'super' : multiplier <= 0.75 ? 'weak' : 'neutral',
    element: skill.element,
  });

  if (skill.inflicts && Math.random() < skill.inflicts.chance) {
    applyStatus(state, defender, skill.inflicts.effect, defenderSide);
  }
}

function checkFaint(state: BattleState): void {
  const enemy = activeOf(state, 'enemy');
  if (enemy.hp <= 0) {
    state.log.push(`${enemy.name}이(가) 쓰러졌다!`);
    const next = state.enemyTeam.findIndex((c) => c.hp > 0);
    if (next === -1) {
      state.status = 'won';
      state.log.push('전투에서 승리했습니다!');
    } else {
      state.enemyActiveIndex = next;
      state.log.push(`상대가 ${state.enemyTeam[next].name}을(를) 내보냈다!`);
    }
  }

  const player = activeOf(state, 'player');
  if (player.hp <= 0) {
    state.log.push(`${player.name}이(가) 쓰러졌다!`);
    const next = state.playerTeam.findIndex((c) => c.hp > 0);
    if (next === -1) {
      // 펫이 전멸해도 테이머가 남아 있으면 전투는 계속된다
      if (state.tamer.hp > 0) {
        state.log.push(`${state.tamer.name}이(가) 홀로 맞선다!`);
      } else {
        state.status = 'lost';
        state.log.push('모두 쓰러졌습니다...');
      }
    } else {
      state.playerActiveIndex = next;
    }
  }

  if (state.tamer.hp <= 0 && state.playerTeam.every((c) => c.hp <= 0)) {
    state.status = 'lost';
    state.log.push('모두 쓰러졌습니다...');
  }
}

/** 플레이어 측에서 지금 실제로 싸우고 있는 유닛 (펫이 전멸하면 테이머) */
export function playerFront(state: BattleState): Combatant {
  const pet = activeOf(state, 'player');
  return pet.hp > 0 ? pet : state.tamer;
}

export function executeTurn(
  prev: BattleState,
  playerAction: BattleAction,
  enemyAction: BattleAction,
): BattleState {
  const state: BattleState = {
    ...prev,
    playerTeam: prev.playerTeam.map((c) => ({ ...c, status: c.status ? { ...c.status } : null })),
    enemyTeam: prev.enemyTeam.map((c) => ({ ...c, status: c.status ? { ...c.status } : null })),
    tamer: { ...prev.tamer, status: prev.tamer.status ? { ...prev.tamer.status } : null },
    log: [...prev.log],
    effects: [],
  };

  state.playerTeam.forEach((c) => (c.defending = false));
  state.enemyTeam.forEach((c) => (c.defending = false));
  state.tamer.defending = false;

  const enemy = () => activeOf(state, 'enemy');

  // 도망
  if (playerAction.type === 'flee') {
    const me = playerFront(state);
    const chance = 0.5 + (me.ability.SPE - enemy().ability.SPE) / 200;
    if (Math.random() < Math.max(0.1, Math.min(0.95, chance))) {
      state.status = 'fled';
      state.log.push('무사히 도망쳤다!');
      return state;
    }
    state.log.push('도망칠 수 없었다!');
  }

  // 교체는 턴을 소모하고 즉시 반영된다
  if (playerAction.type === 'switch') {
    const target = state.playerTeam[playerAction.index];
    if (target && target.hp > 0) {
      state.playerActiveIndex = playerAction.index;
      state.log.push(`${target.name}, 부탁해!`);
    }
  }

  const priorityOf = (a: BattleAction) =>
    a.type === 'attack' ? SKILLS[a.skillId]?.priority ?? 0 : a.type === 'tamer' ? 0 : 0;

  const playerUnit = () => (playerAction.type === 'tamer' ? state.tamer : playerFront(state));

  const playerFirst =
    priorityOf(playerAction) !== priorityOf(enemyAction)
      ? priorityOf(playerAction) > priorityOf(enemyAction)
      : playerUnit().ability.SPE >= enemy().ability.SPE;

  const runPlayer = () => {
    if (state.status !== 'ongoing') return;
    if (playerAction.type === 'attack') {
      const unit = playerFront(state);
      if (!resolveStatusBeforeAction(state, unit)) return;
      performAttack(state, unit, enemy(), getSkill(playerAction.skillId), 'enemy');
    } else if (playerAction.type === 'tamer') {
      if (state.tamerCooldown > 0) {
        state.log.push('테이머가 아직 숨을 고르고 있다.');
        return;
      }
      state.tamerCooldown = TAMER_COOLDOWN_TURNS;
      state.log.push(`${state.tamer.name}이(가) 직접 나섰다!`);
      performAttack(state, state.tamer, enemy(), getSkill('headbutt'), 'enemy');
    } else if (playerAction.type === 'defend') {
      const unit = playerFront(state);
      unit.defending = true;
      state.log.push(`${unit.name}은(는) 방어 태세를 취했다.`);
    }
    checkFaint(state);
  };

  const runEnemy = () => {
    if (state.status !== 'ongoing') return;
    if (enemyAction.type !== 'attack') return;
    const attacker = enemy();
    if (!resolveStatusBeforeAction(state, attacker)) return;
    // 플레이어 펫이 전멸했으면 테이머를 노린다
    const target = playerFront(state);
    performAttack(state, attacker, target, getSkill(enemyAction.skillId), target.kind === 'tamer' ? 'tamer' : 'player');
    checkFaint(state);
  };

  if (playerFirst) {
    runPlayer();
    runEnemy();
  } else {
    runEnemy();
    runPlayer();
  }

  if (state.status === 'ongoing') {
    tickStatus(state, playerFront(state), 'player');
    tickStatus(state, enemy(), 'enemy');
    checkFaint(state);
  }

  if (state.tamerCooldown > 0) state.tamerCooldown -= 1;
  state.turn += 1;
  return state;
}
