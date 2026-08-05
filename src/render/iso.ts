/**
 * 아이소메트릭 투영.
 *
 * 원작 「스톤에이지」는 2:1 마름모 격자다. 탑다운 정사각 격자로 그리면 화면이
 * 평평해 보이고, 무엇보다 키 큰 물체(나무·벽·거대 펫)를 놓을 곳이 없다. 정사각
 * 타일에서는 스프라이트가 자기 칸을 넘어가면 곧바로 뒤 타일을 덮어버리기 때문이다.
 * 마름모에서는 타일 높이가 폭의 절반이라 위쪽으로 여유가 생기고, 그 여유가 그대로
 * "높이"가 된다.
 *
 * **게임 로직은 이 파일을 모른다.** 이동·충돌·인카운터는 전부 월드 타일 좌표로
 * 돌아가고, 투영은 그리기 직전에만 일어난다. 그래야 투영을 또 바꿔도 밸런스와
 * 리플레이가 그대로 남는다.
 */

/**
 * 타일 하나의 화면 폭·높이. 2:1이 아이소메트릭의 표준 비율이다.
 *
 * 처음엔 64×32로 잡았는데 마을 하나가 통째로 화면에 들어와 버렸다. 맵 전체가
 * 보이면 걸어다닐 이유가 사라진다 — 모퉁이를 돌 때 새로 드러나는 게 있어야 한다.
 * 96×48은 800px 화면에 가로 스물 몇 칸이 들어오는 크기다.
 */
export const TILE_W = 96;
export const TILE_H = 48;

/**
 * 64×32 기준으로 그린 그림을 지금 타일 크기에 맞추는 배율.
 *
 * 스프라이트 치수를 전부 타일 크기로 나눠 쓰면 코드가 읽히지 않는다. 기준
 * 크기에서 그리고 마지막에 한 번 늘린다.
 */
export const ART_SCALE = TILE_W / 64;

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/**
 * 월드 타일 좌표 → 화면 좌표. 돌려주는 것은 타일 **중심**이다.
 *
 * 마름모의 네 꼭짓점은 중심에서 (±HW, 0), (0, ±HH)다. 중심을 기준으로 잡으면
 * 스프라이트를 놓을 때 "발밑"이 center + (0, HH)로 일정하게 떨어진다.
 */
export function isoX(tx: number, ty: number): number {
  return (tx - ty) * HW;
}

export function isoY(tx: number, ty: number): number {
  return (tx + ty) * HH;
}

/** 화면 좌표 → 월드 타일 좌표(실수). isoX/isoY의 역변환이다. */
export function unproject(sx: number, sy: number): { x: number; y: number } {
  return { x: sx / TILE_W + sy / TILE_H, y: sy / TILE_H - sx / TILE_W };
}

/**
 * 그리는 순서를 정하는 값. 클수록 앞(나중에 그린다).
 *
 * 아이소메트릭에서 화면 아래쪽일수록 카메라에 가깝고, 화면 y는 (tx+ty)에만
 * 비례한다. 그래서 정렬 키가 x나 y 하나가 아니라 둘의 합이다. 탑다운에서 쓰던
 * "y로 정렬" 을 그대로 가져오면 나무 뒤로 걸어가도 안 가려진다.
 */
export function depth(tx: number, ty: number): number {
  return tx + ty;
}

/** 마름모 경로를 만든다. 채우기·클리핑 양쪽에서 쓴다. */
export function diamondPath(g: CanvasRenderingContext2D, cx: number, cy: number, w = TILE_W, h = TILE_H): void {
  const hw = w / 2;
  const hh = h / 2;
  g.beginPath();
  g.moveTo(cx, cy - hh);
  g.lineTo(cx + hw, cy);
  g.lineTo(cx, cy + hh);
  g.lineTo(cx - hw, cy);
  g.closePath();
}

/* ─────────────── 입력 ─────────────── */

const clamp1 = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * 화면 기준 입력 → 월드 이동 방향.
 *
 * 아이소메트릭에서 월드 축은 화면에서 45° 기울어 있다. 키 입력을 월드 축에
 * 그대로 꽂으면 위쪽 화살표가 화면 오른쪽 위로 간다 — 직접 걸어보면 즉시
 * 이상하다는 걸 안다. 그래서 화면 축을 월드 축으로 돌려서 넣는다.
 *
 * 마침 딱 맞아떨어진다: 화살표 넷이 화면의 상하좌우가 되고, 두 개를 같이 누르면
 * 월드 축 넷이 나온다. 여덟 방향이 빠짐없이 나오고 겹치지도 않는다.
 */
export function screenInputToWorld(sx: number, sy: number): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } {
  return { dx: clamp1(sx + sy), dy: clamp1(sy - sx) };
}

/** 화면에서 본 여덟 방향. 스프라이트가 어느 쪽을 보고 서 있는지에 쓴다. */
export type ScreenDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/**
 * 월드 facing → 화면 방향.
 *
 * 월드로 "위"(y-)는 화면에서 오른쪽 위다. 이 표는 그 45° 회전을 굳혀 놓은 것이고,
 * 스프라이트는 화면 방향만 알면 된다.
 */
const FACING_TO_SCREEN: Record<string, ScreenDir> = {
  up: 'ne',
  right: 'se',
  down: 'sw',
  left: 'nw',
  upLeft: 'n',
  upRight: 'e',
  downRight: 's',
  downLeft: 'w',
};

export function screenDir(facing: string): ScreenDir {
  return FACING_TO_SCREEN[facing] ?? 'sw';
}

/** 카메라를 마주보는 방향인가 — 얼굴을 그릴지 뒤통수를 그릴지 가른다. */
export function facesCamera(d: ScreenDir): boolean {
  return d === 's' || d === 'se' || d === 'sw';
}

/** 화면에서 왼쪽을 보는가. 옆모습을 좌우 반전할 때 쓴다. */
export function facesLeft(d: ScreenDir): boolean {
  return d === 'w' || d === 'nw' || d === 'sw';
}

/* ─────────────── 카메라 ─────────────── */

/** 화면 한가운데가 가리키는 **투영된** 좌표. 타일 좌표가 아니다. */
export interface Camera {
  x: number;
  y: number;
}

/**
 * 맵 전체를 투영했을 때의 경계 상자.
 *
 * 맵은 직사각형이지만 투영하면 마름모라 경계 상자 안에 빈 곳이 생긴다. 그 빈
 * 곳은 가려서 없애는 게 아니라 배경으로 보여준다 — 아이소메트릭 화면에서 지형
 * 바깥이 보이는 건 정상이고, 억지로 가두면 카메라가 맵 끝에서 튄다.
 */
export function mapBounds(width: number, height: number) {
  return {
    minX: isoX(0, height - 1) - HW,
    maxX: isoX(width - 1, 0) + HW,
    minY: isoY(0, 0) - HH,
    maxY: isoY(width - 1, height - 1) + HH,
  };
}

/** 대상을 화면 중앙에 두되 맵 밖으로 너무 나가지 않게 가둔다. */
export function focusCamera(
  mapW: number,
  mapH: number,
  tx: number,
  ty: number,
  viewW: number,
  viewH: number,
): Camera {
  const b = mapBounds(mapW, mapH);
  const fit = (v: number, lo: number, hi: number, view: number) => {
    // 맵이 화면보다 좁으면 가운데 정렬한다. 안 그러면 하한이 상한보다 커진다.
    if (hi - lo <= view) return (lo + hi) / 2;
    return Math.min(Math.max(v, lo + view / 2), hi - view / 2);
  };
  return {
    x: fit(isoX(tx, ty), b.minX, b.maxX, viewW),
    y: fit(isoY(tx, ty), b.minY, b.maxY, viewH),
  };
}

/**
 * 화면에 걸리는 타일 범위.
 *
 * 화면 네 귀퉁이를 역투영하면 타일 공간에서는 기울어진 사각형이 된다. 그걸 감싸는
 * 경계 상자를 쓴다 — 실제보다 두 배쯤 넓게 잡히지만, 정확한 다각형 순회를 짜서
 * 얻는 이득보다 그 코드를 틀리게 짤 위험이 크다.
 *
 * `pad`는 화면 밖에 중심이 있어도 스프라이트 윗부분이 걸쳐 들어오는 키 큰
 * 물체를 위한 여유다.
 */
export function visibleTiles(
  cam: Camera,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
  pad = 3,
) {
  const l = cam.x - viewW / 2;
  const r = cam.x + viewW / 2;
  const t = cam.y - viewH / 2;
  const b = cam.y + viewH / 2;

  const corners = [unproject(l, t), unproject(r, t), unproject(l, b), unproject(r, b)];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);

  return {
    x0: Math.max(0, Math.floor(Math.min(...xs)) - pad),
    x1: Math.min(mapW - 1, Math.ceil(Math.max(...xs)) + pad),
    y0: Math.max(0, Math.floor(Math.min(...ys)) - pad),
    y1: Math.min(mapH - 1, Math.ceil(Math.max(...ys)) + pad),
  };
}
