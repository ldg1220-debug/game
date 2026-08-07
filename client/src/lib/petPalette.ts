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

export type PupilShape = 'round' | 'slit' | 'horizontal' | 'dot';

export interface SpeciesPalette {
  /** 몸 주색 */
  main: string;
  /** 배·주둥이·무늬 */
  sub: string;
  /** 발·코·그림자 지는 부위 */
  dark: string;
  /**
   * 홍채 색.
   *
   * 원래 홍채에 원소 강조색을 그대로 물려 놨다. 그래서 도감에서 속성을
   * 하나 고르면 42종 눈이 전부 같은 색이 됐다 — 몸 색은 종별로 갈라 놓고
   * 눈만 원소에 묶여 있었다. 눈은 종의 인상을 정하는 부위라 종이 갖는다.
   */
  eye: string;
  /** 동공 모양. 파충류는 세로 슬릿, 초식은 가로, 새는 점. */
  pupil: PupilShape;
}

/** 원소가 몸 색에 섞이는 비율. 종 정체성을 덮지 않을 만큼만. */
const ELEMENT_MIX = 0.16;

export const SPECIES_PALETTE: Record<number, SpeciesPalette> = {
  /* 색은 제시받은 프롬프트에 적힌 것을 그대로 옮겼다. */
  // ─── 푸른 초원 ───
  1: { main: '#F4F1EC', sub: '#FFFFFF', dark: '#B8B0A4', eye: '#D8342E', pupil: 'round' }, // 왕관토끼 · 흰 토끼 + 빨간 눈
  2: { main: '#C6CBD4', sub: '#FFFFFF', dark: '#6E7684', eye: '#D8342E', pupil: 'slit' }, // 구름여우 · 은색 + 빨간 눈
  3: { main: '#4FA8E0', sub: '#B8E4FA', dark: '#1F5E8C', eye: '#F0A020', pupil: 'slit' }, // 파란공룡 · 밝은 파랑 + 주황 볏
  4: { main: '#F08A2E', sub: '#FFE0A0', dark: '#8C4408', eye: '#3A2A18', pupil: 'round' }, // 가시거북 · 주황 + 크림 껍질
  5: { main: '#F0A0C0', sub: '#FFF4E8', dark: '#96506E', eye: '#C8342E', pupil: 'dot' }, // 분홍하피 · 분홍 깃 + 크림 날개
  6: { main: '#F4F4F4', sub: '#FFFFFF', dark: '#1E1E22', eye: '#2B2118', pupil: 'horizontal' }, // 젖소 · 흑백 + 노란 뿔
  7: { main: '#F0D035', sub: '#FFFFFF', dark: '#8C6A10', eye: '#3A2E1E', pupil: 'dot' }, // 노란테이퍼 · 밝은 노랑 + 흰 앞발
  8: { main: '#FAFAFA', sub: '#FFFFFF', dark: '#1A1A1E', eye: '#3A8ED0', pupil: 'slit' }, // 백호새끼 · 흰 호랑이
  9: { main: '#F07020', sub: '#FFE05C', dark: '#8C3208', eye: '#E8A020', pupil: 'slit' }, // 주황잎공룡 · 주황 + 노란 잎판
  10: { main: '#6E7684', sub: '#C4CAD4', dark: '#26292E', eye: '#E8C13A', pupil: 'round' }, // 회색박쥐 · 회색 깃 + 검은 가슴
  11: { main: '#F4C8D4', sub: '#FFFFFF', dark: '#A87888', eye: '#3A8ED0', pupil: 'horizontal' }, // 점박이사슴 · 연분홍 + 파란 반점
  12: { main: '#5A5A62', sub: '#C8A882', dark: '#1E1E24', eye: '#E8C13A', pupil: 'round' }, // 늑대인간 · 회검정 털 + 황갈 피부
  13: { main: '#2E7AC4', sub: '#FFF0A0', dark: '#123E6E', eye: '#FF8020', pupil: 'round' }, // 불꽃펭귄 · 파란 몸 + 화염 볏
  14: { main: '#3A4048', sub: '#2E9EA8', dark: '#14181C', eye: '#D8342E', pupil: 'slit' }, // 현무 · 진회색 + 청록 껍질
  15: { main: '#D8B87A', sub: '#FFFFFF', dark: '#7A5E2E', eye: '#C8A83A', pupil: 'horizontal' }, // 황갈염소 · 황갈 + 흰 턱수염
  16: { main: '#D8342E', sub: '#F09020', dark: '#7A0E08', eye: '#E8C13A', pupil: 'round' }, // 빨간랩터 · 빨강 + 주황 깃볏
  17: { main: '#2E6ECC', sub: '#F0D035', dark: '#123A6E', eye: '#0E2E4E', pupil: 'round' }, // 블루소드피시 · 파랑 + 노란 줄무늬
  18: { main: '#4E8C3A', sub: '#5A5A62', dark: '#1E3E14', eye: '#E8DCC0', pupil: 'horizontal' }, // 뿔녹색거북 · 녹색 + 진회 껍질
  19: { main: '#8ECBE8', sub: '#FFFFFF', dark: '#3A6E8C', eye: '#E8C13A', pupil: 'slit' }, // 파란비룡 · 연파랑
  20: { main: '#4E9E4A', sub: '#F0D035', dark: '#1E4A1C', eye: '#E8A020', pupil: 'slit' }, // 초록공룡 · 녹색 + 노란금 줄무늬
  21: { main: '#7A5230', sub: '#D8B060', dark: '#3A2410', eye: '#3A2A18', pupil: 'round' }, // 갈색불곰 · 갈색 + 노란 주둥이
  // ─── 울창한 숲 ───
  22: { main: '#5AA83A', sub: '#FFFFFF', dark: '#2A5E18', eye: '#3A2E1E', pupil: 'horizontal' }, // 파라마 · 녹색 털 + 흰 대파
  23: { main: '#2E5EA8', sub: '#F0E8A0', dark: '#0E2A5A', eye: '#E0567A', pupil: 'round' }, // 파란혀괴수 · 진파랑 + 연노랑 배
  24: { main: '#C4342E', sub: '#F07050', dark: '#6E0E08', eye: '#C8A83A', pupil: 'slit' }, // 빨간돛악어 · 빨강 돛
  25: { main: '#F0C020', sub: '#FFF0C0', dark: '#5A3A10', eye: '#4A9E5E', pupil: 'slit' }, // 앉은치타 · 노랑 + 진갈 반점
  26: { main: '#4EAA2E', sub: '#E8C13A', dark: '#1E4A10', eye: '#E8C13A', pupil: 'round' }, // 녹색털야수 · 녹색 털 + 금 뿔
  27: { main: '#B08A5A', sub: '#F0D860', dark: '#5A3E20', eye: '#3A2E1E', pupil: 'horizontal' }, // 트리케라톱스 · 탄갈 + 노란 프릴
  // ─── 험준한 산맥 ───
  28: { main: '#F08A2E', sub: '#C4B8A8', dark: '#7A3A08', eye: '#E8C13A', pupil: 'horizontal' }, // 뿔사슴염소 · 주황 + 은빛 뿔
  29: { main: '#7A8A70', sub: '#B8E0F4', dark: '#3A4A34', eye: '#3A8ED0', pupil: 'round' }, // 얼음껍질짐승 · 이끼 + 얼음판
  30: { main: '#3A3A42', sub: '#8A8A96', dark: '#141418', eye: '#E02020', pupil: 'round' }, // 검은악몽페가수스
  31: { main: '#F0C020', sub: '#FFFFFF', dark: '#7A5E08', eye: '#3A2A18', pupil: 'round' }, // 노란털야수 · 노랑 털 + 흰 가슴
  32: { main: '#FAFAFA', sub: '#FFFFFF', dark: '#1A1A1E', eye: '#3A8ED0', pupil: 'slit' }, // 백호 · 흰 호랑이 + 검은 줄
  // ─── 불타는 화산 ───
  33: { main: '#A81E1E', sub: '#2E6ECC', dark: '#520808', eye: '#E8C13A', pupil: 'round' }, // 붉은가시멧돼지 · 진홍 + 파란 가시
  34: { main: '#8A8A94', sub: '#1E1E24', dark: '#3A3A42', eye: '#E8C13A', pupil: 'round' }, // 회색이족공룡 · 회색 + 검은 칼라
  35: { main: '#F05A20', sub: '#A81E1E', dark: '#7A2408', eye: '#E8C13A', pupil: 'slit' }, // 붉은얼룩드래곤
  36: { main: '#F2521E', sub: '#FFDE5C', dark: '#6B1704', eye: '#FFDE5C', pupil: 'round' }, // 봉황 · 화염 깃
  37: { main: '#E04010', sub: '#F0D035', dark: '#7A1404', eye: '#FFDE5C', pupil: 'slit' }, // 여의주동양룡 · 주황빨강 + 노란 수염
  // ─── 신비한 빙산 ───
  38: { main: '#F4F0E4', sub: '#FFFFFF', dark: '#A89E8A', eye: '#3A2A18', pupil: 'round' }, // 북극곰 · 크림흰 털
  39: { main: '#5A9ED8', sub: '#FFFFFF', dark: '#1E4A7A', eye: '#3A2A18', pupil: 'round' }, // 파란맘모스 · 밝은 파랑 + 흰 상아
  40: { main: '#F0EEE4', sub: '#3AC8F0', dark: '#8A8878', eye: '#3AC8F0', pupil: 'round' }, // 사이보그드래곤 · 흰크림 + 파란 발광
  41: { main: '#A8DCF4', sub: '#FFFFFF', dark: '#3A7096', eye: '#3AC8F0', pupil: 'slit' }, // 얼음드래곤 · 연파랑 + 흰 털
  42: { main: '#8ECBE8', sub: '#FFFFFF', dark: '#2E6E96', eye: '#E8C13A', pupil: 'slit' }, // 청룡 · 연파랑 + 흰 갈기 + 금 뿔
};

const FALLBACK: SpeciesPalette = { main: '#9C8F7E', sub: '#DCD2C2', dark: '#4E463C', eye: '#3A2E22', pupil: 'round' };

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
  /** 종 고유 홍채 색 */
  eye: string;
  /** 종 고유 동공 모양 */
  pupil: PupilShape;
}

/**
 * 채도를 올린다.
 *
 * 원본 스톤에이지 도감을 보면 색이 원색에 가깝고 명암 단계가 뚜렷하다.
 * 자연색에 가깝게 잡은 종 색은 3D 조명 아래에서 한 번 더 탁해져, 나란히
 * 놓으면 원본보다 눅눅해 보였다.
 */
function saturate(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(l + (x - l) * k)));
  return '#' + [c(r), c(g), c(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const SATURATION = 1.3;

/** 종 색 + 원소 강조를 합친 최종 팔레트 */
export function petPalette(shapeId: number, element: CoreElement): PetPalette {
  const sat = SPECIES_PALETTE[shapeId] ?? FALLBACK;
  const s = sat;
  const e = ELEMENT_PALETTE[element];
  return {
    main: saturate(mix(s.main, e.main, ELEMENT_MIX), SATURATION),
    // 배는 원본처럼 확실히 밝게 갈라야 형태가 읽힌다
    sub: saturate(mix(s.sub, e.sub, ELEMENT_MIX * 0.7), SATURATION * 0.85),
    dark: saturate(mix(s.dark, e.dark, ELEMENT_MIX), SATURATION),
    accent: e.main,
    glow: e.accent,
    // 눈은 종이 정한다. 원소는 아주 옅게만 섞어 속성 힌트를 남긴다.
    eye: mix(sat.eye, e.main, 0.12),
    pupil: sat.pupil,
  };
}
