/**
 * 판정 서비스.
 *
 * 규칙의 권위자다. 클라이언트가 쓰는 전투 엔진과 검증 코드를 **그대로 import**
 * 해서 돌린다.
 *
 * ## 왜 파이썬이 아닌가
 *
 * 헌장이 정한 백엔드는 FastAPI이고 그건 지킨다. 다만 전투 규칙까지 파이썬으로
 * 옮겨 적으면 같은 규칙의 구현이 둘이 된다. 둘은 반드시 어긋나고, 어긋난 날
 * 어느 쪽이 맞는지 판정할 방법이 없다. 밸런스 수치 하나 고칠 때마다 두 곳을
 * 고쳐야 하고, 한 곳을 빠뜨리면 "서버에서는 이겼는데 화면에서는 졌다"가 된다.
 *
 * 그래서 역할을 나눈다.
 *
 *   FastAPI   상태 — 계정·세이브·대전 기록·거래·길드·연결
 *   판정 서비스  규칙 — 세이브가 정당한가, 이 seed로 누가 이기는가
 *
 * FastAPI는 seed를 정하고 이 서비스를 부른 뒤 결과를 보관한다. 판정 서비스는
 * 상태를 갖지 않는다 — 순수 함수 한 겹을 HTTP로 감싼 것뿐이라, 몇 개를 띄우든
 * 같은 입력에 같은 답이 나온다.
 *
 * ## 왜 seed를 여기서 뽑지 않는가
 *
 * 뽑으면 재현이 불가능해진다. 분쟁이 생겼을 때 "그 seed로 다시 돌려보자"가
 * 안 되면 로그를 보관하는 의미의 절반이 사라진다.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolveDuel, type DuelSide } from './duel';
import { verifySave } from '../src/game/verify';
import type { SaveFile } from '../src/game/save';

const PORT = Number(process.env['ARBITER_PORT'] ?? 8787);
/** 요청 본문 상한. 세이브 둘이 들어와도 수백 KB를 넘지 않는다. */
const MAX_BODY = 4_000_000;

class BadRequest extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new BadRequest('요청이 너무 크다');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) throw new BadRequest('본문이 비어 있다');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BadRequest('JSON으로 읽히지 않는다');
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

function requireObject(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new BadRequest(`${name}이(가) 객체가 아니다`);
  return v as Record<string, unknown>;
}

function readSide(raw: unknown, name: string): DuelSide {
  const o = requireObject(raw, name);
  const playerId = o['playerId'];
  const stance = o['stance'];
  if (typeof playerId !== 'string' || playerId.length === 0) throw new BadRequest(`${name}.playerId가 없다`);
  if (typeof stance !== 'string') throw new BadRequest(`${name}.stance가 없다`);
  return { playerId, save: requireObject(o['save'], `${name}.save`) as unknown as SaveFile, stance };
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';

  if (req.method === 'GET' && url === '/health') {
    send(res, 200, { status: 'ok', service: 'arbiter' });
    return;
  }

  if (req.method === 'POST' && url === '/verify') {
    const body = requireObject(await readJson(req), 'body');
    const result = verifySave(requireObject(body['save'], 'save') as unknown as SaveFile);
    if (!result.ok) {
      send(res, 200, { ok: false, issues: result.issues });
      return;
    }
    send(res, 200, {
      ok: true,
      playerName: result.roster.playerName,
      level: result.roster.level,
      heroStats: result.roster.heroStats,
      roster: result.roster.combatants.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        level: c.level,
        stats: c.stats,
      })),
    });
    return;
  }

  if (req.method === 'POST' && url === '/duel') {
    const body = requireObject(await readJson(req), 'body');
    const seed = body['seed'];
    if (typeof seed !== 'number' || !Number.isFinite(seed)) throw new BadRequest('seed가 없다');
    const outcome = resolveDuel(readSide(body['a'], 'a'), readSide(body['b'], 'b'), seed >>> 0);
    // 검증 실패는 422다. 요청 형식은 멀쩡하고 내용이 규칙을 어긴 것이다.
    send(res, outcome.ok ? 200 : 422, outcome);
    return;
  }

  send(res, 404, { error: '없는 경로' });
}

export const server = createServer((req, res) => {
  route(req, res).catch((e: unknown) => {
    if (e instanceof BadRequest) {
      send(res, 400, { error: e.message });
      return;
    }
    // 판정이 예외로 죽으면 대전이 통째로 멈춘다. 이유를 남기고 500을 돌려준다.
    console.error('[arbiter] 판정 실패:', e);
    send(res, 500, { error: '판정 중 오류', detail: e instanceof Error ? e.message : String(e) });
  });
});

// 테스트에서 import 할 때는 뜨지 않게 한다
if (process.env['ARBITER_NO_LISTEN'] !== '1') {
  server.listen(PORT, () => {
    console.log(`판정 서비스 — http://127.0.0.1:${PORT}`);
  });
}
