import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CoreElement } from '../lib/gameTypes';
import { petPalette, type PetPalette } from '../lib/petPalette';
import { petMaterial, type SurfaceKind } from '../lib/petTexture';

/**
 * 3D 펫 렌더러.
 *
 * 평면 SVG로는 볼륨이 나오지 않아 원본 스톤에이지와 격차가 컸다. 외부 에셋 없이
 * 품질을 올리는 방법은 3D다 — 프리미티브를 조합해 몸을 만들고, 절차적으로 구운
 * PBR 재질과 조명 리그를 붙이면 음영·질감·접지가 공짜로 따라온다.
 *
 * 렌더러는 하나만 만들어 여러 펫이 공유한다. 캔버스마다 WebGL 컨텍스트를 잡으면
 * 도감처럼 수십 개가 한 화면에 뜰 때 컨텍스트 한도(보통 16개)에 걸린다.
 */

export type PetPose = 'idle' | 'attack' | 'hurt' | 'faint' | 'victory';

export type Horns = 'curved' | 'antler' | 'tusk' | 'crystal' | 'spike';
export type Pattern = 'spots' | 'stripes' | 'none';

/** 종별 체형. 프리미티브 조합의 파라미터. */
export interface PetBody {
  kind: 'quadruped' | 'biped' | 'blob' | 'bird' | 'shelled' | 'serpent' | 'golem';
  surface: SurfaceKind;
  /** 몸통 길이·높이·폭 배율 */
  proportions: [number, number, number];
  /**
   * 다리 길이 배율. 실루엣을 가장 크게 가르는 값이다.
   * 0.45(두더지·악어처럼 바닥에 붙음) ~ 1.5(사슴처럼 높이 섬)
   */
  legs?: number;
  /** 머리 크기 배율 */
  head?: number;
  /**
   * 네발 동물의 골격 계열. 실루엣을 정하는 가장 큰 값이다.
   * 같은 'quadruped'라도 개과와 곰과는 다른 동물로 보여야 한다.
   */
  archetype?: ArchetypeName;
  ears?: 'pointed' | 'long' | 'round' | 'none';
  /** 귀 크기 배율. 여우·사막여우는 머리에 비해 귀가 크다. */
  earScale?: number;
  tail?: 'bushy' | 'thin' | 'puff' | 'lizard' | 'none';
  horns?: Horns;
  /** 주둥이 길이 0(뭉툭)~1(길다) */
  snout?: number;
  /** 갈기 유무 */
  mane?: boolean;
  build?: 'slim' | 'sturdy';
  /** 등가시 */
  spikes?: boolean;
  /** 몸 무늬 */
  pattern?: Pattern;
  /** 원소 발광 코어 (정령·반딧불이류) */
  glow?: boolean;
  /** 버섯 갓 같은 머리 장식 */
  cap?: boolean;
  /**
   * 머리~목덜미 볏. 레퍼런스에서 실루엣을 가장 강하게 잡아주는 장식이다.
   * flame은 불꽃, feather는 깃털 부채, fin은 물갈퀴 지느러미.
   */
  crest?: 'flame' | 'feather' | 'fin';
  /** 등판 (스테고사우루스식 판) */
  plates?: boolean;
  /** 옆지느러미 */
  fins?: boolean;
  /** 긴 코 (매머드) */
  trunk?: boolean;

  /*
   * ── 격(格)을 만드는 부위 ──
   * 여기까지는 "무슨 동물인가"를 정하는 값이고, 아래는 "얼마나 강한가"를
   * 정한다. 보스와 일반 펫이 화면에서 같은 크기·같은 실루엣으로 나오면
   * 그림만 봐서는 무엇이 강한지 알 수 없다.
   */
  /** 날개 — 실루엣을 가장 크게 키운다 */
  wings?: 'membrane' | 'feather';
  /** 어깨·등 장갑판 */
  armor?: boolean;
  /** 몸 주위를 도는 원소 고리 */
  aura?: boolean;
  /** 머리 위 관 */
  crown?: boolean;
  /** 입 밖으로 나온 송곳니 */
  fangs?: boolean;
  /** 눈을 발광시킨다 (보스) */
  fieryEyes?: boolean;
  /**
   * 화면에서 차지하는 크기. 크기 보정이 모두를 같은 외접구에 맞추는 탓에
   * 보스도 토끼와 같은 크기로 찍혔다. 이 값으로 등급 차이를 만든다.
   */
  presence?: number;
}

let shared: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} | null = null;

function getShared() {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // 조명 리그: 키 + 필 + 반사광. 이게 볼륨을 만든다.
  const key = new THREE.DirectionalLight(0xfff4e0, 2.5);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  const c = key.shadow.camera as THREE.OrthographicCamera;
  c.left = -3;
  c.right = 3;
  c.top = 3;
  c.bottom = -3;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.75);
  fill.position.set(-4, 2, 2);
  scene.add(fill);

  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a2416, 0.8));

  // 림 라이트 — 어두운 배경에서 실루엣을 떼어낸다
  const rim = new THREE.DirectionalLight(0xffe0b0, 1.5);
  rim.position.set(-2.5, 2.4, -5);
  scene.add(rim);

  /*
   * 절차적 환경맵. envMap이 없으면 MeshStandardMaterial의 스페큘러가 거의
   * 죽어서 재질이 물감처럼 납작해진다. 하늘/지면 그라디언트를 담은 작은
   * 큐브맵을 구워 반사에 물려준다.
   */
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 64;
  envCanvas.height = 64;
  const ectx = envCanvas.getContext('2d')!;
  const eg = ectx.createLinearGradient(0, 0, 0, 64);
  eg.addColorStop(0, '#dcecff');
  eg.addColorStop(0.45, '#8fa8c8');
  eg.addColorStop(0.55, '#6b5a44');
  eg.addColorStop(1, '#2a2118');
  ectx.fillStyle = eg;
  ectx.fillRect(0, 0, 64, 64);
  const envTex = new THREE.CubeTexture([
    envCanvas, envCanvas, envCanvas, envCanvas, envCanvas, envCanvas,
  ] as unknown as HTMLCanvasElement[]);
  envTex.needsUpdate = true;
  envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(2.7, 1.5, 3.2);
  camera.lookAt(0, 0.62, 0);

  shared = { renderer, scene, camera };
  return shared;
}

/**
 * 로프트 — 곡선을 따라 타원 단면을 이어 붙인 껍질.
 *
 * 지금까지 몸통·꼬리를 구를 촘촘히 쌓아 만들었다. 그래서 실루엣이 파도처럼
 * 울퉁불퉁하고, 어떤 비율을 줘도 "점토 공을 붙인 장난감"으로 읽혔다.
 * 원본은 단면이 또렷하고 능선이 살아 있다. 단면을 직접 만들어 이어야
 * 등줄기·배 능선 같은 각이 생긴다.
 *
 * keel > 0이면 배가 아래로 뾰족해지고, ridge > 0이면 등줄기가 솟는다.
 */
function loft(
  pts: THREE.Vector3[],
  radii: number[],
  opt: { wide?: number; tall?: number; keel?: number; ridge?: number; sides?: number } = {},
): THREE.BufferGeometry {
  const N = opt.sides ?? 14;
  const wide = opt.wide ?? 1;
  const tall = opt.tall ?? 1;
  const keel = opt.keel ?? 0;
  const ridge = opt.ridge ?? 0;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t =
      i === 0 ? pts[1].clone().sub(pts[0]) :
      i === pts.length - 1 ? pts[i].clone().sub(pts[i - 1]) :
      pts[i + 1].clone().sub(pts[i - 1]);
    t.normalize();
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    const u2 = new THREE.Vector3().crossVectors(side, t).normalize();
    const r = radii[i];
    for (let j = 0; j <= N; j++) {
      const a = (j / N) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // 아래쪽은 용골처럼 좁히고 위쪽은 능선으로 세운다
      const shape = 1 + (sa < 0 ? keel * sa : ridge * sa);
      const off = side.clone().multiplyScalar(ca * r * wide * shape)
        .addScaledVector(u2, sa * r * tall * shape);
      pos.push(p.x + off.x, p.y + off.y, p.z + off.z);
      const n = off.clone().normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(j / N, i / (pts.length - 1));
    }
  }
  const ring = N + 1;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 윤곽선 — 뒤집힌 껍질(inverted hull).
 *
 * 원본은 부위마다 진한 경계가 있어 형태가 딱 끊긴다. 이쪽은 모든 부위가
 * 같은 밝기로 매끈하게 이어져 서로 녹아 버렸다. 각 메시를 법선 방향으로
 * 조금 부풀린 어두운 복제본을 뒷면만 그려 덧대면 외곽선이 생긴다.
 */
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x0d0a12, side: THREE.BackSide });

function addOutlines(group: THREE.Group, scale = 0.03) {
  const targets: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noOutline && !o.userData.noFrame) targets.push(o);
  });
  for (const m of targets) {
    m.geometry.computeBoundingSphere();
    const r = m.geometry.boundingSphere?.radius ?? 0;
    const s = Math.max(m.scale.x, m.scale.y, m.scale.z);
    // 아주 작은 부품(눈 하이라이트·발톱 끝)에 두르면 검은 점만 남는다
    if (r * s < 0.035) continue;
    const o = new THREE.Mesh(m.geometry, OUTLINE_MAT);
    o.position.copy(m.position);
    o.rotation.copy(m.rotation);
    o.quaternion.copy(m.quaternion);
    const grow = 1 + scale / Math.max(0.05, r * s);
    o.scale.set(m.scale.x * grow, m.scale.y * grow, m.scale.z * grow);
    o.renderOrder = -1;
    (m.parent ?? group).add(o);
  }
}

export type ArchetypeName =
  | 'canine' | 'feline' | 'ursine' | 'caprine' | 'lagomorph' | 'reptile';

/**
 * 골격 계열.
 *
 * spine은 [앞뒤 위치, 높이, 굵기]를 코 쪽(+x)에서 꼬리 쪽으로 나열한 것이다.
 * 이 굵기 변화가 곧 실루엣이다 — 개과는 가슴이 깊고(0.33) 허리가 잘록하며
 * (0.25) 몸이 좁고(zSquash 0.78), 곰과는 어깨에 혹이 있고(0.43) 폭이 넓다
 * (1.02). 캡슐 하나로 다 만들면 이 차이가 전부 사라진다.
 *
 * muzzle 값들은 두개골 앞에서 코까지 굵기가 줄어드는 쐐기를 만든다.
 * 여우가 여우로 보이는 건 이 쐐기가 길고 가늘기 때문이다(1.35 / 0.26).
 */
interface Archetype {
  spine: [number, number, number][];
  /** 몸통 폭 배율 */
  zSquash: number;
  shoulderT: number;
  hipT: number;
  neckLen: number;
  neckRise: number;
  neckThick: number;
  /** 두개골 x/y/z 배율 */
  skull: [number, number, number];
  /** 주둥이 길이 (두개골 반지름 대비) */
  muzzleLen: number;
  /** 주둥이 시작 굵기 */
  muzzleThick: number;
  /** 코 끝 굵기 */
  muzzleTaper: number;
  /** 주둥이가 아래로 처지는 정도 */
  muzzleDrop: number;
  legType: 'digitigrade' | 'plantigrade' | 'hoofed';
  legThick: number;
  /** 양안 간격 — 포식자는 좁고 피식자는 넓다 */
  eyeYaw: number;
  eyeSize: number;
}

export const ARCHETYPES: Record<ArchetypeName, Archetype> = {
  // 개과 — 깊은 가슴, 잘록한 허리, 좁은 몸, 길고 가는 쐐기 주둥이
  canine: {
    spine: [[0.40, 0.03, 0.24], [0.26, -0.01, 0.33], [0.04, 0.0, 0.25], [-0.16, 0.02, 0.27], [-0.36, 0.0, 0.30]],
    zSquash: 0.78, shoulderT: 0.14, hipT: 0.88, neckLen: 0.16, neckRise: 0.2, neckThick: 0.82,
    skull: [1.0, 0.84, 0.78], muzzleLen: 1.35, muzzleThick: 0.5, muzzleTaper: 0.26, muzzleDrop: 0.1,
    legType: 'digitigrade', legThick: 0.075, eyeYaw: 0.4, eyeSize: 0.24,
  },
  // 고양이과 — 등이 평평하고 몸이 길다. 주둥이는 짧고 넓다.
  feline: {
    spine: [[0.40, 0.02, 0.22], [0.24, 0.0, 0.28], [0.02, 0.01, 0.26], [-0.20, 0.01, 0.27], [-0.38, 0.0, 0.28]],
    zSquash: 0.8, shoulderT: 0.14, hipT: 0.88, neckLen: 0.12, neckRise: 0.16, neckThick: 0.85,
    skull: [0.98, 0.9, 0.94], muzzleLen: 0.5, muzzleThick: 0.6, muzzleTaper: 0.44, muzzleDrop: 0.06,
    legType: 'digitigrade', legThick: 0.072, eyeYaw: 0.36, eyeSize: 0.26,
  },
  // 곰과 — 어깨 혹, 굵은 몸통, 발바닥으로 걷는 기둥 다리
  ursine: {
    spine: [[0.34, 0.07, 0.32], [0.20, 0.11, 0.43], [-0.02, 0.05, 0.4], [-0.22, 0.0, 0.35], [-0.38, -0.03, 0.28]],
    zSquash: 1.02, shoulderT: 0.16, hipT: 0.86, neckLen: 0.06, neckRise: 0.1, neckThick: 1.0,
    skull: [1.04, 0.96, 1.0], muzzleLen: 0.8, muzzleThick: 0.64, muzzleTaper: 0.42, muzzleDrop: 0.16,
    legType: 'plantigrade', legThick: 0.088, eyeYaw: 0.46, eyeSize: 0.2,
  },
  // 우제류 — 곧은 등, 가는 발굽 다리, 옆으로 벌어진 눈
  caprine: {
    spine: [[0.38, 0.04, 0.22], [0.22, 0.05, 0.28], [0.0, 0.06, 0.27], [-0.20, 0.05, 0.27], [-0.36, 0.02, 0.24]],
    zSquash: 0.84, shoulderT: 0.14, hipT: 0.88, neckLen: 0.2, neckRise: 0.3, neckThick: 0.72,
    skull: [1.02, 0.86, 0.76], muzzleLen: 1.0, muzzleThick: 0.48, muzzleTaper: 0.34, muzzleDrop: 0.2,
    legType: 'hoofed', legThick: 0.06, eyeYaw: 0.72, eyeSize: 0.24,
  },
  // 토끼류 — 뒷다리 쪽 엉덩이가 크고 앞은 작다
  lagomorph: {
    spine: [[0.30, 0.0, 0.23], [0.16, -0.02, 0.28], [-0.04, 0.03, 0.32], [-0.20, 0.06, 0.33], [-0.34, 0.03, 0.26]],
    zSquash: 0.94, shoulderT: 0.16, hipT: 0.84, neckLen: 0.04, neckRise: 0.14, neckThick: 0.9,
    skull: [0.96, 0.94, 0.9], muzzleLen: 0.34, muzzleThick: 0.56, muzzleTaper: 0.4, muzzleDrop: 0.08,
    legType: 'digitigrade', legThick: 0.07, eyeYaw: 0.74, eyeSize: 0.26,
  },
  // 파충류 — 바닥에 붙은 납작한 몸, 길고 낮은 주둥이
  reptile: {
    spine: [[0.42, 0.0, 0.19], [0.24, -0.01, 0.26], [0.02, 0.0, 0.27], [-0.20, 0.0, 0.23], [-0.38, -0.01, 0.17]],
    zSquash: 1.08, shoulderT: 0.14, hipT: 0.88, neckLen: 0.08, neckRise: 0.02, neckThick: 0.95,
    skull: [1.2, 0.68, 0.92], muzzleLen: 1.5, muzzleThick: 0.62, muzzleTaper: 0.4, muzzleDrop: 0.04,
    legType: 'plantigrade', legThick: 0.062, eyeYaw: 0.6, eyeSize: 0.2,
  },
};

/**
 * 색 구역. 몸 전체를 한 색으로 칠하면 형태가 뭉개져서 종 구분이 안 된다.
 * 배·주둥이·발·귀안쪽을 다른 톤으로 나눠 실루엣 안에 정보를 넣는다.
 */
interface Zones {
  base: THREE.Material;
  belly: THREE.Material;
  mark: THREE.Material;
  paw: THREE.Material;
  ink: THREE.Material;
  elem: THREE.Material;
  glow: THREE.Material;
  iris: THREE.Material;
  sclera: THREE.Material;
}

const tint = (hex: string, t: number) =>
  '#' + new THREE.Color(hex).lerp(new THREE.Color(t > 0 ? 0xffffff : 0x000000), Math.abs(t)).getHexString();

function makeZones(body: PetBody, pal: PetPalette, seed: number): Zones {
  const surf = body.surface;
  /*
   * 형광 강조색을 배·주둥이 같은 넓은 면에 칠했더니 주둥이가 거대한 노란
   * 원이 되고 그 끝의 검은 코가 동공처럼 보여서 얼굴이 외눈으로 읽혔다.
   * 넓은 면은 종 색을 밝게/어둡게 민 톤으로만 쓰고, 원소 강조색은 홍채·
   * 발톱·등가시 같은 작은 부분에만 남긴다.
   */
  return {
    base: petMaterial(surf, pal.main, seed, surf === 'scale' ? 1.1 : 1.25),
    belly: petMaterial(surf, pal.sub, seed + 3, 1.1),
    mark: petMaterial(surf, tint(pal.main, -0.3), seed + 5, 1.15),
    paw: petMaterial(surf, pal.dark, seed + 11, 1.4),
    ink: new THREE.MeshStandardMaterial({ color: 0x120e1c, roughness: 0.34 }),
    elem: new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.28, metalness: 0.15 }),
    glow: new THREE.MeshStandardMaterial({
      color: pal.glow,
      emissive: new THREE.Color(pal.accent),
      emissiveIntensity: 1.4,
      roughness: 0.4,
    }),
    iris: new THREE.MeshStandardMaterial({
      color: pal.accent,
      roughness: 0.2,
      metalness: 0.1,
      // 보스는 눈이 빛난다. 작은 부위지만 격 차이가 가장 빨리 읽히는 곳이다.
      emissive: new THREE.Color(body.fieryEyes ? pal.accent : 0x000000),
      emissiveIntensity: body.fieryEyes ? 1.6 : 0,
    }),
    sclera: new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.16 }),
  };
}

/** 프리미티브를 조합해 몸을 만든다 */
function buildPet(body: PetBody, pal: PetPalette, seed: number, element: CoreElement): THREE.Group {
  const g = new THREE.Group();
  const z = makeZones(body, pal, seed);
  const [pl, ph, pw] = body.proportions;

  const add = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    pos: [number, number, number],
    rot?: [number, number, number],
    scale?: [number, number, number],
  ) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const sphere = (r: number, seg = 26) => new THREE.SphereGeometry(r, seg, seg);
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 20);
  const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);

  /** 결정적 난수 — 무늬 배치에 쓴다 */
  let rs = seed * 9301 + 49297;
  const rnd = () => ((rs = (rs * 9301 + 49297) % 233280) / 233280);

  /**
   * 얼굴.
   *
   * 눈 위치를 x/z 좌표로 직접 찍었더니 머리 옆구리에 탁구공이 붙은 꼴이 됐다.
   * 머리를 구로 보고 요/피치 각으로 표면 위 지점을 구한 뒤, 그 법선 방향으로
   * 눈알을 살짝 묻는다. 이러면 머리 크기가 달라져도 눈이 늘 정면을 본다.
   *
   * yaw는 양안 간격, pitch는 눈높이. 포식자(늑대·고양이)는 좁고 정면,
   * 피식자(토끼·양)는 넓게 벌어진다.
   */
  const face = (hx: number, hy: number, hz: number, R: number, yaw = 0.44, pitch = 0.26, er = R * 0.27) => {
    for (const side of [-1, 1]) {
      const d = new THREE.Vector3(
        Math.cos(pitch) * Math.cos(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.sin(yaw) * side,
      ).normalize();
      const r = er;
      // 눈알을 표면보다 조금 안쪽에 둬서 눈두덩에 묻히게 한다
      const c = new THREE.Vector3(hx, hy, hz).addScaledVector(d, R * 0.8);
      const at = (t: number) => c.clone().addScaledVector(d, r * t);

      /*
       * 눈두덩 + 흰자 + 홍채 + 동공 + 하이라이트 + 윗눈꺼풀.
       *
       * 눈을 작게 줄였더니 표정이 사라져 전부 밋밋해졌다. 작은 썸네일에서
       * 캐릭터를 살리는 건 눈이다. 크게 키우고, 검은 테두리(눈두덩)와
       * 윗눈꺼풀을 넣어 배경색과 상관없이 윤곽이 잡히게 한다.
       */
      /*
       * 눈에는 윤곽선을 두르지 않는다. 눈두덩이 이미 검은 테두리 역할을
       * 하는데 그 위에 외곽선까지 얹으니 눈이 검은 고리로 뭉개졌다.
       */
      const noLine = (m: THREE.Mesh) => {
        m.userData.noOutline = true;
        return m;
      };
      const socket = at(-0.2);
      const sock = noLine(add(sphere(r * 1.34, 16), z.ink, [socket.x, socket.y, socket.z]));
      sock.lookAt(socket.clone().add(d));
      sock.scale.set(1, 1, 0.4);

      const e = at(0);
      noLine(add(sphere(r, 22), z.sclera, [e.x, e.y, e.z]));
      const i2 = at(0.42);
      noLine(add(sphere(r * 0.74, 20), z.iris, [i2.x, i2.y, i2.z]));
      const p2 = at(0.66);
      noLine(add(sphere(r * 0.42, 16), z.ink, [p2.x, p2.y, p2.z]));
      const h2 = at(0.76);
      const hl = noLine(add(sphere(r * 0.28, 12), z.sclera, [h2.x, h2.y + r * 0.36, h2.z]));
      hl.castShadow = false;
      // 작은 보조 하이라이트 — 눈이 젖어 보인다
      const h3 = at(0.74);
      noLine(add(sphere(r * 0.13, 8), z.sclera, [h3.x, h3.y - r * 0.34, h3.z])).castShadow = false;

      // 윗눈꺼풀 — 눈매를 만든다
      const lid = at(0.1);
      const lidM = noLine(add(sphere(r * 1.06, 16), z.base, [lid.x, lid.y + r * 0.72, lid.z]));
      lidM.lookAt(lid.clone().add(d));
      lidM.scale.set(1, 0.62, 0.5);
    }
  };

  /** 캡슐/원기둥을 임의 방향으로 눕힌다. 캡슐의 축은 +Y다. */
  const orient = (m: THREE.Mesh, dir: THREE.Vector3) => {
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  };

  /** 뿔 — 종을 가장 빨리 구분시키는 장식 */
  const addHorns = (hx: number, hy: number, s: number) => {
    for (const side of [-1, 1]) {
      switch (body.horns) {
        case 'curved':
          // 산양 — 뒤로 말리는 나선
          for (let i = 0; i < 6; i++) {
            const t = i / 5;
            add(sphere(0.062 * s * (1 - t * 0.5), 10), z.paw, [
              hx - t * 0.26 * s + Math.sin(t * 3) * 0.06 * s,
              hy + 0.2 * s + Math.sin(t * 2.4) * 0.12 * s,
              side * (0.14 + t * 0.05) * s,
            ]);
          }
          break;
        case 'antler':
          add(capsule(0.026 * s, 0.24 * s), z.paw, [hx - 0.02, hy + 0.34 * s, side * 0.13 * s], [0, 0, side * 0.3]);
          for (const b of [0.12, 0.24]) {
            add(capsule(0.018 * s, 0.13 * s), z.paw, [
              hx - 0.08 * s, hy + 0.3 * s + b * s, side * (0.18 * s + b * 0.4),
            ], [side * 0.7, 0, side * 0.9]);
          }
          break;
        case 'crystal':
          for (let i = 0; i < 3; i++) {
            add(cone(0.05 * s * (1 - i * 0.2), (0.3 - i * 0.06) * s, 6), z.glow, [
              hx - i * 0.07 * s, hy + (0.3 + i * 0.05) * s, side * (0.12 + i * 0.05) * s,
            ], [0, 0, side * (0.2 + i * 0.25)]);
          }
          break;
        case 'tusk':
          add(capsule(0.045 * s, 0.26 * s), z.sclera, [
            hx + 0.16 * s, hy - 0.16 * s, side * 0.16 * s,
          ], [0, 0, Math.PI / 2 - 0.75]);
          break;
        case 'spike':
          add(cone(0.06 * s, 0.24 * s, 7), z.elem, [hx - 0.02, hy + 0.26 * s, side * 0.14 * s], [0, 0, side * 0.35]);
          break;
      }
    }
  };

  /** 몸통 무늬 — 표범 반점, 호랑이 줄무늬 */
  const addPattern = (cx: number, cy: number, len: number, r: number) => {
    if (!body.pattern || body.pattern === 'none') return;
    const n = body.pattern === 'spots' ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const a = rnd() * Math.PI * 2;
      const px = cx + (t - 0.5) * len;
      const py = cy + Math.sin(a) * r * 0.62;
      const pz = Math.cos(a) * r * 0.92;
      if (body.pattern === 'spots') {
        const s = add(sphere(0.052 + rnd() * 0.03, 10), z.mark, [px, py, pz]);
        s.lookAt(px * 2 - cx, py * 2 - cy, pz * 2);
        s.scale.set(1, 1, 0.28);
      } else {
        const s = add(sphere(0.09, 10), z.mark, [px, py, pz]);
        s.lookAt(px * 2 - cx, py * 2 - cy, pz * 2);
        s.scale.set(0.22, 1.15, 0.3);
      }
    }
  };

  /**
   * 날개.
   *
   * 처음엔 Shape를 만든 뒤 월드 좌표에서 회전·이동을 눈대중으로 맞췄더니
   * 날개가 등 뒤에 낀 검은 얼룩이 됐다. 날개 하나를 로컬 그룹 안에서
   * 다 만들고(막 + 뼈대), 그 그룹만 어깨에 붙여 돌린다.
   *
   * 로컬 규약: +X가 몸 바깥, +Y가 위. 그룹을 Y로 ∓90도 돌리면 +X가
   * 월드의 ∓Z(좌우 바깥)로 간다.
   */
  const addWings = (sx: number, sy: number, span: number) => {
    if (!body.wings) return;
    const membraneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint(pal.dark, 0.22)),
      roughness: 0.66,
      metalness: 0.06,
      emissive: new THREE.Color(pal.accent),
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    });

    for (const side of [-1, 1]) {
      const wing = new THREE.Group();

      if (body.wings === 'membrane') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        // 위쪽 앞전 — 손목까지 크게 뻗는다
        shape.quadraticCurveTo(span * 0.55, span * 0.62, span * 1.25, span * 0.5);
        // 아랫변에 손가락 사이 물갈퀴가 파이도록 세 번 들어간다
        shape.quadraticCurveTo(span * 0.95, span * 0.12, span * 0.82, -span * 0.02);
        shape.quadraticCurveTo(span * 0.72, span * 0.22, span * 0.55, -span * 0.14);
        shape.quadraticCurveTo(span * 0.44, span * 0.1, span * 0.26, -span * 0.22);
        shape.quadraticCurveTo(span * 0.14, span * 0.02, 0, 0);
        const w = new THREE.Mesh(new THREE.ShapeGeometry(shape, 28), membraneMat);
        w.castShadow = true;
        wing.add(w);

        // 뼈대 — 막과 같은 로컬 좌표라 어긋날 수 없다
        for (let i = 0; i < 4; i++) {
          const a = 0.42 - i * 0.22;
          const len = span * (1.2 - i * 0.22);
          const bone = new THREE.Mesh(capsule(0.02, len), z.paw);
          bone.position.set((Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2, 0.012);
          bone.rotation.z = a - Math.PI / 2;
          bone.castShadow = true;
          wing.add(bone);
        }
      } else {
        // 깃털 날개 — 길쭉한 깃을 부채꼴로 겹친다
        for (let i = 0; i < 8; i++) {
          const t = i / 7;
          const a = 0.72 - t * 1.15;
          const len = span * (1.15 - t * 0.35);
          const f = new THREE.Mesh(sphere(0.5, 10), i % 2 ? z.belly : z.mark);
          f.position.set((Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2, t * 0.03);
          f.rotation.z = a;
          f.scale.set(len * 0.5, span * 0.1, span * 0.045);
          f.castShadow = true;
          wing.add(f);
        }
      }

      // 어깨에 붙이고 바깥으로 편다. 살짝 뒤로 젖혀 앞을 가리지 않게.
      wing.position.set(sx, sy, side * 0.18);
      wing.rotation.set(0, (side * -Math.PI) / 2 + side * 0.42, 0.24);
      g.add(wing);
    }
  };

  /**
   * 볏 — 머리에서 목덜미로 뻗는 부채.
   *
   * 레퍼런스에서 실루엣을 가장 크게 잡는 게 이거다. 어떤 개체는 볏이
   * 머리보다 크다. 이쪽 모델이 밋밋했던 이유가 이런 "밖으로 뻗는" 요소가
   * 없어서였다 — 전부 매끈한 덩어리에 작은 디테일만 붙어 있었다.
   */
  const addCrest = (cx: number, cy: number, size: number, back: number) => {
    if (!body.crest) return;
    const N = body.crest === 'fin' ? 7 : 9;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      // 가운데가 가장 길고 양끝이 짧은 부채
      const len = size * (0.55 + Math.sin(t * Math.PI) * 1.05);
      const px = cx - back * t;
      const py = cy + size * 0.4;
      if (body.crest === 'flame') {
        for (const side of [-1, 0, 1]) {
          if (side !== 0 && i % 2) continue;
          const sp = add(cone(size * 0.15, len, 6), i % 2 ? z.elem : z.glow, [
            px - len * 0.1, py + len * 0.42, side * size * 0.26,
          ], [side * 0.3, 0, 0.4 + t * 0.55]);
          sp.castShadow = false;
        }
      } else if (body.crest === 'feather') {
        const fth = add(sphere(0.5, 10), i % 2 ? z.belly : z.elem, [px, py + len * 0.42, 0]);
        fth.scale.set(size * 0.13, len * 0.5, size * 0.055);
        fth.rotation.z = 0.35 + t * 0.6;
      } else {
        const fin = add(sphere(0.5, 10), z.belly, [px, py + len * 0.36, 0]);
        fin.scale.set(size * 0.1, len * 0.46, size * 0.05);
        fin.rotation.z = 0.3 + t * 0.4;
      }
    }
  };

  /** 등판 — 스테고사우루스식으로 좌우 어긋나게 세운다 */
  const addPlates = (get: (t: number) => THREE.Vector3, rad: (t: number) => number) => {
    if (!body.plates) return;
    for (let i = 0; i < 7; i++) {
      const t = 0.18 + (i / 6) * 0.62;
      const p = get(t);
      const h = rad(t) * (1.25 + Math.sin(t * Math.PI) * 0.85);
      const plate = add(new THREE.CylinderGeometry(h * 0.48, h * 0.6, 0.035, 5), z.belly, [
        p.x, p.y + rad(t) * 0.85 + h * 0.4, (i % 2 ? 1 : -1) * rad(t) * 0.22,
      ]);
      plate.rotation.set(Math.PI / 2, 0, i % 2 ? 0.18 : -0.18);
    }
  };

  /** 옆지느러미 */
  const addFins = (cx: number, cy: number, size: number) => {
    if (!body.fins) return;
    for (const side of [-1, 1]) {
      const fin = add(sphere(0.5, 12), z.belly, [cx, cy, side * size * 1.05]);
      fin.scale.set(size * 0.85, size * 0.22, size * 1.05);
      fin.rotation.set(side * 0.5, 0, -0.28);
    }
  };

  /** 긴 코 — 매머드는 코가 없으면 매머드로 안 읽힌다 */
  const addTrunk = (cx: number, cy: number, size: number) => {
    if (!body.trunk) return;
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      add(sphere(size * (0.3 - t * 0.17), 12), z.base, [
        cx + Math.sin(t * 1.4) * size * 0.42,
        cy - t * size * 1.5,
        0,
      ]);
    }
  };

  /**
   * 어깨·등 장갑판.
   *
   * 처음엔 판을 몸 중심에서 r*0.5만큼만 띄웠더니 전부 몸 안에 묻혀
   * 아무것도 안 보였다. 등 곡면 위 방향을 잡아 그 법선으로 얹는다.
   */
  const addArmor = (cx: number, cy: number, len: number, r: number) => {
    if (!body.armor) return;
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      for (const side of [-1, 1]) {
        // 등에서 옆구리로 내려오는 각도
        const a = side * (0.5 + t * 0.18);
        const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
        const plate = add(new THREE.CylinderGeometry(r * 0.3, r * 0.4, 0.06, 6), z.paw, [
          cx + (0.42 - t * 0.9) * len,
          cy + dir.y * r * 1.0,
          dir.z * r * 1.0,
        ]);
        orient(plate, dir);
      }
    }
    // 어깨 뿔 — 위로 솟아 실루엣을 깬다
    for (const side of [-1, 1]) {
      add(cone(r * 0.26, r * 0.95, 7), z.elem, [
        cx + len * 0.26, cy + r * 0.95, side * r * 0.66,
      ], [side * 0.42, 0, -0.2]);
    }
  };

  /**
   * 용암 균열 — 발광 코어가 몸 안에 있으면 밖에서 안 보인다.
   * 바위 표면에 빛나는 틈을 내야 골렘이 "속에서 타는" 것으로 읽힌다.
   */
  const addCracks = (cx: number, cy: number, len: number, r: number) => {
    if (!body.glow || body.surface !== 'rock') return;
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2;
      const t = rnd();
      const px = cx + (t - 0.5) * len;
      const py = cy + Math.sin(a) * r * 0.76;
      const pz = Math.cos(a) * r * 1.04;
      const c = add(sphere(0.085 + rnd() * 0.04, 8), z.glow, [px, py, pz]);
      c.lookAt(px * 2 - cx, py * 2 - cy, pz * 2);
      c.scale.set(0.42 + rnd() * 0.6, 1.5, 0.16);
      c.castShadow = false;
      c.userData.noFrame = true;
    }
  };

  /**
   * 원소 고리 — 강한 개체 주위를 도는 기운.
   *
   * 크기 보정이 외접구 기준이라, 고리를 몸과 같이 재면 고리가 구를 키워서
   * 정작 보스의 몸이 작게 찍혔다. 격을 세우려고 넣은 장식이 반대로 격을
   * 깎은 셈이다. noFrame으로 표시해 크기 계산에서 뺀다.
   */
  const addAura = (cy: number, r: number) => {
    if (!body.aura) return;
    for (let i = 0; i < 2; i++) {
      const ring = add(new THREE.TorusGeometry(r * (0.92 + i * 0.16), 0.02, 8, 40), z.glow, [
        0, cy + i * 0.08, 0,
      ], [Math.PI / 2 - 0.3 + i * 0.36, i * 0.6, 0.16]);
      ring.castShadow = false;
      ring.receiveShadow = false;
      ring.userData.noFrame = true;
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const orb = add(sphere(0.032, 8), z.glow, [
        Math.cos(a) * r * 1.05, cy + Math.sin(a * 2) * 0.2, Math.sin(a) * r * 1.05,
      ]);
      orb.castShadow = false;
      orb.userData.noFrame = true;
    }
  };

  /** 관 */
  const addCrown = (hx: number, hy: number, r: number) => {
    if (!body.crown) return;
    const band = add(new THREE.TorusGeometry(r * 0.62, r * 0.09, 8, 22), z.elem, [hx, hy + r * 0.72, 0], [Math.PI / 2, 0, 0]);
    band.castShadow = false;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tall = i % 2 === 0;
      add(cone(r * 0.1, r * (tall ? 0.56 : 0.34), 6), tall ? z.glow : z.elem, [
        hx + Math.cos(a) * r * 0.6,
        hy + r * (tall ? 1.0 : 0.9),
        Math.sin(a) * r * 0.6,
      ]);
    }
  };

  /** 송곳니 */
  const addFangs = (mx: number, my: number, s: number) => {
    if (!body.fangs) return;
    for (const side of [-1, 1]) {
      add(cone(0.026 * s, 0.11 * s, 6), z.sclera, [mx, my - 0.05 * s, side * 0.05 * s], [0, 0, Math.PI]);
    }
  };

  if (body.kind === 'quadruped') {
    /*
     * 네발 몸통.
     *
     * 이전에는 캡슐 하나 + 구 두 개로 모든 네발 동물을 만들었다. 그러니
     * 여우도 곰도 표범도 "둥근 동물"이었고, 다리 길이와 주둥이 길이를
     * 아무리 바꿔도 종이 아니라 같은 인형의 변주로 보였다.
     *
     * 실루엣을 만드는 건 척추 곡선과 그 위의 굵기 변화다. 개과는 가슴이
     * 깊고 허리가 잘록하며 몸이 좁다. 곰과는 어깨에 혹이 있고 폭이 넓다.
     * 그래서 종류(archetype)마다 척추 프로파일 · 두개골 비율 · 주둥이
     * 쐐기 · 다리 구조를 따로 정의하고, 몸은 그 프로파일을 따라 굵기가
     * 변하는 구를 촘촘히 놓아 만든다.
     */
    const A = ARCHETYPES[body.archetype ?? 'ursine'];
    const legs = body.legs ?? 1;
    /*
     * 몸 높이.
     *
     * 원본 스톤에이지 도감을 재보면 다리는 전체 높이의 1/4 정도이고 몸이
     * 땅에 가깝다. 해부학적으로 맞는 비율(다리가 절반)로 만들었더니 늘씬한
     * 야생동물이 나와서, 뭉툭한 원본 화풍과 결이 달랐다.
     */
    const bodyY = 0.17 + 0.26 * legs;
    const pawY = 0.085;

    // 척추를 부드러운 곡선으로. 굵기는 구간별 선형 보간.
    const spinePts = A.spine.map(([x, y]) => new THREE.Vector3(x * pl, y * ph, 0));
    const spine = new THREE.CatmullRomCurve3(spinePts, false, 'catmullrom', 0.35);
    const radiusOn = (t: number) => {
      const seg = t * (A.spine.length - 1);
      const i = Math.min(A.spine.length - 2, Math.floor(seg));
      const f = seg - i;
      // 원본은 몸이 뭉툭하다. 프로파일 굵기를 일괄로 올린다.
      return (A.spine[i][2] + (A.spine[i + 1][2] - A.spine[i][2]) * f) * pw * 1.18;
    };
    const at = (t: number) => {
      const p = spine.getPoint(Math.max(0, Math.min(1, t)));
      return new THREE.Vector3(p.x, bodyY + p.y, 0);
    };

    /*
     * 몸통은 로프트로 한 덩어리를 뽑는다.
     *
     * 구를 촘촘히 쌓았더니 실루엣이 파도처럼 울퉁불퉁하고, 어떤 비율을 줘도
     * 점토 공을 붙인 장난감으로 읽혔다. 단면을 직접 이어야 등줄기와 가슴
     * 능선이 각을 갖는다.
     */
    const SEGS = 22;
    const bodyPts: THREE.Vector3[] = [];
    const bodyR: number[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const t = i / SEGS;
      bodyPts.push(at(t));
      // 코·꼬리 끝은 좁혀 닫는다
      bodyR.push(radiusOn(t) * (0.34 + Math.sin(Math.min(1, t * 1.12) * Math.PI) * 0.72));
    }
    add(loft(bodyPts, bodyR, { wide: A.zSquash, tall: 1.04, keel: 0.14, ridge: 0.1, sides: 16 }), z.base, [0, 0, 0]);
    // 배 — 아래쪽만 밝게. 앞다리~뒷다리 사이에만 넣어 가슴선을 만든다.
    const bellyPts: THREE.Vector3[] = [];
    const bellyR: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = 0.14 + (i / 12) * 0.66;
      const p = at(t);
      bellyPts.push(new THREE.Vector3(p.x, p.y - radiusOn(t) * 0.46, 0));
      bellyR.push(radiusOn(t) * 0.56 * Math.sin((i / 12) * Math.PI) ** 0.4);
    }
    add(loft(bellyPts, bellyR, { wide: A.zSquash * 0.92, tall: 0.42, sides: 12 }), z.belly, [0, 0, 0]);
    addPattern(at(0.5).x, at(0.5).y, 0.7 * pl, radiusOn(0.5));
    addCracks(at(0.5).x, at(0.5).y, 0.8 * pl, radiusOn(0.5));

    const shoulder = at(A.shoulderT);
    const hip = at(A.hipT);
    const shoulderR = radiusOn(A.shoulderT);
    const hipR = radiusOn(A.hipT);

    if (body.mane) {
      // 갈기 — 목덜미를 감싼다
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const lump = add(sphere(shoulderR * 0.36, 12), i % 3 === 0 ? z.mark : z.belly, [
          shoulder.x + 0.04 * pl,
          shoulder.y + 0.1 + Math.sin(a) * shoulderR * 0.9,
          Math.cos(a) * shoulderR * 0.95,
        ]);
        lump.scale.set(0.42, 1, 1);
      }
    }

    /* ── 머리 ── */
    const hs = body.head ?? 1;
    // 대두 비율. 머리 지름이 몸통 길이의 절반쯤 된다.
    const headR = 0.38 * ph * hs;
    const headY = shoulder.y + A.neckRise * ph + headR * 0.5;
    const headX = shoulder.x + A.neckLen * pl + headR * 0.5;
    const skull = add(sphere(headR, 24), z.base, [headX, headY, 0]);
    skull.scale.set(...A.skull);

    // 목 — 어깨에서 두개골 뒤로 잇는다
    const neckA = new THREE.Vector3(headX - headR * 0.5, headY - headR * 0.32, 0);
    const neckB = new THREE.Vector3(shoulder.x - 0.02 * pl, shoulder.y + shoulderR * 0.2, 0);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const p = neckB.clone().lerp(neckA, t);
      const n = add(sphere(shoulderR * (0.62 - t * 0.16) * A.neckThick, 14), z.base, [p.x, p.y, 0]);
      n.scale.set(1, 1, A.zSquash);
    }

    /*
     * 주둥이.
     *
     * 구 + 캡슐을 따로 붙이면 "공에 소시지를 꽂은" 모양이 된다. 두개골
     * 앞면에서 시작해 굵기가 줄어드는 구를 이어 놓아야 하나의 쐐기로
     * 읽힌다. 여우가 여우로 보이는 건 이 쐐기 각도 때문이다.
     */
    const mLen = A.muzzleLen * headR * (0.6 + (body.snout ?? 0.5) * 0.8);
    const mSteps = 10;
    let noseX = headX;
    let noseY = headY;
    for (let i = 0; i <= mSteps; i++) {
      const t = i / mSteps;
      const r = headR * (A.muzzleThick + (A.muzzleTaper - A.muzzleThick) * t);
      const x = headX + headR * A.skull[0] * 0.42 + mLen * t;
      const y = headY - headR * 0.22 - mLen * t * A.muzzleDrop;
      const m = add(sphere(r, 14), i > mSteps * 0.82 ? z.belly : z.base, [x, y, 0]);
      m.scale.set(1, 0.94, 0.86);
      noseX = x;
      noseY = y;
    }
    add(sphere(headR * A.muzzleTaper * 0.78, 12), z.ink, [noseX + headR * 0.06, noseY + headR * 0.05, 0]);
    /*
     * 입.
     *
     * 원본 도감을 보면 거의 모든 펫이 입을 벌리고 이빨을 드러낸다. 이게
     * 캐릭터성의 큰 부분인데 이쪽은 입선 하나뿐이라 표정이 없었다.
     * 초식·소형종(토끼·산양)은 다물린 입선을 유지한다.
     */
    const openMouth = A.legType !== 'hoofed' && body.archetype !== 'lagomorph';
    const mouthX = noseX - mLen * 0.34;
    const mouthY = noseY - headR * 0.24;
    if (openMouth) {
      const cavity = add(sphere(headR * 0.24, 16), z.ink, [mouthX, mouthY, 0]);
      cavity.scale.set(0.95, 0.58, 0.78);
      // 혀
      const tongue = add(sphere(headR * 0.13, 12), z.elem, [mouthX + headR * 0.05, mouthY - headR * 0.05, 0]);
      tongue.scale.set(1.1, 0.34, 0.8);
      // 윗니 — 벌린 입 위쪽에 줄지어 붙는다
      // 처음엔 이빨을 크게 냈더니 주둥이 끝이 흰 덩어리로 뭉쳤다
      for (const k of [-1.3, -0.45, 0.45, 1.3]) {
        add(cone(headR * 0.032, headR * 0.1, 6), z.sclera, [
          mouthX + headR * 0.16, mouthY + headR * 0.13, k * headR * 0.1,
        ], [0, 0, Math.PI]);
      }
      // 아랫니
      for (const k of [-0.85, 0.85]) {
        add(cone(headR * 0.028, headR * 0.09, 6), z.sclera, [
          mouthX + headR * 0.14, mouthY - headR * 0.14, k * headR * 0.1,
        ]);
      }
    } else {
      add(new THREE.TorusGeometry(headR * 0.16, 0.01, 6, 14, Math.PI), z.ink, [
        mouthX, mouthY, 0,
      ], [Math.PI / 2, 0, Math.PI]);
    }
    addFangs(noseX - mLen * 0.18, noseY - headR * 0.18, hs);

    // 눈 — 포식자는 정면에 모이고, 초식·피식자는 옆으로 벌어진다
    face(headX, headY + headR * 0.18, 0, headR, A.eyeYaw, 0.2, headR * A.eyeSize * 1.18);
    for (const side of [-1, 1]) {
      add(capsule(0.02, headR * 0.3), z.mark, [
        headX + headR * 0.42, headY + headR * 0.5, side * headR * 0.5,
      ], [0, 0, 1.25]);
    }

    /* ── 귀 ── */
    const es = (body.earScale ?? 1) * hs;
    if (body.ears === 'pointed') {
      for (const side of [-1, 1]) {
        // 여우 귀는 머리에 비해 크고 뒤로 살짝 눕는다
        add(cone(0.42 * headR * es, 1.05 * headR * es, 10), z.base, [
          headX - headR * 0.24, headY + headR * 0.78 * es, side * headR * 0.5,
        ], [0, 0, side * 0.2]);
        add(cone(0.24 * headR * es, 0.72 * headR * es, 10), z.belly, [
          headX - headR * 0.18, headY + headR * 0.76 * es, side * headR * 0.56,
        ], [0, 0, side * 0.2]);
      }
    } else if (body.ears === 'long') {
      for (const side of [-1, 1]) {
        const ear = add(capsule(0.075 * es, 0.38 * es), z.base, [
          headX - headR * 0.3, headY + headR * 1.5 * es, side * headR * 0.45,
        ], [0, 0, side * 0.2]);
        ear.scale.set(0.66, 1, 1);
        const inner = add(capsule(0.04 * es, 0.3 * es), z.belly, [
          headX - headR * 0.26, headY + headR * 1.5 * es, side * headR * 0.52,
        ], [0, 0, side * 0.2]);
        inner.scale.set(0.6, 1, 1);
      }
    } else if (body.ears === 'round') {
      for (const side of [-1, 1]) {
        const ear = add(sphere(0.34 * headR * es, 14), z.base, [
          headX - headR * 0.3, headY + headR * 0.82, side * headR * 0.68,
        ]);
        ear.scale.set(0.4, 1, 1);
        const inner = add(sphere(0.2 * headR * es, 12), z.belly, [
          headX - headR * 0.26, headY + headR * 0.82, side * headR * 0.72,
        ]);
        inner.scale.set(0.3, 1, 1);
      }
    }
    addHorns(headX, headY, hs);
    addCrown(headX, headY, headR);

    /* ── 다리 ──
     * 발가락으로 걷는 개·고양이과(digitigrade)는 뒤꿈치가 들려 무릎이
     * 두 번 꺾이고, 발바닥으로 걷는 곰과(plantigrade)는 굵은 기둥에
     * 넓은 발이다. 발굽류는 가늘고 곧다. 이 차이가 걸음새를 만든다.
     */
    const legPairs: [THREE.Vector3, number, number][] = [
      [shoulder, shoulderR, 1],
      [hip, hipR, -1],
    ];
    for (const [anchor, ar, front] of legPairs) {
      for (const side of [-1, 1]) {
        const zz = side * ar * A.zSquash * 0.78;
        const topY = anchor.y - ar * 0.3;
        const span = Math.max(0.14, topY - pawY);
        // 레퍼런스는 다리가 굵고 발이 크다
        const t = A.legThick * 1.45 * (body.build === 'sturdy' ? 1.18 : 0.92);

        if (A.legType === 'plantigrade') {
          const up = add(capsule(t * 1.15, span * 0.42), z.base, [anchor.x, pawY + span * 0.72, zz]);
          up.scale.set(1, 1, 1.1);
          add(capsule(t * 1.0, span * 0.42), z.base, [anchor.x + 0.01, pawY + span * 0.28, zz]);
          const foot = add(sphere(t * 1.5, 16), z.paw, [anchor.x + t * 0.9, pawY - 0.01, zz]);
          foot.scale.set(1.25, 0.5, 1.0);
          for (const k of [-1, 0, 1]) {
            add(cone(t * 0.26, t * 0.6, 6), z.elem, [
              anchor.x + t * 2.1, pawY - 0.012, zz + k * t * 0.62,
            ], [0, 0, -Math.PI / 2]);
          }
        } else if (A.legType === 'hoofed') {
          add(capsule(t * 0.95, span * 0.4), z.base, [anchor.x, pawY + span * 0.74, zz]);
          add(capsule(t * 0.58, span * 0.46), z.base, [anchor.x + front * 0.02, pawY + span * 0.3, zz]);
          add(cone(t * 0.8, t * 1.5, 8), z.paw, [anchor.x, pawY + t * 0.4, zz], [Math.PI, 0, 0]);
        } else {
          // digitigrade — 허벅지 / 정강이 / 들린 뒤꿈치 / 작은 발
          const thigh = add(capsule(t * 1.15, span * 0.34), z.base, [
            anchor.x - front * 0.02 * pl, pawY + span * 0.76, zz,
          ], [0, 0, front * 0.2]);
          thigh.scale.set(1, 1, 1.15);
          add(capsule(t * 0.78, span * 0.32), z.base, [
            anchor.x + front * 0.035 * pl, pawY + span * 0.46, zz,
          ], [0, 0, -front * 0.28]);
          add(capsule(t * 0.56, span * 0.28), z.base, [
            anchor.x, pawY + span * 0.2, zz,
          ], [0, 0, front * 0.12]);
          const paw = add(sphere(t * 1.0, 14), z.paw, [anchor.x + t * 0.5, pawY - 0.005, zz]);
          paw.scale.set(1.3, 0.62, 0.95);
          for (const k of [-1, 0, 1]) {
            add(sphere(t * 0.32, 10), z.paw, [anchor.x + t * 1.2, pawY - 0.012, zz + k * t * 0.5]);
            add(cone(t * 0.16, t * 0.42, 6), z.elem, [
              anchor.x + t * 1.7, pawY - 0.016, zz + k * t * 0.5,
            ], [0, 0, -Math.PI / 2]);
          }
        }
      }
    }

    // 등가시 / 등털
    for (let i = 0; i < 6; i++) {
      const t = 0.18 + (i / 5) * 0.6;
      const p = at(t);
      add(cone(0.045 - i * 0.004, body.spikes ? 0.2 : 0.12, 6), body.spikes ? z.elem : z.mark, [
        p.x, p.y + radiusOn(t) * 0.95, 0,
      ], [0, 0, 0.18]);
    }

    /* ── 꼬리 ──
     * 여우 꼬리는 몸통만큼 길고 굵어야 여우로 읽힌다. 굵기가 변하는
     * 구를 곡선을 따라 놓아 붓 모양을 만든다.
     */
    const tailBase = at(1);
    const tailChain = (len: number, r0: number, r1: number, lift: number, tipMat: THREE.Material) => {
      const N = 14;
      const pts: THREE.Vector3[] = [];
      const rs: number[] = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const bulge = Math.sin(t * Math.PI) * 0.42 + 1;
        rs.push((r0 + (r1 - r0) * t) * bulge * (i === N ? 0.2 : 1));
        pts.push(new THREE.Vector3(
          tailBase.x - len * t,
          // 밑동만 살짝 들고 뒤로 흐른다
          tailBase.y + Math.sin(t * Math.PI * 0.55) * lift - t * t * lift * 0.9,
          0,
        ));
      }
      add(loft(pts, rs, { wide: 0.95, tall: 1.05, ridge: 0.12, sides: 12 }), z.base, [0, 0, 0]);
      // 꼬리 끝 색 구분
      const tip = add(sphere(rs[N - 2] * 1.02, 14), tipMat, [pts[N - 2].x, pts[N - 2].y, 0]);
      tip.scale.set(1.3, 1, 0.95);
    };
    if (body.tail === 'bushy') {
      tailChain(0.8 * pl, hipR * 0.95, hipR * 0.5, 0.16, z.belly);
    } else if (body.tail === 'thin') {
      tailChain(0.8 * pl, hipR * 0.24, hipR * 0.11, 0.3, z.belly);
    } else if (body.tail === 'puff') {
      const p = add(sphere(hipR * 0.62, 16), z.belly, [tailBase.x - 0.06 * pl, tailBase.y + 0.02, 0]);
      p.scale.set(0.9, 1, 1);
    } else if (body.tail === 'lizard') {
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        add(sphere(hipR * (0.72 - t * 0.62), 12), i % 2 ? z.base : z.mark, [
          tailBase.x - 0.9 * pl * t,
          tailBase.y - (tailBase.y - pawY - 0.04) * t * t,
          0,
        ]);
      }
    }

    if (body.glow && body.surface !== 'rock') {
      const core = add(sphere(0.12, 16), z.glow, [at(0.55).x, at(0.55).y - radiusOn(0.55) * 0.4, 0]);
      core.castShadow = false;
    }

    addCrest(headX - headR * 0.3, headY + headR * 0.3, headR * 1.15, 0.5 * pl);
    addPlates(at, radiusOn);
    addFins(at(0.45).x, at(0.45).y - radiusOn(0.45) * 0.3, radiusOn(0.45) * 1.1);
    addTrunk(noseX + headR * 0.1, noseY - headR * 0.1, headR);
    addArmor(at(0.5).x, at(0.5).y, 0.8 * pl, radiusOn(0.5));
    addWings(at(0.34).x, at(0.34).y + radiusOn(0.34) * 0.7, 0.95);
    addAura(bodyY, Math.max(0.5 * pl, radiusOn(0.5) * 1.35));
  } else if (body.kind === 'biped') {
    /*
     * 이족보행.
     *
     * 레퍼런스 32장 중 8장이 두 발로 선다 — 화염 도마뱀, 랩터, 수탉,
     * 갑옷 거수. 이쪽 42종에는 이족이 하나도 없어서, 비율과 색을 아무리
     * 맞춰도 원본과 결이 달랐다.
     *
     * 서 있는 몸은 네발과 균형이 완전히 다르다. 무거운 머리를 앞으로
     * 내밀고 꼬리를 뒤로 뻗어 축을 맞춘다. 다리는 몸통 아래 한가운데,
     * 팔은 짧고 몸에 붙는다.
     */
    const hipY = 0.5 * ph;
    const bodyH = 0.62 * ph;
    const bs = 0.3 * pw;

    // 몸통 — 배가 굵고 어깨로 갈수록 좁아지며 앞으로 기운다
    const lean = 0.3;
    const TORSO = [1.15, 1.2, 1.0, 0.82];
    const spinePt = (t: number) => new THREE.Vector3(
      Math.sin(lean) * bodyH * t,
      hipY + Math.cos(lean) * bodyH * t,
      0,
    );
    const torsoR = (t: number) => {
      const seg = t * (TORSO.length - 1);
      const k = Math.min(TORSO.length - 2, Math.floor(seg));
      return bs * (TORSO[k] + (TORSO[k + 1] - TORSO[k]) * (seg - k));
    };
    const tPts: THREE.Vector3[] = [];
    const tR: number[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      tPts.push(spinePt(t));
      tR.push(torsoR(t) * (i === 0 ? 0.55 : i === 14 ? 0.7 : 1));
    }
    add(loft(tPts, tR, { wide: 0.9, tall: 1.02, keel: 0.12, ridge: 0.08, sides: 16 }), z.base, [0, 0, 0]);
    // 배 판 — 레퍼런스는 배가 확실히 밝은 다른 색이다
    const bPts: THREE.Vector3[] = [];
    const bR: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = 0.08 + (i / 10) * 0.78;
      const p = spinePt(t);
      bPts.push(new THREE.Vector3(p.x + torsoR(t) * 0.44, p.y, 0));
      bR.push(torsoR(t) * 0.5 * Math.sin((i / 10) * Math.PI) ** 0.35);
    }
    add(loft(bPts, bR, { wide: 0.72, tall: 0.95, sides: 12 }), z.belly, [0, 0, 0]);

    /* 머리 — 전체 높이의 40% 가까이 되는 대두 */
    const headR = 0.34 * ph * (body.head ?? 1);
    const top = spinePt(1);
    const headX = top.x + headR * 0.42;
    const headY = top.y + headR * 0.62;
    const skull = add(sphere(headR, 24), z.base, [headX, headY, 0]);
    skull.scale.set(1.02, 0.94, 0.92);
    // 목
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      add(sphere(bs * (0.62 - t * 0.1), 14), z.base, [
        top.x + (headX - top.x) * t, top.y + (headY - top.y) * t - headR * 0.3, 0,
      ]);
    }

    // 주둥이 — 앞으로 뻗는 쐐기
    const mLen = headR * (0.5 + (body.snout ?? 0.5) * 1.1);
    let noseX = headX;
    let noseY = headY;
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      const r = headR * (0.5 - t * 0.28);
      noseX = headX + headR * 0.5 + mLen * t;
      noseY = headY - headR * 0.16 - mLen * t * 0.12;
      const m = add(sphere(r, 14), t > 0.8 ? z.belly : z.base, [noseX, noseY, 0]);
      m.scale.set(1, 0.92, 0.86);
    }
    add(sphere(headR * 0.075, 10), z.ink, [noseX + headR * 0.1, noseY + headR * 0.06, 0]);

    // 벌린 입 + 이빨
    const mx = noseX - mLen * 0.3;
    const my = noseY - headR * 0.2;
    const cav = add(sphere(headR * 0.22, 16), z.ink, [mx, my, 0]);
    cav.scale.set(0.95, 0.6, 0.78);
    for (const k of [-1.2, -0.4, 0.4, 1.2]) {
      add(cone(headR * 0.03, headR * 0.1, 6), z.sclera, [
        mx + headR * 0.14, my + headR * 0.12, k * headR * 0.09,
      ], [0, 0, Math.PI]);
    }
    addFangs(mx, my, 1);

    face(headX, headY + headR * 0.16, 0, headR, 0.42, 0.18, headR * 0.3);

    /* 다리 — 굵고 짧다. 발이 크다. */
    for (const side of [-1, 1]) {
      const zz = side * bs * 0.62;
      const span = hipY - 0.09;
      const thigh = add(capsule(bs * 0.44, span * 0.4), z.base, [0.02, hipY - span * 0.24, zz], [0, 0, 0.18]);
      thigh.scale.set(1, 1, 1.05);
      add(capsule(bs * 0.32, span * 0.4), z.base, [-0.03, hipY - span * 0.62, zz], [0, 0, -0.16]);
      const foot = add(sphere(bs * 0.46, 16), z.paw, [0.05, 0.075, zz]);
      foot.scale.set(1.5, 0.5, 1.0);
      for (const k of [-1, 0, 1]) {
        add(sphere(bs * 0.17, 10), z.paw, [0.05 + bs * 0.5, 0.06, zz + k * bs * 0.24]);
        add(cone(bs * 0.08, bs * 0.24, 6), z.elem, [
          0.05 + bs * 0.78, 0.055, zz + k * bs * 0.24,
        ], [0, 0, -Math.PI / 2]);
      }
    }

    /* 팔 — 짧고 몸에 붙는다 */
    for (const side of [-1, 1]) {
      const sp = spinePt(0.82);
      const zz = side * (torsoR(0.82) + bs * 0.16);
      add(capsule(bs * 0.24, bs * 0.5), z.base, [sp.x + bs * 0.1, sp.y - bs * 0.42, zz], [0, 0, 0.5]);
      add(capsule(bs * 0.18, bs * 0.42), z.base, [sp.x + bs * 0.42, sp.y - bs * 0.82, zz], [0, 0, -0.5]);
      const hand = add(sphere(bs * 0.24, 12), z.paw, [sp.x + bs * 0.6, sp.y - bs * 1.05, zz]);
      hand.scale.set(1, 1.1, 0.9);
      for (const k of [-1, 0, 1]) {
        add(cone(bs * 0.07, bs * 0.24, 6), z.elem, [
          sp.x + bs * 0.72, sp.y - bs * 1.24, zz + k * bs * 0.14,
        ], [0, 0, Math.PI - 0.3]);
      }
    }

    /* 꼬리 — 뒤로 뻗어 앞으로 기운 상체와 축을 맞춘다 */
    const btPts: THREE.Vector3[] = [];
    const btR: number[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      btR.push(bs * (0.72 - t * 0.62) * (i === 14 ? 0.25 : 1));
      btPts.push(new THREE.Vector3(-t * 0.92 * pl, hipY - t * t * (hipY - 0.12) * 0.85, 0));
    }
    add(loft(btPts, btR, { wide: 0.92, tall: 1.05, ridge: 0.16, sides: 12 }), z.base, [0, 0, 0]);

    // 등가시
    if (body.spikes) {
      for (let i = 0; i < 6; i++) {
        const t = 0.2 + (i / 5) * 0.7;
        const p = spinePt(t);
        add(cone(bs * 0.16, bs * 0.5, 6), z.elem, [
          p.x - torsoR(t) * 0.5, p.y, 0,
        ], [0, 0, -0.9]);
      }
    }

    if (body.ears === 'pointed') {
      for (const side of [-1, 1]) {
        add(cone(headR * 0.24, headR * 0.72, 10), z.base, [
          headX - headR * 0.28, headY + headR * 0.7, side * headR * 0.42,
        ], [0, 0, side * 0.2]);
      }
    }
    addHorns(headX, headY, headR * 3.2);
    addCrest(headX - headR * 0.5, headY + headR * 0.34, headR * 1.2, 0.5 * ph);
    addPlates((t) => spinePt(t), (t) => torsoR(t));
    addCrown(headX, headY, headR);
    addArmor(spinePt(0.6).x, spinePt(0.6).y, 0.3 * ph, torsoR(0.6));
    addWings(spinePt(0.8).x - torsoR(0.8) * 0.5, spinePt(0.8).y, 1.0);
    addAura(hipY + bodyH * 0.4, Math.max(0.42 * pw, torsoR(0.5) * 1.5));
    if (body.glow) {
      const core = add(sphere(0.12 * pw, 16), z.glow, [spinePt(0.4).x + torsoR(0.4) * 0.5, spinePt(0.4).y, 0]);
      core.castShadow = false;
    }
  } else if (body.kind === 'blob') {
    /*
     * 젤리 몸통.
     *
     * 처음엔 납작한 구를 세로로 쌓았는데, 구마다 실루엣 단차가 생겨
     * 시루떡·벌집처럼 보였다. 회전체(Lathe)로 한 덩어리를 만들면 옆선이
     * 매끈하게 이어진다 — 물방울에 필요한 건 딱 이거다.
     */
    const h = 1.05 * ph;
    const R = 0.52 * pw;
    const profile: THREE.Vector2[] = [];
    const STEPS = 26;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      // 아래는 넓게 퍼지고 위로 갈수록 좁아지며 끝은 둥글게 닫힌다
      const wobble = 1 + Math.sin(t * 5.5) * 0.035;
      const r = R * Math.pow(Math.cos(t * Math.PI * 0.5), 0.62) * wobble * (1 - t * 0.08);
      profile.push(new THREE.Vector2(Math.max(0.004, r), t * h));
    }
    add(new THREE.LatheGeometry(profile, 40), z.base, [0, 0.02, 0]);
    /** 높이 t(0~1)에서의 몸통 반지름 — 눈·하이라이트를 표면에 정확히 얹는 데 쓴다 */
    const radiusAt = (t: number) => profile[Math.round(t * STEPS)].x;

    // 내부 코어 — 원소가 비쳐 보인다
    const core = add(sphere(0.22 * pw, 20), body.glow ? z.glow : z.belly, [0, 0.3 * h, 0]);
    core.scale.set(1, 0.85, 1);
    core.castShadow = false;

    // 표면 하이라이트 — 좌표를 눈대중으로 찍었더니 몸 밖에 흰 뿔처럼 떠 있었다
    const hlT = 0.6;
    const hlR = radiusAt(hlT);
    const hl = add(sphere(0.1 * pw, 14), z.sclera, [-hlR * 0.52, hlT * h, hlR * 0.78]);
    hl.lookAt(-hlR * 1.6, hlT * h, hlR * 2.4);
    hl.scale.set(0.9, 1.7, 0.3);
    hl.castShadow = false;

    if (body.cap) {
      // 버섯 갓
      const capMesh = add(sphere(0.5 * pw, 24), z.belly, [0, 0.86 * h, 0]);
      capMesh.scale.set(1, 0.46, 1);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const d = add(sphere(0.075, 10), z.sclera, [
          Math.cos(a) * 0.3 * pw, 0.9 * h, Math.sin(a) * 0.3 * pw,
        ]);
        d.scale.set(1, 0.4, 1);
      }
    }
    if (body.horns) addHorns(0.06, 0.72 * h, 0.9);
    addCrown(0, 0.62 * h, 0.4 * pw);
    addAura(0.42 * h, 0.62 * pw);

    /*
     * 얼굴은 몸통 위쪽 1/2 지점을 머리로 친다.
     * face()가 눈을 반지름의 0.8배 지점에 놓으므로, 그 자리가 실제 표면이
     * 되도록 몸통 반지름을 0.8로 나눠 넘긴다. 안 그러면 눈이 젤리 속에 잠긴다.
     */
    const fy = 0.48 * h;
    const fr = radiusAt(0.48) / 0.8;
    face(0, fy, 0, fr, 0.5, 0.16, radiusAt(0.48) * 0.26);
    const mouth = add(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), z.ink, [0, 0, 0], [Math.PI / 2, 0, Math.PI]);
    mouth.position.set(fr * 0.9, fy - fr * 0.42, 0);
  } else if (body.kind === 'shelled') {
    const [Rx, Ry, Rz] = [0.57 * pw, 0.39 * pw, 0.51 * pw];
    const shell = add(sphere(1, 30), z.mark, [0, 0.44, 0]);
    shell.scale.set(Rx, Ry, Rz);
    /*
     * 등껍질 판.
     *
     * 처음엔 판을 원 하나에 둘러 놓고 rotation.x/z를 눈대중으로 줬더니
     * 판이 껍질 밖으로 튀어나가 사발처럼 보였다. 타원면 위 방향 벡터를
     * 구해 그 법선으로 판을 눕히면 껍질에 정확히 얹힌다.
     */
    const plate = (phi: number, count: number, offset: number, s: number) => {
      for (let i = 0; i < count; i++) {
        const th = (i / count) * Math.PI * 2 + offset;
        const dir = new THREE.Vector3(
          Math.cos(phi) * Math.cos(th),
          Math.sin(phi),
          Math.cos(phi) * Math.sin(th),
        );
        const pos = new THREE.Vector3(dir.x * Rx, 0.44 + dir.y * Ry, dir.z * Rz);
        const p = add(new THREE.CylinderGeometry(s, s * 1.08, 0.05, 6), z.paw, [pos.x, pos.y, pos.z]);
        // 타원면의 법선은 방향벡터를 반지름 제곱으로 나눈 것
        orient(p, new THREE.Vector3(dir.x / (Rx * Rx), dir.y / (Ry * Ry), dir.z / (Rz * Rz)));
        p.rotateY(th);
      }
    };
    const top = add(new THREE.CylinderGeometry(0.13 * pw, 0.14 * pw, 0.05, 6), z.paw, [0, 0.44 + Ry, 0]);
    top.rotation.y = 0.3;
    plate(0.62, 5, 0.3, 0.12 * pw);
    plate(0.16, 8, 0, 0.115 * pw);

    const belly = add(sphere(0.48 * pw, 22), z.belly, [0, 0.3, 0]);
    belly.scale.set(1, 0.44, 0.9);

    /*
     * 머리.
     *
     * 머리 위치를 pl로만 잡았더니, 껍질이 커지는 상위 등급(태초의거북)에서
     * 머리가 껍질 안으로 먹혀 통째로 바위처럼 보였다. 껍질 반지름 Rx에서
     * 띄워 항상 밖으로 나오게 한다.
     */
    const hr = 0.2 * pw;
    const hx = Rx + hr * 0.9;
    add(capsule(0.13 * pw, hr), z.base, [Rx * 0.72, 0.42, 0], [0, 0, Math.PI / 2 - 0.3]);
    const head = add(sphere(hr), z.base, [hx, 0.52, 0]);
    head.scale.set(1.08, 0.95, 0.95);
    add(sphere(0.03 * pw), z.ink, [hx + hr * 0.92, 0.49, 0]);
    face(hx, 0.54, 0, hr, 0.5, 0.24, hr * 0.34);
    addFangs(hx + hr * 0.8, 0.47, pw);
    if (body.horns) addHorns(hx - hr * 0.2, 0.56, 0.75 * pw);

    for (const fx of [0.3, -0.32]) {
      for (const side of [-1, 1]) {
        const f = add(capsule(0.1, 0.1), z.paw, [fx, 0.16, side * 0.34], [0, 0, Math.PI / 2]);
        f.scale.set(1, 1.2, 1);
        for (const t of [-1, 0, 1]) {
          add(cone(0.02, 0.06, 6), z.elem, [fx + 0.1, 0.13, side * 0.34 + t * 0.05], [0, 0, -Math.PI / 2]);
        }
      }
    }
    add(cone(0.07, 0.22, 8), z.base, [-0.64 * pl, 0.34, 0], [0, 0, Math.PI / 2]);
    addCrown(0.7 * pl, 0.5, 0.19);
    addAura(0.48, Math.max(Rx, Rz) * 1.08);
  } else if (body.kind === 'bird') {
    /*
     * 조류.
     *
     * 이전에는 세로로 세운 계란 하나에 부리를 꽂았다. 새로 안 보이는 이유는
     * 자세다. 실제 새는 몸통이 앞으로 기울어 가슴이 나오고 꼬리가 뒤로
     * 올라가며, 다리는 몸통 한참 아래 뒤쪽에 붙는다. 부엉이만 몸통이 선다.
     */
    const upright = body.ears === 'pointed';
    const tilt = upright ? 0.12 : 0.42;
    const bs = 0.36 * pw;

    /*
     * 몸통 — 어깨에서 꽁지로 내려가며 굵기가 변한다.
     *
     * 처음엔 위쪽이 가장 굵은 식으로 썼더니 어깨 구가 머리를 통째로
     * 삼켜서, 화면에는 눈·부리 없는 검은 물방울만 남았다. 어깨는 가늘고
     * 가슴(t≈0.35)이 가장 굵어야 새로 보인다.
     */
    const TORSO = [0.52, 0.86, 1.12, 1.06, 0.78, 0.44];
    const torso = new THREE.Group();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const seg = t * (TORSO.length - 1);
      const k = Math.min(TORSO.length - 2, Math.floor(seg));
      const r = bs * (TORSO[k] + (TORSO[k + 1] - TORSO[k]) * (seg - k));
      const m = new THREE.Mesh(sphere(r, 18), z.base);
      m.position.set(0, 0.42 * ph - t * 0.76 * ph, 0);
      m.scale.set(1, 1, 0.94);
      m.castShadow = true;
      m.receiveShadow = true;
      torso.add(m);
      // 가슴·배는 밝게
      if (t < 0.72) {
        const b = new THREE.Mesh(sphere(r * 0.74, 14), z.belly);
        b.position.set(r * 0.42, 0.42 * ph - t * 0.76 * ph, 0);
        b.scale.set(0.7, 1, 0.86);
        torso.add(b);
      }
    }
    torso.position.set(0, 0.5, 0);
    torso.rotation.z = -tilt;
    g.add(torso);

    /*
     * 머리 — 몸통 앞 위쪽. 목은 짧게 하나로 잇는다.
     * 부엉이류는 머리가 몸통에 거의 붙고 크다.
     */
    const headR = 0.26 * (body.head ?? 1) * pw;
    // 어깨 끝(회전 후 위치)에서 머리 반지름만큼 더 띄운다
    const shX = Math.sin(tilt) * 0.42 * ph;
    const shY = 0.5 + Math.cos(tilt) * 0.42 * ph;
    const hx = shX + headR * 0.85;
    const hy = shY + headR * 0.72;
    const head = add(sphere(headR, 22), z.base, [hx, hy, 0]);
    head.scale.set(1, 0.96, 0.98);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const n = add(sphere(headR * (0.72 - t * 0.16), 14), z.base, [
        hx + (shX - hx) * t,
        hy + (shY - hy) * t - headR * 0.34,
        0,
      ]);
      n.scale.set(1, 1, 0.92);
    }

    /*
     * 부리 — 위아래 두 장이 끝에서 만난다. 맹금류는 위 부리 끝이 갈고리로
     * 꺾인다. 이전엔 원뿔 하나라 당근처럼 보였다.
     */
    const bl = headR * (body.horns === 'crystal' ? 1.15 : 0.95);
    const upper = add(cone(headR * 0.42, bl, 10), z.elem, [
      hx + headR * 0.82, hy + headR * 0.05, 0,
    ], [0, 0, -Math.PI / 2 - 0.12]);
    upper.scale.set(1, 1, 0.78);
    const lower = add(cone(headR * 0.3, bl * 0.68, 10), z.paw, [
      hx + headR * 0.72, hy - headR * 0.16, 0,
    ], [0, 0, -Math.PI / 2 + 0.1]);
    lower.scale.set(1, 1, 0.72);
    if (body.fangs || body.wings === 'feather') {
      // 갈고리 부리 — 맹금류의 인상을 만든다
      add(cone(headR * 0.2, headR * 0.34, 8), z.elem, [
        hx + headR * (0.82 + bl / headR * 0.5), hy - headR * 0.06, 0,
      ], [0, 0, Math.PI + 0.5]);
    }
    // 콧구멍(납막)
    for (const side of [-1, 1]) {
      add(sphere(headR * 0.05, 8), z.ink, [hx + headR * 0.72, hy + headR * 0.16, side * headR * 0.12]);
    }

    face(hx, hy + headR * 0.16, 0, headR, upright ? 0.42 : 0.66, 0.14, headR * (upright ? 0.36 : 0.3));
    if (upright) {
      // 부엉이 귀깃
      for (const side of [-1, 1]) {
        add(cone(headR * 0.24, headR * 0.8, 8), z.mark, [
          hx - headR * 0.4, hy + headR * 0.9, side * headR * 0.5,
        ], [0, 0, side * 0.35]);
      }
      // 안면반
      const disc = add(sphere(headR * 0.92, 20), z.belly, [hx + headR * 0.3, hy + headR * 0.08, 0]);
      disc.scale.set(0.34, 1, 1);
    }

    /*
     * 접은 날개 — wings 플래그가 없는 종은 날개를 몸에 붙여 접는다.
     * 이전에는 옆구리에 원반을 붙여 둥근 지느러미처럼 보였다.
     */
    if (!body.wings) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          const f = add(sphere(0.5, 10), i % 2 ? z.mark : z.base, [
            -0.02 - t * 0.16 * pl,
            0.62 - t * 0.3,
            side * (bs * 0.92 - t * 0.04),
          ]);
          f.scale.set(bs * (0.62 - t * 0.12), bs * (0.5 - t * 0.06), bs * 0.16);
          f.rotation.z = 0.5 + t * 0.25;
        }
      }
    }

    /* 꽁지깃 — 부채꼴로 펴서 뒤로 올린다 */
    for (let i = -2; i <= 2; i++) {
      const t = Math.abs(i) / 2;
      const f = add(sphere(0.5, 10), i % 2 ? z.belly : z.mark, [
        -0.26 * pl - 0.06,
        0.3 + t * 0.03,
        i * 0.055 * pw,
      ]);
      f.scale.set(0.34 * pl, 0.05, 0.055 * pw);
      f.rotation.set(i * 0.12, 0, 0.42 - t * 0.08);
    }

    /* 다리 — 가는 비늘 다리에 앞발가락 3 + 뒷발가락 1 */
    // 다리는 몸통 아래쪽 무게중심 근처에 붙는다
    const legX = -Math.sin(tilt) * 0.1 * ph;
    for (const side of [-1, 1]) {
      const lx = legX;
      add(capsule(0.028 * pw, 0.14), z.paw, [lx, 0.24, side * 0.1 * pw]);
      add(capsule(0.024 * pw, 0.1), z.paw, [lx + 0.03, 0.11, side * 0.1 * pw], [0, 0, -0.3]);
      for (const k of [-1, 0, 1]) {
        const toe = add(capsule(0.018 * pw, 0.08), z.paw, [
          lx + 0.09, 0.035, side * 0.1 * pw + k * 0.035 * pw,
        ], [0, k * 0.35, Math.PI / 2]);
        toe.scale.set(1, 1, 1);
        add(cone(0.012 * pw, 0.035, 6), z.elem, [
          lx + 0.15, 0.03, side * 0.1 * pw + k * 0.045 * pw,
        ], [0, 0, -Math.PI / 2]);
      }
      // 뒷발가락
      add(capsule(0.016 * pw, 0.05), z.paw, [lx - 0.05, 0.035, side * 0.1 * pw], [0, 0, Math.PI / 2]);
    }

    if (body.glow) {
      const halo = add(new THREE.TorusGeometry(0.36, 0.026, 8, 30), z.glow, [hx - 0.1, hy + headR * 0.5, 0], [0.42, 0, 0.28]);
      halo.castShadow = false;
      halo.userData.noFrame = true;
    }
    // 날개는 고정 좌표가 아니라 기울인 몸통의 실제 어깨에 붙인다
    addWings(shX - 0.06, shY - bs * 0.5, 0.95);
    addArmor(shX - 0.1, shY - bs * 0.8, 0.34, bs * 0.9);
    addCrown(hx, hy, headR);
    addAura(0.58, 0.6 * pw);
  } else if (body.kind === 'golem') {
    /*
     * 원소 골렘.
     *
     * 곰 골격을 물려 쓰니 그냥 큰 곰이었다. 골렘은 살아 있는 원소 덩어리다.
     * 몸을 반투명하게 만들고 안에 코어를 넣어 속이 비쳐 보이게 하고,
     * 주위에 원소 조각을 띄운다. 형태는 속성이 정한다 — 불은 위로 솟는
     * 화염, 물은 둥근 물방울, 지는 뭉툭한 바위, 풍은 가늘게 휘도는 소용돌이.
     */
    /*
     * 속성별 몸 윤곽. 밑동 → 어깨 순의 굵기 배열이다.
     *
     * 처음엔 위로 갈수록 단순히 가늘어지게 했더니 천막 같은 원뿔이 나왔다.
     * 골렘으로 읽히려면 밑동이 퍼지고 허리가 한 번 들어갔다가 어깨에서
     * 다시 벌어져야 한다. 그 위에 머리를 따로 얹는다.
     */
    const FORM: Record<CoreElement, { prof: number[]; lift: number; shards: number; headR: number }> = {
      // 불 — 위로 솟는 화염. 어깨가 좁고 끝이 혀처럼 흔들린다.
      fire: { prof: [0.86, 0.98, 0.7, 0.62, 0.5, 0.3], lift: 1.28, shards: 10, headR: 0.24 },
      // 물 — 둥근 물방울. 전체가 부드럽게 이어진다.
      water: { prof: [0.94, 1.02, 0.84, 0.86, 0.66, 0.4], lift: 1.0, shards: 8, headR: 0.28 },
      // 지 — 뭉툭한 바위. 어깨가 넓고 허리가 굵다.
      earth: { prof: [1.0, 1.04, 0.92, 1.0, 0.72, 0.44], lift: 0.92, shards: 11, headR: 0.3 },
      // 풍 — 가늘게 휘도는 소용돌이.
      wind: { prof: [0.7, 0.82, 0.56, 0.5, 0.4, 0.24], lift: 1.2, shards: 9, headR: 0.22 },
    };
    const f = FORM[element] ?? FORM.earth;

    /*
     * 반투명 원소체. transmission을 쓰면 뒤가 비쳐 "덩어리"가 아니라
     * "물질"로 읽힌다. 불투명한 바위 재질로는 절대 안 나오는 인상이다.
     */
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(pal.main),
      transmission: element === 'earth' ? 0.34 : 0.66,
      thickness: 0.9,
      ior: element === 'water' ? 1.33 : 1.2,
      roughness: element === 'earth' ? 0.55 : 0.16,
      metalness: 0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      emissive: new THREE.Color(pal.accent),
      emissiveIntensity: element === 'fire' ? 0.5 : 0.16,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });

    const H = 1.15 * ph * f.lift;
    const R = 0.46 * pw;
    const profile: THREE.Vector2[] = [];
    const STEPS = 34;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const seg = t * (f.prof.length - 1);
      const k = Math.min(f.prof.length - 2, Math.floor(seg));
      const w = f.prof[k] + (f.prof[k + 1] - f.prof[k]) * (seg - k);
      // 불·풍은 끝이 혀처럼 흔들린다
      const flicker = element === 'fire' || element === 'wind' ? 1 + Math.sin(t * 11) * 0.08 * t : 1;
      profile.push(new THREE.Vector2(Math.max(0.006, R * w * flicker), t * H));
    }
    const shell = add(new THREE.LatheGeometry(profile, 44), bodyMat, [0, 0.02, 0]);
    shell.castShadow = true;

    // 머리 — 어깨 위에 따로 얹어야 눈이 몸에 묻히지 않는다
    const gh = f.headR * pw;
    const headY = H + gh * 0.5;
    const gHead = add(sphere(gh, 22), bodyMat, [0, headY, 0]);
    gHead.scale.set(1, 0.95, 0.96);

    // 안에서 도는 코어 — 반투명 몸 너머로 비쳐 보인다
    const core = add(sphere(0.19 * pw, 20), z.glow, [0, H * 0.5, 0]);
    core.scale.set(1, 1.15, 1);
    core.castShadow = false;

    /*
     * 팔 — 골렘이라면 팔이 있어야 골렘으로 읽힌다. 어깨에서 주먹으로
     * 굵어지는 덩어리를 몸통과 같은 반투명 재질로 만든다.
     */
    const shoulderR = R * f.prof[3];
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const a = add(sphere(0.085 * pw + t * 0.045 * pw, 14), bodyMat, [
          t * 0.08 * pw,
          H * 0.72 - t * H * 0.4,
          side * (shoulderR + 0.06 * pw + t * 0.1 * pw),
        ]);
        a.castShadow = true;
      }
      // 주먹 — 골렘은 손이 커야 골렘으로 보인다
      add(sphere(0.2 * pw, 16), bodyMat, [0.08 * pw, H * 0.3, side * (shoulderR + 0.16 * pw)]);
    }

    /* 원소 조각 — 몸 주위를 도는 불티·얼음·바위 파편 */
    for (let i = 0; i < f.shards; i++) {
      const a = (i / f.shards) * Math.PI * 2;
      const t = rnd();
      const rad = R * (1.05 + rnd() * 0.3);
      const sz = 0.05 + rnd() * 0.06;
      const shard = add(
        element === 'earth' || element === 'fire'
          ? new THREE.DodecahedronGeometry(sz * pw, 0)
          : new THREE.OctahedronGeometry(sz * pw, 0),
        element === 'earth' ? z.paw : z.glow,
        [Math.cos(a) * rad, H * (0.2 + t * 0.75), Math.sin(a) * rad],
        [rnd() * 3, rnd() * 3, rnd() * 3],
      );
      shard.castShadow = false;
      shard.userData.noFrame = true;
    }

    // 얼굴 — 빛나는 눈만. 원소체에 코와 입은 어울리지 않는다.
    face(0, headY, 0, gh, 0.5, 0.06, gh * 0.36);
    if (body.horns) addHorns(0, headY, gh * 3.2);
    addCrown(0, headY, gh);
    addArmor(0, H * 0.66, 0.42 * pl, shoulderR);
    addAura(H * 0.5, R * 1.2);
  } else {
    /*
     * serpent — 이전엔 구 9개를 대충 뿌려 덩어리로 보였다.
     * 나선 곡선을 촘촘히 샘플링하고 반지름을 줄여가며 구를 놓으면
     * 이어진 몸통으로 읽힌다.
     */
    const N = 26;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * Math.PI * 2.7 + 0.6;
      const rad = 0.6 * (1 - t * 0.5) * pw;
      pts.push(new THREE.Vector3(Math.cos(a) * rad * 1.05, 0.15 + t * 0.62 * ph, Math.sin(a) * rad));
    }
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = (0.19 - t * 0.09) * pw;
      const s = add(sphere(r, 16), i % 3 === 0 ? z.mark : z.base, [pts[i].x, pts[i].y, pts[i].z]);
      s.scale.set(1, 0.9, 1);
      // 배비늘 — 안쪽 아래를 밝게
      if (i % 2 === 0) {
        const v = add(sphere(r * 0.6, 10), z.belly, [pts[i].x * 0.86, pts[i].y - r * 0.62, pts[i].z * 0.86]);
        v.scale.set(1, 0.4, 1);
      }
    }
    const hp = pts[N];
    const dir = hp.clone().sub(pts[N - 2]).normalize();
    const hx = hp.x + dir.x * 0.16;
    const hy = hp.y + dir.y * 0.1;
    const hz = hp.z + dir.z * 0.16;
    const head = add(sphere(0.2 * pw, 22), z.base, [hx, hy, hz]);
    head.scale.set(1.2, 0.8, 0.95);
    add(capsule(0.08, 0.12), z.belly, [hx + 0.14, hy - 0.03, hz], [0, 0, Math.PI / 2]);
    face(hx, hy, hz, 0.2 * pw, 0.5, 0.26, 0.2 * pw * 0.34);
    if (body.horns) addHorns(hx - 0.04, hy + 0.04, 0.7);
    // 갈라진 혀
    add(capsule(0.016, 0.12), z.elem, [hx + 0.26, hy - 0.05, hz], [0, 0, Math.PI / 2]);
    for (const side of [-1, 1]) {
      add(capsule(0.012, 0.06), z.elem, [hx + 0.35, hy - 0.04, hz + side * 0.025], [0, side * 0.5, Math.PI / 2]);
    }
    if (body.spikes) {
      for (let i = 4; i < N; i += 3) {
        add(cone(0.05, 0.14, 6), z.elem, [pts[i].x, pts[i].y + 0.16, pts[i].z], [0, 0, 0]);
      }
    }
    addWings(hx - 0.5, hy - 0.12, 0.85);
    addCrown(hx, hy, 0.2 * pw);
    addFangs(hx + 0.18, hy - 0.08, 0.9);
    addAura(0.42 * ph, 0.72 * pw);
  }

  /*
   * 마지막에 윤곽선을 두른다. 부위가 모두 같은 밝기로 매끈하게 이어져
   * 서로 녹아 버리던 게 이 화풍이 장난감처럼 보인 큰 이유였다.
   */
  addOutlines(g);
  return g;
}

/** 종별 체형 정의 — 42종 전부. 빠지면 조용히 1번 체형으로 떨어져 전부 같아 보인다. */
export const PET_BODIES: Record<number, PetBody> = {
  // ─── 푸른 초원 ───
  1: { kind: 'quadruped', archetype: 'lagomorph', surface: 'fur', proportions: [0.82, 1.0, 1.0], legs: 0.8, ears: 'long', tail: 'puff', snout: 0.1, build: 'sturdy', presence: 0.9 },
  2: { kind: 'quadruped', archetype: 'canine', earScale: 1.25, surface: 'fur', proportions: [1.05, 0.98, 0.86], legs: 1.05, ears: 'pointed', tail: 'bushy', snout: 0.95, build: 'slim' },
  3: { kind: 'blob', surface: 'slime', proportions: [1, 1, 1], presence: 0.9 },
  4: { kind: 'shelled', surface: 'scale', proportions: [1, 1, 1], fins: true },
  5: { kind: 'bird', surface: 'feather', proportions: [1, 1, 0.85], head: 1.05, presence: 0.9 },
  6: { kind: 'blob', surface: 'slime', proportions: [0.8, 0.72, 0.72], glow: true, horns: 'spike', presence: 0.86 },
  7: { kind: 'quadruped', archetype: 'ursine', surface: 'fur', proportions: [0.9, 0.86, 1.05], legs: 0.45, ears: 'round', tail: 'puff', snout: 0.8, build: 'sturdy' },
  8: { kind: 'quadruped', archetype: 'feline', surface: 'fur', proportions: [1.0, 0.95, 0.82], legs: 1.1, ears: 'pointed', tail: 'thin', snout: 0.35, build: 'slim' },
  9: { kind: 'biped', surface: 'scale', proportions: [1.0, 0.98, 0.92], snout: 0.7, spikes: true, fangs: true, crest: 'flame', glow: true },
  10: { kind: 'bird', surface: 'feather', proportions: [1.05, 1.05, 0.92], head: 0.95, wings: 'feather' },
  11: { kind: 'quadruped', archetype: 'caprine', surface: 'fur', proportions: [1.0, 1.05, 0.8], legs: 1.45, ears: 'pointed', tail: 'puff', snout: 0.6, horns: 'crystal', build: 'slim' },
  12: { kind: 'quadruped', archetype: 'canine', surface: 'fur', proportions: [1.14, 1.08, 1.02], legs: 1.24, ears: 'pointed', tail: 'bushy', snout: 0.8, mane: true, build: 'sturdy', fangs: true, crest: 'feather', presence: 1.06 },
  13: { kind: 'bird', surface: 'feather', proportions: [0.95, 1.05, 1.1], head: 1.25, ears: 'pointed', glow: true, wings: 'feather', crest: 'feather', presence: 1.08 },
  14: { kind: 'shelled', surface: 'rock', proportions: [1.25, 1.25, 1.34], horns: 'spike', armor: true, aura: true, crown: true, fieryEyes: true, presence: 1.22 },
  15: { kind: 'quadruped', archetype: 'lagomorph', surface: 'fur', proportions: [0.88, 1.0, 0.9], legs: 1.15, ears: 'long', tail: 'puff', snout: 0.15, build: 'slim' },
  16: { kind: 'quadruped', archetype: 'canine', earScale: 1.2, surface: 'fur', proportions: [1.08, 1.02, 0.92], legs: 1.08, ears: 'pointed', tail: 'bushy', snout: 0.95, build: 'slim', fangs: true, glow: true, crest: 'flame', presence: 1.04 },
  17: { kind: 'blob', surface: 'slime', proportions: [1.05, 1.1, 1.05], glow: true },
  18: { kind: 'shelled', surface: 'rock', proportions: [1.06, 1.06, 1.14], horns: 'spike', armor: true, presence: 1.08 },
  19: { kind: 'bird', surface: 'feather', proportions: [1.1, 0.92, 0.8], head: 0.9 },
  20: { kind: 'bird', surface: 'feather', proportions: [0.85, 0.85, 1.15], head: 0.95, glow: true },
  21: { kind: 'quadruped', archetype: 'ursine', surface: 'rock', proportions: [0.95, 0.9, 1.1], legs: 0.5, ears: 'round', tail: 'puff', snout: 0.75, build: 'sturdy' },
  // ─── 울창한 숲 ───
  22: { kind: 'serpent', surface: 'scale', proportions: [1, 1, 1], crest: 'fin' },
  23: { kind: 'blob', surface: 'slime', proportions: [1.1, 0.75, 1.15], cap: true },
  24: { kind: 'quadruped', archetype: 'reptile', surface: 'scale', proportions: [1.32, 0.8, 0.98], legs: 0.42, ears: 'none', tail: 'lizard', snout: 1.0, build: 'sturdy', fangs: true, plates: true, presence: 1.06 },
  25: { kind: 'quadruped', archetype: 'feline', surface: 'fur', proportions: [1.16, 1.02, 0.86], legs: 1.28, ears: 'round', tail: 'thin', snout: 0.5, pattern: 'stripes', build: 'slim', fangs: true, presence: 1.02 },
  26: { kind: 'golem', surface: 'rock', proportions: [1.05, 1.2, 1.02], horns: 'antler', glow: true, aura: true, fieryEyes: true, presence: 1.1 },
  27: { kind: 'biped', surface: 'rock', proportions: [1.2, 1.24, 1.26], head: 0.98, snout: 0.4, horns: 'antler', armor: true, aura: true, fangs: true, fieryEyes: true, crest: 'feather', presence: 1.26 },
  // ─── 험준한 산맥 ───
  28: { kind: 'quadruped', archetype: 'caprine', surface: 'fur', proportions: [0.95, 1.0, 0.95], legs: 1.15, ears: 'pointed', tail: 'puff', snout: 0.55, horns: 'curved', build: 'sturdy' },
  29: { kind: 'shelled', surface: 'rock', proportions: [1.05, 0.85, 1.15], horns: 'spike' },
  30: { kind: 'bird', surface: 'feather', proportions: [1.18, 1.14, 1.08], head: 1.0, wings: 'feather', crest: 'feather', fangs: true, presence: 1.08 },
  31: { kind: 'biped', surface: 'fur', proportions: [1.05, 1.16, 1.25], head: 1.05, snout: 0.25, fangs: true, presence: 1.14 },
  32: { kind: 'biped', surface: 'rock', proportions: [1.25, 1.28, 1.3], head: 1.0, snout: 0.55, horns: 'curved', spikes: true, armor: true, aura: true, crown: true, fangs: true, fieryEyes: true, presence: 1.28 },
  // ─── 불타는 화산 ───
  33: { kind: 'shelled', surface: 'slime', proportions: [0.92, 0.92, 0.98], glow: true, horns: 'spike' },
  34: { kind: 'bird', surface: 'feather', proportions: [1.02, 1.02, 0.9], head: 0.95, wings: 'feather' },
  35: { kind: 'golem', surface: 'rock', proportions: [1.1, 1.05, 1.15], glow: true, fieryEyes: true, armor: true, presence: 1.12 },
  36: { kind: 'bird', surface: 'feather', proportions: [1.05, 0.98, 1.0], head: 1.15, glow: true, wings: 'feather', aura: true, fieryEyes: true, crest: 'flame', presence: 1.14 },
  37: { kind: 'biped', surface: 'rock', proportions: [1.3, 1.3, 1.32], head: 1.0, snout: 0.8, horns: 'spike', spikes: true, glow: true, wings: 'membrane', armor: true, aura: true, fangs: true, fieryEyes: true, crest: 'flame', presence: 1.3 },
  // ─── 신비한 빙산 ───
  38: { kind: 'quadruped', archetype: 'canine', earScale: 1.3, surface: 'fur', proportions: [1.0, 0.95, 0.9], legs: 1.05, ears: 'pointed', tail: 'bushy', snout: 0.9, build: 'slim' },
  39: { kind: 'quadruped', archetype: 'ursine', surface: 'fur', proportions: [1.28, 1.24, 1.34], legs: 1.24, ears: 'round', tail: 'thin', snout: 0.6, horns: 'tusk', trunk: true, mane: true, build: 'sturdy', presence: 1.12 },
  40: { kind: 'golem', surface: 'slime', proportions: [0.92, 1.0, 0.88], glow: true, horns: 'crystal', fieryEyes: true },
  41: { kind: 'serpent', surface: 'scale', proportions: [1.3, 1.25, 1.25], spikes: true, horns: 'spike', fins: true, crest: 'fin', fangs: true, fieryEyes: true, presence: 1.16 },
  42: { kind: 'bird', surface: 'feather', proportions: [1.1, 1.05, 1.1], head: 1.15, glow: true, wings: 'feather', crown: true, aura: true, fieryEyes: true, crest: 'fin', presence: 1.24 },
};

/*
 * 기본 요각.
 *
 * 몸은 +X를 향해 만든다. 카메라가 방위각 0.87rad에 있는데 회전을 -0.78로 두니
 * 펫의 정면이 카메라와 5도 차이 — 완전한 정면 샷이 나와 몸 길이도 다리도
 * 안 보였다. 방위각 차이가 약 37도가 되게 맞춰 3/4 뷰로 세운다.
 */
const BASE_YAW = -0.25;

export function hasBody(shapeId: number): boolean {
  return shapeId in PET_BODIES;
}

/**
 * 종마다 부피가 달라 그대로 두면 뱀은 작고 골렘은 프레임을 넘친다.
 *
 * 처음엔 바운딩 박스의 각 축을 가중해 맞췄는데, 꼬리가 길게 뻗은 도마뱀은
 * x가 커져 혼자 작게 찍혔다. 화면에서 차지하는 크기는 결국 외접구 반지름이
 * 정하므로 그걸 기준으로 잡는다.
 */
function frame(group: THREE.Group, presence = 1) {
  // 오라 같은 장식은 몸이 아니다. 같이 재면 몸이 그만큼 작게 찍힌다.
  const box = new THREE.Box3();
  const one = new THREE.Box3();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.noFrame) return;
    one.setFromObject(o);
    box.union(one);
  });
  if (box.isEmpty()) box.setFromObject(group);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const s = sph.radius > 0.01 ? (0.95 * presence) / sph.radius : 1;
  group.scale.setScalar(s);
  // 외접구 중심을 화면 중앙(카메라가 보는 y=0.62)에 두고, 발은 바닥에 붙인다
  group.position.set(-sph.center.x * s, -box.min.y * s, -sph.center.z * s);
}

/** 2D 스프라이트의 모션 이름을 3D 포즈로 옮긴다. walk는 idle과 같은 흔들림으로 처리한다. */
export function poseFromMotion(motion: string): PetPose {
  return motion === 'walk' ? 'idle' : (motion as PetPose);
}

/**
 * 도감처럼 수십 개가 한 화면에 뜰 때를 위한 예산.
 * 캔버스마다 매 프레임 렌더하면 40개 기준 초당 2400회 그리게 된다.
 * 화면 밖은 아예 멈추고, 보이는 것도 30fps로 제한한다.
 */
const FRAME_MS = 1000 / 30;

/**
 * 정지 프레임 캐시.
 *
 * 도감을 3D로 바꾸자 42개 캔버스가 각자 애니메이션을 돌려 2fps가 나왔다.
 * 목록 화면의 작은 썸네일은 움직일 이유가 없다. 종·속성·크기별로 한 번만
 * 굽고 그 비트맵을 재사용하면 같은 종이 여러 번 나와도 렌더는 한 번이다.
 */
const stillCache = new Map<string, HTMLCanvasElement>();

export function PetSprite3D({
  shapeId,
  element,
  size = 96,
  pose = 'idle',
  seed = 1,
  flipped = false,
  animated = true,
  className,
}: {
  shapeId: number;
  element: CoreElement;
  size?: number;
  pose?: PetPose;
  seed?: number;
  /** 전투에서 상대 진영은 좌우를 뒤집어 마주 보게 한다 */
  flipped?: boolean;
  /** false면 한 프레임만 굽고 멈춘다. 목록·도감 썸네일용. */
  animated?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 화면에 없으면 렌더를 멈춘다
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '80px' });
    io.observe(canvas);
    let last = 0;

    const drawFrom = (src: CanvasImageSource) => {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (flipped) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const stillKey = `${shapeId}|${element}|${size}|${pose}|${seed}`;
    if (!animated) {
      const hit = stillCache.get(stillKey);
      if (hit) {
        drawFrom(hit);
        return;
      }
    }

    const { renderer, scene, camera } = getShared();
    const body = PET_BODIES[shapeId] ?? PET_BODIES[1];
    const pal = petPalette(shapeId, element);

    // 체형은 안쪽 그룹에 담고 크기 보정을 걸어, 바깥 그룹은 포즈 애니메이션에만 쓴다
    const inner = buildPet(body, pal, seed + shapeId * 13, element);
    frame(inner, body.presence ?? 1);
    const group = new THREE.Group();
    group.add(inner);

    // 바닥 그림자 받이
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.34 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    let raf = 0;
    const t0 = performance.now();

    const frameLoop = () => {
      raf = requestAnimationFrame(frameLoop);
      const now = performance.now();
      if (animated && (!visible || now - last < FRAME_MS)) return;
      last = now;
      const t = (now - t0) / 1000;
      const p = poseRef.current;

      // 포즈별 절차적 애니메이션
      group.rotation.y = BASE_YAW;
      group.position.set(0, 0, 0);
      group.rotation.z = 0;
      if (p === 'idle') {
        group.position.y = Math.sin(t * 2.2) * 0.035;
        group.rotation.y = BASE_YAW + Math.sin(t * 0.7) * 0.1;
      } else if (p === 'attack') {
        const k = Math.min(1, (t % 1.2) / 0.5);
        group.position.x = Math.sin(k * Math.PI) * 0.42;
        group.rotation.y = BASE_YAW + 0.18;
      } else if (p === 'hurt') {
        group.position.x = Math.sin(t * 34) * 0.06;
        group.rotation.z = 0.1;
      } else if (p === 'faint') {
        group.rotation.z = -1.2;
        group.position.y = -0.18;
      } else if (p === 'victory') {
        group.position.y = Math.abs(Math.sin(t * 3.4)) * 0.3;
        group.rotation.y = BASE_YAW + Math.sin(t * 3.4) * 0.25;
      }

      renderer.setSize(size, size, false);
      scene.add(group);
      renderer.render(scene, camera);
      scene.remove(group);

      drawFrom(renderer.domElement);

      if (!animated) {
        // 구운 프레임을 캐시에 복사해 두고 루프를 끝낸다
        const still = document.createElement('canvas');
        still.width = size;
        still.height = size;
        still.getContext('2d')?.drawImage(renderer.domElement, 0, 0, size, size);
        stillCache.set(stillKey, still);
        cancelAnimationFrame(raf);
      }
    };
    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    };
  }, [shapeId, element, size, seed, flipped, pose, animated]);

  const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
  return (
    <canvas
      ref={ref}
      width={size * dpr}
      height={size * dpr}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
    />
  );
}
