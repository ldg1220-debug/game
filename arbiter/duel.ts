/**
 * 대전 판정.
 *
 * 서버가 전투를 굴리는 자리다. 여기서 중요한 건 로직이 아니라 **어디서 오는가**다:
 * `simulateBattle`도 `verifySave`도 `createDuelSource`도 전부 클라이언트가 쓰는
 * 바로 그 모듈이다. 복사본이 아니다.
 *
 * 그래서 이 파일에는 규칙이 없다. 검증하고, seed를 받아 엔진을 부르고, 결과를
 * 정리해 돌려주는 것뿐이다. 규칙을 여기 한 줄이라도 적으면 그 순간 클라이언트와
 * 서버가 다른 게임을 하기 시작한다.
 */

import { DEFAULT_CATALOG, simulateBattle, type BattleEvent, type Combatant } from '../src/engine/battle';
import { createDuelSource, isDuelStance, type DuelStance } from '../src/game/stances';
import { digestOf, verifySave, type VerifyIssue, type VerifiedRoster } from '../src/game/verify';
import type { SaveFile } from '../src/game/save';

export interface DuelSide {
  playerId: string;
  save: SaveFile;
  stance: string;
}

export interface DuelRejected {
  ok: false;
  /** 어느 쪽이 거절당했는지. 양쪽 다면 둘 다 들어간다. */
  rejected: { playerId: string; issues: VerifyIssue[] }[];
}

export interface DuelResolved {
  ok: true;
  seed: number;
  winner: 'a' | 'b' | 'draw';
  endedBy: string;
  rounds: number;
  log: BattleEvent[];
  /** 로그가 같은지 싸게 확인하기 위한 값 */
  digest: string;
  sides: {
    a: DuelSideSummary;
    b: DuelSideSummary;
  };
}

export interface DuelSideSummary {
  playerId: string;
  playerName: string;
  level: number;
  stance: DuelStance;
  /** 서버가 다시 계산한 명부. 클라이언트가 보낸 능력치는 쓰지 않는다. */
  roster: { id: string; name: string; level: number; hp: number; maxHp: number }[];
  survivors: number;
}

export type DuelOutcome = DuelResolved | DuelRejected;

function summarize(
  side: DuelSide,
  stance: DuelStance,
  roster: VerifiedRoster,
  final: Combatant[],
): DuelSideSummary {
  return {
    playerId: side.playerId,
    playerName: roster.playerName,
    level: roster.level,
    stance,
    roster: final.map((c) => ({ id: c.id, name: c.name, level: c.level, hp: c.hp, maxHp: c.stats.hp })),
    survivors: final.filter((c) => c.hp > 0).length,
  };
}

/**
 * 한 판 굴린다.
 *
 * seed는 인자로 받는다 — 판정 서비스가 직접 뽑으면 재현이 불가능해지고, 분쟁이
 * 생겼을 때 "그때 그 seed로 다시 돌려보자"를 할 수 없다. seed를 정하는 것도,
 * 로그를 보관하는 것도 서버(FastAPI)의 일이다.
 */
export function resolveDuel(a: DuelSide, b: DuelSide, seed: number): DuelOutcome {
  const rejected: DuelRejected['rejected'] = [];

  const stanceOf = (s: DuelSide): DuelStance | null => (isDuelStance(s.stance) ? s.stance : null);
  for (const s of [a, b]) {
    if (stanceOf(s) === null) {
      rejected.push({
        playerId: s.playerId,
        issues: [{ where: 'stance', message: `대전에서 쓸 수 없는 태세 — ${s.stance}`, kind: 'malformed' }],
      });
    }
  }

  const va = verifySave(a.save);
  const vb = verifySave(b.save);
  if (!va.ok) rejected.push({ playerId: a.playerId, issues: va.issues });
  if (!vb.ok) rejected.push({ playerId: b.playerId, issues: vb.issues });
  if (rejected.length > 0 || !va.ok || !vb.ok) return { ok: false, rejected };

  const sa = stanceOf(a)!;
  const sb = stanceOf(b)!;

  // 양쪽 개체 id가 겹치면 엔진이 대상을 잘못 고른다. 서로 다른 사람의 세이브라
  // uid가 같을 수 있으므로 진영 접두사를 붙인다.
  const prefix = (cs: Combatant[], p: string) => cs.map((c) => ({ ...c, id: `${p}:${c.id}` }));

  // **대전은 펫끼리 붙는다. 주인공은 나가지 않는다.**
  //
  // 처음엔 PvE와 똑같이 주인공 + 펫으로 짰다. 30판씩 재보니 펫 레벨이 10 차이
  // 나는데도 승률이 13:17이었다 — 주인공 능력치가 양쪽 다 레벨에만 달려 있어
  // 사실상 같고, 그 둘이 전투를 지배해서 펫 차이가 묻힌 것이다. 게임의 축이
  // 펫 육성인데 대전에서 육성이 무의미해지면 대전을 할 이유가 없다.
  const result = simulateBattle({
    allies: prefix(va.roster.pets, 'a'),
    enemies: prefix(vb.roster.pets, 'b'),
    seed,
    commandSource: createDuelSource(sa, sb, DEFAULT_CATALOG),
  });

  return {
    ok: true,
    seed,
    winner: result.winner === 'ally' ? 'a' : result.winner === 'enemy' ? 'b' : 'draw',
    endedBy: result.endedBy,
    rounds: result.rounds,
    log: result.log,
    digest: digestOf(result.log),
    sides: {
      a: summarize(a, sa, va.roster, result.finalState.allies),
      b: summarize(b, sb, vb.roster, result.finalState.enemies),
    },
  };
}
