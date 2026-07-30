import { ELEMENT_COLOR, type Element } from '../lib/gameTypes';

/**
 * 펫 형상 아트. 종(shapeId)이 실루엣을, 속성이 색을 결정한다.
 * 기획 문서의 "형상 × 속성" 조합 구조를 그대로 시각화하기 위해
 * 이미지 파일 대신 속성 색으로 착색되는 SVG로 그린다.
 */

const INK = '#1a1526';

interface Palette {
  base: string;
  dark: string;
  light: string;
  pale: string;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function paletteFor(element: Element): Palette {
  const base = ELEMENT_COLOR[element];
  return { base, dark: shade(base, -0.35), light: shade(base, 0.22), pale: shade(base, 0.55) };
}

/** 좌우 한 쌍의 눈. 대부분의 형상이 공유한다. */
function Eyes({ cx, cy, gap = 8, r = 2.2 }: { cx: number; cy: number; gap?: number; r?: number }) {
  return (
    <>
      <circle cx={cx - gap / 2} cy={cy} r={r} fill={INK} />
      <circle cx={cx + gap / 2} cy={cy} r={r} fill={INK} />
      <circle cx={cx - gap / 2 + r * 0.35} cy={cy - r * 0.35} r={r * 0.3} fill="#fff" opacity={0.9} />
      <circle cx={cx + gap / 2 + r * 0.35} cy={cy - r * 0.35} r={r * 0.3} fill="#fff" opacity={0.9} />
    </>
  );
}

type Art = (p: Palette) => React.ReactNode;

const ART: Record<number, Art> = {
  // 1. 솜털토끼 — 긴 귀와 둥근 몸
  1: (p) => (
    <>
      <ellipse cx="24" cy="16" rx="4.5" ry="13" fill={p.base} transform="rotate(-12 24 16)" />
      <ellipse cx="40" cy="16" rx="4.5" ry="13" fill={p.base} transform="rotate(12 40 16)" />
      <ellipse cx="24" cy="17" rx="2.2" ry="8.5" fill={p.pale} transform="rotate(-12 24 17)" />
      <ellipse cx="40" cy="17" rx="2.2" ry="8.5" fill={p.pale} transform="rotate(12 40 17)" />
      <circle cx="50" cy="46" r="5.5" fill={p.light} />
      <ellipse cx="32" cy="41" rx="17" ry="15" fill={p.base} />
      <ellipse cx="32" cy="46" rx="10" ry="8.5" fill={p.pale} opacity={0.75} />
      <Eyes cx={32} cy={38} gap={12} />
      <path d="M30 44h4l-2 2.4z" fill={INK} opacity={0.75} />
    </>
  ),

  // 2. 불꽃여우 — 뾰족한 귀와 불꽃 꼬리
  2: (p) => (
    <>
      <path d="M44 46q14-4 12-18 6 14-4 22z" fill={p.light} />
      <path d="M42 47q12-3 11-15 4 11-4 17z" fill={p.pale} opacity={0.8} />
      <ellipse cx="30" cy="43" rx="14" ry="11" fill={p.base} />
      <path d="M19 24l3 11 8-6z" fill={p.base} />
      <path d="M41 24l-3 11-8-6z" fill={p.base} />
      <path d="M21 27l1.6 6 4.2-3z" fill={p.pale} />
      <path d="M39 27l-1.6 6-4.2-3z" fill={p.pale} />
      <circle cx="30" cy="31" r="11.5" fill={p.base} />
      <path d="M30 31q-8 2-8 8 8 4 16 0 0-6-8-8z" fill={p.pale} opacity={0.85} />
      <Eyes cx={30} cy={30} gap={11} />
      <path d="M28.4 36h3.2l-1.6 2z" fill={INK} />
    </>
  ),

  // 3. 물방울슬라임 — 물방울 실루엣
  3: (p) => (
    <>
      <path d="M32 10c9 13 15 20 15 27a15 15 0 0 1-30 0c0-7 6-14 15-27z" fill={p.base} />
      <path d="M32 24c5 8 9 12 9 16a9 9 0 0 1-18 0c0-4 4-8 9-16z" fill={p.light} opacity={0.55} />
      <ellipse cx="25" cy="30" rx="3" ry="5" fill="#fff" opacity={0.5} transform="rotate(-20 25 30)" />
      <Eyes cx={32} cy={38} gap={11} />
      <path d="M28 45q4 3 8 0" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </>
  ),

  // 4. 이끼거북 — 육각 무늬 등껍질
  4: (p) => (
    <>
      <ellipse cx="14" cy="50" rx="5" ry="4" fill={p.dark} />
      <ellipse cx="50" cy="50" rx="5" ry="4" fill={p.dark} />
      <circle cx="15" cy="34" r="8.5" fill={p.light} />
      <Eyes cx={13} cy={33} gap={7} r={1.8} />
      <path d="M20 44a19 13 0 0 1 38 0z" fill={p.base} />
      <path d="M20 44a19 13 0 0 1 38 0" fill="none" stroke={p.dark} strokeWidth="2" />
      <path d="M33 32l5-3 5 3-2 6h-6z" fill={p.dark} opacity={0.55} />
      <path d="M24 40l4-2 4 2-1 4h-6z" fill={p.dark} opacity={0.45} />
      <path d="M44 40l4-2 4 2-1 4h-6z" fill={p.dark} opacity={0.45} />
    </>
  ),

  // 5. 바람참새 — 작은 새
  5: (p) => (
    <>
      <path d="M46 34l14-5-11 11z" fill={p.dark} />
      <ellipse cx="31" cy="38" rx="15" ry="12" fill={p.base} />
      <path d="M28 34q10-2 14 7-9 5-16-1z" fill={p.light} />
      <circle cx="22" cy="27" r="9" fill={p.base} />
      <path d="M13 27l-7 2 7 3z" fill={p.pale} />
      <Eyes cx={22} cy={26} gap={8} r={1.9} />
      <ellipse cx="31" cy="46" rx="8" ry="4" fill={p.pale} opacity={0.7} />
    </>
  ),

  // 6. 반딧불이 — 빛나는 배마디
  6: (p) => (
    <>
      <ellipse cx="20" cy="26" rx="11" ry="6" fill={p.pale} opacity={0.4} transform="rotate(-28 20 26)" />
      <ellipse cx="44" cy="26" rx="11" ry="6" fill={p.pale} opacity={0.4} transform="rotate(28 44 26)" />
      <circle cx="32" cy="46" r="11" fill={p.light} opacity={0.35} />
      <circle cx="32" cy="46" r="7.5" fill={p.light} />
      <ellipse cx="32" cy="34" rx="9" ry="11" fill={p.base} />
      <path d="M23 32h18M23 38h18" stroke={p.dark} strokeWidth="1.4" opacity={0.6} />
      <circle cx="32" cy="22" r="7" fill={p.dark} />
      <path d="M28 15l-3-6M36 15l3-6" stroke={p.dark} strokeWidth="1.8" strokeLinecap="round" />
      <Eyes cx={32} cy={22} gap={7} r={1.8} />
    </>
  ),

  // 7. 조약돌두더지 — 앞으로 튀어나온 주둥이와 굴착용 발톱
  7: (p) => (
    <>
      <ellipse cx="32" cy="34" rx="16" ry="14" fill={p.base} />
      {/* 굴착용 앞발 — 몸 아래에 뭉쳐 붙인다 */}
      <ellipse cx="19" cy="48" rx="7" ry="5" fill={p.dark} />
      <ellipse cx="45" cy="48" rx="7" ry="5" fill={p.dark} />
      <path d="M14 51l1.5 7 2-7zM19 52l0 7 2.5-7zM24 51l-1 7 2.5-6z" fill={p.pale} />
      <path d="M50 51l-1.5 7-2-7zM45 52l0 7-2.5-7zM40 51l1 7-2.5-6z" fill={p.pale} />
      {/* 앞으로 튀어나온 주둥이 (아래가 코끝) */}
      <path d="M23 32h18l-9 14z" fill={p.pale} />
      <ellipse cx="32" cy="42" rx="3" ry="2.4" fill={INK} opacity={0.9} />
      <path d="M28 45l-7 3M36 45l7 3" stroke={INK} strokeWidth="1" strokeLinecap="round" opacity={0.45} />
      {/* 두더지는 눈이 거의 감겨 있다 */}
      <path d="M19 30q4 3 8 0M37 30q4 3 8 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),

  // 8. 안개고양이 — 삼각 귀와 감긴 꼬리
  8: (p) => (
    <>
      <path d="M46 48q12 2 10-10-1 8-10 6z" fill={p.light} />
      <ellipse cx="30" cy="43" rx="14" ry="11" fill={p.base} />
      <path d="M19 22l2 11 8-5z" fill={p.base} />
      <path d="M41 22l-2 11-8-5z" fill={p.base} />
      <path d="M21 25l1 5.5 4-2.5z" fill={p.pale} />
      <path d="M39 25l-1 5.5-4-2.5z" fill={p.pale} />
      <circle cx="30" cy="30" r="11" fill={p.base} />
      <Eyes cx={30} cy={29} gap={11} r={2.4} />
      <path d="M28.6 34h2.8l-1.4 1.8z" fill={INK} />
      <path d="M18 32h-7M18 35h-7M42 32h7M42 35h7" stroke={p.dark} strokeWidth="1.2" strokeLinecap="round" opacity={0.7} />
    </>
  ),

  // 9. 화산도마뱀 — 등지느러미 볏
  9: (p) => (
    <>
      <path d="M48 44q12 0 14-10-2 14-14 14z" fill={p.dark} />
      <path d="M18 30l5-8 5 8 5-9 5 9 5-7 4 7z" fill={p.dark} />
      <ellipse cx="32" cy="42" rx="18" ry="11" fill={p.base} />
      <ellipse cx="32" cy="46" rx="12" ry="6" fill={p.pale} opacity={0.65} />
      <circle cx="17" cy="35" r="8.5" fill={p.light} />
      <Eyes cx={15} cy={34} gap={7} r={1.9} />
      <path d="M22 50l-2 6M32 52l0 6M42 50l2 6" stroke={p.dark} strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),

  // 10. 폭풍매 — 펼친 날개
  10: (p) => (
    <>
      <path d="M30 34C20 26 10 26 3 33c8 1 12 5 14 10 5-2 9-4 13-9z" fill={p.base} />
      <path d="M34 34c10-8 20-8 27-1-8 1-12 5-14 10-5-2-9-4-13-9z" fill={p.base} />
      <path d="M28 33c-8-5-15-5-20-1 6 1 9 4 11 7z" fill={p.light} opacity={0.7} />
      <path d="M36 33c8-5 15-5 20-1-6 1-9 4-11 7z" fill={p.light} opacity={0.7} />
      <path d="M28 48l4 10 4-10z" fill={p.dark} />
      <ellipse cx="32" cy="40" rx="8" ry="11" fill={p.dark} />
      <circle cx="32" cy="27" r="8" fill={p.base} />
      <path d="M32 30l7 3-7 3z" fill={p.pale} />
      <Eyes cx={32} cy={25} gap={8} r={1.9} />
    </>
  ),

  // 11. 크리스탈사슴 — 가지 친 결정 뿔과 갸름한 얼굴
  11: (p) => (
    <>
      {/* 결정 뿔: 굵은 줄기에서 가지가 갈라지고 면마다 명암을 준다 */}
      <path d="M25 22L21 4l4 1 3 15z" fill={p.pale} />
      <path d="M25 22L21 4l2 0 2 17z" fill="#fff" opacity={0.35} />
      <path d="M23 12L12 6l0 4 10 5z" fill={p.pale} />
      <path d="M24 17L15 15l1 4 8 1z" fill={p.light} />
      <path d="M39 22L43 4l-4 1-3 15z" fill={p.pale} />
      <path d="M39 22L43 4l-2 0-2 17z" fill="#fff" opacity={0.35} />
      <path d="M41 12l11-6 0 4-10 5z" fill={p.pale} />
      <path d="M40 17l9-2-1 4-8 1z" fill={p.light} />
      {/* 몸통 */}
      <ellipse cx="32" cy="47" rx="12" ry="10" fill={p.base} />
      <ellipse cx="32" cy="50" rx="7" ry="5" fill={p.pale} opacity={0.6} />
      <path d="M25 55l-1 7M39 55l1 7" stroke={p.dark} strokeWidth="2.6" strokeLinecap="round" />
      {/* 귀 */}
      <ellipse cx="21" cy="28" rx="4.5" ry="2.8" fill={p.dark} transform="rotate(-28 21 28)" />
      <ellipse cx="43" cy="28" rx="4.5" ry="2.8" fill={p.dark} transform="rotate(28 43 28)" />
      {/* 갸름한 머리 + 주둥이 */}
      <path d="M32 20c6 0 8 6 7 12-1 5-3 9-7 9s-6-4-7-9c-1-6 1-12 7-12z" fill={p.base} />
      <ellipse cx="32" cy="38" rx="4.2" ry="3.4" fill={p.light} />
      <ellipse cx="32" cy="37" rx="1.8" ry="1.3" fill={INK} opacity={0.85} />
      <Eyes cx={32} cy={29} gap={9} r={1.9} />
    </>
  ),

  // 12. 그림자늑대 — 전부 각지게. 고양이의 둥근 실루엣과 대비시킨다
  12: (p) => (
    <>
      <path d="M44 48l16-6-6 8 8 4-18 2z" fill={p.dark} />
      <ellipse cx="30" cy="46" rx="14" ry="9" fill={p.dark} />
      {/* 갈기 — 톱니로 두른다 */}
      <path d="M13 34l5 4 3-6 4 6 3-7 4 7 3-6 4 6 5-4-2 12H15z" fill={p.dark} />
      {/* 뾰족한 귀 */}
      <path d="M15 12l3 15 8-8zM45 12l-3 15-8-8z" fill={p.base} />
      <path d="M17 17l1.6 7 4-4zM43 17l-1.6 7-4-4z" fill={p.dark} />
      {/* 각진 머리 */}
      <path d="M30 16l13 9-2 11-11 8-11-8-2-11z" fill={p.base} />
      {/* 주둥이 */}
      <path d="M30 44l-7-10h14z" fill={p.pale} opacity={0.75} />
      <path d="M28.4 38h3.2l-1.6 2.4z" fill={INK} />
      {/* 사나운 눈매 */}
      <path d="M22 27l7 2-7 2z" fill={p.light} />
      <path d="M38 27l-7 2 7 2z" fill={p.light} />
      <path d="M23 28l4 1-4 1zM37 28l-4 1 4 1z" fill={INK} />
    </>
  ),

  // 13. 빛나는부엉이 — 큰 눈과 귀깃
  13: (p) => (
    <>
      <circle cx="32" cy="38" r="16" fill={p.light} opacity={0.25} />
      <path d="M19 18l3 10 7-5zM45 18l-3 10-7-5z" fill={p.base} />
      <ellipse cx="32" cy="38" rx="16" ry="17" fill={p.base} />
      <path d="M16 38a16 17 0 0 0 6 13V30a16 17 0 0 0-6 8zM48 38a16 17 0 0 1-6 13V30a16 17 0 0 1 6 8z" fill={p.dark} opacity={0.45} />
      <circle cx="25" cy="34" r="6.5" fill={p.pale} />
      <circle cx="39" cy="34" r="6.5" fill={p.pale} />
      <circle cx="25" cy="34" r="3.4" fill={INK} />
      <circle cx="39" cy="34" r="3.4" fill={INK} />
      <circle cx="26.2" cy="32.8" r="1.2" fill="#fff" opacity={0.9} />
      <circle cx="40.2" cy="32.8" r="1.2" fill="#fff" opacity={0.9} />
      <path d="M29 42h6l-3 4z" fill={shade('#d9c04a', -0.1)} />
    </>
  ),

  // 14. 태초의거북 — 보스. 가시 등껍질과 빛나는 고대 문양으로 일반 거북과 구분한다
  14: (p) => {
    const rune = '#f0dc9a';
    return (
      <>
        <circle cx="32" cy="40" r="27" fill={rune} opacity={0.07} />
        <ellipse cx="9" cy="55" rx="7" ry="5" fill={p.dark} />
        <ellipse cx="55" cy="55" rx="7" ry="5" fill={p.dark} />
        <path d="M4 52l-3 6 5-1zM60 52l3 6-5-1z" fill={p.dark} />
        {/* 목과 머리 */}
        <path d="M18 44q-8 0-11-6 4 10 11 10z" fill={p.dark} />
        <circle cx="11" cy="34" r="10" fill={p.light} />
        <path d="M8 24l-2-8 7 5z" fill={rune} opacity={0.8} />
        <Eyes cx={9} cy={33} gap={8} r={2.1} />
        <path d="M2 38q4 3 8 1" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity={0.6} />
        {/* 가시가 돋은 등껍질 */}
        <path d="M14 50a24 21 0 0 1 48 0z" fill={p.base} />
        <path d="M20 33l-4-9 9 4zM32 26l-2-10 8 7zM45 30l2-10 6 8z" fill={p.dark} />
        <path d="M14 50a24 21 0 0 1 48 0" fill="none" stroke={p.dark} strokeWidth="3" />
        <path d="M22 50a14 12 0 0 1 28 0" fill="none" stroke={p.dark} strokeWidth="2" opacity={0.7} />
        {/* 고대 문양 */}
        <path d="M36 32l8-4 8 4-3 9h-10z" fill={p.dark} opacity={0.65} />
        <path d="M20 42l7-3 7 3-2 7h-10z" fill={p.dark} opacity={0.55} />
        <path d="M44 43l7-3 7 3-2 6h-10z" fill={p.dark} opacity={0.55} />
        <circle cx="44" cy="35" r="3" fill={rune} opacity={0.9} />
        <circle cx="27" cy="45" r="2.2" fill={rune} opacity={0.75} />
        <circle cx="51" cy="45" r="2.2" fill={rune} opacity={0.75} />
        <circle cx="35" cy="47" r="1.6" fill={rune} opacity={0.6} />
      </>
    );
  },
};

export function PetSprite({
  shapeId,
  element,
  size = 64,
  silhouette,
  className,
}: {
  shapeId: number;
  element: Element;
  size?: number;
  silhouette?: boolean;
  className?: string;
}) {
  const art = ART[shapeId] ?? ART[1];
  const palette = silhouette
    ? { base: '#2a2a56', dark: '#1f1f42', light: '#33336a', pale: '#3d3d78' }
    : paletteFor(element);

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      {art(palette)}
    </svg>
  );
}
