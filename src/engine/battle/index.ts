/**
 * 전투 엔진.
 *
 * 헌장 Phase 2. 순수 함수다 — 입력을 mutate 하지 않고, 부수효과가 없으며,
 * 모든 난수는 주입된 seed에서 나온다. 같은 seed + 같은 입력 = 같은 결과.
 *
 * 화면은 여기 없다. BattleEvent 로그를 렌더러가 재생할 뿐이고, 렌더러가
 * 전투 결과를 다시 계산하는 일은 없어야 한다.
 */

import { createCaptureResolver } from '../capture';
import { createRng, type RNG } from '../rng';
import type { Ailment, Element, ElementPair, Skill, Stats } from '../types';
import { createDefaultAI } from './ai';
import { BASIC_ATTACK_ID, resolveCatalog } from './catalog';
import {
  ailmentChance,
  applyModifiers,
  clamp,
  critChance,
  damageVariance,
  elementMultiplier,
  finalDamage,
  fleeChance,
  hitChance,
  initiative,
  poisonDamage,
  rowDealtMultiplier,
  rowTakenMultiplier,
} from './formula';
import type {
  ActiveAilment,
  ActiveModifier,
  BattleCatalog,
  BattleCommand,
  BattleEvent,
  BattleInput,
  BattleResult,
  BattleView,
  CaptureResolver,
  Combatant,
  CombatantView,
  EndReason,
  Side,
  Winner,
} from './types';

export * from './types';
export * from './formula';
export { createDefaultAI } from './ai';
export { DEFAULT_CATALOG, DEFAULT_FORMULA, resolveCatalog } from './catalog';

/* ─────────────── 내부 상태 ─────────────── */

interface Unit extends Combatant {
  side: Side;
  /** 입력 순서. 행동 순서가 같을 때 이 값으로 가른다 — 결정론을 위해 필요하다. */
  index: number;
  fainted: boolean;
  defending: boolean;
  ailments: ActiveAilment[];
  modifiers: ActiveModifier[];
  /** 도발 남은 턴. 0보다 크면 상대의 단일 공격을 끌어온다. */
  tauntTurns: number;
  /** 이 유닛 대신 맞아주는 유닛 */
  protectedBy: string | null;
  protectTurns: number;
}

/**
 * Phase 3이 채운 자리. 레벨 역전 페널티와 매력 보정까지 들어간 완전한 공식이
 * /src/engine/capture 에 있고, 전투는 그걸 주입받아 쓴다. 전투 엔진은 포획
 * 공식을 모르고, 포획 모듈은 전투 상태를 모른다.
 */
const DEFAULT_CAPTURE_RESOLVER: CaptureResolver = createCaptureResolver();

/* ─────────────── 엔진 ─────────────── */

export function simulateBattle(input: BattleInput): BattleResult {
  const catalog = resolveCatalog(input.catalog);
  const f = catalog.formula;
  const rng = createRng(input.seed);
  const captureResolver = input.captureResolver ?? DEFAULT_CAPTURE_RESOLVER;

  validateInput(input, catalog);

  const units: Unit[] = [
    ...input.allies.map((c, i) => toUnit(c, 'ally', i)),
    ...input.enemies.map((c, i) => toUnit(c, 'enemy', input.allies.length + i)),
  ];
  const allies = units.filter((u) => u.side === 'ally');
  const enemies = units.filter((u) => u.side === 'enemy');

  const log: BattleEvent[] = [];
  const commandSource = input.commandSource ?? createDefaultAI(catalog, rng);

  let round = 0;
  let ended = false;
  let winner: Winner = 'draw';
  let endedBy: EndReason = 'roundLimit';
  let capturedPet: BattleResult['capturedPet'];

  /* ── 조회 헬퍼 ── */

  const living = (side: Side) => units.filter((u) => u.side === side && !u.fainted);
  const friendly = (u: Unit) => (u.side === 'ally' ? allies : enemies);
  const byId = (id: string) => units.find((u) => u.id === id);
  const eff = (u: Unit): Stats => applyModifiers(u.stats, u.modifiers);
  const hasAilment = (u: Unit, a: Ailment) => u.ailments.some((x) => x.ailment === a);
  const canAct = (u: Unit) => !u.fainted && !hasAilment(u, 'paralysis') && !hasAilment(u, 'sleep');

  const view = (): BattleView => ({
    allies: allies.map(toView),
    enemies: enemies.map(toView),
  });
  function toView(u: Unit): CombatantView {
    return { ...toCombatant(u), side: u.side, fainted: u.fainted, ailments: u.ailments, modifiers: u.modifiers, effectiveStats: eff(u) };
  }

  /* ── 피해 ── */

  function faintIfDown(u: Unit): void {
    if (u.hp <= 0 && !u.fainted) {
      u.hp = 0;
      u.fainted = true;
      // 쓰러지면 걸려 있던 효과는 의미가 없다. 부활 시스템이 없으므로 정리한다.
      u.ailments = [];
      u.modifiers = [];
      u.tauntTurns = 0;
      log.push({ type: 'faint', round, targetId: u.id });
    }
  }

  function wake(u: Unit): void {
    if (hasAilment(u, 'sleep')) {
      u.ailments = u.ailments.filter((x) => x.ailment !== 'sleep');
      log.push({ type: 'ailmentCleared', round, targetId: u.id, ailment: 'sleep', reason: 'woken' });
    }
  }

  function dealDamage(actor: Unit, target: Unit, skill: Skill, redirectedFrom?: string): void {
    // 무속성 스킬을 물리·근접으로 본다. 진형 보정은 물리에만 걸린다.
    const physical = skill.element === null;
    const a = eff(actor);
    const d = eff(target);

    const toHit = clamp(hitChance(a.spd, d.spd, f) * skill.accuracy, 0, 1);
    if (!rng.chance(toHit)) {
      log.push({ type: 'miss', round, actorId: actor.id, targetId: target.id, skillId: skill.id });
      return;
    }

    const crit = rng.chance(critChance(a.spd, f));
    const attackElement: Element | ElementPair = skill.element ?? actor.element;
    const elem = elementMultiplier(attackElement, target.element, f);

    let situational =
      rowDealtMultiplier(actor.row, physical, f) * rowTakenMultiplier(target.row, physical, f);
    // 가드 브레이크는 방어 커맨드를 무시한다. 그게 이 아키타입의 존재 이유다.
    if (target.defending && skill.archetype !== 'guardBreak') situational *= f.defend.damageTaken;

    const amount = finalDamage(
      {
        atk: a.atk,
        def: d.def,
        skillPower: skill.power,
        elementMul: elem,
        critMul: crit ? f.crit.multiplier : 1,
        situational,
        variance: damageVariance(rng, f),
      },
      f,
    );

    target.hp = Math.max(0, target.hp - amount);
    log.push({
      type: 'damage',
      round,
      actorId: actor.id,
      targetId: target.id,
      skillId: skill.id,
      amount,
      crit,
      elementMultiplier: elem,
      ...(redirectedFrom ? { redirectedFrom } : {}),
      hpAfter: target.hp,
    });
    wake(target);
    faintIfDown(target);
  }

  function healUnit(actor: Unit, target: Unit, amount: number): void {
    const capped = Math.min(target.stats.hp, target.hp + Math.max(0, Math.round(amount)));
    const gained = capped - target.hp;
    target.hp = capped;
    log.push({ type: 'heal', round, actorId: actor.id, targetId: target.id, amount: gained, hpAfter: target.hp });
  }

  function cureAilments(actor: Unit, target: Unit, only?: Ailment): void {
    const removed = target.ailments.filter((x) => !only || x.ailment === only);
    target.ailments = target.ailments.filter((x) => (only ? x.ailment !== only : false));
    for (const r of removed) {
      log.push({ type: 'ailmentCleared', round, targetId: target.id, ailment: r.ailment, reason: 'cured' });
    }
    if (removed.length === 0) {
      // 아무 효과가 없어도 행동은 소비됐다는 걸 로그에 남긴다
      log.push({ type: 'heal', round, actorId: actor.id, targetId: target.id, amount: 0, hpAfter: target.hp });
    }
  }

  function applyAilment(actor: Unit, target: Unit, ailment: Ailment, accuracy: number, duration: number, guaranteed = false): void {
    if (target.fainted) return;
    if (!guaranteed) {
      const chance = ailmentChance(accuracy, eff(target).spd, f);
      if (!rng.chance(chance)) {
        log.push({ type: 'ailmentResisted', round, actorId: actor.id, targetId: target.id, ailment });
        return;
      }
    }
    // 마비만 지속 턴을 따로 굴린다 — 헌장이 "행동불가 1~3턴"으로 못박았다.
    const turns =
      ailment === 'paralysis'
        ? rng.int(f.ailment.paralysisMinTurns, f.ailment.paralysisMaxTurns)
        : duration;

    const existing = target.ailments.find((x) => x.ailment === ailment);
    if (existing) existing.turns = Math.max(existing.turns, turns);
    else target.ailments.push({ ailment, turns });

    log.push({ type: 'ailmentApplied', round, actorId: actor.id, targetId: target.id, ailment, turns });
  }

  function applyModifier(actor: Unit, target: Unit, sourceId: string, mods: { atk?: number; def?: number; spd?: number }, turns: number): void {
    if (target.fainted) return;
    const mod: ActiveModifier = { sourceId, turns, ...mods };
    // 같은 출처는 갱신한다. 배수의 진을 3번 쓰면 8배가 되는 걸 막는다.
    const idx = target.modifiers.findIndex((m) => m.sourceId === sourceId);
    if (idx >= 0) target.modifiers[idx] = mod;
    else target.modifiers.push(mod);
    log.push({ type: 'modifierApplied', round, actorId: actor.id, targetId: target.id, sourceId, ...mods, turns });
  }

  /* ── 대상 선정 ── */

  function pickEnemyTarget(actor: Unit, requestedId?: string): Unit | undefined {
    const foes = living(actor.side === 'ally' ? 'enemy' : 'ally');
    if (foes.length === 0) return undefined;

    // 도발이 걸려 있으면 단일 공격은 도발한 쪽으로 끌려간다
    const taunter = foes.find((u) => u.tauntTurns > 0);
    if (taunter) return taunter;

    const requested = requestedId ? byId(requestedId) : undefined;
    if (requested && !requested.fainted && requested.side !== actor.side) return requested;
    return foes[0];
  }

  /** 감싸기 — 실제로 맞는 유닛으로 바꿔준다 */
  function redirectProtected(target: Unit): { unit: Unit; from?: string } {
    if (target.protectedBy) {
      const guard = byId(target.protectedBy);
      if (guard && !guard.fainted && guard.id !== target.id) return { unit: guard, from: target.id };
    }
    return { unit: target };
  }

  function allySide(actor: Unit): Unit[] {
    return friendly(actor).filter((u) => !u.fainted);
  }

  function resolveTargets(actor: Unit, target: Skill['target'], requestedId?: string): Unit[] {
    switch (target) {
      case 'self':
        return [actor];
      case 'allAllies':
        return allySide(actor);
      case 'oneAlly': {
        const req = requestedId ? byId(requestedId) : undefined;
        if (req && !req.fainted && req.side === actor.side) return [req];
        return [actor];
      }
      case 'allEnemies':
        return living(actor.side === 'ally' ? 'enemy' : 'ally');
      case 'oneEnemy': {
        const t = pickEnemyTarget(actor, requestedId);
        return t ? [t] : [];
      }
    }
  }

  /* ── 스킬 ── */

  function useSkill(actor: Unit, skill: Skill, requestedId: string | undefined, confusedTarget?: Unit): void {
    if (actor.energy < skill.cost) {
      log.push({ type: 'noEnergy', round, actorId: actor.id, skillId: skill.id, cost: skill.cost, energy: actor.energy });
      basicAttack(actor, requestedId, confusedTarget);
      return;
    }
    actor.energy -= skill.cost;

    const targets = confusedTarget ? [confusedTarget] : resolveTargets(actor, skill.target, requestedId);
    if (targets.length === 0) return;

    switch (skill.archetype) {
      case 'single':
      case 'aoe':
      case 'guardBreak': {
        for (const raw of targets) {
          if (raw.fainted) continue;
          const { unit, from } = redirectProtected(raw);
          log.push({ type: 'attack', round, actorId: actor.id, targetId: unit.id, skillId: skill.id });
          dealDamage(actor, unit, skill, from);
          if (unit.fainted) continue;
          if (skill.archetype === 'guardBreak' && skill.modifiers) {
            applyModifier(actor, unit, skill.id, skill.modifiers, skill.duration ?? 1);
          }
          if (skill.ailment) {
            applyAilment(actor, unit, skill.ailment, skill.accuracy, skill.duration ?? 1);
          }
        }
        return;
      }

      case 'ailment': {
        if (!skill.ailment) return;
        for (const t of targets) {
          applyAilment(actor, t, skill.ailment, skill.accuracy, skill.duration ?? 1);
        }
        return;
      }

      case 'heal': {
        for (const t of targets) {
          if (skill.power > 0) healUnit(actor, t, t.stats.hp * skill.power);
          else cureAilments(actor, t);
        }
        return;
      }

      case 'guardBuff': {
        if (!skill.modifiers) return;
        for (const t of targets) applyModifier(actor, t, skill.id, skill.modifiers, skill.duration ?? 1);
        return;
      }

      case 'elementBuff': {
        if (!skill.modifiers) return;
        // 속성 강화는 같은 속성 아군에게만 걸린다. 단일 속성 파티라는 전략 축이
        // 여기서 생긴다 — 아무에게나 걸리면 그 축이 사라진다.
        for (const t of targets) {
          if (skill.element === null || t.element.primary === skill.element || t.element.secondary === skill.element) {
            applyModifier(actor, t, skill.id, skill.modifiers, skill.duration ?? 1);
          }
        }
        return;
      }

      case 'taunt': {
        const turns = skill.duration ?? 1;
        if (skill.target === 'self') {
          actor.tauntTurns = turns;
          log.push({ type: 'tauntSet', round, actorId: actor.id, protectedId: actor.id, turns });
        } else {
          for (const t of targets) {
            if (t.id === actor.id) continue;
            t.protectedBy = actor.id;
            t.protectTurns = turns;
            log.push({ type: 'tauntSet', round, actorId: actor.id, protectedId: t.id, turns });
          }
        }
        return;
      }
    }
  }

  function basicAttack(actor: Unit, requestedId: string | undefined, confusedTarget?: Unit): void {
    const skill = catalog.skills[BASIC_ATTACK_ID]!;
    const target = confusedTarget ?? pickEnemyTarget(actor, requestedId);
    if (!target) return;
    const { unit, from } = redirectProtected(target);
    log.push({ type: 'attack', round, actorId: actor.id, targetId: unit.id, skillId: skill.id });
    dealDamage(actor, unit, skill, from);
  }

  /* ── 정령 ── */

  function useSpirit(actor: Unit, spiritId: string, level: number, requestedId?: string): void {
    const sp = catalog.spirits[spiritId];
    // 정령은 장비에 깃든다. 안 가진 정령을 부르면 평타로 떨어뜨린다.
    if (!sp || !actor.spirits?.includes(spiritId)) {
      basicAttack(actor, requestedId);
      return;
    }
    const lv = clamp(Math.round(level), 1, sp.levels.length);
    const tier = sp.levels[lv - 1]!;

    if (actor.energy < tier.cost) {
      log.push({ type: 'noEnergy', round, actorId: actor.id, skillId: spiritId, cost: tier.cost, energy: actor.energy });
      basicAttack(actor, requestedId);
      return;
    }
    // 실패해도 기력은 나간다. 성공률이 낮은 고레벨 정령에 대가가 없으면
    // 무조건 최고 레벨만 쓰게 된다.
    actor.energy -= tier.cost;

    const success = rng.chance(tier.successRate);
    log.push({ type: 'spiritUsed', round, actorId: actor.id, spiritId, level: lv, success });
    if (!success) return;

    const targets = resolveTargets(actor, sp.target, requestedId);
    const e = sp.effect;

    switch (e.kind) {
      case 'damage': {
        const synthetic: Skill = {
          id: spiritId,
          name: sp.name,
          archetype: 'single',
          element: sp.element,
          target: sp.target,
          power: tier.power,
          cost: 0,
          accuracy: 1,
          description: sp.description,
        };
        for (const raw of targets) {
          if (raw.fainted) continue;
          const { unit, from } = redirectProtected(raw);
          dealDamage(actor, unit, synthetic, from);
        }
        return;
      }
      case 'heal':
        for (const t of targets) healUnit(actor, t, t.stats.hp * tier.power);
        return;
      case 'buff':
        if (!e.modifiers) return;
        for (const t of targets) applyModifier(actor, t, spiritId, e.modifiers, tier.duration);
        return;
      case 'ailment':
        if (!e.ailment) return;
        // 성공 판정을 이미 successRate로 했으므로 저항을 또 굴리지 않는다
        for (const t of targets) applyAilment(actor, t, e.ailment, 1, tier.duration, true);
        return;
      case 'loyaltyGuard':
        // 충성도는 전투 밖 시스템이다. 로그만 남기고 Phase 3이 읽는다.
        return;
    }
  }

  /* ── 아이템 ── */

  function useItem(actor: Unit, itemId: string, requestedId?: string): void {
    const item = catalog.items[itemId];
    if (!item) {
      basicAttack(actor, requestedId);
      return;
    }
    const req = requestedId ? byId(requestedId) : undefined;
    const target = req && !req.fainted && req.side === actor.side ? req : actor;
    log.push({ type: 'itemUsed', round, actorId: actor.id, itemId, targetId: target.id });

    if (item.kind === 'heal') {
      if (item.heal && item.heal > 0) healUnit(actor, target, item.heal);
      else cureAilments(actor, target, 'poison');
    }
    // 그 밖의 종류는 전투 중 효과가 없다(진화제·먹이 등). 로그만 남는다.
  }

  /* ── 포획 ── */

  function tryCapture(actor: Unit, targetId: string, itemId: string): void {
    const target = byId(targetId);
    const tool = catalog.items[itemId];
    const valid =
      target !== undefined &&
      !target.fainted &&
      target.side !== actor.side &&
      target.kind === 'pet' &&
      target.speciesId !== undefined &&
      capturedPet === undefined &&
      tool !== undefined &&
      tool.kind === 'captureTool';

    if (!valid) {
      basicAttack(actor, targetId);
      return;
    }

    const chance = clamp(
      captureResolver({
        target: toView(target),
        capturer: toView(actor),
        toolMultiplier: tool.captureMultiplier ?? 1,
        formula: f,
      }),
      0,
      1,
    );
    log.push({ type: 'captureAttempt', round, actorId: actor.id, targetId: target.id, itemId, chance });

    if (rng.chance(chance)) {
      capturedPet = {
        combatantId: target.id,
        speciesId: target.speciesId!,
        hpRatioAtCapture: target.hp / target.stats.hp,
        capturerId: actor.id,
      };
      target.fainted = true;
      log.push({ type: 'captureSuccess', round, actorId: actor.id, targetId: target.id });
      if (living(target.side).length === 0) {
        ended = true;
        winner = actor.side;
        endedBy = 'capture';
      }
      return;
    }

    // 실패하면 대상이 달아날 수 있다. 이 리스크가 "지금 잡을까 더 깎을까"를
    // 실제 의사결정으로 만든다.
    const escaped = rng.chance(f.capture.escapeOnFail);
    if (escaped) {
      target.fainted = true;
      if (living(target.side).length === 0) {
        ended = true;
        winner = actor.side;
        endedBy = 'flee';
      }
    }
    log.push({ type: 'captureFailed', round, actorId: actor.id, targetId: target.id, escaped });
  }

  /* ── 도주 ── */

  function tryFlee(actor: Unit): void {
    const foes = living(actor.side === 'ally' ? 'enemy' : 'ally');
    const fastestFoe = foes.reduce((m, u) => Math.max(m, eff(u).spd), 0);
    const chance = fleeChance(eff(actor).spd, fastestFoe, f);
    const success = rng.chance(chance);
    log.push({ type: 'fleeAttempt', round, actorId: actor.id, chance, success });
    if (success) {
      ended = true;
      endedBy = 'flee';
      // 도망친 쪽은 이기지 못한다
      winner = actor.side === 'ally' ? 'enemy' : 'ally';
    }
  }

  /* ── 한 유닛의 행동 ── */

  function act(actor: Unit, command: BattleCommand): void {
    // 혼란은 대상을 무작위로 바꾼다. 아군을 때릴 수도 있다.
    let confused: Unit | undefined;
    if (hasAilment(actor, 'confusion')) {
      const pool = units.filter((u) => !u.fainted && u.id !== actor.id);
      if (pool.length > 0) {
        confused = rng.pick(pool);
        log.push({ type: 'confused', round, actorId: actor.id, targetId: confused.id });
      }
    }

    switch (command.kind) {
      case 'attack':
        basicAttack(actor, command.targetId, confused);
        return;
      case 'skill': {
        const skill = catalog.skills[command.skillId];
        if (!skill) {
          basicAttack(actor, command.targetId, confused);
          return;
        }
        useSkill(actor, skill, command.targetId, confused);
        return;
      }
      case 'spirit':
        useSpirit(actor, command.spiritId, command.level, confused?.id ?? command.targetId);
        return;
      case 'item':
        useItem(actor, command.itemId, confused ? undefined : command.targetId);
        return;
      case 'capture':
        tryCapture(actor, confused?.id ?? command.targetId, command.itemId);
        return;
      case 'flee':
        tryFlee(actor);
        return;
      case 'defend':
        // 라운드 시작에 이미 적용됐다
        return;
    }
  }

  /* ── 라운드 종료 처리 ── */

  function endOfRound(): void {
    for (const u of units) {
      if (u.fainted) continue;

      // 독은 최대 체력 비례로 들어간다. 방어력이 높아도 피해간다.
      const poison = u.ailments.find((x) => x.ailment === 'poison');
      if (poison) {
        const amount = poisonDamage(u.stats.hp, f);
        u.hp = Math.max(0, u.hp - amount);
        log.push({ type: 'ailmentTick', round, targetId: u.id, ailment: 'poison', amount, hpAfter: u.hp });
        faintIfDown(u);
        if (u.fainted) continue;
      }

      const keptAilments: ActiveAilment[] = [];
      for (const a of u.ailments) {
        a.turns -= 1;
        if (a.turns > 0) keptAilments.push(a);
        else log.push({ type: 'ailmentCleared', round, targetId: u.id, ailment: a.ailment, reason: 'expired' });
      }
      u.ailments = keptAilments;

      const keptMods: ActiveModifier[] = [];
      for (const m of u.modifiers) {
        m.turns -= 1;
        if (m.turns > 0) keptMods.push(m);
        else log.push({ type: 'modifierExpired', round, targetId: u.id, sourceId: m.sourceId });
      }
      u.modifiers = keptMods;

      if (u.tauntTurns > 0) u.tauntTurns -= 1;
      if (u.protectTurns > 0) {
        u.protectTurns -= 1;
        if (u.protectTurns === 0) u.protectedBy = null;
      }

      const regen = Math.min(f.battle.energyRegenPerRound, u.maxEnergy - u.energy);
      if (regen > 0) {
        u.energy += regen;
        log.push({ type: 'energyRegen', round, actorId: u.id, amount: regen });
      }
    }
  }

  function checkDefeat(): boolean {
    if (living('ally').length === 0) {
      ended = true;
      winner = 'enemy';
      endedBy = 'defeat';
      return true;
    }
    if (living('enemy').length === 0) {
      ended = true;
      winner = 'ally';
      endedBy = capturedPet ? 'capture' : 'defeat';
      return true;
    }
    return false;
  }

  /* ── 메인 루프 ── */

  log.push({ type: 'battleStart', allies: allies.map((u) => u.id), enemies: enemies.map((u) => u.id) });

  for (round = 1; round <= f.battle.maxRounds; round++) {
    if (checkDefeat()) break;
    log.push({ type: 'roundStart', round });

    const commands = commandSource(view(), round);

    // 방어는 순발력을 무시하고 라운드 시작에 즉시 적용된다
    for (const u of units) u.defending = false;
    for (const u of units) {
      if (u.fainted || !canAct(u)) continue;
      if (commands[u.id]?.kind === 'defend') {
        u.defending = true;
        log.push({ type: 'defend', round, actorId: u.id });
      }
    }

    // 행동 순서: order = spd * rng(0.9,1.1). 동점은 입력 순서로 가른다.
    const order = units
      .filter((u) => !u.fainted)
      .map((u) => ({ u, roll: initiative(eff(u).spd, rng, f) }))
      .sort((a, b) => b.roll - a.roll || a.u.index - b.u.index);
    log.push({ type: 'order', round, actorIds: order.map((o) => o.u.id) });

    for (const { u } of order) {
      if (ended) break;
      if (u.fainted) continue;

      const command = commands[u.id] ?? { kind: 'attack' as const };
      log.push({ type: 'command', round, actorId: u.id, command });

      if (!canAct(u)) {
        const reason = hasAilment(u, 'paralysis') ? 'paralysis' : 'sleep';
        log.push({ type: 'skipped', round, actorId: u.id, reason });
        continue;
      }
      act(u, command);
      if (checkDefeat()) break;
    }

    if (ended) break;
    endOfRound();
    if (checkDefeat()) break;
  }

  if (!ended) {
    // 200라운드를 넘기면 무승부로 끊는다. 서로 못 죽이는 조합에서 무한 루프를
    // 막는 안전 장치다.
    round = f.battle.maxRounds;
    winner = 'draw';
    endedBy = 'roundLimit';
  }

  log.push({ type: 'battleEnd', round, winner, endedBy });

  return {
    log,
    winner,
    endedBy,
    rounds: round,
    finalState: {
      allies: allies.map(toCombatant),
      enemies: enemies.map(toCombatant),
    },
    ...(capturedPet ? { capturedPet } : {}),
  };
}

/* ─────────────── 변환·검증 ─────────────── */

function toUnit(c: Combatant, side: Side, index: number): Unit {
  return {
    ...c,
    element: { ...c.element },
    stats: { ...c.stats },
    skills: [...c.skills],
    ...(c.spirits ? { spirits: [...c.spirits] } : {}),
    side,
    index,
    fainted: c.hp <= 0,
    defending: false,
    ailments: [],
    modifiers: [],
    tauntTurns: 0,
    protectedBy: null,
    protectTurns: 0,
  };
}

function toCombatant(u: Unit): Combatant {
  const {
    side: _side,
    index: _index,
    fainted: _fainted,
    defending: _defending,
    ailments: _ailments,
    modifiers: _modifiers,
    tauntTurns: _tauntTurns,
    protectedBy: _protectedBy,
    protectTurns: _protectTurns,
    ...rest
  } = u;
  return { ...rest, element: { ...rest.element }, stats: { ...rest.stats }, skills: [...rest.skills] };
}

function validateInput(input: BattleInput, catalog: BattleCatalog): void {
  const max = catalog.formula.battle.maxPartySize;
  if (input.allies.length === 0 || input.enemies.length === 0) {
    throw new RangeError('전투에는 양쪽 모두 최소 1명이 필요하다');
  }
  if (input.allies.length > max || input.enemies.length > max) {
    throw new RangeError(`파티는 최대 ${max}명이다 (아군 ${input.allies.length}, 적 ${input.enemies.length})`);
  }
  if (!catalog.skills[BASIC_ATTACK_ID]) {
    throw new RangeError(`기본 공격 스킬(${BASIC_ATTACK_ID})이 카탈로그에 없다`);
  }
  const ids = new Set<string>();
  for (const c of [...input.allies, ...input.enemies]) {
    if (ids.has(c.id)) throw new RangeError(`전투원 id가 중복됐다: ${c.id}`);
    ids.add(c.id);
    if (c.stats.hp <= 0) throw new RangeError(`${c.id}: 최대 체력이 0 이하다`);
  }
}

/** 밸런스 시뮬레이터·테스트가 쓰는 RNG 노출. 엔진 밖에서 seed를 맞출 때 필요하다. */
export type { RNG };
