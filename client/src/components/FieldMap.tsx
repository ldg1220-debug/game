import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateMap,
  isWalkable,
  TILES,
  TILE_SIZE,
  type MapObject,
  type TileKind,
} from '../lib/mapData';
import { audio } from '../lib/audio';

/** 타일당 이동 시간 (가이드 1.3절) */
const MOVE_MS = 200;
/** 수풀 한 칸당 조우 확률 */
const ENCOUNTER_CHANCE = 0.12;

type Dir = 'up' | 'down' | 'left' | 'right';

const DIR_DELTA: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

export interface FieldMapProps {
  regionId: string;
  start: { x: number; y: number };
  openedTreasures: string[];
  onMove: (pos: { x: number; y: number }) => void;
  onEncounter: () => void;
  onInteract: (obj: MapObject) => void;
  /** 조우·상호작용 중에는 입력을 막는다 */
  paused?: boolean;
}

/**
 * 타일 기반 필드 (완성도 가이드 1절).
 *
 * 캔버스로 그린다. 지형은 지역 시드에서 결정적으로 생성하므로 타일맵 에셋이 없고,
 * 화면에 보이는 타일만 그려서 큰 맵에서도 그리는 양이 일정하다(가이드 1.5의
 * 청크 로딩과 같은 목적). 카메라는 플레이어를 따라가되 맵 밖을 비추지 않도록 고정한다.
 */
export function FieldMap({
  regionId,
  start,
  openedTreasures,
  onMove,
  onEncounter,
  onInteract,
  paused,
}: FieldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 480, h: 360 });

  const { tiles, objects, map } = useMemo(() => generateMap(regionId), [regionId]);

  // 이동은 렌더 루프에서 보간하므로 ref로 관리한다 (setState 남발 방지)
  const posRef = useRef({ x: start.x, y: start.y });
  const moveRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; t: number } | null>(null);
  const facingRef = useRef<Dir>('down');
  const heldRef = useRef<Dir | null>(null);
  const pausedRef = useRef(!!paused);
  const openedRef = useRef(new Set(openedTreasures));
  const stepCountRef = useRef(0);

  useEffect(() => {
    pausedRef.current = !!paused;
  }, [paused]);
  useEffect(() => {
    openedRef.current = new Set(openedTreasures);
  }, [openedTreasures]);

  // 콜백을 ref로 고정한다. 인라인 함수를 렌더 루프 의존성에 두면 매 이동마다
  // 루프가 재생성된다.
  const cbRef = useRef({ onMove, onEncounter });
  cbRef.current = { onMove, onEncounter };

  /**
   * 위치 초기화는 '지역이 바뀔 때'만 해야 한다. start는 우리가 onMove로 올려보낸
   * 좌표가 되돌아온 값이기도 해서, start를 의존성에 두면 이동이 끝날 때마다 이
   * 효과가 다시 돌아 진행 중이던 다음 이동을 취소해 버린다(한 칸씩만 움직이던 원인).
   */
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    posRef.current = { x: startRef.current.x, y: startRef.current.y };
    moveRef.current = null;
  }, [regionId]);

  const objectAt = useCallback(
    (x: number, y: number) => objects.find((o) => o.x === x && o.y === y),
    [objects],
  );

  const tryMove = useCallback(
    (dir: Dir) => {
      if (pausedRef.current || moveRef.current) return;
      facingRef.current = dir;
      const d = DIR_DELTA[dir];
      const nx = posRef.current.x + d.x;
      const ny = posRef.current.y + d.y;
      if (!isWalkable(tiles, nx, ny)) return;

      // 상호작용 대상이 있는 칸은 진입 대신 상호작용
      const obj = objectAt(nx, ny);
      if (obj && !(obj.kind === 'treasure' && openedRef.current.has(obj.id))) {
        onInteract(obj);
        return;
      }

      moveRef.current = { from: { ...posRef.current }, to: { x: nx, y: ny }, t: 0 };
    },
    [tiles, objectAt, onInteract],
  );

  // 키보드 입력
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      heldRef.current = dir;
      tryMove(dir);
    };
    const up = (e: KeyboardEvent) => {
      if (KEY_DIR[e.key] && heldRef.current === KEY_DIR[e.key]) heldRef.current = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [tryMove]);

  // 뷰포트 크기 (가이드 1.3: 모바일 480×360, 태블릿 1024×768)
  useEffect(() => {
    const resize = () => {
      const el = wrapRef.current;
      if (!el) return;
      const w = Math.min(el.clientWidth, map.cols * TILE_SIZE);
      const h = Math.min(Math.round(w * 0.75), map.rows * TILE_SIZE, 420);
      setViewport({ w, h });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [map.cols, map.rows]);

  // 렌더 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = viewport.w * dpr;
    canvas.height = viewport.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let last = performance.now();

    const finishStep = () => {
      const to = moveRef.current!.to;
      posRef.current = to;
      moveRef.current = null;
      cbRef.current.onMove(to);
      stepCountRef.current++;
      if (stepCountRef.current % 2 === 0) audio.step();

      // 수풀에서 조우 판정
      const tile = tiles[to.y]?.[to.x];
      if (tile && TILES[tile].encounter && Math.random() < ENCOUNTER_CHANCE) {
        audio.encounter();
        cbRef.current.onEncounter();
      }
    };

    const drawTile = (kind: TileKind, px: number, py: number, tx: number, ty: number) => {
      const info = TILES[kind];
      ctx.fillStyle = info.color;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      if (!info.detail) return;
      ctx.fillStyle = info.detail;

      // 타일 종류별 간단한 디테일. 좌표 기반이라 매 프레임 같은 모양이 나온다.
      const odd = (tx + ty) % 2 === 0;
      switch (kind) {
        case 'grass':
        case 'path':
        case 'sand':
          if (odd) ctx.fillRect(px + 6, py + 8, 3, 3);
          ctx.fillRect(px + 20, py + 21, 3, 3);
          break;
        case 'tall-grass':
          for (let i = 0; i < 4; i++) {
            const gx = px + 4 + i * 7;
            ctx.fillRect(gx, py + 16 + ((i + tx) % 3) * 2, 2, 12);
          }
          break;
        case 'tree':
          ctx.beginPath();
          ctx.arc(px + 16, py + 13, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4a3626';
          ctx.fillRect(px + 13, py + 20, 6, 11);
          break;
        case 'rock':
          ctx.beginPath();
          ctx.moveTo(px + 5, py + 27);
          ctx.lineTo(px + 12, py + 7);
          ctx.lineTo(px + 22, py + 9);
          ctx.lineTo(px + 28, py + 27);
          ctx.closePath();
          ctx.fill();
          break;
        case 'water':
          ctx.globalAlpha = 0.55;
          ctx.fillRect(px + 3, py + 10 + (odd ? 3 : 0), 12, 2);
          ctx.fillRect(px + 17, py + 20 - (odd ? 3 : 0), 11, 2);
          ctx.globalAlpha = 1;
          break;
        case 'ice':
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(px + 8, py + 8);
          ctx.lineTo(px + 24, py + 24);
          ctx.moveTo(px + 24, py + 8);
          ctx.lineTo(px + 8, py + 24);
          ctx.strokeStyle = info.detail;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'lava':
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(px + 16, py + 16, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
      }
    };

    const drawObject = (o: MapObject, px: number, py: number) => {
      if (o.kind === 'treasure') {
        const opened = openedRef.current.has(o.id);
        ctx.fillStyle = opened ? '#5a4a34' : '#b5892f';
        ctx.fillRect(px + 6, py + 12, 20, 15);
        ctx.fillStyle = opened ? '#3d3222' : '#e0b64a';
        ctx.fillRect(px + 6, py + 8, 20, 6);
        if (!opened) {
          ctx.fillStyle = '#f0dc9a';
          ctx.fillRect(px + 14, py + 15, 4, 5);
        }
      } else if (o.kind === 'npc') {
        ctx.fillStyle = '#5b7fb5';
        ctx.fillRect(px + 10, py + 15, 12, 14);
        ctx.fillStyle = '#e0b48c';
        ctx.beginPath();
        ctx.arc(px + 16, py + 11, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a3a2c';
        ctx.fillRect(px + 10, py + 5, 12, 4);
      } else if (o.kind === 'dungeon') {
        ctx.fillStyle = '#241d33';
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 30);
        ctx.lineTo(px + 4, py + 16);
        ctx.arc(px + 16, py + 16, 12, Math.PI, 0);
        ctx.lineTo(px + 28, py + 30);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#6b6b78';
        ctx.fillRect(px + 2, py + 28, 28, 3);
      } else if (o.kind === 'town') {
        ctx.fillStyle = '#8a6a44';
        ctx.fillRect(px + 5, py + 15, 22, 15);
        ctx.fillStyle = '#c0553f';
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 15);
        ctx.lineTo(px + 16, py + 4);
        ctx.lineTo(px + 30, py + 15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f0dc9a';
        ctx.fillRect(px + 13, py + 21, 6, 9);
      }
    };

    const drawPlayer = (px: number, py: number, walking: boolean, t: number) => {
      const bob = walking ? Math.sin(t * Math.PI * 2) * 1.5 : 0;
      const dir = facingRef.current;
      ctx.save();
      ctx.translate(px + 16, py + 16 + bob);
      if (dir === 'left') ctx.scale(-1, 1);

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 13, 9, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5b7fb5';
      ctx.fillRect(-6, -1, 12, 14);
      ctx.fillStyle = '#e0b48c';
      ctx.beginPath();
      ctx.arc(0, -7, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a3a2c';
      ctx.beginPath();
      ctx.arc(0, -9, 7, Math.PI, 0);
      ctx.fill();

      // 뒤를 보고 있으면 얼굴을 그리지 않는다
      if (dir !== 'up') {
        ctx.fillStyle = '#1a1526';
        const eyeOffset = dir === 'down' ? 2.6 : 3.2;
        ctx.fillRect(-eyeOffset - 1, -8, 2, 2);
        ctx.fillRect(eyeOffset - 1, -8, 2, 2);
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;

      // 이동 보간
      if (moveRef.current) {
        moveRef.current.t += dt / MOVE_MS;
        if (moveRef.current.t >= 1) finishStep();
      } else if (heldRef.current && !pausedRef.current) {
        tryMove(heldRef.current);
      }

      const mv = moveRef.current;
      const fx = mv ? mv.from.x + (mv.to.x - mv.from.x) * mv.t : posRef.current.x;
      const fy = mv ? mv.from.y + (mv.to.y - mv.from.y) * mv.t : posRef.current.y;

      // 카메라: 플레이어 중앙, 맵 경계에서 고정
      const worldW = map.cols * TILE_SIZE;
      const worldH = map.rows * TILE_SIZE;
      const camX = Math.max(0, Math.min(worldW - viewport.w, fx * TILE_SIZE + TILE_SIZE / 2 - viewport.w / 2));
      const camY = Math.max(0, Math.min(worldH - viewport.h, fy * TILE_SIZE + TILE_SIZE / 2 - viewport.h / 2));

      ctx.clearRect(0, 0, viewport.w, viewport.h);

      // 보이는 타일만 그린다
      const x0 = Math.max(0, Math.floor(camX / TILE_SIZE));
      const y0 = Math.max(0, Math.floor(camY / TILE_SIZE));
      const x1 = Math.min(map.cols - 1, Math.ceil((camX + viewport.w) / TILE_SIZE));
      const y1 = Math.min(map.rows - 1, Math.ceil((camY + viewport.h) / TILE_SIZE));

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          drawTile(tiles[y][x], Math.round(x * TILE_SIZE - camX), Math.round(y * TILE_SIZE - camY), x, y);
        }
      }

      for (const o of objects) {
        if (o.x < x0 - 1 || o.x > x1 + 1 || o.y < y0 - 1 || o.y > y1 + 1) continue;
        drawObject(o, Math.round(o.x * TILE_SIZE - camX), Math.round(o.y * TILE_SIZE - camY));
      }

      drawPlayer(fx * TILE_SIZE - camX, fy * TILE_SIZE - camY, !!mv, mv ? mv.t : 0);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [tiles, objects, map, viewport, tryMove]);

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        style={{ width: viewport.w, height: viewport.h }}
        className="rounded-lg border border-gold-500/20 bg-ink-950 mx-auto block touch-none"
        aria-label="필드 맵. 방향키 또는 아래 방향 버튼으로 이동합니다."
        role="application"
      />

      {/* 터치용 D패드 (가이드 7.2: 최소 44×44px) */}
      <div className="mt-3 flex justify-center select-none">
        <div className="grid grid-cols-3 gap-1.5 w-[152px]">
          <span />
          <DirButton dir="up" label="위로" onPress={tryMove} />
          <span />
          <DirButton dir="left" label="왼쪽으로" onPress={tryMove} />
          <span className="flex items-center justify-center text-[10px] text-slate-600">이동</span>
          <DirButton dir="right" label="오른쪽으로" onPress={tryMove} />
          <span />
          <DirButton dir="down" label="아래로" onPress={tryMove} />
          <span />
        </div>
      </div>
    </div>
  );
}

const ARROW: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

function DirButton({ dir, label, onPress }: { dir: Dir; label: string; onPress: (d: Dir) => void }) {
  // 누르고 있으면 연속 이동
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  const start = () => {
    onPress(dir);
    stop();
    timer.current = window.setInterval(() => onPress(dir), MOVE_MS);
  };
  useEffect(() => stop, []);

  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="w-11 h-11 rounded-lg panel text-sm text-slate-300 active:scale-95 active:border-gold-400/60 transition"
    >
      {ARROW[dir]}
    </button>
  );
}
