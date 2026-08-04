import { useEffect, useRef, useState } from 'react';
import { drawField } from '../render/fieldRenderer';
import { buildTileset, type Tileset } from '../render/tileset';
import { getMap, warpAt, zoneAt } from '../game/maps';
import type { MoveInput } from '../game/movement';
import { dangerLevel } from '../game/encounter';
import { NPCS } from '../game/dialogue';
import { questsFor } from '../game/quests';
import { useGame } from '../game/store';

/**
 * 필드 화면.
 *
 * 렌더 루프는 여기 하나뿐이다. 매 프레임 스토어의 tickField를 부르고, 그 결과를
 * 캔버스에 그린다. 그리는 쪽은 상태를 만지지 않는다 — 스토어만 상태를 바꾼다.
 */

const VIEW_W = 800;
const VIEW_H = 512;

/** 키 → 방향. 방향키와 WASD를 모두 받는다. */
const KEY_AXIS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
};

export function FieldScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tilesetRef = useRef<Tileset | null>(null);
  const keysRef = useRef(new Set<string>());
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (KEY_AXIS[e.code]) {
        e.preventDefault();
        keysRef.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    // 창을 벗어나면 키가 눌린 채로 남아 캐릭터가 계속 걷는다
    const blur = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    tilesetRef.current ??= buildTileset(32);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // 탭이 백그라운드에 다녀오면 dt가 몇 초씩 튄다. 잘라내지 않으면 한 프레임에
      // 여러 칸을 지나가면서 인카운터 판정이 통째로 건너뛰어진다.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const input: MoveInput = { dx: 0, dy: 0 };
      for (const code of keysRef.current) {
        const axis = KEY_AXIS[code];
        if (!axis) continue;
        if (axis[0] !== 0) input.dx = axis[0] as -1 | 1;
        if (axis[1] !== 0) input.dy = axis[1] as -1 | 1;
      }

      useGame.getState().tickField(dt, input);

      const s = useGame.getState();
      const map = getMap(s.player.mapId);
      const inZone = zoneAt(map, s.player.tile.x, s.player.tile.y) !== undefined;

      // 표식은 매 프레임 다시 만든다. 퀘스트 상태가 바뀌면 즉시 반영돼야 하고,
      // NPC는 몇 명뿐이라 비용이 없다.
      const npcs = NPCS.filter((n) => n.mapId === map.id).map((n) => {
        const rows = questsFor(s.questLog, n.id);
        const mark = rows.some((q) => q.state === 'ready')
          ? ('ready' as const)
          : rows.some((q) => q.state === 'available')
            ? ('available' as const)
            : null;
        return { x: n.x, y: n.y, name: n.name, mark };
      });

      drawField(g, map, s.player, tilesetRef.current!, {
        danger: s.danger.gauge,
        dangerVisible: inZone && s.danger.grace === 0,
        npcs,
      });

      const w = warpAt(map, s.player.tile.x, s.player.tile.y);
      setHint(w ? w.label : null);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const player = useGame((s) => s.player);
  const danger = useGame((s) => s.danger);
  const messages = useGame((s) => s.messages);
  const map = getMap(player.mapId);
  const zone = zoneAt(map, player.tile.x, player.tile.y);
  const level = dangerLevel(danger, zone !== undefined);

  const LEVEL_TEXT = {
    safe: '안전',
    calm: '조용하다',
    uneasy: '기척이 있다',
    imminent: '바로 앞이다',
  } as const;

  return (
    <>
      <div className="stage">
        <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H} />
        {hint && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(10,10,18,0.85)', border: '1px solid #38384d', borderRadius: 6, padding: '5px 10px', fontSize: 12, lineHeight: 1.4 }}>
            {hint} — 그대로 걸어 들어가면 이동한다
          </div>
        )}
      </div>

      <div className="panel">
        <div className="row spread">
          <div className="row" style={{ flex: 1 }}>
            <strong style={{ fontSize: 13 }}>{map.name}</strong>
            <span className="muted small">{zone ? zone.name : '길 위'}</span>
            <div className={`gauge ${level}`} title="위험도">
              <i style={{ width: `${Math.round(danger.gauge * 100)}%` }} />
            </div>
            <span className="small" style={{ minWidth: 78, textAlign: 'right' }}>
              {LEVEL_TEXT[level]}
            </span>
          </div>
          <span className="tiny muted">
            <kbd>WASD</kbd> / <kbd>←↑↓→</kbd> 이동 · 대각선 가능 · 걸음 {player.steps}
          </span>
        </div>

        <div className="log" style={{ height: 76, marginTop: 10 }}>
          {messages.map((m, i) => (
            <p key={i} className={i === messages.length - 1 ? '' : 'info'}>
              {m}
            </p>
          ))}
        </div>
      </div>
    </>
  );
}
