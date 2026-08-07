import { describe, it, expect } from 'vitest';
import { resolveDuel, type DuelSide } from '../arbiter/duel';
import { expectedStats, levelUp } from '../src/engine/growth';
import { GROWTH_SCORE_CAP } from '../src/engine/types';
import { characterBaseStats, getSpecies } from '../src/game/party';
import { useGame } from '../src/game/store';
import type { SaveFile } from '../src/game/save';
import { digestOf, verifySave, verifySaveText } from '../src/game/verify';

/**
 * 검증과 대전 판정 테스트.
 *
 * 멀티플레이의 계약은 하나다: **클라이언트가 보낸 숫자를 믿지 않는다.**
 *
 * 그래서 여기서 확인하는 것은 "정상 세이브가 통과하는가"보다 "고친 세이브가
 * 걸리는가"다. 통과 쪽은 한 번만 확인하면 되지만, 걸러내는 쪽은 빠뜨린 구멍
 * 하나가 곧 게임 전체의 밸런스를 무의미하게 만든다.
 */

function freshSave(): SaveFile {
  return JSON.parse(JSON.stringify(useGame.getState().exportSave())) as SaveFile;
}

/** 깊은 복사본에 손을 대서 "고친 세이브"를 만든다. */
function tampered(mutate: (s: SaveFile) => void): SaveFile {
  const s = freshSave();
  mutate(s);
  return s;
}

const issuesOf = (s: SaveFile) => {
  const r = verifySave(s);
  return r.ok ? [] : r.issues;
};

describe('정상 세이브', () => {
  it('통과하고 명부가 나온다', () => {
    const r = verifySave(freshSave());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 주인공 + 파티 펫
    expect(r.roster.combatants.length).toBeGreaterThanOrEqual(2);
    expect(r.roster.combatants[0]!.kind).toBe('character');
    expect(r.roster.playerName).toBe('탐험가');
  });

  it('문자열로 받아도 통과한다', () => {
    const r = verifySaveText(JSON.stringify(freshSave()));
    expect(r.ok).toBe(true);
  });

  it('세이브가 아니면 이유를 돌려준다', () => {
    const r = verifySaveText('이건 그냥 글자다');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]!.kind).toBe('malformed');
  });
});

describe('능력치를 믿지 않는다', () => {
  it('저장된 펫 능력치를 부풀리면 걸린다', () => {
    // currentStats는 캐시가 아니라 실제 상태다. 다만 종·성장률·레벨에서 완전히
    // 유도되므로 서버가 다시 계산해 대조할 수 있다.
    const is = issuesOf(tampered((s) => {
      s.party[0]!.currentStats = { hp: 99999, atk: 9999, def: 9999, spd: 9999 };
    }));
    expect(is.map((i) => i.where)).toContain('party[0].currentStats.atk');
    expect(is.every((i) => i.kind === 'tamper')).toBe(true);
  });

  it('레벨업으로 실제로 자란 개체는 통과한다', () => {
    // 소수 누적이라 더하는 순서가 다르면 끝자리가 흔들린다. 그걸 위조로 보면
    // 정상적으로 키운 펫이 대전에 못 나간다.
    const grown = tampered((s) => {
      let pet = s.party[0]!;
      for (let i = 0; i < 30; i++) pet = levelUp(pet);
      s.party[0] = pet;
    });
    expect(grown.party[0]!.level).toBe(freshSave().party[0]!.level + 30);
    const r = verifySave(grown);
    expect(r.ok, JSON.stringify(r.ok ? [] : r.issues)).toBe(true);
  });

  it('명부의 능력치는 저장값이 아니라 계산값이다', () => {
    const grown = tampered((s) => {
      let pet = s.party[0]!;
      for (let i = 0; i < 12; i++) pet = levelUp(pet);
      s.party[0] = pet;
    });
    const r = verifySave(grown);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pet = grown.party[0]!;
    const want = expectedStats(getSpecies(pet.speciesId).baseStats, pet.growth, pet.level);
    expect(r.roster.combatants[1]!.stats.atk).toBe(Math.floor(want.atk + 1e-9));
  });

  it('주인공 능력치가 레벨과 안 맞으면 걸린다', () => {
    const is = issuesOf(tampered((s) => { s.character.baseStats.atk = 9999; }));
    expect(is.some((i) => i.where === 'character.baseStats.atk' && i.kind === 'tamper')).toBe(true);
  });

  it('레벨을 올리면 능력치도 같이 올라야 통과한다', () => {
    // 레벨만 올리면 능력치가 안 맞아 걸리고, 규칙대로 다시 계산해 넣으면 통과한다.
    expect(issuesOf(tampered((s) => { s.character.level = 40; })).length).toBeGreaterThan(0);
    const ok = verifySave(
      tampered((s) => {
        s.character.level = 40;
        s.character.baseStats = characterBaseStats(40);
      }),
    );
    expect(ok.ok).toBe(true);
  });
});

describe('성장률', () => {
  it('종의 범위를 벗어나면 걸린다', () => {
    const is = issuesOf(tampered((s) => { s.party[0]!.growth.atk = 5; }));
    expect(is.some((i) => i.where === 'party[0].growth' && i.kind === 'tamper')).toBe(true);
  });

  it('상한을 넘기면 상한이라고 말해준다', () => {
    // 범위 위반과 상한 위반은 같은 값이 아니다. 상한 초과는 헌장이 특별히 막는
    // 것이라 메시지가 달라야 어느 쪽인지 알 수 있다.
    const is = issuesOf(tampered((s) => {
      s.party[0]!.growth = { hp: 25, atk: 5, def: 5, spd: 5 };
    }));
    const hit = is.find((i) => i.where === 'party[0].growth');
    expect(hit?.message).toContain('상한');
    expect(hit?.message).toContain(String(GROWTH_SCORE_CAP));
  });

  it('상한 바로 아래는 범위 검사에 걸린다 — 통과시키지 않는다', () => {
    // 지표만 낮추고 개별 성장률을 종의 최대보다 높게 두는 우회를 막는다
    const is = issuesOf(tampered((s) => {
      s.party[0]!.growth = { hp: 1, atk: 1.9, def: 0.1, spd: 0.1 };
    }));
    expect(is.length).toBeGreaterThan(0);
  });
});

describe('그 밖의 위조', () => {
  const cases: [string, (s: SaveFile) => void, string][] = [
    ['없는 종', (s) => { s.party[0]!.speciesId = '용'; }, 'party[0].speciesId'],
    ['레벨 초과', (s) => { s.party[0]!.level = 500; }, 'party[0].level'],
    ['배울 수 없는 기술', (s) => { s.party[0]!.skills = ['tidalWave']; }, 'party[0].skills'],
    ['기술 칸 초과', (s) => { s.party[0]!.skills = ['strike', 'strike', 'strike', 'strike', 'strike']; }, 'party[0].skills'],
    ['충성도 초과', (s) => { s.party[0]!.loyalty = 900; }, 'party[0].loyalty'],
    ['스톤 음수', (s) => { s.stones = -1; }, 'stones'],
    ['매력 음수', (s) => { s.character.charm = -5; }, 'character.charm'],
    ['소지품 음수', (s) => { s.inventory.push({ itemId: 'herbSmall', qty: -3 }); }, 'inventory.herbSmall'],
    ['칸에 안 맞는 장비', (s) => { s.equipment.armor = 'clubStone'; }, 'equipment.armor'],
    ['없는 장비', (s) => { s.equipment.weapon = '엑스칼리버'; }, 'equipment.weapon'],
  ];

  for (const [name, mutate, where] of cases) {
    it(`${name} — ${where}에서 걸린다`, () => {
      const is = issuesOf(tampered(mutate));
      expect(is.map((i) => i.where)).toContain(where);
    });
  }
});

/* ─────────────── 대전 ─────────────── */

function side(playerId: string, stance: string, mutate?: (s: SaveFile) => void): DuelSide {
  return { playerId, save: mutate ? tampered(mutate) : freshSave(), stance };
}

describe('대전 판정', () => {
  it('같은 seed와 같은 입력이면 완전히 같은 결과다', () => {
    const run = () => resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), 4242);
    const a = run();
    const b = run();
    expect(a.ok).toBe(true);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('로그 지문이 로그와 함께 움직인다', () => {
    const r = resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), 99);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.digest).toBe(digestOf(r.log));
    expect(r.digest).not.toBe(digestOf(r.log.slice(0, -1)));
  });

  it('seed가 다르면 결과가 달라진다', () => {
    const logs = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), seed);
      if (r.ok) logs.add(r.digest);
    }
    expect(logs.size).toBeGreaterThan(1);
  });

  it('상대 태세가 상대 쪽에 적용된다', () => {
    // 도주로 확인한다. 방어는 회복기도 방어 정령도 없는 펫에게는 공격과 같은
    // 명령이 나올 수 있어(실제로 시작 펫이 그렇다) 태세 반영 여부를 못 가른다.
    const both = resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), 777);
    const runs = resolveDuel(side('u1', 'aggressive'), side('u2', 'flee'), 777);
    expect(both.ok && runs.ok).toBe(true);
    if (!both.ok || !runs.ok) return;
    expect(runs.digest).not.toBe(both.digest);
  });

  it('아무도 자기 편을 때리지 않는다', () => {
    // 상대 커맨드를 정할 때 시야를 뒤집지 않으면, 상대는 "내 적"을 자기 편에서
    // 고르게 된다 — 즉 자기 팀을 때린다. 이게 미러링 버그의 실제 증상이다.
    const r = resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), 909);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const confused = new Set(
      r.log.filter((e) => e.type === 'confused').map((e) => (e as { actorId: string }).actorId),
    );
    const friendly = r.log.filter(
      (e) =>
        e.type === 'damage' &&
        e.actorId.slice(0, 2) === e.targetId.slice(0, 2) &&
        !confused.has(e.actorId),
    );
    expect(friendly).toEqual([]);
  });

  it('주인공은 대전에 나가지 않는다 — 펫끼리 붙는다', () => {
    // 주인공을 넣으면 양쪽 주인공 능력치가 레벨에만 달려 있어 거의 같고, 그 둘이
    // 전투를 지배해 펫 육성 차이가 묻힌다. 실측으로 확인한 뒤 뺐다.
    const r = resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), 12);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const s of [r.sides.a, r.sides.b]) {
      expect(s.roster.length).toBeGreaterThan(0);
      expect(s.roster.every((c) => !c.id.includes('hero'))).toBe(true);
    }
  });

  it('도주 태세면 상대가 이긴 것으로 끝난다', () => {
    const r = resolveDuel(side('u1', 'flee'), side('u2', 'aggressive'), 31);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 도망쳤든 못 도망치고 졌든, 도망만 치는 쪽이 이길 수는 없다
    expect(r.winner).not.toBe('a');
  });

  it('결과에 양쪽 요약이 들어간다', () => {
    const r = resolveDuel(side('u1', 'aggressive'), side('u2', 'defensive'), 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sides.a.playerId).toBe('u1');
    expect(r.sides.b.stance).toBe('defensive');
    expect(r.sides.a.roster.length).toBeGreaterThan(0);
    expect(r.rounds).toBeGreaterThan(0);
  });

  it('개체 id가 겹쳐도 진영이 섞이지 않는다', () => {
    // 두 사람이 같은 uid의 펫을 갖고 있을 수 있다. 접두사를 안 붙이면 엔진이
    // 상대 펫을 자기 편으로 착각한다.
    const r = resolveDuel(side('u1', 'aggressive'), side('u2', 'aggressive'), 8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const aIds = r.sides.a.roster.map((x) => x.id);
    const bIds = r.sides.b.roster.map((x) => x.id);
    expect(aIds.every((id) => id.startsWith('a:'))).toBe(true);
    expect(bIds.every((id) => id.startsWith('b:'))).toBe(true);
    expect(aIds.filter((id) => bIds.includes(id))).toEqual([]);
  });
});

describe('대전 거절', () => {
  it('고친 세이브를 낸 쪽만 지목한다', () => {
    const r = resolveDuel(
      side('honest', 'aggressive'),
      side('cheat', 'aggressive', (s) => { s.party[0]!.growth.atk = 9; }),
      1,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejected.map((x) => x.playerId)).toEqual(['cheat']);
    expect(r.rejected[0]!.issues.some((i) => i.kind === 'tamper')).toBe(true);
  });

  it('양쪽 다 고쳤으면 둘 다 지목한다', () => {
    const r = resolveDuel(
      side('a', 'aggressive', (s) => { s.stones = -1; }),
      side('b', 'aggressive', (s) => { s.character.charm = -1; }),
      1,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejected.map((x) => x.playerId).sort()).toEqual(['a', 'b']);
  });

  it('대전에서 포획 태세는 쓸 수 없다', () => {
    // 남의 펫을 잡을 수 있으면 대전이 아니라 강탈이다
    const r = resolveDuel(side('u1', 'capture'), side('u2', 'aggressive'), 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejected[0]!.issues[0]!.where).toBe('stance');
  });

  it('거절당한 판은 로그를 만들지 않는다', () => {
    const r = resolveDuel(side('u1', 'aggressive', (s) => { s.stones = -1; }), side('u2', 'aggressive'), 1);
    expect(r.ok).toBe(false);
    expect((r as unknown as Record<string, unknown>)['log']).toBeUndefined();
  });
});
