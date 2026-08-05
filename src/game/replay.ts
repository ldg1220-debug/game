/**
 * 전투 로그 재생.
 *
 * BattleEvent 배열만 읽어 임의의 시점 상태를 만든다. 전투 엔진을 다시 돌리지
 * 않는다 — 그게 "렌더러는 로그를 재생만 한다"는 규칙의 실제 구현이다.
 *
 * 로그가 화면에 필요한 걸 다 담고 있는지는 테스트가 지킨다: 로그를 끝까지
 * 재생한 결과가 엔진이 돌려준 finalState와 정확히 같아야 한다. 어긋나면 이벤트가
 * 뭔가를 빠뜨린 것이고, 그건 렌더러가 아니라 엔진에서 고칠 문제다.
 */

import skillsJson from '../data/skills.json';
import type { Ailment, Element, Skill } from '../engine/types';
import type { BattleEvent, Combatant, Side } from '../engine/battle';

/** 스킬 속성. 무속성 스킬(버프·회복)은 null이라 연출도 무속성으로 나간다. */
const SKILL_ELEMENT: Record<string, Element | null> = Object.fromEntries(
  (skillsJson as Skill[]).map((s) => [s.id, s.element]),
);

export interface ReplayUnit {
  id: string;
  name: string;
  side: Side;
  row: Combatant['row'];
  kind: Combatant['kind'];
  level: number;
  element: Combatant['element'];
  /** 펫이면 종 id. 렌더러가 어떤 몸으로 그릴지 여기서 안다. */
  speciesId?: string;
  hp: number;
  maxHp: number;
  fainted: boolean;
  ailments: Ailment[];
  /** 버프/디버프 출처 목록. 아이콘 하나로 보여주기 위한 것. */
  modifiers: string[];
  /** 이번 이벤트에서 맞았거나 회복했다 — 한 프레임짜리 연출용 */
  flash: 'hit' | 'heal' | 'miss' | null;
  captured: boolean;
}

/**
 * 마지막 이벤트가 화면에 남긴 충격.
 *
 * 연출은 "지금 무엇이 일어났는가"를 알아야 한다. 유닛 상태만 봐서는 체력이 줄었다는
 * 것밖에 모르고, 그러면 불 스킬이든 물 스킬이든 같은 이펙트가 나간다.
 */
export interface Impact {
  targetId: string;
  kind: 'hit' | 'heal' | 'miss' | 'capture' | 'faint';
  /** 스킬 속성. 스킬을 모르는 타격(상태이상 도트 등)이면 null. */
  element: Element | null;
  amount: number;
  crit: boolean;
}

export interface ReplayState {
  units: ReplayUnit[];
  round: number;
  /** 이 시점까지의 사람이 읽는 로그 줄 */
  lines: { text: string; tone: 'hit' | 'heal' | 'info' | 'big' }[];
  finished: boolean;
  /** 이 시점의 마지막 이벤트. 연출 한 프레임짜리 재료다. */
  impact: Impact | null;
}

function seed(c: Combatant, side: Side): ReplayUnit {
  return {
    id: c.id,
    name: c.name,
    side,
    row: c.row,
    kind: c.kind,
    level: c.level,
    element: c.element,
    speciesId: c.speciesId,
    hp: c.hp,
    maxHp: c.stats.hp,
    fainted: c.hp <= 0,
    ailments: [],
    modifiers: [],
    flash: null,
    captured: false,
  };
}

const AILMENT_LABEL: Record<Ailment, string> = {
  paralysis: '마비',
  sleep: '수면',
  poison: '독',
  confusion: '혼란',
};

/**
 * log[0..upTo) 를 적용한 상태.
 *
 * 매번 처음부터 다시 접는다. 전투 로그는 길어야 수천 건이라 이 정도면 충분히
 * 빠르고, 되감기가 공짜가 되어 재생 속도 조절과 일시정지가 단순해진다.
 */
export function replayBattle(
  allies: Combatant[],
  enemies: Combatant[],
  log: BattleEvent[],
  upTo: number,
  nameOf: (id: string) => string = (id) => id,
): ReplayState {
  const units = new Map<string, ReplayUnit>();
  for (const c of allies) units.set(c.id, seed(c, 'ally'));
  for (const c of enemies) units.set(c.id, seed(c, 'enemy'));

  const lines: ReplayState['lines'] = [];
  let round = 0;
  let finished = false;
  let impact: Impact | null = null;
  const end = Math.min(upTo, log.length);

  for (let i = 0; i < end; i++) {
    const e = log[i]!;
    // 연출용 flash는 마지막 이벤트에만 남긴다
    const last = i === end - 1;
    const u = (id: string) => units.get(id);

    switch (e.type) {
      case 'roundStart':
        round = e.round;
        lines.push({ text: `── ${e.round}라운드`, tone: 'info' });
        break;

      case 'damage': {
        const t = u(e.targetId);
        if (t) {
          t.hp = e.hpAfter;
          if (last) t.flash = 'hit';
        }
        if (last) {
          impact = {
            targetId: e.targetId,
            kind: 'hit',
            element: SKILL_ELEMENT[e.skillId] ?? null,
            amount: e.amount,
            crit: e.crit,
          };
        }
        const tags = [e.crit ? '치명타' : null, e.elementMultiplier > 1.01 ? '효과적' : e.elementMultiplier < 0.99 ? '반감' : null]
          .filter(Boolean)
          .join(' ');
        lines.push({
          text: `${nameOf(e.actorId)} → ${nameOf(e.targetId)} ${e.amount} 피해${tags ? ` (${tags})` : ''}`,
          tone: 'hit',
        });
        break;
      }

      case 'heal': {
        const t = u(e.targetId);
        if (t) {
          t.hp = e.hpAfter;
          if (last && e.amount > 0) t.flash = 'heal';
        }
        if (last && e.amount > 0) {
          impact = { targetId: e.targetId, kind: 'heal', element: null, amount: e.amount, crit: false };
        }
        if (e.amount > 0) lines.push({ text: `${nameOf(e.targetId)} ${e.amount} 회복`, tone: 'heal' });
        break;
      }

      case 'miss': {
        const t = u(e.targetId);
        if (last && t) t.flash = 'miss';
        if (last) impact = { targetId: e.targetId, kind: 'miss', element: null, amount: 0, crit: false };
        lines.push({ text: `${nameOf(e.actorId)}의 공격이 빗나갔다`, tone: 'info' });
        break;
      }

      case 'ailmentTick': {
        const t = u(e.targetId);
        if (t) {
          t.hp = e.hpAfter;
          if (last) t.flash = 'hit';
        }
        if (last) impact = { targetId: e.targetId, kind: 'hit', element: null, amount: e.amount, crit: false };
        lines.push({ text: `${nameOf(e.targetId)} ${AILMENT_LABEL[e.ailment]}으로 ${e.amount} 피해`, tone: 'hit' });
        break;
      }

      case 'ailmentApplied': {
        const t = u(e.targetId);
        if (t && !t.ailments.includes(e.ailment)) t.ailments.push(e.ailment);
        lines.push({ text: `${nameOf(e.targetId)} ${AILMENT_LABEL[e.ailment]} (${e.turns}턴)`, tone: 'info' });
        break;
      }

      case 'ailmentResisted':
        lines.push({ text: `${nameOf(e.targetId)} 저항했다`, tone: 'info' });
        break;

      case 'ailmentCleared': {
        const t = u(e.targetId);
        if (t) t.ailments = t.ailments.filter((a) => a !== e.ailment);
        break;
      }

      case 'modifierApplied': {
        const t = u(e.targetId);
        if (t && !t.modifiers.includes(e.sourceId)) t.modifiers.push(e.sourceId);
        break;
      }

      case 'modifierExpired': {
        const t = u(e.targetId);
        if (t) t.modifiers = t.modifiers.filter((m) => m !== e.sourceId);
        break;
      }

      case 'skipped':
        lines.push({ text: `${nameOf(e.actorId)}은(는) 움직이지 못했다`, tone: 'info' });
        break;

      case 'confused':
        lines.push({ text: `${nameOf(e.actorId)} 혼란 — ${nameOf(e.targetId)}를 노린다`, tone: 'info' });
        break;

      case 'defend':
        lines.push({ text: `${nameOf(e.actorId)} 방어 자세`, tone: 'info' });
        break;

      case 'tauntSet':
        lines.push({
          text:
            e.actorId === e.protectedId
              ? `${nameOf(e.actorId)} 도발`
              : `${nameOf(e.actorId)}가 ${nameOf(e.protectedId)}를 감싼다`,
          tone: 'info',
        });
        break;

      case 'spiritUsed':
        lines.push({
          text: `${nameOf(e.actorId)} 정령 Lv.${e.level} ${e.success ? '발동' : '실패'}`,
          tone: e.success ? 'big' : 'info',
        });
        break;

      case 'noEnergy':
        lines.push({ text: `${nameOf(e.actorId)} 기력이 모자란다`, tone: 'info' });
        break;

      case 'captureAttempt':
        lines.push({ text: `밧줄을 던졌다 — 성공률 ${(e.chance * 100).toFixed(0)}%`, tone: 'big' });
        break;

      case 'captureSuccess': {
        const t = u(e.targetId);
        if (t) {
          t.captured = true;
          t.fainted = true;
        }
        if (last) impact = { targetId: e.targetId, kind: 'capture', element: null, amount: 0, crit: false };
        lines.push({ text: `${nameOf(e.targetId)}을(를) 붙잡았다!`, tone: 'big' });
        break;
      }

      case 'captureFailed': {
        const t = u(e.targetId);
        if (e.escaped && t) t.fainted = true;
        lines.push({ text: e.escaped ? '실패 — 달아나버렸다' : '실패했다', tone: 'info' });
        break;
      }

      case 'fleeAttempt':
        lines.push({ text: e.success ? '빠져나왔다' : '도망치지 못했다', tone: e.success ? 'big' : 'info' });
        break;

      case 'faint': {
        const t = u(e.targetId);
        if (t) {
          t.fainted = true;
          t.hp = 0;
        }
        if (last) impact = { targetId: e.targetId, kind: 'faint', element: null, amount: 0, crit: false };
        lines.push({ text: `${nameOf(e.targetId)} 쓰러졌다`, tone: 'big' });
        break;
      }

      case 'battleEnd':
        finished = true;
        lines.push({
          text: e.winner === 'ally' ? '승리했다' : e.winner === 'enemy' ? '패배했다' : '무승부',
          tone: 'big',
        });
        break;

      default:
        // command·order·attack·energyRegen 등은 화면에 필요 없다
        break;
    }
  }

  return { units: [...units.values()], round, lines, finished, impact };
}

/** 재생을 건너뛸 수 있는 지점인지 — 화면에 아무 변화도 주지 않는 이벤트는 빨리 넘긴다. */
export function isVisible(e: BattleEvent): boolean {
  switch (e.type) {
    case 'command':
    case 'order':
    case 'attack':
    case 'energyRegen':
    case 'battleStart':
      return false;
    case 'heal':
      return e.amount > 0;
    default:
      return true;
  }
}
