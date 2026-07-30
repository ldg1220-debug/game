import { ELEMENT_PALETTE, type CoreElement } from './gameTypes';

/**
 * 종별 색.
 *
 * 원래는 원소가 색을 전부 정했다. 그러니 도감을 열면 화 속성 개체가 전부
 * 같은 주황색 덩어리로 보이고, 솜털토끼와 그림자늑대가 구분되지 않았다.
 * 원소는 개체마다 굴러 바뀌는 값이라 종의 정체성이 될 수 없다.
 *
 * 그래서 규칙을 바꾼다.
 *  - 종이 몸 색(main·sub·dark)을 정한다. 늑대는 어떤 원소든 잿빛 남색이다.
 *  - 원소는 강조로만 들어간다: 홍채·발톱·등가시·갈기 끝, 그리고 몸 색에
 *    아주 옅게(ELEMENT_MIX) 섞이는 정도.
 * 이렇게 하면 실루엣만으로 종을 알아보면서 원소도 한눈에 읽힌다.
 */

export interface SpeciesPalette {
  /** 몸 주색 */
  main: string;
  /** 배·주둥이·무늬 */
  sub: string;
  /** 발·코·그림자 지는 부위 */
  dark: string;
}

/** 원소가 몸 색에 섞이는 비율. 종 정체성을 덮지 않을 만큼만. */
const ELEMENT_MIX = 0.16;

export const SPECIES_PALETTE: Record<number, SpeciesPalette> = {
  // ─── 푸른 초원 ───
  1: { main: '#EFE3D2', sub: '#FFF8EE', dark: '#B9A791' }, // 솜털토끼 · 크림
  2: { main: '#E2703A', sub: '#FFE7C7', dark: '#8C3B18' }, // 불꽃여우 · 녹슨 주황
  3: { main: '#4FC3E8', sub: '#C6F2FF', dark: '#1B6E8C' }, // 물방울슬라임 · 물빛
  4: { main: '#6E8F4E', sub: '#CBE0A8', dark: '#3B4F27' }, // 이끼거북 · 이끼
  5: { main: '#A98763', sub: '#F3E2C7', dark: '#5F462C' }, // 바람참새 · 참새 갈색
  6: { main: '#4C5A32', sub: '#D9F27A', dark: '#232B15' }, // 반딧불이 · 올리브 + 발광
  7: { main: '#7C7367', sub: '#C4BBAA', dark: '#433D35' }, // 조약돌두더지 · 돌빛
  8: { main: '#9FB1C4', sub: '#E8F0F7', dark: '#54636F' }, // 안개고양이 · 안개 회청
  9: { main: '#B4462C', sub: '#F0A05A', dark: '#5E1E10' }, // 화산도마뱀 · 적갈
  10: { main: '#6B7C93', sub: '#DCE6F0', dark: '#333E4E' }, // 폭풍매 · 폭풍 회청
  11: { main: '#C9AE8B', sub: '#F2E7D2', dark: '#6E5A3D' }, // 크리스탈사슴 · 사슴 (수정 뿔은 원소색)
  12: { main: '#4A4E6B', sub: '#9AA0C4', dark: '#22243A' }, // 그림자늑대 · 잿빛 남색
  13: { main: '#D8C39B', sub: '#FFF6D8', dark: '#7A6742' }, // 빛나는부엉이 · 상아
  14: { main: '#3E5540', sub: '#E8D77A', dark: '#18241A' }, // 태초의거북 · 고태 녹 + 금
  15: { main: '#DCE9F2', sub: '#FFFFFF', dark: '#94A8B8' }, // 질풍토끼 · 흰 바람
  16: { main: '#D0341F', sub: '#FFD07A', dark: '#701208' }, // 홍염여우 · 홍염
  17: { main: '#2E8FC4', sub: '#8FE0FF', dark: '#144B6E' }, // 해류슬라임 · 심청
  18: { main: '#7A7161', sub: '#B8AE99', dark: '#403A31' }, // 바위거북 · 바위
  19: { main: '#3E5C8A', sub: '#EDE3CE', dark: '#1C2C46' }, // 창공제비 · 창공
  20: { main: '#C46A2E', sub: '#FFDDA8', dark: '#63300F' }, // 불나방 · 나방 주황
  21: { main: '#6A6055', sub: '#A79B8B', dark: '#38322B' }, // 바위두더지 · 흙바위
  // ─── 울창한 숲 ───
  22: { main: '#5B8C3A', sub: '#C2DE86', dark: '#2C4A19' }, // 덩굴뱀 · 덩굴
  23: { main: '#7C9B57', sub: '#E4A0B8', dark: '#3E5228' }, // 버섯두꺼비 · 이끼 + 버섯갓
  24: { main: '#4F6B4A', sub: '#C6C09A', dark: '#243424' }, // 늪지악어 · 늪
  25: { main: '#C7B48E', sub: '#4A4258', dark: '#6B5C3C' }, // 달빛표범 · 달빛 반점
  26: { main: '#5E4830', sub: '#9FD877', dark: '#241A0F' }, // 고대나무정령 · 고목
  27: { main: '#28502E', sub: '#F0DC8C', dark: '#0F2011' }, // 숲의수호자 · 심록 + 금
  // ─── 험준한 산맥 ───
  28: { main: '#C2B08C', sub: '#F0E6CE', dark: '#6B5D40' }, // 뿔산양 · 산양 베이지
  29: { main: '#A65438', sub: '#E0BB92', dark: '#542414' }, // 바위게 · 게 붉은 갈색
  30: { main: '#5A4F44', sub: '#EFE2C7', dark: '#2B241D' }, // 폭풍독수리 · 흑갈 + 흰 머리
  31: { main: '#E3EDF4', sub: '#B9CEDE', dark: '#7E92A2' }, // 설인 · 설백
  32: { main: '#463F32', sub: '#F2CE5C', dark: '#1C1913' }, // 산맥의패왕 · 화강암 + 금
  // ─── 불타는 화산 ───
  33: { main: '#8C3A22', sub: '#FF9A3C', dark: '#3E140A' }, // 용암달팽이
  34: { main: '#3B3843', sub: '#8E8797', dark: '#19171E' }, // 잿빛까마귀
  35: { main: '#5C3428', sub: '#FF7A2E', dark: '#28140E' }, // 마그마골렘
  36: { main: '#F2521E', sub: '#FFDE5C', dark: '#6B1704' }, // 불사조 · 화염
  37: { main: '#5E1408', sub: '#FF9E2E', dark: '#1F0602' }, // 화산의군주 · 흑요석 + 용암
  // ─── 신비한 빙산 ───
  38: { main: '#DCEAF5', sub: '#8ECBE8', dark: '#8FA6B8' }, // 얼음여우
  39: { main: '#8FA3B8', sub: '#E6EFF7', dark: '#4A586A' }, // 빙하매머드
  40: { main: '#A8E4F2', sub: '#F0FCFF', dark: '#4E8DA3' }, // 서리정령
  41: { main: '#123C54', sub: '#5FD0E0', dark: '#061620' }, // 심해리바이어던 · 심해
  42: { main: '#E4F2FC', sub: '#69A8DE', dark: '#4C6E90' }, // 빙산의여왕 · 설백 + 심청
};

const FALLBACK: SpeciesPalette = { main: '#9C8F7E', sub: '#DCD2C2', dark: '#4E463C' };

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return (
    '#' +
    [c(ar, br), c(ag, bg), c(ab, bb)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export interface PetPalette {
  /** 몸 주색 (종 색에 원소를 옅게 섞은 것) */
  main: string;
  /** 배·무늬 */
  sub: string;
  /** 발·코 */
  dark: string;
  /** 원소 강조색 — 홍채·발톱·등가시 */
  accent: string;
  /** 원소 발광색 — 림/글로우 */
  glow: string;
}

/** 종 색 + 원소 강조를 합친 최종 팔레트 */
export function petPalette(shapeId: number, element: CoreElement): PetPalette {
  const s = SPECIES_PALETTE[shapeId] ?? FALLBACK;
  const e = ELEMENT_PALETTE[element];
  return {
    main: mix(s.main, e.main, ELEMENT_MIX),
    sub: mix(s.sub, e.sub, ELEMENT_MIX * 0.7),
    dark: mix(s.dark, e.dark, ELEMENT_MIX),
    accent: e.main,
    glow: e.accent,
  };
}
