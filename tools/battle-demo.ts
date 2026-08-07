/**
 * 전투 로그 콘솔 뷰어.
 *
 * 헌장 Phase 2는 "UI를 만들지 않는다. 콘솔과 테스트로만 검증한다"고 못박았다.
 * 이건 그 콘솔이다 — 동시에 "BattleEvent 로그만으로 전투를 재생할 수 있는가"에
 * 대한 실물 증거이기도 하다. 여기서 상태를 다시 계산하지 않고, 오직 로그만 읽는다.
 *
 *   pnpm battle:demo [seed]
 */

import { DEFAULT_CATALOG, simulateBattle, type BattleEvent, type Combatant } from '../src/engine/battle';

const seed = Number(process.argv[2] ?? 20260804);

const name = new Map<string, string>();
const skillName = (id: string) => DEFAULT_CATALOG.skills[id]?.name ?? DEFAULT_CATALOG.spirits[id]?.name ?? id;
const who = (id: string) => name.get(id) ?? id;

function mk(over: Partial<Combatant> & { id: string; name: string }): Combatant {
  const hp = over.stats?.hp ?? 320;
  return {
    kind: 'pet',
    level: 25,
    element: { primary: 'earth', secondary: null },
    stats: { hp, atk: 45, def: 32, spd: 30 },
    hp,
    energy: 45,
    maxEnergy: 45,
    row: 'front',
    skills: ['strike'],
    ...over,
  };
}

const allies: Combatant[] = [
  mk({ id: 'hero', name: '주인공', kind: 'character', charm: 12, element: { primary: 'earth', secondary: null }, skills: ['strike', 'gore', 'harden'], stats: { hp: 340, atk: 44, def: 34, spd: 33 } }),
  mk({ id: 'fox', name: '불씨여우', element: { primary: 'fire', secondary: 'wind' }, skills: ['strike', 'scorch', 'frenzy2'], stats: { hp: 260, atk: 54, def: 24, spd: 46 } }),
  mk({ id: 'shell', name: '바위등딱지', row: 'back', element: { primary: 'earth', secondary: null }, skills: ['strike', 'ironWall', 'taunt'], stats: { hp: 420, atk: 30, def: 52, spd: 18 }, spirits: ['stoneSkin'] }),
];

const enemies: Combatant[] = [
  mk({ id: 'wyrm', name: '물결비늘뱀', element: { primary: 'water', secondary: null }, skills: ['strike', 'splash', 'lull'], stats: { hp: 300, atk: 48, def: 30, spd: 38 }, speciesId: 'frostscale', captureBaseRate: 0.3 }),
  mk({ id: 'stag', name: '회오리사슴', row: 'back', element: { primary: 'wind', secondary: null }, skills: ['strike', 'gale', 'numb'], stats: { hp: 270, atk: 42, def: 26, spd: 50 }, speciesId: 'whirlstag', captureBaseRate: 0.42 }),
];

for (const c of [...allies, ...enemies]) name.set(c.id, c.name);

const result = simulateBattle({ allies, enemies, seed });

/** 로그 한 줄을 사람이 읽는 문장으로. 상태 계산은 여기 없다. */
function render(e: BattleEvent): string | null {
  switch (e.type) {
    case 'battleStart':
      return `전투 시작 — ${e.allies.map(who).join(', ')} vs ${e.enemies.map(who).join(', ')}`;
    case 'roundStart':
      return `\n── 라운드 ${e.round} ──`;
    case 'order':
      return `  순서: ${e.actorIds.map(who).join(' → ')}`;
    case 'defend':
      return `  ${who(e.actorId)} 방어 자세`;
    case 'skipped':
      return `  ${who(e.actorId)} 행동 불가 (${e.reason === 'paralysis' ? '마비' : '수면'})`;
    case 'confused':
      return `  ${who(e.actorId)} 혼란 — 엉뚱하게 ${who(e.targetId)}를 노린다`;
    case 'command':
      // 공격 계열은 attack 이벤트가 따로 나오므로, 그 외만 여기서 보여준다
      if (e.command.kind === 'skill') {
        const s = DEFAULT_CATALOG.skills[e.command.skillId];
        // 공격은 attack이, 도발은 tauntSet이 이미 보여준다
        const covered = ['single', 'aoe', 'guardBreak', 'taunt'];
        if (s && !covered.includes(s.archetype)) {
          return `  ${who(e.actorId)} · ${s.name}`;
        }
      }
      return null;
    case 'attack':
      return `  ${who(e.actorId)} → ${who(e.targetId)} · ${skillName(e.skillId)}`;
    case 'miss':
      return `    빗나감`;
    case 'damage': {
      const tags = [
        e.crit ? '치명타' : null,
        e.elementMultiplier > 1.01 ? '효과적' : e.elementMultiplier < 0.99 ? '별로' : null,
        e.redirectedFrom ? `${who(e.redirectedFrom)} 대신` : null,
      ].filter(Boolean);
      return `    ${e.amount} 피해${tags.length ? ` (${tags.join(', ')})` : ''} → ${who(e.targetId)} HP ${e.hpAfter}`;
    }
    case 'heal':
      return e.amount > 0 ? `  ${who(e.actorId)} → ${who(e.targetId)} ${e.amount} 회복 (HP ${e.hpAfter})` : null;
    case 'ailmentApplied':
      return `    ${who(e.actorId)} → ${who(e.targetId)} ${e.ailment} ${e.turns}턴`;
    case 'ailmentResisted':
      return `    ${who(e.actorId)} → ${who(e.targetId)} 저항`;
    case 'ailmentTick':
      return `  ${who(e.targetId)} ${e.ailment} 피해 ${e.amount} (HP ${e.hpAfter})`;
    case 'ailmentCleared':
      return `  ${who(e.targetId)} ${e.ailment} 해제 (${e.reason})`;
    case 'modifierApplied': {
      const parts = [e.atk && `공 x${e.atk}`, e.def && `방 x${e.def}`, e.spd && `순 x${e.spd}`].filter(Boolean);
      return `  ${who(e.targetId)} ${skillName(e.sourceId)} — ${parts.join(' ')} (${e.turns}턴)`;
    }
    case 'tauntSet':
      return e.actorId === e.protectedId
        ? `  ${who(e.actorId)} 도발 — 공격을 끌어온다 (${e.turns}턴)`
        : `  ${who(e.actorId)}가 ${who(e.protectedId)}를 감싼다 (${e.turns}턴)`;
    case 'spiritUsed':
      return `  ${who(e.actorId)} 정령 ${skillName(e.spiritId)} Lv.${e.level} ${e.success ? '발동' : '실패'}`;
    case 'itemUsed':
      return `  ${who(e.actorId)} 아이템 ${DEFAULT_CATALOG.items[e.itemId]?.name ?? e.itemId}`;
    case 'noEnergy':
      return `  ${who(e.actorId)} 기력 부족 (${e.energy}/${e.cost}) — 평타로 대체`;
    case 'captureAttempt':
      return `  ${who(e.actorId)} 포획 시도 → ${who(e.targetId)} (${(e.chance * 100).toFixed(1)}%)`;
    case 'captureSuccess':
      return `  ${who(e.targetId)} 포획 성공`;
    case 'captureFailed':
      return `  포획 실패${e.escaped ? ' — 달아났다' : ''}`;
    case 'fleeAttempt':
      return `  ${who(e.actorId)} 도주 시도 (${(e.chance * 100).toFixed(1)}%) — ${e.success ? '성공' : '실패'}`;
    case 'faint':
      return `  ${who(e.targetId)} 쓰러짐`;
    case 'battleEnd':
      return `\n전투 종료 — ${e.winner === 'ally' ? '아군 승리' : e.winner === 'enemy' ? '패배' : '무승부'} (${e.endedBy}, ${e.round}라운드)`;
    default:
      return null; // energyRegen 등 화면에 필요 없는 것들
  }
}

console.log(`seed ${seed}\n`);
for (const e of result.log) {
  const line = render(e);
  if (line !== null) console.log(line);
}

console.log('\n최종 상태');
for (const c of [...result.finalState.allies, ...result.finalState.enemies]) {
  console.log(`  ${c.name.padEnd(7)} HP ${String(c.hp).padStart(4)}/${c.stats.hp}  기력 ${c.energy}`);
}
console.log(`\n로그 ${result.log.length}건`);
