/**
 * 데이터 검증 CLI.
 *
 * `pnpm validate:data` 로 돌리고, build 스크립트가 tsc보다 먼저 이걸 부른다.
 * 스키마 위반이나 성장률 상한 초과가 있으면 여기서 빌드가 멈춘다 — 잘못된
 * 밸런스 데이터가 배포까지 흘러가지 않게 하는 게 목적이다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateData } from '../src/data/schema';
import { GROWTH_SCORE_CAP, growthScore } from '../src/engine/types';

const DATA_DIR = path.resolve(fileURLToPath(new URL('../src/data', import.meta.url)));

function readJson(name: string): unknown {
  const file = path.join(DATA_DIR, `${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ ${name}.json 을 읽지 못했다: ${(e as Error).message}`);
    process.exit(1);
  }
}

const result = validateData({
  pets: readJson('pets'),
  skills: readJson('skills'),
  spirits: readJson('spirits'),
  items: readJson('items'),
  formula: readJson('formula'),
  growth: readJson('growth'),
});

if (result.errors.length > 0) {
  console.error(`\n데이터 검증 실패 — ${result.errors.length}건\n`);
  for (const e of result.errors) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}

// 통과했으면 상한까지 얼마나 남았는지 보여준다. 밸런스를 만질 때 이 여유가
// 줄어드는 걸 눈으로 확인할 수 있어야 한다.
const top = result.pets.reduce(
  (acc, p) => {
    const s = growthScore(p.growthRange.max);
    return s > acc.score ? { score: s, id: p.id } : acc;
  },
  { score: 0, id: '' },
);

console.log('\n데이터 검증 통과');
console.log(`  펫 ${result.pets.length}종 · 스킬 ${result.skills.length} · 정령 ${result.spirits.length} · 아이템 ${result.items.length}`);
console.log(
  `  최고 성장률 지표 ${top.score.toFixed(3)} (${top.id}) / 상한 ${GROWTH_SCORE_CAP} — 여유 ${(GROWTH_SCORE_CAP - top.score).toFixed(3)}\n`,
);
