import type { PetInstance, Skill } from './gameTypes';
import { getCurrentAbility } from './petUtils';
import { movesForElement, SKILLS } from './petData';
import { dualTypeMultiplier } from './typeChart';

export type BattleAction =
  | { type: 'attack'; skillId: string }
  | { type: 'defend' }
  | { type: 'switch'; index: number }
  | { type: 'flee' }
  | { type: 'wait' };

export interface BattleLogEntry {
  message: string;
}

export interface BattleState {
  playerTeam: PetInstance[];
  enemyTeam: PetInstance[];
  playerActiveIndex: number;
  enemyActiveIndex: number;
  playerDefending: boolean;
  enemyDefending: boolean;
  turn: number;
  log: string[];
  status: 'ongoing' | 'won' | 'lost' | 'fled';
}

export function getPetMoves(pet: PetInstance): Skill[] {
  const moves = [SKILLS.tackle, ...movesForElement(pet.elementPrimary)];
  if (pet.elementSecondary) moves.push(...movesForElement(pet.elementSecondary));
  const seen = new Set<string>();
  return moves.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

export function initializeBattle(playerTeam: PetInstance[], enemyTeam: PetInstance[]): BattleState {
  return {
    playerTeam,
    enemyTeam,
    playerActiveIndex: 0,
    enemyActiveIndex: 0,
    playerDefending: false,
    enemyDefending: false,
    turn: 1,
    log: ['전투 시작!'],
    status: 'ongoing',
  };
}

export function calculateDamage(attacker: PetInstance, defender: PetInstance, skill: Skill): {
  damage: number;
  isCrit: boolean;
  multiplier: number;
} {
  const atkAbility = getCurrentAbility(attacker);
  const defAbility = getCurrentAbility(defender);

  const attackStat = skill.category === 'physical' ? atkAbility.ATK : atkAbility.SPA;
  const defenseStat = skill.category === 'physical' ? defAbility.DEF : defAbility.SPD;

  // 설계 문서 5.4의 `공격력 × 위력 / 방어력`을 그대로 쓰면 Lv.1 기준 95 데미지가 나와
  // 최대 HP 40인 펫이 한 방에 쓰러진다. 레벨 스케일링 항과 정규화 상수를 넣어
  // 공방 성장이 상쇄되도록 하고, 전투가 레벨 구간과 무관하게 6~8턴 정도 유지되게 한다.
  const levelFactor = (2 * attacker.level) / 5 + 2;
  const baseDamage = (levelFactor * skill.power * attackStat) / Math.max(1, defenseStat) / 50 + 2;

  const multiplier = dualTypeMultiplier(
    skill.element,
    defender.elementPrimary,
    defender.elementSecondary,
    defender.secondaryRatio,
  );

  const isCrit = Math.random() * 100 < atkAbility.CRI;
  const critMultiplier = isCrit ? 1.5 : 1.0;

  const damage = Math.max(1, Math.round(baseDamage * multiplier * critMultiplier));

  return { damage, isCrit, multiplier };
}

function activePet(state: BattleState, side: 'player' | 'enemy'): PetInstance {
  return side === 'player'
    ? state.playerTeam[state.playerActiveIndex]
    : state.enemyTeam[state.enemyActiveIndex];
}

function setActivePet(state: BattleState, side: 'player' | 'enemy', pet: PetInstance): void {
  if (side === 'player') state.playerTeam[state.playerActiveIndex] = pet;
  else state.enemyTeam[state.enemyActiveIndex] = pet;
}

function speedOf(pet: PetInstance): number {
  return getCurrentAbility(pet).SPE;
}

export function chooseEnemyAction(state: BattleState): BattleAction {
  const enemy = activePet(state, 'enemy');
  const moves = getPetMoves(enemy);
  const skill = moves[Math.floor(Math.random() * moves.length)];
  return { type: 'attack', skillId: skill.id };
}

function applyAttack(
  state: BattleState,
  attackerSide: 'player' | 'enemy',
  skillId: string,
): void {
  const defenderSide = attackerSide === 'player' ? 'enemy' : 'player';
  const attacker = activePet(state, attackerSide);
  const defender = activePet(state, defenderSide);
  if (attacker.currentHp <= 0 || defender.currentHp <= 0) return;

  const skill = SKILLS[skillId];

  if (Math.random() * 100 > skill.accuracy) {
    state.log.push(`${attackerSide === 'player' ? '내 펫' : '상대 펫'}의 ${skill.name}이(가) 빗나갔다!`);
    return;
  }

  const { damage, isCrit, multiplier } = calculateDamage(attacker, defender, skill);
  const isDefending = defenderSide === 'player' ? state.playerDefending : state.enemyDefending;
  const finalDamage = isDefending ? Math.round(damage * 0.5) : damage;

  const newHp = Math.max(0, defender.currentHp - finalDamage);
  setActivePet(state, defenderSide, { ...defender, currentHp: newHp });

  let message = `${attackerSide === 'player' ? '내 펫' : '상대 펫'}의 ${skill.name}! ${finalDamage}의 데미지`;
  if (isCrit) message += ' (급소 공격!)';
  if (multiplier >= 2) message += ' 효과가 굉장했다!';
  else if (multiplier <= 0.5) message += ' 효과가 별로였다...';
  state.log.push(message);
}

function checkFaint(state: BattleState): void {
  const player = activePet(state, 'player');
  const enemy = activePet(state, 'enemy');
  if (enemy.currentHp <= 0) {
    state.log.push(`상대 펫이 쓰러졌다!`);
    const nextIndex = state.enemyTeam.findIndex((p) => p.currentHp > 0);
    if (nextIndex === -1) {
      state.status = 'won';
      state.log.push('전투에서 승리했습니다!');
    } else {
      state.enemyActiveIndex = nextIndex;
    }
  }
  if (player.currentHp <= 0) {
    state.log.push(`내 펫이 쓰러졌다!`);
    const nextIndex = state.playerTeam.findIndex((p) => p.currentHp > 0);
    if (nextIndex === -1) {
      state.status = 'lost';
      state.log.push('모든 펫이 쓰러졌습니다...');
    } else {
      state.playerActiveIndex = nextIndex;
    }
  }
}

export function executeTurn(
  battleState: BattleState,
  playerAction: BattleAction,
  enemyAction: BattleAction,
): BattleState {
  const state: BattleState = {
    ...battleState,
    playerTeam: [...battleState.playerTeam],
    enemyTeam: [...battleState.enemyTeam],
    log: [...battleState.log],
  };
  state.playerDefending = false;
  state.enemyDefending = false;

  if (playerAction.type === 'flee') {
    const player = activePet(state, 'player');
    const enemy = activePet(state, 'enemy');
    const fleeChance = 0.5 + (speedOf(player) - speedOf(enemy)) / 200;
    if (Math.random() < Math.max(0.1, Math.min(0.95, fleeChance))) {
      state.status = 'fled';
      state.log.push('무사히 도망쳤다!');
      return state;
    }
    state.log.push('도망칠 수 없었다!');
  }

  if (playerAction.type === 'switch') {
    state.playerActiveIndex = playerAction.index;
    state.log.push(`${'내 펫을 교체했다!'}`);
  }

  const playerPriority = playerAction.type === 'attack' ? SKILLS[playerAction.skillId]?.priority ?? 0 : 0;
  const enemyPriority = enemyAction.type === 'attack' ? SKILLS[enemyAction.skillId]?.priority ?? 0 : 0;

  const playerFirst =
    playerPriority !== enemyPriority
      ? playerPriority > enemyPriority
      : speedOf(activePet(state, 'player')) >= speedOf(activePet(state, 'enemy'));

  const runAction = (side: 'player' | 'enemy', action: BattleAction) => {
    if (state.status !== 'ongoing') return;
    if (action.type === 'attack') applyAttack(state, side, action.skillId);
    else if (action.type === 'defend') {
      if (side === 'player') state.playerDefending = true;
      else state.enemyDefending = true;
      state.log.push(`${side === 'player' ? '내 펫' : '상대 펫'}이(가) 방어 태세를 취했다.`);
    }
    checkFaint(state);
  };

  if (playerAction.type !== 'flee') {
    if (playerFirst) {
      runAction('player', playerAction);
      runAction('enemy', enemyAction);
    } else {
      runAction('enemy', enemyAction);
      runAction('player', playerAction);
    }
  } else if (state.status === 'ongoing') {
    runAction('enemy', enemyAction);
  }

  state.turn += 1;
  return state;
}
