import { ELEMENT_PALETTE, type CoreElement } from '../lib/gameTypes';

/**
 * 펫 모션. 완성도 가이드 3.1절의 6종을 프레임 수·시간 스펙에 맞춰 구현한다.
 * 래스터 스프라이트 시트 대신 SVG 전체에 CSS 변형을 걸어, 42종 전부에
 * 추가 에셋 없이 같은 모션이 적용되도록 했다.
 */
export type PetMotion = 'idle' | 'walk' | 'attack' | 'hurt' | 'faint' | 'victory';

const MOTION_CLASS: Record<PetMotion, string> = {
  idle: 'pet-idle',
  walk: 'pet-walk',
  attack: 'pet-attack',
  hurt: 'pet-hurt',
  faint: 'pet-faint',
  victory: 'pet-victory',
};

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

function paletteFor(element: CoreElement): Palette {
  // 가이드 2.3절의 4단계 팔레트를 스프라이트의 base/dark/light/pale에 대응시킨다
  const p = ELEMENT_PALETTE[element];
  return { base: p.main, dark: p.dark, light: p.sub, pale: p.accent };
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
  // ─── 진화형: 원형의 실루엣을 유지하되 장식과 덩치로 격을 올린다 ───

  // 15. 질풍토끼 — 귀를 뒤로 눕히고 바람 궤적을 붙였다
  15: (p) => (
    <>
      <path d="M4 22q10-4 18 2-9 1-18-2zM2 32q11-3 19 3-10 1-19-3z" fill={p.pale} opacity={0.45} />
      <path d="M28 16q-10-6-20-2 8 6 19 7z" fill={p.base} />
      <path d="M36 16q10-6 20-2-8 6-19 7z" fill={p.base} />
      <path d="M27 16q-7-4-14-2 6 4 13 5z" fill={p.pale} />
      <path d="M37 16q7-4 14-2-6 4-13 5z" fill={p.pale} />
      <circle cx="52" cy="44" r="6" fill={p.light} />
      <ellipse cx="32" cy="40" rx="17" ry="14" fill={p.base} />
      <ellipse cx="32" cy="45" rx="10" ry="8" fill={p.pale} opacity={0.75} />
      <path d="M22 33l8 3-8 3zM42 33l-8 3 8 3z" fill={p.light} />
      <path d="M23 34l5 2-5 2zM41 34l-5 2 5 2z" fill={INK} />
      <path d="M30 43h4l-2 2.4z" fill={INK} opacity={0.8} />
    </>
  ),

  // 16. 홍염여우 — 꼬리 세 갈래와 갈기
  16: (p) => (
    <>
      <path d="M42 46q16-2 16-18 8 16-6 24zM44 48q14 2 18-10 2 14-12 16zM40 44q12-8 8-22 10 12 0 24z" fill={p.light} />
      <path d="M43 46q11-2 12-13 4 11-6 16z" fill={p.pale} opacity={0.85} />
      <ellipse cx="28" cy="44" rx="15" ry="11" fill={p.base} />
      <path d="M13 34l4 6 4-8 4 8 3-9 3 9 4-8 4 8 4-6-2 12H15z" fill={p.light} />
      <path d="M16 20l4 13 8-7zM40 20l-4 13-8-7z" fill={p.base} />
      <path d="M18 24l2 7 4-4zM38 24l-2 7-4-4z" fill={p.pale} />
      <circle cx="28" cy="29" r="12" fill={p.base} />
      <path d="M28 30q-9 2-9 9 9 4 18 0 0-7-9-9z" fill={p.pale} opacity={0.85} />
      <path d="M20 27l7 2-7 2z" fill={p.dark} />
      <path d="M36 27l-7 2 7 2z" fill={p.dark} />
      <path d="M21 28l4 1-4 1zM35 28l-4 1 4 1z" fill={INK} />
      <path d="M26.4 36h3.2l-1.6 2z" fill={INK} />
    </>
  ),

  // 17. 해류슬라임 — 물마루 볏이 솟은 형태
  17: (p) => (
    <>
      <path d="M32 6c4 6 10 5 13 1-1 7-6 9-10 9z" fill={p.light} />
      <path d="M32 12c10 14 17 22 17 29a17 17 0 0 1-34 0c0-7 7-15 17-29z" fill={p.base} />
      <path d="M15 41q8 6 17 0t17 0" stroke={p.light} strokeWidth="2.5" fill="none" opacity={0.7} />
      <path d="M32 26c6 9 10 13 10 17a10 10 0 0 1-20 0c0-4 4-8 10-17z" fill={p.light} opacity={0.45} />
      <ellipse cx="24" cy="32" rx="3" ry="5.5" fill="#fff" opacity={0.5} transform="rotate(-20 24 32)" />
      <Eyes cx={32} cy={40} gap={12} r={2.4} />
      <path d="M27 47q5 4 10 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  ),

  // 18. 바위거북 — 각지고 가시 돋친 등껍질
  18: (p) => (
    <>
      <ellipse cx="12" cy="53" rx="6" ry="4.5" fill={p.dark} />
      <ellipse cx="52" cy="53" rx="6" ry="4.5" fill={p.dark} />
      <circle cx="13" cy="34" r="9" fill={p.light} />
      <Eyes cx={11} cy={33} gap={7} r={1.9} />
      <path d="M18 30l-5-8 9 3zM31 25l-3-9 9 6zM45 29l1-9 7 7z" fill={p.dark} />
      <path d="M16 48l6-14h20l6 14z" fill={p.base} />
      <path d="M22 34l-6 14h10l2-14zM42 34l6 14H38l-2-14z" fill={p.dark} opacity={0.5} />
      <path d="M16 48l6-14h20l6 14" fill="none" stroke={p.dark} strokeWidth="2.5" />
      <path d="M28 37h8l1 8h-10z" fill={p.light} opacity={0.7} />
    </>
  ),

  // 19. 창공제비 — 갈라진 꼬리와 날렵한 날개
  19: (p) => (
    <>
      <path d="M30 36C18 28 8 30 2 38c9 0 13 4 16 9 5-3 9-6 12-11z" fill={p.base} />
      <path d="M34 36c12-8 22-6 28 2-9 0-13 4-16 9-5-3-9-6-12-11z" fill={p.base} />
      <path d="M28 35c-8-4-14-3-18 1 6 0 9 2 11 5z" fill={p.light} opacity={0.75} />
      <path d="M36 35c8-4 14-3 18 1-6 0-9 2-11 5z" fill={p.light} opacity={0.75} />
      <path d="M28 48l-4 12 8-7 8 7-4-12z" fill={p.dark} />
      <ellipse cx="32" cy="40" rx="7" ry="10" fill={p.dark} />
      <circle cx="32" cy="28" r="7.5" fill={p.base} />
      <path d="M32 31l7 2.5-7 2.5z" fill={p.pale} />
      <Eyes cx={32} cy={26} gap={8} r={1.8} />
    </>
  ),

  // 20. 불나방 — 크고 무늬 있는 날개
  20: (p) => (
    <>
      <path d="M30 34C18 22 6 24 4 34c-2 9 8 14 16 10 4-2 8-6 10-10z" fill={p.base} opacity={0.85} />
      <path d="M34 34c12-12 24-10 26 0 2 9-8 14-16 10-4-2-8-6-10-10z" fill={p.base} opacity={0.85} />
      <path d="M28 40c-9 8-18 8-20 1 6 5 14 3 20-1zM36 40c9 8 18 8 20 1-6 5-14 3-20-1z" fill={p.light} opacity={0.7} />
      <circle cx="15" cy="32" r="4" fill={p.pale} opacity={0.8} />
      <circle cx="49" cy="32" r="4" fill={p.pale} opacity={0.8} />
      <ellipse cx="32" cy="38" rx="6" ry="13" fill={p.dark} />
      <path d="M26 34h12M26 40h12" stroke={p.pale} strokeWidth="1.4" opacity={0.55} />
      <circle cx="32" cy="22" r="6.5" fill={p.dark} />
      <path d="M28 15q-4-6-9-5 5 1 7 6zM36 15q4-6 9-5-5 1-7 6z" stroke={p.dark} strokeWidth="1.6" fill="none" />
      <Eyes cx={32} cy={22} gap={6.5} r={1.7} />
    </>
  ),

  // 21. 바위두더지 — 등에 암석 판을 얹었다
  21: (p) => (
    <>
      <ellipse cx="32" cy="36" rx="17" ry="15" fill={p.base} />
      <path d="M18 26l7-5 6 5-3 7h-8zM38 24l7-4 6 6-3 7h-8zM28 20l5-4 5 5-2 5h-7z" fill={p.dark} />
      <ellipse cx="18" cy="48" rx="7.5" ry="5" fill={p.dark} />
      <ellipse cx="46" cy="48" rx="7.5" ry="5" fill={p.dark} />
      <path d="M12 51l1.5 8 2.5-8zM18 52l0 8 3-8zM24 51l-1 8 3-7z" fill={p.pale} />
      <path d="M52 51l-1.5 8-2.5-8zM46 52l0 8-3-8zM40 51l1 8-3-7z" fill={p.pale} />
      <path d="M23 34h18l-9 14z" fill={p.pale} />
      <ellipse cx="32" cy="44" rx="3" ry="2.4" fill={INK} opacity={0.9} />
      <path d="M20 32q4 3 8 0M36 32q4 3 8 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),

  // ─── 울창한 숲 ───

  // 22. 덩굴뱀 — 똬리 튼 몸과 잎사귀
  22: (p) => (
    <>
      <path
        d="M32 54c-14 0-22-6-22-13s9-11 18-11 15 3 15 7-5 6-11 6-9-2-9-4"
        fill="none"
        stroke={p.base}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M32 54c-14 0-22-6-22-13s9-11 18-11"
        fill="none"
        stroke={p.light}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity={0.6}
      />
      <path d="M46 22q8-6 14-2-6 6-13 5z" fill={p.light} />
      <path d="M44 16q2-9 9-10-1 8-7 11z" fill={p.light} />
      <ellipse cx="40" cy="26" rx="10" ry="8" fill={p.base} />
      <Eyes cx={40} cy={24} gap={9} r={2} />
      <path d="M44 32l8 3-8 1z" fill="#e2543f" opacity={0.85} />
    </>
  ),

  // 23. 버섯두꺼비 — 머리에 버섯갓
  23: (p) => (
    <>
      <ellipse cx="32" cy="44" rx="19" ry="14" fill={p.base} />
      <ellipse cx="32" cy="49" rx="12" ry="8" fill={p.pale} opacity={0.7} />
      <ellipse cx="14" cy="54" rx="7" ry="4" fill={p.dark} />
      <ellipse cx="50" cy="54" rx="7" ry="4" fill={p.dark} />
      <rect x="28" y="20" width="8" height="12" rx="3" fill={p.pale} />
      <path d="M14 22a18 12 0 0 1 36 0z" fill="#c0553f" />
      <circle cx="23" cy="17" r="3" fill={p.pale} opacity={0.9} />
      <circle cx="34" cy="14" r="3.6" fill={p.pale} opacity={0.9} />
      <circle cx="43" cy="18" r="2.6" fill={p.pale} opacity={0.9} />
      <Eyes cx={32} cy={38} gap={14} r={2.6} />
      <path d="M24 46q8 5 16 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  ),

  // 24. 늪지악어 — 길고 낮은 주둥이
  24: (p) => (
    <>
      <path d="M46 42q14 2 16-8-1 14-16 14z" fill={p.dark} />
      <ellipse cx="34" cy="42" rx="19" ry="10" fill={p.base} />
      <path d="M18 32l4-7 4 7 5-8 5 8 5-6 4 6z" fill={p.dark} />
      <path d="M22 50l-2 7M34 52l0 7M46 50l2 7" stroke={p.dark} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M20 36q-17 0-18 6 1 6 18 6z" fill={p.light} />
      <path d="M4 40h14M4 44h14" stroke="#fff" strokeWidth="1.4" opacity={0.75} />
      <path d="M6 41l2 3 2-3 2 3 2-3 2 3 2-3" fill="none" stroke="#fff" strokeWidth="1" opacity={0.6} />
      <circle cx="22" cy="32" r="4.5" fill={p.light} />
      <circle cx="22" cy="32" r="2" fill={INK} />
      <circle cx="22.8" cy="31.2" r="0.7" fill="#fff" />
    </>
  ),

  // 25. 달빛표범 — 반점과 초승달 문양
  25: (p) => (
    <>
      <path d="M46 46q14-4 12-16 7 14-8 21z" fill={p.light} />
      <ellipse cx="30" cy="44" rx="15" ry="11" fill={p.base} />
      <circle cx="22" cy="42" r="2.2" fill={p.dark} opacity={0.6} />
      <circle cx="31" cy="47" r="2.4" fill={p.dark} opacity={0.6} />
      <circle cx="38" cy="41" r="2" fill={p.dark} opacity={0.6} />
      <path d="M18 20l3 12 8-6zM42 20l-3 12-8-6z" fill={p.base} />
      <path d="M20 23l1.6 6 4-3zM40 23l-1.6 6-4-3z" fill={p.pale} />
      <circle cx="30" cy="30" r="11.5" fill={p.base} />
      <path d="M30 19a6 6 0 0 0 0 11 7 7 0 0 1 0-11z" fill={p.pale} opacity={0.9} />
      <Eyes cx={30} cy={30} gap={11} r={2.5} />
      <path d="M28.5 35h3l-1.5 2z" fill={INK} />
      <path d="M18 33h-7M18 36h-7M42 33h7M42 36h7" stroke={p.dark} strokeWidth="1.2" strokeLinecap="round" opacity={0.7} />
    </>
  ),

  // 26. 고대나무정령 — 나무 몸통에 깃든 얼굴
  26: (p) => (
    <>
      <path d="M20 14q-8-6-14-2 6 8 15 6zM44 14q8-6 14-2-6 8-15 6z" fill={p.light} />
      <path d="M24 10q-2-8 3-10 3 7 0 11zM40 10q2-8-3-10-3 7 0 11z" fill={p.light} />
      <path d="M22 20h20l4 34H18z" fill={p.base} />
      <path d="M18 54h28l4 6H14z" fill={p.dark} />
      <path d="M28 24q-3 12 0 26M36 24q3 12 0 26" stroke={p.dark} strokeWidth="1.6" fill="none" opacity={0.5} />
      <path d="M16 30q-8 2-10 8 8-1 11-5zM48 30q8 2 10 8-8-1-11-5z" fill={p.base} />
      <ellipse cx="26" cy="33" rx="4" ry="5" fill={p.dark} />
      <ellipse cx="38" cy="33" rx="4" ry="5" fill={p.dark} />
      <circle cx="26" cy="33" r="2" fill="#f0dc9a" opacity={0.9} />
      <circle cx="38" cy="33" r="2" fill="#f0dc9a" opacity={0.9} />
      <path d="M28 43q4 4 8 0" stroke={p.dark} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),

  // 27. 숲의수호자 — 보스. 거대한 뿔과 빛나는 문양
  27: (p) => {
    const rune = '#f0dc9a';
    return (
      <>
        <circle cx="32" cy="36" r="28" fill={rune} opacity={0.07} />
        <path d="M22 16L14 2l-3 3 6 14zM18 12L6 8l1 5 10 4zM42 16L50 2l3 3-6 14zM46 12l12-4-1 5-10 4z" fill={p.pale} />
        <path d="M20 20q-6-4-12-2 5 5 12 4zM44 20q6-4 12-2-5 5-12 4z" fill={p.light} />
        <ellipse cx="32" cy="46" rx="19" ry="15" fill={p.base} />
        <path d="M18 56l-2 7M30 58l-1 6M34 58l1 6M46 56l2 7" stroke={p.dark} strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="32" cy="49" rx="11" ry="8" fill={p.dark} opacity={0.4} />
        <circle cx="32" cy="47" r="4" fill={rune} opacity={0.8} />
        <circle cx="22" cy="44" r="2.2" fill={rune} opacity={0.6} />
        <circle cx="42" cy="44" r="2.2" fill={rune} opacity={0.6} />
        <ellipse cx="32" cy="28" rx="12" ry="11" fill={p.base} />
        <path d="M32 34q-6 2-6 6 6 3 12 0 0-4-6-6z" fill={p.pale} opacity={0.8} />
        <circle cx="27" cy="26" r="3.2" fill={rune} />
        <circle cx="37" cy="26" r="3.2" fill={rune} />
        <circle cx="27" cy="26" r="1.4" fill={INK} />
        <circle cx="37" cy="26" r="1.4" fill={INK} />
      </>
    );
  },
  // ─── 험준한 산맥 ───

  // 28. 뿔산양 — 말려 올라간 뿔
  28: (p) => (
    <>
      <path d="M20 22q-12-2-13-10 8 1 12 5zM44 22q12-2 13-10-8 1-12 5z" fill={p.pale} />
      <path d="M20 22q-9 0-10-6 6 1 9 4zM44 22q9 0 10-6-6 1-9 4z" fill={p.light} />
      <ellipse cx="32" cy="46" rx="16" ry="12" fill={p.base} />
      <ellipse cx="32" cy="49" rx="10" ry="7" fill={p.pale} opacity={0.65} />
      <path d="M23 56l-1 7M41 56l1 7" stroke={p.dark} strokeWidth="2.8" strokeLinecap="round" />
      <ellipse cx="32" cy="28" rx="10" ry="11" fill={p.base} />
      <ellipse cx="32" cy="36" rx="5" ry="4" fill={p.pale} />
      <ellipse cx="32" cy="35" rx="2" ry="1.4" fill={INK} opacity={0.85} />
      <Eyes cx={32} cy={27} gap={10} r={2} />
      <path d="M27 18q-3-5-1-8 3 3 3 8zM37 18q3-5 1-8-3 3-3 8z" fill={p.dark} />
    </>
  ),

  // 29. 바위게 — 집게와 각진 껍질
  29: (p) => (
    <>
      <path d="M10 34l-7-6 3-6 9 8zM54 34l7-6-3-6-9 8z" fill={p.dark} />
      <path d="M4 24l-3-6 7 1 2 6zM60 24l3-6-7 1-2 6z" fill={p.light} />
      <path d="M14 50l-6 8M22 54l-3 8M42 54l3 8M50 50l6 8" stroke={p.dark} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 44l6-12h24l6 12-6 8H20z" fill={p.base} />
      <path d="M20 34l4 18M44 34l-4 18" stroke={p.dark} strokeWidth="1.6" opacity={0.45} />
      <path d="M14 44l6-12h24l6 12" fill="none" stroke={p.dark} strokeWidth="2.2" />
      <circle cx="25" cy="38" r="3.4" fill={p.pale} />
      <circle cx="39" cy="38" r="3.4" fill={p.pale} />
      <circle cx="25" cy="38" r="1.7" fill={INK} />
      <circle cx="39" cy="38" r="1.7" fill={INK} />
      <path d="M27 47q5 3 10 0" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </>
  ),

  // 30. 폭풍독수리 — 크게 펼친 날개와 번개
  30: (p) => (
    <>
      <path d="M30 32C16 20 4 22 0 32c8-1 14 3 18 10 5-3 9-6 12-10z" fill={p.base} />
      <path d="M34 32c14-12 26-10 30 0-8-1-14 3-18 10-5-3-9-6-12-10z" fill={p.base} />
      <path d="M27 31c-9-6-17-5-22 0 7-1 12 1 16 4zM37 31c9-6 17-5 22 0-7-1-12 1-16 4z" fill={p.light} opacity={0.7} />
      <path d="M10 40l6 2-5 4zM54 40l-6 2 5 4z" fill={p.pale} />
      <path d="M28 48l-3 12 7-6 7 6-3-12z" fill={p.dark} />
      <ellipse cx="32" cy="40" rx="8" ry="11" fill={p.dark} />
      <path d="M30 34l-4 8 5-1-3 7 7-9-5 1z" fill="#f0dc9a" opacity={0.9} />
      <circle cx="32" cy="24" r="8" fill={p.base} />
      <path d="M32 27l8 3-8 3z" fill="#e8c86a" />
      <Eyes cx={32} cy={22} gap={8} r={1.9} />
      <path d="M25 18l4-4 4 4M35 18l4-4 4 4" stroke={p.dark} strokeWidth="1.6" fill="none" />
    </>
  ),

  // 31. 설인 — 덩치 큰 털북숭이
  31: (p) => (
    <>
      <path d="M10 40q-6 8-2 16 4-6 8-8zM54 40q6 8 2 16-4-6-8-8z" fill={p.light} />
      <path d="M14 54q-2 8 4 8h28q6 0 4-8z" fill={p.dark} />
      <ellipse cx="32" cy="42" rx="20" ry="17" fill={p.light} />
      <path d="M14 34q4-4 9-3M50 34q-4-4-9-3" stroke={p.pale} strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="46" rx="12" ry="10" fill={p.pale} opacity={0.7} />
      <ellipse cx="32" cy="30" rx="13" ry="11" fill={p.light} />
      <ellipse cx="32" cy="34" rx="7" ry="5" fill={p.pale} />
      <ellipse cx="32" cy="32" rx="2.4" ry="1.8" fill={INK} opacity={0.85} />
      <Eyes cx={32} cy={27} gap={11} r={2.1} />
      <path d="M22 20l3-6 3 5M42 20l-3-6-3 5" stroke={p.pale} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),

  // 32. 산맥의패왕 — 보스. 거대한 뿔과 바위 갑주
  32: (p) => {
    const rune = '#f0dc9a';
    return (
      <>
        <circle cx="32" cy="38" r="29" fill={rune} opacity={0.06} />
        <path d="M18 20Q2 14 2 2q10 6 12 10zM46 20Q62 14 62 2q-10 6-12 10z" fill={p.pale} />
        <path d="M18 20Q6 16 5 8q7 5 11 8zM46 20Q58 16 59 8q-7 5-11 8z" fill={p.light} />
        <ellipse cx="32" cy="46" rx="21" ry="16" fill={p.base} />
        <path d="M14 40l8-6 8 6-3 9H17zM34 40l8-6 8 6-3 9H37z" fill={p.dark} opacity={0.6} />
        <path d="M16 58l-3 6M28 60l-1 4M36 60l1 4M48 58l3 6" stroke={p.dark} strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="32" cy="28" rx="13" ry="12" fill={p.base} />
        <path d="M32 34q-6 2-6 6 6 3 12 0 0-4-6-6z" fill={p.pale} opacity={0.8} />
        <path d="M23 25l8 2-8 2z" fill={rune} />
        <path d="M41 25l-8 2 8 2z" fill={rune} />
        <path d="M24 26l4 1-4 1zM40 26l-4 1 4 1z" fill={INK} />
        <circle cx="32" cy="46" r="3.4" fill={rune} opacity={0.85} />
      </>
    );
  },

  // ─── 불타는 화산 ───

  // 33. 용암달팽이 — 균열이 빛나는 껍데기
  33: (p) => (
    <>
      <path d="M6 52q6 4 20 4h22q6 0 6-4t-6-4H10q-6 0-4 4z" fill={p.light} />
      <circle cx="36" cy="36" r="18" fill={p.base} />
      <path
        d="M36 36m-13 0a13 13 0 1 1 26 0a13 13 0 1 1-22 8"
        fill="none"
        stroke={p.dark}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M36 36m-7 0a7 7 0 1 1 14 0"
        fill="none"
        stroke="#f0dc9a"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity={0.85}
      />
      <path d="M18 48q-8 0-11-6 0 10 11 12z" fill={p.light} />
      <path d="M10 42l-2-8M16 42l2-8" stroke={p.light} strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="32" r="2.4" fill={INK} />
      <circle cx="18" cy="32" r="2.4" fill={INK} />
    </>
  ),

  // 34. 잿빛까마귀 — 재가 흩날리는 날개
  34: (p) => (
    <>
      <path d="M30 34C18 24 6 26 2 36c9-2 15 2 18 9 5-3 9-7 10-11z" fill={p.dark} />
      <path d="M34 34c12-10 24-8 28 2-9-2-15 2-18 9-5-3-9-7-10-11z" fill={p.dark} />
      <path d="M26 33c-8-5-15-4-19 1 6-1 11 1 14 4z" fill={p.base} opacity={0.85} />
      <path d="M38 33c8-5 15-4 19 1-6-1-11 1-14 4z" fill={p.base} opacity={0.85} />
      <circle cx="12" cy="46" r="1.8" fill={p.light} opacity={0.7} />
      <circle cx="52" cy="48" r="1.4" fill={p.light} opacity={0.6} />
      <circle cx="20" cy="52" r="1.2" fill={p.light} opacity={0.5} />
      <path d="M28 48l-3 12 7-5 7 5-3-12z" fill={p.dark} />
      <ellipse cx="32" cy="40" rx="7" ry="11" fill={p.dark} />
      <circle cx="32" cy="26" r="7.5" fill={p.dark} />
      <path d="M32 29l9 2.5-9 2.5z" fill={p.light} />
      <circle cx="29" cy="24" r="2.1" fill={p.light} />
      <circle cx="35" cy="24" r="2.1" fill={p.light} />
      <circle cx="29" cy="24" r="1" fill={INK} />
      <circle cx="35" cy="24" r="1" fill={INK} />
    </>
  ),

  // 35. 마그마골렘 — 균열 사이로 용암이 흐른다
  35: (p) => (
    <>
      <path d="M8 30l6-8 8 4-2 10-8 2zM56 30l-6-8-8 4 2 10 8 2z" fill={p.dark} />
      <path d="M18 22l8-8h12l8 8 4 20-6 16H20l-6-16z" fill={p.base} />
      <path d="M26 14l-4 20 8 6-4 18M38 14l4 20-8 6 4 18" stroke="#f0dc9a" strokeWidth="2" fill="none" opacity={0.8} />
      <path d="M20 40h24" stroke="#f0dc9a" strokeWidth="1.6" opacity={0.6} />
      <path d="M20 58l-2 6M44 58l2 6" stroke={p.dark} strokeWidth="3" strokeLinecap="round" />
      <path d="M23 24h7l-1 6h-6z" fill="#f0dc9a" opacity={0.9} />
      <path d="M34 24h7l-1 6h-6z" fill="#f0dc9a" opacity={0.9} />
      <path d="M27 34h10l-2 4h-6z" fill={p.dark} />
    </>
  ),

  // 36. 불사조 — 타오르는 깃털
  36: (p) => (
    <>
      <path d="M30 32C16 18 4 22 2 34c-2 12 10 16 18 10-2-6 4-10 10-12z" fill={p.base} />
      <path d="M34 32c14-14 26-10 28 2 2 12-10 16-18 10 2-6-4-10-10-12z" fill={p.base} />
      <path d="M24 30C14 22 8 24 6 32c4-4 12-4 18-2zM40 30c10-8 16-6 18 2-4-4-12-4-18-2z" fill={p.pale} opacity={0.8} />
      <path d="M28 48q-4 14-12 16 10 0 16-10zM36 48q4 14 12 16-10 0-16-10z" fill={p.light} />
      <path d="M32 48q0 16-4 16 8 0 8-16z" fill={p.pale} />
      <ellipse cx="32" cy="38" rx="8" ry="12" fill={p.light} />
      <circle cx="32" cy="24" r="8" fill={p.light} />
      <path d="M32 21l-4-12 6 5 5-6-3 13z" fill={p.pale} />
      <path d="M32 27l8 2.5-8 2.5z" fill="#f0dc9a" />
      <Eyes cx={32} cy={23} gap={8} r={1.9} />
    </>
  ),

  // 37. 화산의군주 — 보스. 용암 갈기와 뿔
  37: (p) => {
    const rune = '#ffd27a';
    return (
      <>
        <circle cx="32" cy="36" r="30" fill={rune} opacity={0.08} />
        <path d="M14 18l-6-14 12 8zM50 18l6-14-12 8zM32 10l-3-10 8 8z" fill={p.light} />
        <path d="M10 36q-8 6-6 16 5-8 10-10zM54 36q8 6 6 16-5-8-10-10z" fill={p.light} />
        <ellipse cx="32" cy="46" rx="21" ry="16" fill={p.base} />
        <path d="M14 42q6 4 18 4t18-4" stroke={rune} strokeWidth="2" fill="none" opacity={0.7} />
        <path d="M18 58l-3 6M30 60l-1 4M36 60l1 4M46 58l3 6" stroke={p.dark} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M16 30l5-8 5 8 6-9 6 9 5-7 5 7-3 8H19z" fill={p.light} />
        <ellipse cx="32" cy="30" rx="13" ry="11" fill={p.base} />
        <path d="M32 34q-6 2-6 6 6 3 12 0 0-4-6-6z" fill={rune} opacity={0.55} />
        <path d="M23 27l8 2-8 2z" fill={rune} />
        <path d="M41 27l-8 2 8 2z" fill={rune} />
        <path d="M24 28l4 1-4 1zM40 28l-4 1 4 1z" fill={INK} />
        <circle cx="32" cy="46" r="3.6" fill={rune} opacity={0.9} />
      </>
    );
  },

  // ─── 신비한 빙산 ───

  // 38. 얼음여우 — 서리 낀 꼬리
  38: (p) => (
    <>
      <path d="M44 46q16-4 14-20 8 16-8 24z" fill={p.pale} />
      <path d="M45 46q12-3 12-15 4 12-6 17z" fill="#fff" opacity={0.45} />
      <ellipse cx="28" cy="44" rx="15" ry="11" fill={p.base} />
      <path d="M16 20l4 13 8-7zM40 20l-4 13-8-7z" fill={p.base} />
      <path d="M18 24l2 7 4-4zM38 24l-2 7-4-4z" fill="#fff" opacity={0.6} />
      <circle cx="28" cy="29" r="12" fill={p.base} />
      <path d="M28 30q-9 2-9 9 9 4 18 0 0-7-9-9z" fill="#fff" opacity={0.7} />
      <path d="M22 16l2 5M34 16l-2 5M28 13v6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity={0.7} />
      <Eyes cx={28} cy={28} gap={11} r={2.3} />
      <path d="M26.4 35h3.2l-1.6 2z" fill={INK} />
    </>
  ),

  // 39. 빙하매머드 — 상아와 긴 코
  39: (p) => (
    <>
      <ellipse cx="34" cy="42" rx="21" ry="17" fill={p.base} />
      <path d="M16 34q-8-2-10 4 6 0 9 3z" fill={p.light} />
      <ellipse cx="16" cy="38" rx="9" ry="11" fill={p.light} />
      <path d="M14 48q-2 10 2 14 4-2 3-8z" fill={p.light} />
      <path d="M10 46q-8 6-6 12 5-6 9-6zM22 48q6 8 2 14-2-8-6-8z" fill="#e8edf5" />
      <path d="M18 56l-2 7M32 58l-1 6M44 56l2 7" stroke={p.dark} strokeWidth="3" strokeLinecap="round" />
      <Eyes cx={16} cy={34} gap={8} r={1.9} />
      <path d="M40 26q6-6 12-4-5 3-8 7z" fill={p.pale} opacity={0.7} />
    </>
  ),

  // 40. 서리정령 — 눈 결정 형상
  40: (p) => (
    <>
      <path
        d="M32 4v56M8 18l48 28M56 18L8 46"
        stroke={p.pale}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={0.55}
      />
      <path d="M32 12l-5 5M32 12l5 5M32 52l-5-5M32 52l5-5" stroke={p.pale} strokeWidth="2" strokeLinecap="round" opacity={0.5} />
      <circle cx="32" cy="34" r="15" fill={p.base} opacity={0.55} />
      <path d="M32 20l7 8-7 8-7-8z" fill={p.light} />
      <path d="M32 34l7 8-7 8-7-8z" fill={p.light} opacity={0.8} />
      <circle cx="32" cy="32" r="9" fill={p.pale} opacity={0.9} />
      <Eyes cx={32} cy={31} gap={9} r={2.1} />
      <path d="M28 37q4 3 8 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  ),

  // 41. 심해리바이어던 — 뱀 같은 몸통과 지느러미
  41: (p) => (
    <>
      <path
        d="M6 50q10 4 18-2t14-10 16-2"
        fill="none"
        stroke={p.base}
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        d="M6 50q10 4 18-2t14-10 16-2"
        fill="none"
        stroke={p.light}
        strokeWidth="4"
        strokeLinecap="round"
        opacity={0.5}
      />
      <path d="M20 40l-3-10 9 6zM34 32l-2-11 9 7z" fill={p.pale} />
      <path d="M2 44l-2-8 8 6zM4 56l-4 6 8-2z" fill={p.dark} />
      <ellipse cx="52" cy="32" rx="11" ry="9" fill={p.base} />
      <path d="M60 26l4-8-2 10z" fill={p.pale} />
      <path d="M46 36l-6 4 7 1z" fill={p.pale} />
      <Eyes cx={54} cy={30} gap={9} r={2.2} />
      <path d="M58 37l6 2-6 1z" fill="#fff" opacity={0.7} />
    </>
  ),

  // 42. 빙산의여왕 — 보스. 얼음 왕관과 빛나는 문양
  42: (p) => {
    const rune = '#cfe9f7';
    return (
      <>
        <circle cx="32" cy="36" r="30" fill={rune} opacity={0.08} />
        <path d="M20 16l-4-14 8 8 8-12 8 12 8-8-4 14z" fill={p.pale} />
        <path d="M22 16l-2-8 5 5 7-9 7 9 5-5-2 8z" fill="#fff" opacity={0.5} />
        <path d="M10 34q-8 8-6 20 6-10 12-12zM54 34q8 8 6 20-6-10-12-12z" fill={p.light} opacity={0.75} />
        <path d="M32 22q-16 10-16 26 0 12 16 12t16-12q0-16-16-26z" fill={p.base} />
        <path d="M32 34q-9 8-9 16 0 7 9 7t9-7q0-8-9-16z" fill={p.light} opacity={0.55} />
        <path d="M24 44l8-6 8 6-3 10h-10z" fill={rune} opacity={0.5} />
        <ellipse cx="32" cy="28" rx="11" ry="10" fill={p.light} />
        <circle cx="27" cy="27" r="2.6" fill={rune} />
        <circle cx="37" cy="27" r="2.6" fill={rune} />
        <circle cx="27" cy="27" r="1.2" fill={INK} />
        <circle cx="37" cy="27" r="1.2" fill={INK} />
        <path d="M29 33q3 2 6 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <circle cx="32" cy="48" r="3" fill={rune} opacity={0.9} />
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
  motion,
  flipped,
  label,
}: {
  shapeId: number;
  element: CoreElement;
  size?: number;
  silhouette?: boolean;
  className?: string;
  motion?: PetMotion;
  /** 좌우 반전. 모션 키프레임이 반전을 유지하도록 클래스로 처리한다. */
  flipped?: boolean;
  /** 지정하면 장식용이 아닌 의미 있는 이미지로 노출한다 */
  label?: string;
}) {
  const art = ART[shapeId] ?? ART[1];
  const palette = silhouette
    ? { base: '#2a2a56', dark: '#1f1f42', light: '#33336a', pale: '#3d3d78' }
    : paletteFor(element);

  const classes = [
    className,
    motion ? MOTION_CLASS[motion] : '',
    flipped ? 'pet-flip' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={classes || undefined}
      role="img"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      shapeRendering="geometricPrecision"
    >
      {art(palette)}
    </svg>
  );
}
