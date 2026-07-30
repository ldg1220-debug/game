import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENT_PALETTE, type CoreElement } from '../lib/gameTypes';
import { petMaterial, type SurfaceKind } from '../lib/petTexture';

/**
 * 3D 펫 렌더러 (프로토타입).
 *
 * 평면 SVG로는 볼륨이 나오지 않아 원본 스톤에이지와 격차가 컸다. 외부 에셋 없이
 * 품질을 올리는 방법은 3D다 — 프리미티브를 조합해 몸을 만들고, 절차적으로 구운
 * PBR 재질과 조명 리그를 붙이면 음영·질감·접지가 공짜로 따라온다.
 *
 * 렌더러는 하나만 만들어 여러 펫이 공유한다. 캔버스마다 WebGL 컨텍스트를 잡으면
 * 도감처럼 수십 개가 한 화면에 뜰 때 컨텍스트 한도(보통 16개)에 걸린다.
 */

export type PetPose = 'idle' | 'attack' | 'hurt' | 'faint' | 'victory';

/** 종별 체형. 프리미티브 조합의 파라미터. */
export interface PetBody {
  kind: 'quadruped' | 'blob' | 'bird' | 'shelled' | 'serpent';
  surface: SurfaceKind;
  /** 몸통 길이·높이·폭 배율 */
  proportions: [number, number, number];
  ears?: 'pointed' | 'long' | 'none';
  tail?: 'bushy' | 'thin' | 'puff' | 'none';
  horns?: boolean;
  /** 주둥이 길이 0(뭉툭)~1(길다) */
  snout?: number;
  /** 갈기 유무 */
  mane?: boolean;
  build?: 'slim' | 'sturdy';
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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // 조명 리그: 키 + 필 + 반사광. 이게 볼륨을 만든다.
  const key = new THREE.DirectionalLight(0xfff4e0, 2.6);
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

  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.7);
  fill.position.set(-4, 2, 2);
  scene.add(fill);

  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a2416, 0.85));

  const rim = new THREE.DirectionalLight(0xffd9a0, 1.1);
  rim.position.set(-2, 3, -5);
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

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(2.9, 1.35, 3.0);
  camera.lookAt(0, 0.66, 0);

  shared = { renderer, scene, camera };
  return shared;
}

/**
 * 종별 색 구역. 몸 전체를 한 색으로 칠하면 형태가 뭉개져서 종 구분이 안 된다.
 * 배·주둥이·발·귀안쪽을 다른 톤으로 나눠 실루엣 안에 정보를 넣는다.
 */
interface Zones {
  base: THREE.Material;
  belly: THREE.Material;
  accent: THREE.Material;
  paw: THREE.Material;
  ink: THREE.Material;
  iris: THREE.Material;
  sclera: THREE.Material;
}

function makeZones(body: PetBody, pal: { main: string; sub: string; accent: string; dark: string }, seed: number): Zones {
  const surf = body.surface;
  /*
   * accent(#FFD700 같은 형광 강조색)를 배·주둥이 같은 넓은 면에 칠했더니
   * 주둥이가 거대한 노란 원이 되고 그 끝의 검은 코가 동공처럼 보여서
   * 얼굴이 외눈으로 읽혔다. 넓은 면은 주색을 밝게/어둡게 민 톤으로만 쓰고,
   * 형광 강조색은 눈 홍채와 발톱 같은 아주 작은 부분에만 남긴다.
   */
  const tint = (hex: string, t: number) =>
    '#' + new THREE.Color(hex).lerp(new THREE.Color(t > 0 ? 0xffffff : 0x000000), Math.abs(t)).getHexString();

  return {
    base: petMaterial(surf, pal.main, seed, surf === 'scale' ? 1.1 : 1.25),
    belly: petMaterial(surf, tint(pal.main, 0.34), seed + 3, 1.1),
    accent: petMaterial(surf, pal.sub, seed + 7, 1.1),
    paw: petMaterial(surf, tint(pal.main, -0.42), seed + 11, 1.4),
    ink: new THREE.MeshStandardMaterial({ color: 0x120e1c, roughness: 0.34 }),
    iris: new THREE.MeshStandardMaterial({ color: pal.sub, roughness: 0.22, metalness: 0.1 }),
    sclera: new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.16 }),
  };
}

/** 프리미티브를 조합해 몸을 만든다 */
function buildPet(body: PetBody, pal: { main: string; sub: string; accent: string; dark: string }, seed: number): THREE.Group {
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

  const sphere = (r: number, seg = 28) => new THREE.SphereGeometry(r, seg, seg);
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 10, 22);
  const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);

  /**
   * 얼굴. 이전 구현은 눈이 지름 0.05짜리 검은 구여서 80px에서 전혀 안 보였다.
   * 흰자 + 홍채 + 동공 + 하이라이트로 층을 만들고 크기를 키운다.
   */
  const face = (cx: number, cy: number, scale: number, gap: number) => {
    for (const side of [-1, 1]) {
      // 눈을 머리 옆면 쪽으로 더 벌린다. 3/4 시점에서 두 눈이 겹쳐 외눈처럼 보였다.
      const ez = side * gap * 1.5;
      // 바깥으로 갈수록 살짝 뒤로 물러나 머리 곡면을 따른다
      cx -= 0;
      // 눈두덩은 얕게. 이전엔 흰자가 머리 지름의 1/3이라 눈알이 튀어나와 보였다.
      const r = 0.078 * scale;
      const back = -Math.abs(gap) * 0.55;
      add(sphere(r * 1.22, 14), z.paw, [cx + back - 0.02, cy + 0.008, ez], undefined, [0.5, 1, 1]);
      add(sphere(r, 20), z.sclera, [cx + back, cy, ez], undefined, [0.88, 1, 1]);
      add(sphere(r * 0.64, 18), z.iris, [cx + back + r * 0.46, cy, ez + side * 0.02]);
      add(sphere(r * 0.32, 14), z.ink, [cx + back + r * 0.7, cy, ez + side * 0.026]);
      add(sphere(r * 0.18, 10), z.sclera, [cx + back + r * 0.76, cy + r * 0.42, ez + side * 0.03]);
    }
  };

  if (body.kind === 'quadruped') {
    const chunky = body.build === 'sturdy';
    const bodyR = (chunky ? 0.38 : 0.32) * pw;

    // 몸통 — 가슴이 굵고 허리가 잘록하게
    add(capsule(bodyR, 0.5 * pl), z.base, [0, 0.64, 0], [0, 0, Math.PI / 2]);
    add(sphere(bodyR * 1.06), z.base, [0.28 * pl, 0.66, 0]);
    add(sphere(bodyR * 0.92), z.base, [-0.32 * pl, 0.6, 0]);
    // 배 (밝은 톤)
    const belly = add(sphere(bodyR * 0.86), z.belly, [0.02 * pl, 0.48, 0.06]);
    belly.scale.set(1.5, 0.62, 0.86);

    if (body.mane) {
      // 갈기 — 늑대·사자류의 인상을 만든다
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const lump = add(sphere(0.14, 12), z.accent, [
          0.42 * pl,
          0.76 + Math.sin(a) * 0.3,
          Math.cos(a) * 0.32,
        ]);
        lump.scale.set(0.55, 1, 1);
      }
    }

    // 머리
    const headY = 0.98 * ph;
    const headX = 0.6 * pl;
    const head = add(sphere(0.3 * ph), z.base, [headX, headY, 0]);
    head.scale.set(1, 0.95, 0.94);

    // 주둥이 — 길이로 종을 구분한다 (여우는 길고 토끼는 짧다)
    const snout = body.snout ?? 0.5;
    const sx = headX + 0.2 * ph + snout * 0.14;
    const muzzle = add(capsule(0.088 * ph, 0.08 + snout * 0.2), z.belly, [sx - 0.06, headY - 0.09, 0], [0, 0, Math.PI / 2]);
    muzzle.scale.set(1, 1, 0.82);
    add(sphere(0.042), z.ink, [sx + 0.08 + snout * 0.1, headY - 0.075, 0]);
    // 입선
    add(new THREE.TorusGeometry(0.042, 0.01, 6, 14, Math.PI), z.ink, [
      sx + 0.02,
      headY - 0.15,
      0,
    ], [Math.PI / 2, 0, Math.PI]);

    face(headX + 0.2 * ph, headY + 0.14, ph, 0.15);

    // 눈썹 능선 — 표정을 만든다
    for (const side of [-1, 1]) {
      add(capsule(0.022, 0.085), z.paw, [headX + 0.15 * ph, headY + 0.175, side * 0.155], [0, 0, 1.25]);
    }

    // 귀
    if (body.ears === 'pointed') {
      for (const side of [-1, 1]) {
        add(cone(0.115, 0.34, 10), z.base, [headX - 0.04, headY + 0.3, side * 0.16], [0, 0, side * 0.16]);
        add(cone(0.062, 0.22, 10), z.accent, [headX - 0.02, headY + 0.29, side * 0.175], [0, 0, side * 0.16]);
      }
    } else if (body.ears === 'long') {
      for (const side of [-1, 1]) {
        const ear = add(capsule(0.082, 0.36), z.base, [headX - 0.06, headY + 0.42, side * 0.14], [0, 0, side * 0.2]);
        ear.scale.set(0.7, 1, 1);
        const inner = add(capsule(0.045, 0.28), z.accent, [headX - 0.04, headY + 0.42, side * 0.155], [0, 0, side * 0.2]);
        inner.scale.set(0.6, 1, 1);
      }
    }
    if (body.horns) {
      for (const side of [-1, 1]) {
        add(cone(0.075, 0.34, 8), z.belly, [headX - 0.02, headY + 0.3, side * 0.16], [0, 0, side * 0.6]);
      }
    }

    /*
     * 다리 — 이전엔 관절 없는 막대 하나여서 디테일이 없었다.
     * 상완/하완을 나누고 각도를 줘 무릎을 만들고, 발가락 3개와 발톱을 붙인다.
     */
    for (const [fx, thick, knee] of [
      [0.33, 0.1, 0.18],
      [-0.31, 0.115, -0.3],
    ] as [number, number, number][]) {
      for (const side of [-1, 1]) {
        const zz = side * 0.23;
        // 어깨/허벅지
        const upper = add(capsule(thick, 0.16), z.base, [fx * pl, 0.42, zz], [0, 0, knee * 0.5]);
        upper.scale.set(1.15, 1, 1.15);
        // 정강이
        add(capsule(thick * 0.78, 0.17), z.base, [fx * pl + knee * 0.06, 0.24, zz], [0, 0, -knee * 0.3]);
        // 발
        const paw = add(sphere(0.1, 16), z.paw, [fx * pl + 0.04, 0.09, zz]);
        paw.scale.set(1.3, 0.72, 1.05);
        // 발가락 + 발톱
        for (const t of [-1, 0, 1]) {
          add(sphere(0.038, 10), z.paw, [fx * pl + 0.1, 0.075, zz + t * 0.045]);
          add(cone(0.016, 0.05, 6), z.belly, [fx * pl + 0.145, 0.07, zz + t * 0.045], [0, 0, -Math.PI / 2]);
        }
      }
    }

    // 목 — 머리와 몸통이 뚝 끊겨 보이던 걸 잇는다
    add(capsule(0.19 * pw, 0.14), z.base, [0.45 * pl, 0.8, 0], [0, 0, -0.7]);

    // 등털 — 실루엣에 결을 준다
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      add(cone(0.05 - t * 0.015, 0.13, 6), z.accent, [
        (0.28 - t * 0.55) * pl,
        0.94 - t * 0.06,
        0,
      ], [0, 0, -0.25]);
    }

    // 가슴털
    const ruff = add(sphere(0.17, 18), z.belly, [0.4 * pl, 0.54, 0.05]);
    ruff.scale.set(0.7, 0.85, 1.05);

    // 수염과 콧구멍
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        add(capsule(0.0045, 0.11), z.sclera, [
          sx + 0.02,
          headY - 0.04 + i * 0.03,
          side * 0.09,
        ], [0, side * (0.5 + i * 0.18), Math.PI / 2 - 0.1]);
      }
      add(sphere(0.017, 8), z.ink, [sx + 0.11 + snout * 0.1, headY - 0.02, side * 0.032]);
    }

    // 꼬리
    if (body.tail === 'bushy') {
      add(capsule(0.16, 0.34), z.base, [-0.6 * pl, 0.78, 0], [0, 0, -0.85]);
      add(sphere(0.19), z.accent, [-0.8 * pl, 1.02, 0]);
      add(sphere(0.13), z.belly, [-0.88 * pl, 1.14, 0]);
    } else if (body.tail === 'thin') {
      add(capsule(0.055, 0.4), z.base, [-0.58 * pl, 0.72, 0], [0, 0, -0.7]);
      add(sphere(0.075), z.accent, [-0.76 * pl, 0.92, 0]);
    } else if (body.tail === 'puff') {
      add(sphere(0.16), z.belly, [-0.56 * pl, 0.58, 0]);
    }
  } else if (body.kind === 'blob') {
    const b = add(sphere(0.5 * pw, 30), z.base, [0, 0.52 * ph, 0]);
    b.scale.set(1, 1.06 * ph, 1);
    add(cone(0.19, 0.42, 20), z.base, [0, 1.03 * ph, 0]);
    // 내부 코어가 비치는 느낌
    const core = add(sphere(0.26, 20), z.accent, [0, 0.44 * ph, 0]);
    core.scale.set(1, 0.8, 1);
    // 하이라이트
    const hl = add(sphere(0.12, 14), z.sclera, [-0.22, 0.78 * ph, 0.28]);
    hl.scale.set(1, 1.5, 0.4);
    face(0.34, 0.6 * ph, 1.05, 0.19);
    add(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), z.ink, [0.44, 0.47 * ph, 0], [Math.PI / 2, 0, Math.PI]);
  } else if (body.kind === 'shelled') {
    const shell = add(sphere(0.54 * pw, 26), z.accent, [0, 0.5, 0]);
    shell.scale.set(1.05, 0.66, 0.94);
    // 등껍질 판
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const plate = add(sphere(0.16, 12), z.paw, [Math.cos(a) * 0.3, 0.66, Math.sin(a) * 0.28]);
      plate.scale.set(1, 0.35, 1);
    }
    const top = add(sphere(0.17, 14), z.paw, [0, 0.79, 0]);
    top.scale.set(1, 0.4, 1);
    const belly = add(sphere(0.48 * pw, 22), z.belly, [0, 0.32, 0]);
    belly.scale.set(1, 0.44, 0.9);
    // 머리
    add(capsule(0.15, 0.12), z.base, [0.56 * pl, 0.46, 0], [0, 0, Math.PI / 2]);
    add(sphere(0.19), z.base, [0.68 * pl, 0.5, 0]);
    face(0.78 * pl, 0.55, 0.72, 0.11);
    for (const fx of [0.3, -0.32]) {
      for (const side of [-1, 1]) {
        const f = add(capsule(0.1, 0.1), z.paw, [fx, 0.16, side * 0.34], [0, 0, Math.PI / 2]);
        f.scale.set(1, 1.2, 1);
      }
    }
    add(cone(0.07, 0.2, 8), z.base, [-0.64 * pl, 0.36, 0], [0, 0, Math.PI / 2]);
  } else if (body.kind === 'bird') {
    const b = add(sphere(0.34 * pw, 24), z.base, [0, 0.64, 0]);
    b.scale.set(1, 1.14, 0.96);
    const chest = add(sphere(0.26, 20), z.belly, [0.15, 0.6, 0.06]);
    chest.scale.set(0.9, 1.15, 0.8);
    add(sphere(0.25), z.base, [0.14, 1.02, 0]);
    // 부리 (위아래 두 겹)
    add(cone(0.085, 0.26, 10), z.belly, [0.42, 1.0, 0], [0, 0, -Math.PI / 2]);
    add(cone(0.06, 0.16, 10), z.paw, [0.4, 0.94, 0], [0, 0, -Math.PI / 2]);
    face(0.28, 1.08, 0.78, 0.115);
    for (const side of [-1, 1]) {
      const w = add(sphere(0.32, 18), z.accent, [-0.06, 0.7, side * 0.33]);
      w.scale.set(0.95, 0.55, 0.22);
      w.rotation.z = side * 0.18;
      // 날개 끝 깃
      for (let i = 0; i < 3; i++) {
        add(capsule(0.035, 0.16), z.paw, [-0.3 - i * 0.06, 0.62 - i * 0.03, side * 0.32], [0, 0, 1.3]);
      }
    }
    const t = add(sphere(0.26, 16), z.accent, [-0.44, 0.58, 0]);
    t.scale.set(0.85, 0.28, 0.55);
    for (const side of [-1, 1]) {
      add(capsule(0.045, 0.14), z.paw, [0.04, 0.26, side * 0.12]);
      add(sphere(0.07, 10), z.paw, [0.08, 0.1, side * 0.12], undefined, [1.2, 0.6, 1]);
    }
  } else {
    // serpent — 굵기가 줄어드는 몸통 + 또렷한 머리
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const seg = add(sphere(0.3 - t * 0.19, 18), i % 2 === 0 ? z.base : z.accent, [
        -0.6 + Math.cos(t * Math.PI * 1.25) * 0.8,
        0.3 + Math.sin(t * Math.PI * 1.05) * 0.36,
        Math.sin(t * Math.PI * 1.5) * 0.3,
      ]);
      seg.scale.set(1, 0.92, 1);
    }
    const head = add(sphere(0.29, 22), z.base, [0.7, 0.66, 0]);
    head.scale.set(1.15, 0.84, 0.92);
    add(capsule(0.11, 0.12), z.belly, [0.88, 0.62, 0], [0, 0, Math.PI / 2]);
    face(0.86, 0.74, 0.82, 0.13);
    // 갈라진 혀
    add(capsule(0.018, 0.14), z.iris, [1.02, 0.58, 0], [0, 0, Math.PI / 2]);
  }

  return g;
}

/** 종별 체형 정의 (프로토타입: 대표 5종) */
export const PET_BODIES: Record<number, PetBody> = {
  // 솜털토끼 — 짧은 주둥이, 아주 긴 귀, 동그란 몸, 뭉툭한 꼬리
  1: { kind: 'quadruped', surface: 'fur', proportions: [0.82, 1.0, 1.0], ears: 'long', tail: 'puff', snout: 0.1, build: 'sturdy' },
  // 불꽃여우 — 긴 주둥이, 뾰족한 귀, 날렵한 몸, 큰 꼬리
  2: { kind: 'quadruped', surface: 'fur', proportions: [1.05, 0.98, 0.86], ears: 'pointed', tail: 'bushy', snout: 0.95, build: 'slim' },
  3: { kind: 'blob', surface: 'slime', proportions: [1, 1, 1] },
  4: { kind: 'shelled', surface: 'scale', proportions: [1, 1, 1] },
  5: { kind: 'bird', surface: 'feather', proportions: [1, 1, 1] },
  // 그림자늑대 — 갈기와 굵은 체구로 여우와 구분
  12: { kind: 'quadruped', surface: 'fur', proportions: [1.12, 1.08, 1.02], ears: 'pointed', tail: 'bushy', snout: 0.7, mane: true, build: 'sturdy' },
  22: { kind: 'serpent', surface: 'scale', proportions: [1, 1, 1] },
};

export function hasBody(shapeId: number): boolean {
  return shapeId in PET_BODIES;
}

export function PetSprite3D({
  shapeId,
  element,
  size = 96,
  pose = 'idle',
  seed = 1,
  className,
}: {
  shapeId: number;
  element: CoreElement;
  size?: number;
  pose?: PetPose;
  seed?: number;
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

    const { renderer, scene, camera } = getShared();
    const body = PET_BODIES[shapeId] ?? PET_BODIES[1];
    const pal = ELEMENT_PALETTE[element];
    const group = buildPet(body, pal, seed + shapeId * 13);

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

    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      const p = poseRef.current;

      // 포즈별 간단한 절차적 애니메이션
      group.rotation.y = -0.78;
      group.position.y = 0;
      group.rotation.z = 0;
      if (p === 'idle') {
        group.position.y = Math.sin(t * 2.2) * 0.035;
        group.rotation.y = -0.78 + Math.sin(t * 0.7) * 0.1;
      } else if (p === 'attack') {
        const k = Math.min(1, (t % 1.2) / 0.5);
        group.position.x = Math.sin(k * Math.PI) * 0.42;
        group.rotation.y = -0.6;
      } else if (p === 'hurt') {
        group.position.x = Math.sin(t * 34) * 0.06;
        group.rotation.z = 0.1;
      } else if (p === 'faint') {
        group.rotation.z = -1.2;
        group.position.y = -0.18;
      } else if (p === 'victory') {
        group.position.y = Math.abs(Math.sin(t * 3.4)) * 0.3;
        group.rotation.y = -0.78 + Math.sin(t * 3.4) * 0.25;
      }

      renderer.setSize(size, size, false);
      scene.add(group);
      renderer.render(scene, camera);
      scene.remove(group);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    };
  }, [shapeId, element, size, seed]);

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
