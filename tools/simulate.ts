/**
 * 밸런스 시뮬레이터.
 *
 * 헌장: "이 시뮬레이터 결과로 /src/data/*.json 을 튜닝한다. 감으로 조정하지 않는다."
 *
 * 세 가지를 한다.
 *   pnpm simulate match  [A] [B] [N]  두 종을 N회 붙여 승률·라운드·피해 분포
 *   pnpm simulate curve  [out.csv]    레벨 1~99 성장 곡선을 CSV로
 *   pnpm simulate matrix [N]          모든 종 쌍의 승률. 60% 넘으면 경고
 *
 * 인자 없이 부르면 셋 다 돈다.
 *
 * 모든 전투는 seed에서 나오므로 결과가 재현된다. 같은 명령을 두 번 돌리면
 * 같은 숫자가 나오고, 데이터를 고친 만큼만 숫자가 움직인다 — 그래야 "이 변경이
 * 무엇을 바꿨는가"를 말할 수 있다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import petsJson from '../src/data/pets.json';
import { DEFAULT_CATALOG, createDefaultAI, simulateBattle, type Combatant } from '../src/engine/battle';
import { createPetInstance, expToNext } from '../src/engine/growth';
import { createRng } from '../src/engine/rng';
import { ADVANTAGE, ELEMENTS, growthScore, type Element, type PetSpecies } from '../src/engine/types';
import { petToCombatant } from '../src/game/party';
import { createStanceSource } from '../src/game/stances';

const SPECIES = petsJson as PetSpecies[];
const byId = (id: string) => {
  const s = SPECIES.find((x) => x.id === id);
  if (!s) {
    console.error(`없는 종: ${id}\n쓸 수 있는 id: ${SPECIES.map((x) => x.id).join(', ')}`);
    process.exit(1);
  }
  return s;
};

/** 경고 임계값. 이걸 넘으면 그 조합은 선택이 아니라 정답이 된다. */
const DOMINANCE_THRESHOLD = 0.6;

/* ─────────────── 개체 만들기 ─────────────── */

/**
 * 성장률 중앙값 개체.
 *
 * 무작위 개체로 비교하면 종의 차이인지 개체 운인지 구분할 수 없다. 밸런스를
 * 볼 때는 같은 조건에서 종만 갈라야 한다.
 */
function medianCombatant(species: PetSpecies, level: number, uid: string): Combatant {
  const { min, max } = species.growthRange;
  const growth = {
    hp: (min.hp + max.hp) / 2,
    atk: (min.atk + max.atk) / 2,
    def: (min.def + max.def) / 2,
    spd: (min.spd + max.spd) / 2,
  };
  const levels = level - 1;
  const pet = {
    uid,
    speciesId: species.id,
    nickname: null,
    level,
    exp: 0,
    growth,
    currentStats: {
      hp: species.baseStats.hp + growth.hp * levels,
      atk: species.baseStats.atk + growth.atk * levels,
      def: species.baseStats.def + growth.def * levels,
      spd: species.baseStats.spd + growth.spd * levels,
    },
    loyalty: 100,
    skills: species.skillPool.slice(0, 4),
    capturedAt: 0,
    seedUsed: 0,
  };
  return petToCombatant(pet, 'front');
}

function fight(a: Combatant, b: Combatant, seed: number) {
  const rng = createRng(seed);
  return simulateBattle({
    allies: [{ ...a, id: 'A' }],
    enemies: [{ ...b, id: 'B' }],
    seed,
    commandSource: createStanceSource('aggressive', DEFAULT_CATALOG, createDefaultAI(DEFAULT_CATALOG, rng), 'ropeCrude'),
  });
}

/* ─────────────── 1. 두 종 맞대결 ─────────────── */

interface MatchStats {
  aWins: number;
  bWins: number;
  draws: number;
  rounds: number[];
  damageA: number[];
  damageB: number[];
}

function runMatch(a: PetSpecies, b: PetSpecies, level: number, n: number, seed0 = 1000): MatchStats {
  const stats: MatchStats = { aWins: 0, bWins: 0, draws: 0, rounds: [], damageA: [], damageB: [] };
  const ca = medianCombatant(a, level, 'A');
  const cb = medianCombatant(b, level, 'B');

  for (let i = 0; i < n; i++) {
    const r = fight(ca, cb, seed0 + i);
    if (r.winner === 'ally') stats.aWins++;
    else if (r.winner === 'enemy') stats.bWins++;
    else stats.draws++;
    stats.rounds.push(r.rounds);

    let da = 0;
    let db = 0;
    for (const e of r.log) {
      if (e.type !== 'damage') continue;
      if (e.actorId === 'A') da += e.amount;
      else if (e.actorId === 'B') db += e.amount;
    }
    stats.damageA.push(da);
    stats.damageB.push(db);
  }
  return stats;
}

function percentile(rows: readonly number[], p: number): number {
  if (rows.length === 0) return 0;
  const sorted = [...rows].sort((x, y) => x - y);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i]!;
}

const mean = (rows: readonly number[]) => (rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : 0);

function cmdMatch(aId: string, bId: string, n: number, level: number): void {
  const a = byId(aId);
  const b = byId(bId);
  const s = runMatch(a, b, level, n);
  const decided = s.aWins + s.bWins;
  const rate = decided > 0 ? s.aWins / decided : 0.5;

  console.log(`\n맞대결 — ${a.name}(${a.id}) vs ${b.name}(${b.id}) · Lv.${level} · ${n}회`);
  console.log(`  승률    ${a.name} ${(rate * 100).toFixed(1)}% · ${b.name} ${((1 - rate) * 100).toFixed(1)}%` + (s.draws ? ` · 무승부 ${s.draws}` : ''));
  console.log(`  라운드  평균 ${mean(s.rounds).toFixed(1)} · 중앙 ${percentile(s.rounds, 0.5)} · 90% ${percentile(s.rounds, 0.9)}`);
  console.log(`  누적피해 ${a.name} 평균 ${mean(s.damageA).toFixed(0)} · ${b.name} 평균 ${mean(s.damageB).toFixed(0)}`);

  if (Math.abs(rate - 0.5) > DOMINANCE_THRESHOLD - 0.5) {
    const strong = rate > 0.5 ? a : b;
    console.log(`  ⚠ ${strong.name}의 승률이 ${(DOMINANCE_THRESHOLD * 100).toFixed(0)}%를 넘는다 — 고를 이유가 없는 쪽이 생긴다`);
  }
}

/* ─────────────── 2. 성장 곡선 ─────────────── */

/**
 * 전투력 지표.
 *
 * 한 숫자로 줄여야 레벨 구간별 곡선을 볼 수 있다. HP는 버티는 시간, 공격은
 * 깎는 속도라서 곱으로 본다 — 합으로 보면 방어형과 공격형의 실제 차이가
 * 사라진다.
 */
function power(stats: { hp: number; atk: number; def: number; spd: number }): number {
  return Math.round((stats.hp * (stats.atk + stats.def * 0.5) * (1 + stats.spd / 200)) / 100);
}

function cmdCurve(outFile: string): void {
  const rows: string[] = ['species,rarity,growthScore,level,hp,atk,def,spd,power,expToNext'];
  const samples = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 99];

  for (const sp of SPECIES) {
    // 중앙값 개체 하나를 레벨만 바꿔가며 본다
    for (const level of samples) {
      const c = medianCombatant(sp, level, 'x');
      rows.push(
        [
          sp.id,
          sp.rarity,
          ((sp.growthRange.min.hp + sp.growthRange.max.hp) / 2 / 5 +
            (sp.growthRange.min.atk + sp.growthRange.max.atk) / 2 +
            (sp.growthRange.min.def + sp.growthRange.max.def) / 2 +
            (sp.growthRange.min.spd + sp.growthRange.max.spd) / 2
          ).toFixed(3),
          level,
          c.stats.hp,
          c.stats.atk,
          c.stats.def,
          c.stats.spd,
          power(c.stats),
          Number.isFinite(expToNext(level)) ? expToNext(level) : '',
        ].join(','),
      );
    }
  }

  fs.writeFileSync(outFile, rows.join('\n') + '\n');

  console.log(`\n성장 곡선 → ${outFile} (${rows.length - 1}행)`);
  console.log('  구간별 전투력 (희귀도 중앙값)');
  const rarities = ['common', 'uncommon', 'rare', 'epic'] as const;
  const header = samples.filter((l) => l % 10 === 0 || l === 1);
  console.log(`    레벨      ${header.map((l) => String(l).padStart(7)).join('')}`);
  for (const r of rarities) {
    const group = SPECIES.filter((s) => s.rarity === r);
    const cells = header.map((level) =>
      String(Math.round(mean(group.map((s) => power(medianCombatant(s, level, 'x').stats))))).padStart(7),
    );
    console.log(`    ${r.padEnd(9)} ${cells.join('')}`);
  }
}

/* ─────────────── 3. 전 종 매트릭스 ─────────────── */

function cmdMatrix(n: number, level: number): void {
  console.log(`\n전 종 맞대결 — Lv.${level} · 쌍당 ${n}회 · ${SPECIES.length}종`);

  const wins = new Map<string, { won: number; played: number }>();
  for (const s of SPECIES) wins.set(s.id, { won: 0, played: 0 });
  const warnings: string[] = [];
  const elementPairs: { a: Element; b: Element; rate: number }[] = [];

  for (let i = 0; i < SPECIES.length; i++) {
    for (let j = i + 1; j < SPECIES.length; j++) {
      const a = SPECIES[i]!;
      const b = SPECIES[j]!;
      const s = runMatch(a, b, level, n, 5000 + i * 100 + j);
      const decided = s.aWins + s.bWins;
      if (decided === 0) continue;
      const rate = s.aWins / decided;

      wins.get(a.id)!.won += s.aWins;
      wins.get(a.id)!.played += decided;
      wins.get(b.id)!.won += s.bWins;
      wins.get(b.id)!.played += decided;

      elementPairs.push({ a: a.element.primary, b: b.element.primary, rate });

      // 경고는 **같은 등급 + 같은 주속성**끼리만 낸다.
      //
      // 속성이 다르면 한쪽이 압도하는 게 정상이다 — 지>수>화>풍>지 순환이
      // 이 게임의 설계이고, 1대1에서 1.25배와 0.8배가 누적되면 승률은 당연히
      // 한쪽으로 쏠린다. 그걸 경고로 띄우면 설계가 동작하는 걸 결함으로
      // 보고하는 셈이라, 진짜 문제가 소음에 묻힌다.
      if (
        a.rarity === b.rarity &&
        a.element.primary === b.element.primary &&
        Math.abs(rate - 0.5) > DOMINANCE_THRESHOLD - 0.5
      ) {
        const strong = rate > 0.5 ? a : b;
        const weak = rate > 0.5 ? b : a;
        warnings.push(
          `${strong.name} ${(Math.max(rate, 1 - rate) * 100).toFixed(0)}% vs ${weak.name} — 같은 ${a.rarity}·${a.element.primary}`,
        );
      }
    }
  }

  const ranked = [...wins.entries()]
    .map(([id, w]) => ({ id, rate: w.played ? w.won / w.played : 0.5 }))
    .sort((x, y) => y.rate - x.rate);

  console.log('\n  전체 승률 (높은 순)');
  for (const r of ranked) {
    const sp = byId(r.id);
    const bar = '█'.repeat(Math.round(r.rate * 30));
    console.log(
      `    ${sp.name.padEnd(9)} ${sp.rarity.padEnd(9)} ${(r.rate * 100).toFixed(1).padStart(5)}%  ${bar}`,
    );
  }

  // 희귀도가 높을수록 강해야 한다. 아니면 등급 표시가 거짓말이 된다.
  console.log('\n  희귀도별 평균 승률');
  for (const r of ['common', 'uncommon', 'rare', 'epic'] as const) {
    const group = ranked.filter((x) => byId(x.id).rarity === r);
    console.log(`    ${r.padEnd(9)} ${(mean(group.map((g) => g.rate)) * 100).toFixed(1)}%`);
  }

  // 속성 상성이 의도대로 도는지 — 이건 경고가 아니라 확인이다
  console.log('\n  속성 상성 실측 (행이 열을 상대로 이긴 비율)');
  console.log(`    ${''.padEnd(6)}${ELEMENTS.map((e) => e.padStart(9)).join('')}`);
  for (const a of ELEMENTS) {
    const cells = ELEMENTS.map((b) => {
      // 같은 속성끼리는 정의상 50%라 의미가 없다 — 빈칸으로 둔다
      if (a === b) return '·'.padStart(9);
      const rows = elementPairs
        .filter((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))
        .map((p) => (p.a === a ? p.rate : 1 - p.rate));
      return rows.length ? `${(mean(rows) * 100).toFixed(0)}%`.padStart(9) : ''.padStart(9);
    });
    const beats = ADVANTAGE[a];
    console.log(`    ${a.padEnd(6)}${cells.join('')}   → ${beats}에 강함`);
  }

  if (warnings.length > 0) {
    console.log(`\n  ⚠ 같은 등급·같은 속성끼리 ${DOMINANCE_THRESHOLD * 100}%를 넘는 조합 ${warnings.length}건`);
    for (const w of warnings) console.log(`    ${w}`);
  } else {
    console.log(`\n  같은 등급·같은 속성끼리 ${DOMINANCE_THRESHOLD * 100}%를 넘는 조합 없음`);
  }
}

/* ─────────────── 4. 파티 규모 ─────────────── */

/**
 * 같은 종 3마리로 3대3.
 *
 * 1대1 매트릭스만 보면 밸런스를 잘못 읽는다. 전체공격은 표적이 하나뿐이라
 * 위력만 낮은 스킬이 되고, 도발은 지킬 아군이 없어 빈 턴이 되며, 혼란은 고를
 * 대상이 하나뿐이라 아무 일도 안 한다. 실제 게임은 1~5인 파티끼리 붙으므로
 * 그 규모에서 다시 재야 한다.
 *
 * 1대1에서 약해 보이던 종이 여기서 올라오면 그건 밸런스 문제가 아니라
 * 역할 차이다.
 */
function cmdParty(n: number, level: number, size: number): void {
  console.log(`\n${size}대${size} 맞대결 — Lv.${level} · 쌍당 ${n}회 (같은 종 ${size}마리)`);

  const wins = new Map<string, { won: number; played: number }>();
  for (const s of SPECIES) wins.set(s.id, { won: 0, played: 0 });

  const team = (sp: PetSpecies, side: string) =>
    Array.from({ length: size }, (_, k) => ({
      ...medianCombatant(sp, level, `${side}${k}`),
      id: `${side}${k}`,
      row: (k >= 2 ? 'back' : 'front') as 'front' | 'back',
    }));

  for (let i = 0; i < SPECIES.length; i++) {
    for (let j = i + 1; j < SPECIES.length; j++) {
      const a = SPECIES[i]!;
      const b = SPECIES[j]!;
      for (let k = 0; k < n; k++) {
        const seed = 77000 + (i * 100 + j) * 50 + k;
        const rng = createRng(seed);
        const r = simulateBattle({
          allies: team(a, 'A'),
          enemies: team(b, 'B'),
          seed,
          commandSource: createStanceSource('aggressive', DEFAULT_CATALOG, createDefaultAI(DEFAULT_CATALOG, rng), 'ropeCrude'),
        });
        if (r.winner === 'draw') continue;
        wins.get(a.id)!.played++;
        wins.get(b.id)!.played++;
        if (r.winner === 'ally') wins.get(a.id)!.won++;
        else wins.get(b.id)!.won++;
      }
    }
  }

  const ranked = [...wins.entries()]
    .map(([id, w]) => ({ id, rate: w.played ? w.won / w.played : 0.5 }))
    .sort((x, y) => y.rate - x.rate);

  console.log('  등급별 평균 승률');
  for (const r of ['common', 'uncommon', 'rare', 'epic'] as const) {
    const g = ranked.filter((x) => byId(x.id).rarity === r);
    console.log(`    ${r.padEnd(9)} ${(mean(g.map((x) => x.rate)) * 100).toFixed(1)}%`);
  }
  console.log('  종별 승률');
  for (const r of ranked) {
    const sp = byId(r.id);
    console.log(`    ${sp.name.padEnd(9)} ${sp.rarity.padEnd(9)} ${(r.rate * 100).toFixed(1).padStart(5)}%`);
  }
}

/* ─────────────── 성장률 표본 ─────────────── */

function cmdGrowth(n: number): void {
  console.log(`\n성장률 추첨 ${n.toLocaleString()}회 — 종별 실제 분포`);
  const rng = createRng(20260804);
  const rows: { sp: PetSpecies; mean: number; best: number }[] = [];

  for (const sp of SPECIES) {
    let sum = 0;
    let best = 0;
    for (let i = 0; i < n; i++) {
      const pet = createPetInstance(sp, { uid: 'x', level: 1, seed: i, rng, loyalty: 50, capturedAt: 0 });
      const g = growthScore(pet.growth);
      sum += g;
      best = Math.max(best, g);
    }
    rows.push({ sp, mean: sum / n, best });
  }

  rows.sort((a, b) => b.best - a.best);
  console.log('    종            등급       평균    최고');
  for (const r of rows.slice(0, 8)) {
    console.log(`    ${r.sp.name.padEnd(11)} ${r.sp.rarity.padEnd(9)} ${r.mean.toFixed(3)}  ${r.best.toFixed(3)}`);
  }
  console.log(`    … 상위 8종만 표시 (전체 ${rows.length}종)`);
  console.log(`  전체 최고 ${Math.max(...rows.map((r) => r.best)).toFixed(3)} / 상한 5.1`);
}

/* ─────────────── 진입점 ─────────────── */

const [cmd, ...args] = process.argv.slice(2);
const OUT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

switch (cmd) {
  case 'match':
    cmdMatch(args[0] ?? 'emberfox', args[1] ?? 'dewtail', Number(args[2] ?? 300), Number(args[3] ?? 20));
    break;
  case 'curve':
    cmdCurve(args[0] ?? path.join(OUT_DIR, 'balance-curve.csv'));
    break;
  case 'matrix':
    cmdMatrix(Number(args[0] ?? 40), Number(args[1] ?? 30));
    break;
  case 'growth':
    cmdGrowth(Number(args[0] ?? 20000));
    break;
  case 'party':
    cmdParty(Number(args[0] ?? 12), Number(args[1] ?? 30), Number(args[2] ?? 3));
    break;
  default: {
    // 인자 없이 부르면 전부 — 데이터를 고친 뒤 한 번에 확인하는 용도다
    cmdGrowth(20000);
    cmdCurve(path.join(OUT_DIR, 'balance-curve.csv'));
    cmdMatrix(40, 30);
    cmdParty(12, 30, 3);
    cmdMatch('emberfox', 'dewtail', 300, 20);
    console.log('');
  }
}
