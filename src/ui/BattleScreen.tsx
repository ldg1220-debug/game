import { useEffect, useMemo, useRef, useState } from 'react';
import { drawBattle } from '../render/battleRenderer';
import { isVisible, replayBattle } from '../game/replay';
import { getMap } from '../game/maps';
import { STANCE_LABEL } from '../game/stances';
import { useGame } from '../game/store';

/**
 * 전투 화면.
 *
 * 전투는 이미 끝나 있다 — 스토어가 엔진을 한 번 부르고 로그를 받아왔다.
 * 이 화면이 하는 일은 그 로그를 시간에 맞춰 펼치는 것뿐이다. 되감기가 되는
 * 이유도 그래서다: 상태는 언제나 로그에서 다시 접어 만들 수 있다.
 */

const VIEW_W = 800;
const VIEW_H = 512;
const SPEEDS = [1, 2, 4] as const;
const BASE_MS = 320;

export function BattleScreen() {
  const resolved = useGame((s) => s.resolved);
  const finishBattle = useGame((s) => s.finishBattle);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);

  // 화면에 변화를 주는 이벤트만 골라 그 위를 걷는다. 커맨드·행동순서 같은
  // 이벤트에서 멈추면 아무 일도 없는 정지 화면이 된다.
  const stops = useMemo(() => {
    if (!resolved) return [] as number[];
    const out: number[] = [];
    resolved.result.log.forEach((e, i) => {
      if (isVisible(e)) out.push(i + 1);
    });
    return out;
  }, [resolved]);

  const nameOf = useMemo(() => {
    if (!resolved) return (id: string) => id;
    const map = new Map<string, string>();
    for (const c of [...resolved.allies, ...resolved.enemies]) map.set(c.id, c.name);
    return (id: string) => map.get(id) ?? id;
  }, [resolved]);

  const state = useMemo(() => {
    if (!resolved) return null;
    return replayBattle(resolved.allies, resolved.enemies, resolved.result.log, stops[cursor] ?? 0, nameOf);
  }, [resolved, stops, cursor, nameOf]);

  const done = cursor >= stops.length - 1;

  // 재생
  useEffect(() => {
    if (paused || done || stops.length === 0) return;
    const id = setTimeout(() => setCursor((c) => Math.min(c + 1, stops.length - 1)), BASE_MS / speed);
    return () => clearTimeout(id);
  }, [cursor, paused, done, speed, stops.length]);

  // 그리기.
  //
  // 이펙트는 "이 시점이 화면에 뜬 지 얼마나 됐는가"로 진행한다. 재생 시점이
  // 바뀔 때마다 시계를 0으로 되돌린다 — 그러지 않으면 되감기했을 때 이미 다 끝난
  // 이펙트가 나오고, 배속을 올리면 앞 타격의 잔상이 다음 타격에 겹친다.
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!g || !state) return;
    const since = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      drawBattle(g, state.units, {
        indoor: getMap(useGame.getState().player.mapId).indoor,
        age: now - since,
        impact: state.impact,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cursor]);

  if (!resolved || !state) return null;

  const r = resolved.result;
  const outcome = r.winner === 'ally' ? '승리' : r.winner === 'enemy' ? '패배' : '무승부';

  return (
    <>
      <div className="stage">
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />
        {done && (
          <div className="overlay">
            <div className="card">
              <h2>{outcome}</h2>
              <p className="small muted" style={{ margin: '2px 0 10px' }}>
                {resolved.zone.name} · {STANCE_LABEL[resolved.stance]} 태세 · {r.rounds}라운드
              </p>
              {r.winner === 'ally' && <p className="small">경험치 {resolved.rewards.exp}</p>}
              {resolved.rewards.levelUps > 0 && (
                <p className="small" style={{ color: 'var(--gold)' }}>
                  레벨 업 {resolved.rewards.levelUps}회
                </p>
              )}
              {resolved.rewards.captured && (
                <p className="small" style={{ color: 'var(--gold)' }}>
                  새 동료 — 성장률 지표{' '}
                  {(
                    resolved.rewards.captured.growth.hp / 5 +
                    resolved.rewards.captured.growth.atk +
                    resolved.rewards.captured.growth.def +
                    resolved.rewards.captured.growth.spd
                  ).toFixed(2)}
                  {' · 충성도 '}
                  {resolved.rewards.captured.loyalty}
                </p>
              )}
              {r.endedBy === 'flee' && <p className="small muted">빠져나왔다.</p>}
              <div style={{ marginTop: 14 }}>
                <button onClick={finishBattle}>필드로 돌아가기</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="row spread" style={{ marginBottom: 8 }}>
          <span className="small">
            <strong>{state.round}라운드</strong>
            <span className="muted"> · {cursor + 1} / {stops.length}</span>
          </span>
          <div className="row">
            <button className="small" onClick={() => setCursor(0)} disabled={cursor === 0}>
              처음부터
            </button>
            <button className="small" onClick={() => setPaused((p) => !p)} disabled={done}>
              {paused ? '재생' : '일시정지'}
            </button>
            <button
              className="small"
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
            >
              x{speed}
            </button>
            <button className="small" onClick={() => setCursor(stops.length - 1)} disabled={done}>
              건너뛰기
            </button>
          </div>
        </div>

        <div className="log" ref={logRef}>
          {state.lines.map((l, i) => (
            <p key={i} className={l.tone}>
              {l.text}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}
