import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMap, isWalkable, TILES, TILE_SIZE, type MapObject } from '../lib/mapData';
import { decorSprite, getProp, groundPattern, hash2, shiftColor, themeFor } from '../lib/mapRender';
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

    const theme = regionId;
    const groundImg = groundPattern(theme, 'ground');
    const pathImg = groundPattern(theme, 'path');
    const groundPat = ctx.createPattern(groundImg, 'repeat')!;
    const pathPat = ctx.createPattern(pathImg, 'repeat')!;

    /** 길 타일은 바닥 위에 부드러운 경계로 얹는다 (오토타일 대용) */
    const drawGroundLayer = (camX: number, camY: number, x0: number, y0: number, x1: number, y1: number) => {
      ctx.save();
      ctx.translate(-camX, -camY);
      ctx.fillStyle = groundPat;
      ctx.fillRect(x0 * TILE_SIZE, y0 * TILE_SIZE, (x1 - x0 + 1) * TILE_SIZE, (y1 - y0 + 1) * TILE_SIZE);

      // 길: 이웃이 길인지에 따라 모서리를 둥글려 이어붙인다
      ctx.fillStyle = pathPat;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (tiles[y][x] !== 'path' && tiles[y][x] !== 'sand') continue;
          const px = x * TILE_SIZE;
          const py = y * TILE_SIZE;
          const same = (ox: number, oy: number) => {
            const t = tiles[y + oy]?.[x + ox];
            return t === 'path' || t === 'sand';
          };
          const r = 11;
          ctx.beginPath();
          ctx.moveTo(px + (same(-1, 0) || same(0, -1) ? 0 : r), py);
          ctx.lineTo(px + TILE_SIZE - (same(1, 0) || same(0, -1) ? 0 : r), py);
          ctx.quadraticCurveTo(px + TILE_SIZE, py, px + TILE_SIZE, py + (same(1, 0) || same(0, -1) ? 0 : r));
          ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE - (same(1, 0) || same(0, 1) ? 0 : r));
          ctx.quadraticCurveTo(px + TILE_SIZE, py + TILE_SIZE, px + TILE_SIZE - (same(1, 0) || same(0, 1) ? 0 : r), py + TILE_SIZE);
          ctx.lineTo(px + (same(-1, 0) || same(0, 1) ? 0 : r), py + TILE_SIZE);
          ctx.quadraticCurveTo(px, py + TILE_SIZE, px, py + TILE_SIZE - (same(-1, 0) || same(0, 1) ? 0 : r));
          ctx.lineTo(px, py + (same(-1, 0) || same(0, -1) ? 0 : r));
          ctx.quadraticCurveTo(px, py, px + (same(-1, 0) || same(0, -1) ? 0 : r), py);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    };

    /**
     * 맵 오브젝트. 가이드 1.3의 스케일(마을 건물 96~128px, 던전 입구 64px)에 맞춰
     * 타일 하나보다 크게 그리고, 바닥 그림자로 접지시킨다.
     */
    const drawObject = (o: MapObject, px: number, py: number) => {
      const t = themeFor(theme);
      const cx = px + TILE_SIZE / 2;
      const baseY = py + TILE_SIZE;

      const shadow = (rx: number, ry: number) => {
        const g = ctx.createRadialGradient(cx, baseY - 2, 0, cx, baseY - 2, rx);
        g.addColorStop(0, 'rgba(0,0,0,0.38)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, baseY - 2, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      if (o.kind === 'treasure') {
        const opened = openedRef.current.has(o.id);
        shadow(15, 6);
        const body = ctx.createLinearGradient(cx - 13, 0, cx + 13, 0);
        body.addColorStop(0, opened ? '#4a3c28' : '#a8762a');
        body.addColorStop(0.4, opened ? '#5f4d33' : '#e0a83c');
        body.addColorStop(1, opened ? '#3a2f1e' : '#8a5f1e');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.roundRect(cx - 13, baseY - 20, 26, 18, 3);
        ctx.fill();
        // 뚜껑
        ctx.fillStyle = opened ? '#33291a' : '#c08a28';
        ctx.beginPath();
        if (opened) {
          ctx.roundRect(cx - 14, baseY - 32, 28, 10, 4);
        } else {
          ctx.roundRect(cx - 14, baseY - 26, 28, 9, 4);
        }
        ctx.fill();
        // 금속 띠와 자물쇠
        ctx.fillStyle = opened ? '#6b6152' : '#f4de9a';
        ctx.fillRect(cx - 2.5, baseY - 26, 5, 24);
        if (!opened) {
          ctx.beginPath();
          ctx.arc(cx, baseY - 15, 3.4, 0, Math.PI * 2);
          ctx.fill();
          // 반짝임
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.ellipse(cx - 6, baseY - 22, 4, 2, -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }

      if (o.kind === 'npc') {
        shadow(11, 4.5);
        ctx.fillStyle = '#3f5f8a';
        ctx.beginPath();
        ctx.roundRect(cx - 7, baseY - 22, 14, 20, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.roundRect(cx - 7, baseY - 22, 6, 20, 4);
        ctx.fill();
        const face = ctx.createRadialGradient(cx - 2, baseY - 30, 1, cx, baseY - 28, 8);
        face.addColorStop(0, '#f0c9a4');
        face.addColorStop(1, '#cf9f78');
        ctx.fillStyle = face;
        ctx.beginPath();
        ctx.arc(cx, baseY - 28, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a3524';
        ctx.beginPath();
        ctx.arc(cx, baseY - 30, 7, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#1a1526';
        ctx.fillRect(cx - 3.4, baseY - 29, 1.8, 1.8);
        ctx.fillRect(cx + 1.6, baseY - 29, 1.8, 1.8);
        // 대화 표시
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.roundRect(cx + 6, baseY - 44, 14, 10, 3);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + 10, baseY - 34);
        ctx.lineTo(cx + 13, baseY - 30);
        ctx.lineTo(cx + 14, baseY - 34);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3a3550';
        for (let i = 0; i < 3; i++) ctx.fillRect(cx + 8.5 + i * 3.4, baseY - 40, 2, 2);
        return;
      }

      if (o.kind === 'dungeon') {
        // 64px급 바위 아치
        shadow(26, 9);
        const rockG = ctx.createLinearGradient(cx - 26, baseY - 52, cx + 26, baseY);
        rockG.addColorStop(0, t.rock[1]);
        rockG.addColorStop(0.5, t.rock[0]);
        rockG.addColorStop(1, shiftColor(t.rock[0], -0.4));
        ctx.fillStyle = rockG;
        ctx.beginPath();
        ctx.moveTo(cx - 26, baseY);
        ctx.lineTo(cx - 22, baseY - 30);
        ctx.quadraticCurveTo(cx, baseY - 58, cx + 22, baseY - 30);
        ctx.lineTo(cx + 26, baseY);
        ctx.closePath();
        ctx.fill();
        // 입구 (안쪽으로 어두워짐)
        const hole = ctx.createRadialGradient(cx, baseY - 8, 2, cx, baseY - 10, 22);
        hole.addColorStop(0, '#000');
        hole.addColorStop(1, '#1a1024');
        ctx.fillStyle = hole;
        ctx.beginPath();
        ctx.moveTo(cx - 14, baseY);
        ctx.lineTo(cx - 13, baseY - 18);
        ctx.quadraticCurveTo(cx, baseY - 38, cx + 13, baseY - 18);
        ctx.lineTo(cx + 14, baseY);
        ctx.closePath();
        ctx.fill();
        // 횃불
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.ellipse(cx - 20, baseY - 26, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,210,120,0.35)';
        ctx.beginPath();
        ctx.arc(cx - 20, baseY - 26, 10, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // 마을: 96px급 건물
      shadow(34, 11);
      // 뒷집
      ctx.fillStyle = '#6f563a';
      ctx.beginPath();
      ctx.roundRect(cx + 8, baseY - 40, 26, 26, 2);
      ctx.fill();
      ctx.fillStyle = '#8a4436';
      ctx.beginPath();
      ctx.moveTo(cx + 4, baseY - 38);
      ctx.lineTo(cx + 21, baseY - 54);
      ctx.lineTo(cx + 38, baseY - 38);
      ctx.closePath();
      ctx.fill();
      // 본 건물
      const wall = ctx.createLinearGradient(cx - 30, 0, cx + 12, 0);
      wall.addColorStop(0, '#a98a5f');
      wall.addColorStop(0.55, '#8f7049');
      wall.addColorStop(1, '#6d5436');
      ctx.fillStyle = wall;
      ctx.beginPath();
      ctx.roundRect(cx - 30, baseY - 44, 42, 44, 2);
      ctx.fill();
      // 지붕
      const roof = ctx.createLinearGradient(cx - 36, baseY - 70, cx + 18, baseY - 42);
      roof.addColorStop(0, '#d0674a');
      roof.addColorStop(1, '#8e3f2c');
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(cx - 36, baseY - 42);
      ctx.lineTo(cx - 9, baseY - 70);
      ctx.lineTo(cx + 18, baseY - 42);
      ctx.closePath();
      ctx.fill();
      // 문과 창
      ctx.fillStyle = '#4a3421';
      ctx.beginPath();
      ctx.roundRect(cx - 16, baseY - 22, 14, 22, [6, 6, 0, 0]);
      ctx.fill();
      ctx.fillStyle = '#f5d98a';
      ctx.beginPath();
      ctx.roundRect(cx - 1, baseY - 34, 10, 10, 2);
      ctx.fill();
      ctx.strokeStyle = '#4a3421';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + 4, baseY - 34);
      ctx.lineTo(cx + 4, baseY - 24);
      ctx.moveTo(cx - 1, baseY - 29);
      ctx.lineTo(cx + 9, baseY - 29);
      ctx.stroke();
      // 간판
      ctx.fillStyle = '#e0b64a';
      ctx.beginPath();
      ctx.roundRect(cx - 40, baseY - 34, 10, 8, 2);
      ctx.fill();
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

      // 1) 연속 바닥
      drawGroundLayer(camX, camY, x0, y0, x1, y1);

      // 2) 물·용암은 바닥을 덮는 지형
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = tiles[y][x];
          if (k !== 'water' && k !== 'lava') continue;
          const img = getProp(k, theme, x, y);
          if (img) ctx.drawImage(img, Math.round(x * TILE_SIZE - camX), Math.round(y * TILE_SIZE - camY));
        }
      }

      // 2b) 평지 장식 — 빈 바닥을 메운다
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = tiles[y][x];
          if (k !== 'grass' && k !== 'path' && k !== 'sand' && k !== 'ice') continue;
          const roll = hash2(x, y, 77);
          if (roll > 0.42) continue;
          const img = decorSprite(theme, Math.floor(hash2(x, y, 88) * 9));
          const dx = (hash2(x, y, 303) - 0.5) * 16;
          const dy = (hash2(x, y, 404) - 0.5) * 16;
          ctx.drawImage(img, Math.round(x * TILE_SIZE - camX + dx), Math.round(y * TILE_SIZE - camY + dy));
        }
      }

      // 3) 프롭과 오브젝트를 y순으로 그려 앞뒤가 겹치게 한다
      type Drawable = { y: number; draw: () => void };
      const layer: Drawable[] = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = tiles[y][x];
          if (k !== 'tree' && k !== 'rock' && k !== 'tall-grass') continue;
          const img = getProp(k, theme, x, y);
          if (!img) continue;
          /*
           * 프롭을 칸 정중앙에 놓으면 32px 격자를 따라 줄이 보인다. 좌표 해시로
           * 칸 안팎으로 흔들어 배치해야 지형처럼 읽힌다.
           */
          const jx = (hash2(x, y, 101) - 0.5) * 18;
          const jy = (hash2(x, y, 202) - 0.5) * 12;
          const px = Math.round(x * TILE_SIZE - camX + jx);
          const py = Math.round(y * TILE_SIZE - camY + jy) - (img.height - TILE_SIZE);
          layer.push({ y: y * TILE_SIZE + jy, draw: () => ctx.drawImage(img, px, py) });
        }
      }
      for (const o of objects) {
        if (o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 2 || o.y > y1 + 2) continue;
        const px = Math.round(o.x * TILE_SIZE - camX);
        const py = Math.round(o.y * TILE_SIZE - camY);
        /*
         * 마을·던전은 타일 하나보다 훨씬 높게 그려서, 그 위쪽 칸에 서 있으면
         * 플레이어가 건물에 완전히 가려진다(스폰이 마을 바로 위라 실제로 캐릭터가
         * 사라졌다). 뒤에 서 있을 때는 반투명으로 낮춰 비쳐 보이게 한다.
         */
        const tall = o.kind === 'town' || o.kind === 'dungeon';
        const behind =
          tall && Math.abs(fx - o.x) <= 1.5 && fy < o.y && fy > o.y - (o.kind === 'town' ? 2.6 : 2);
        layer.push({
          y: o.y * TILE_SIZE + 1,
          draw: () => {
            if (behind) ctx.globalAlpha = 0.45;
            drawObject(o, px, py);
            ctx.globalAlpha = 1;
          },
        });
      }
      layer.push({
        y: fy * TILE_SIZE + 2,
        draw: () => drawPlayer(fx * TILE_SIZE - camX, fy * TILE_SIZE - camY, !!mv, mv ? mv.t : 0),
      });
      layer.sort((a, b) => a.y - b.y);
      for (const d of layer) d.draw();

      // 4) 분위기 오버레이와 비네트
      const [ambColor, ambAlpha] = themeFor(theme).ambient;
      ctx.globalAlpha = ambAlpha;
      ctx.fillStyle = ambColor;
      ctx.fillRect(0, 0, viewport.w, viewport.h);
      ctx.globalAlpha = 1;
      const vg = ctx.createRadialGradient(
        viewport.w / 2, viewport.h / 2, Math.min(viewport.w, viewport.h) * 0.35,
        viewport.w / 2, viewport.h / 2, Math.max(viewport.w, viewport.h) * 0.72,
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.20)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, viewport.w, viewport.h);

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
