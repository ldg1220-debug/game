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
  kind: 'quadruped' | 'blob' | 'bird' | 'shelled' | 'serpent';
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
  ears?: 'pointed' | 'long' | 'round' | 'none';
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
    iris: new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.2, metalness: 0.1 }),
    sclera: new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.16 }),
  };
}

/** 프리미티브를 조합해 몸을 만든다 */
function buildPet(body: PetBody, pal: PetPalette, seed: number): THREE.Group {
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

      const socket = at(-0.15);
      const sock = add(sphere(r * 1.3, 14), z.paw, [socket.x, socket.y, socket.z]);
      sock.lookAt(socket.clone().add(d));
      sock.scale.set(1, 1, 0.45);

      const e = at(0);
      add(sphere(r, 20), z.sclera, [e.x, e.y, e.z]);
      const i2 = at(0.44);
      add(sphere(r * 0.66, 18), z.iris, [i2.x, i2.y, i2.z]);
      const p2 = at(0.68);
      add(sphere(r * 0.33, 14), z.ink, [p2.x, p2.y, p2.z]);
      const h2 = at(0.74);
      add(sphere(r * 0.2, 10), z.sclera, [h2.x, h2.y + r * 0.4, h2.z]);
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

  if (body.kind === 'quadruped') {
    const chunky = body.build === 'sturdy';
    const legs = body.legs ?? 1;
    const bodyR = (chunky ? 0.37 : 0.31) * pw;
    // 다리 길이가 몸 높이를 정한다. 두더지는 바닥에 붙고 사슴은 높이 선다.
    const bodyY = 0.24 + 0.4 * legs;
    const pawY = 0.085;
    const span = Math.max(0.12, bodyY - bodyR * 0.6 - pawY);

    // 몸통 — 가슴이 굵고 허리가 잘록하게
    add(capsule(bodyR, 0.5 * pl), z.base, [0, bodyY, 0], [0, 0, Math.PI / 2]);
    add(sphere(bodyR * 1.06), z.base, [0.28 * pl, bodyY + 0.02, 0]);
    add(sphere(bodyR * 0.92), z.base, [-0.32 * pl, bodyY - 0.04, 0]);
    // 배 (밝은 톤)
    const belly = add(sphere(bodyR * 0.86), z.belly, [0.02 * pl, bodyY - 0.16, 0.06]);
    belly.scale.set(1.5, 0.62, 0.86);
    addPattern(0, bodyY + 0.04, 0.8 * pl, bodyR);

    if (body.mane) {
      // 갈기 — 늑대·사자류의 인상을 만든다
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const lump = add(sphere(0.105, 12), i % 3 === 0 ? z.mark : z.belly, [
          0.42 * pl,
          bodyY + 0.16 + Math.sin(a) * 0.26,
          Math.cos(a) * 0.28,
        ]);
        lump.scale.set(0.42, 1, 1);
      }
    }

    // 머리
    const hs = body.head ?? 1;
    const headY = bodyY + 0.34 * ph * hs;
    const headX = 0.58 * pl;
    const headR = 0.3 * ph * hs;
    const head = add(sphere(headR), z.base, [headX, headY, 0]);
    head.scale.set(1, 0.95, 0.94);

    // 목 — 머리와 몸통이 뚝 끊겨 보이던 걸 잇는다
    const neck = new THREE.Vector3(headX - 0.12, headY - 0.12, 0);
    const nb = new THREE.Vector3(0.3 * pl, bodyY + 0.06, 0);
    const nMid = neck.clone().add(nb).multiplyScalar(0.5);
    const nLen = neck.distanceTo(nb);
    const nMesh = add(capsule(0.19 * pw, Math.max(0.02, nLen - 0.06)), z.base, [nMid.x, nMid.y, nMid.z]);
    orient(nMesh, neck.clone().sub(nb));

    // 주둥이 — 길이로 종을 구분한다 (여우는 길고 토끼는 짧다)
    const snout = body.snout ?? 0.5;
    const sx = headX + headR * 0.68 + snout * 0.14;
    const muzzle = add(
      capsule(0.088 * ph * hs, 0.06 + snout * 0.24),
      z.belly,
      [sx - 0.06, headY - 0.1 * hs, 0],
      [0, 0, Math.PI / 2],
    );
    muzzle.scale.set(1, 1, 0.82);
    add(sphere(0.042), z.ink, [sx + 0.07 + snout * 0.12, headY - 0.085 * hs, 0]);
    // 입선
    add(new THREE.TorusGeometry(0.042, 0.01, 6, 14, Math.PI), z.ink, [
      sx + 0.02,
      headY - 0.16 * hs,
      0,
    ], [Math.PI / 2, 0, Math.PI]);

    // 포식자는 눈이 정면에 모이고, 초식/피식자는 옆으로 벌어진다
    const wide = body.ears === 'long' || body.horns === 'curved' || body.horns === 'tusk';
    face(headX, headY, 0, headR, wide ? 0.62 : 0.4, 0.22);

    // 귀
    if (body.ears === 'pointed') {
      for (const side of [-1, 1]) {
        add(cone(0.115 * hs, 0.34 * hs, 10), z.base, [headX - 0.04, headY + 0.3 * hs, side * 0.16 * hs], [0, 0, side * 0.16]);
        add(cone(0.062 * hs, 0.22 * hs, 10), z.belly, [headX - 0.02, headY + 0.29 * hs, side * 0.175 * hs], [0, 0, side * 0.16]);
      }
    } else if (body.ears === 'long') {
      for (const side of [-1, 1]) {
        const ear = add(capsule(0.082, 0.36), z.base, [headX - 0.06, headY + 0.42 * hs, side * 0.14], [0, 0, side * 0.2]);
        ear.scale.set(0.7, 1, 1);
        const inner = add(capsule(0.045, 0.28), z.belly, [headX - 0.04, headY + 0.42 * hs, side * 0.155], [0, 0, side * 0.2]);
        inner.scale.set(0.6, 1, 1);
      }
    } else if (body.ears === 'round') {
      for (const side of [-1, 1]) {
        const ear = add(sphere(0.1 * hs, 14), z.base, [headX - 0.06, headY + 0.26 * hs, side * 0.2 * hs]);
        ear.scale.set(0.45, 1, 1);
        const inner = add(sphere(0.06 * hs, 12), z.belly, [headX - 0.04, headY + 0.26 * hs, side * 0.21 * hs]);
        inner.scale.set(0.35, 1, 1);
      }
    }
    addHorns(headX, headY, hs);

    /*
     * 다리 — 이전엔 관절 없는 막대 하나여서 디테일이 없었다.
     * 상완/하완을 나누고 각도를 줘 무릎을 만들고, 발가락 3개와 발톱을 붙인다.
     */
    for (const [fx, thick, knee] of [
      [0.33, 0.1, 0.18],
      [-0.31, 0.115, -0.3],
    ] as [number, number, number][]) {
      for (const side of [-1, 1]) {
        const zz = side * 0.23 * pw;
        const t = thick * (chunky ? 1.15 : 0.9);
        // 어깨/허벅지
        const upper = add(capsule(t, span * 0.42), z.base, [fx * pl, pawY + span * 0.7, zz], [0, 0, knee * 0.5]);
        upper.scale.set(1.15, 1, 1.15);
        // 정강이
        add(capsule(t * 0.76, span * 0.44), z.base, [fx * pl + knee * 0.06, pawY + span * 0.28, zz], [0, 0, -knee * 0.3]);
        // 발
        const paw = add(sphere(0.1, 16), z.paw, [fx * pl + 0.04, pawY, zz]);
        paw.scale.set(1.3, 0.72, 1.05);
        // 발가락 + 발톱
        for (const tt of [-1, 0, 1]) {
          add(sphere(0.038, 10), z.paw, [fx * pl + 0.1, pawY - 0.01, zz + tt * 0.045]);
          add(cone(0.016, 0.05, 6), z.elem, [fx * pl + 0.145, pawY - 0.015, zz + tt * 0.045], [0, 0, -Math.PI / 2]);
        }
      }
    }

    // 등가시 / 등털 — 실루엣에 결을 준다
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      add(cone(0.05 - t * 0.015, body.spikes ? 0.2 : 0.13, body.spikes ? 6 : 6), body.spikes ? z.elem : z.mark, [
        (0.28 - t * 0.55) * pl,
        bodyY + bodyR * 0.86 - t * 0.05,
        0,
      ], [0, 0, -0.25]);
    }

    // 가슴털
    const ruff = add(sphere(0.17, 18), z.belly, [0.4 * pl, bodyY - 0.1, 0.05]);
    ruff.scale.set(0.7, 0.85, 1.05);

    // 수염과 콧구멍
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        add(capsule(0.0045, 0.11), z.sclera, [
          sx + 0.02,
          headY - 0.05 * hs + i * 0.03,
          side * 0.09,
        ], [0, side * (0.5 + i * 0.18), Math.PI / 2 - 0.1]);
      }
      add(sphere(0.017, 8), z.ink, [sx + 0.1 + snout * 0.12, headY - 0.03 * hs, side * 0.032]);
    }

    // 꼬리
    const tailY = bodyY + 0.12;
    if (body.tail === 'bushy') {
      add(capsule(0.16, 0.34), z.base, [-0.6 * pl, tailY, 0], [0, 0, -0.85]);
      add(sphere(0.19), z.base, [-0.8 * pl, tailY + 0.24, 0]);
      add(sphere(0.13), z.belly, [-0.88 * pl, tailY + 0.36, 0]);
    } else if (body.tail === 'thin') {
      add(capsule(0.055, 0.4), z.base, [-0.58 * pl, tailY - 0.06, 0], [0, 0, -0.7]);
      add(sphere(0.075), z.belly, [-0.76 * pl, tailY + 0.14, 0]);
    } else if (body.tail === 'puff') {
      add(sphere(0.16), z.belly, [-0.56 * pl, bodyY - 0.06, 0]);
    } else if (body.tail === 'lizard') {
      // 바닥으로 흐르며 가늘어지는 꼬리
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        add(sphere(0.14 * (1 - t * 0.8), 12), i % 2 ? z.base : z.mark, [
          -0.5 * pl - t * 0.62,
          bodyY - 0.06 - t * (bodyY - 0.2),
          0,
        ]);
      }
    }

    if (body.glow) {
      const core = add(sphere(0.13, 16), z.glow, [-0.2 * pl, bodyY - 0.16, 0]);
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

    /*
     * 얼굴은 몸통 위쪽 1/2 지점을 머리로 친다.
     * face()가 눈을 반지름의 0.8배 지점에 놓으므로, 그 자리가 실제 표면이
     * 되도록 몸통 반지름을 0.8로 나눠 넘긴다. 안 그러면 눈이 젤리 속에 잠긴다.
     */
    const fy = 0.48 * h;
    const fr = radiusAt(0.48) / 0.8;
    face(0, fy, 0, fr, 0.5, 0.16, radiusAt(0.48) * 0.17);
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

    // 머리
    add(capsule(0.14, 0.14), z.base, [0.56 * pl, 0.42, 0], [0, 0, Math.PI / 2 - 0.3]);
    const head = add(sphere(0.19), z.base, [0.7 * pl, 0.5, 0]);
    head.scale.set(1.08, 0.95, 0.95);
    add(sphere(0.028), z.ink, [0.86 * pl, 0.47, 0]);
    face(0.7 * pl, 0.52, 0, 0.19, 0.5, 0.24);
    if (body.horns) addHorns(0.68 * pl, 0.54, 0.7);

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
  } else if (body.kind === 'bird') {
    // 새는 몸이 서 있다. 네발과 실루엣이 확실히 갈리도록 세로로 세운다.
    const b = add(sphere(0.34 * pw, 24), z.base, [0, 0.62, 0]);
    b.scale.set(1, 1.16, 0.96);
    const chest = add(sphere(0.27, 20), z.belly, [0.15, 0.58, 0.06]);
    chest.scale.set(0.9, 1.18, 0.8);
    addPattern(0, 0.66, 0.4, 0.34 * pw);

    const headR = 0.25 * (body.head ?? 1);
    add(sphere(headR), z.base, [0.14, 1.0, 0]);
    // 부리 (위아래 두 겹)
    add(cone(0.085, 0.26, 10), z.elem, [0.42, 0.99, 0], [0, 0, -Math.PI / 2]);
    add(cone(0.058, 0.15, 10), z.paw, [0.4, 0.93, 0], [0, 0, -Math.PI / 2]);
    face(0.14, 1.0, 0, headR, 0.58, 0.14);
    if (body.horns) addHorns(0.1, 1.02, 0.8);
    if (body.ears === 'pointed') {
      // 부엉이 귀깃
      for (const side of [-1, 1]) {
        add(cone(0.06, 0.2, 8), z.mark, [0.06, 1.2, side * 0.13], [0, 0, side * 0.35]);
      }
    }

    for (const side of [-1, 1]) {
      const w = add(sphere(0.33, 18), z.mark, [-0.06, 0.68, side * 0.33]);
      w.scale.set(0.95, 0.58, 0.2);
      w.rotation.z = side * 0.18;
      // 날개 끝 깃 — 층지게 겹친다
      for (let i = 0; i < 4; i++) {
        add(capsule(0.034, 0.18 - i * 0.02), i % 2 ? z.belly : z.paw, [
          -0.28 - i * 0.07, 0.62 - i * 0.04, side * (0.32 - i * 0.015),
        ], [0, 0, 1.3]);
      }
    }
    // 꽁지깃
    for (let i = -1; i <= 1; i++) {
      const t = add(capsule(0.05, 0.3), z.mark, [-0.48, 0.54 + i * 0.02, i * 0.09], [0, 0, 1.15]);
      t.scale.set(1, 1, 0.4);
    }
    for (const side of [-1, 1]) {
      add(capsule(0.042, 0.16), z.paw, [0.04, 0.24, side * 0.12]);
      const foot = add(sphere(0.07, 10), z.paw, [0.08, 0.09, side * 0.12], undefined, [1.2, 0.6, 1]);
      foot.scale.set(1.3, 0.55, 1);
      for (const t of [-1, 0, 1]) {
        add(cone(0.018, 0.06, 6), z.elem, [0.15, 0.07, side * 0.12 + t * 0.04], [0, 0, -Math.PI / 2]);
      }
    }
    if (body.glow) {
      const halo = add(new THREE.TorusGeometry(0.34, 0.03, 8, 28), z.glow, [0.05, 0.72, 0], [0.5, 0, 0.3]);
      halo.castShadow = false;
    }
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
    face(hx, hy, hz, 0.2 * pw, 0.5, 0.26);
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
  }

  return g;
}

/** 종별 체형 정의 — 42종 전부. 빠지면 조용히 1번 체형으로 떨어져 전부 같아 보인다. */
export const PET_BODIES: Record<number, PetBody> = {
  // ─── 푸른 초원 ───
  1: { kind: 'quadruped', surface: 'fur', proportions: [0.82, 1.0, 1.0], legs: 0.8, ears: 'long', tail: 'puff', snout: 0.1, build: 'sturdy' },
  2: { kind: 'quadruped', surface: 'fur', proportions: [1.05, 0.98, 0.86], legs: 1.05, ears: 'pointed', tail: 'bushy', snout: 0.95, build: 'slim' },
  3: { kind: 'blob', surface: 'slime', proportions: [1, 1, 1] },
  4: { kind: 'shelled', surface: 'scale', proportions: [1, 1, 1] },
  5: { kind: 'bird', surface: 'feather', proportions: [1, 1, 0.85], head: 1.05 },
  6: { kind: 'blob', surface: 'slime', proportions: [0.8, 0.72, 0.72], glow: true, horns: 'spike' },
  7: { kind: 'quadruped', surface: 'fur', proportions: [0.9, 0.86, 1.05], legs: 0.45, ears: 'round', tail: 'puff', snout: 0.8, build: 'sturdy' },
  8: { kind: 'quadruped', surface: 'fur', proportions: [1.0, 0.95, 0.82], legs: 1.1, ears: 'pointed', tail: 'thin', snout: 0.35, build: 'slim' },
  9: { kind: 'quadruped', surface: 'scale', proportions: [1.1, 0.8, 0.88], legs: 0.5, ears: 'none', tail: 'lizard', snout: 0.8, spikes: true },
  10: { kind: 'bird', surface: 'feather', proportions: [1.05, 1.05, 0.92], head: 0.95 },
  11: { kind: 'quadruped', surface: 'fur', proportions: [1.0, 1.05, 0.8], legs: 1.45, ears: 'pointed', tail: 'puff', snout: 0.6, horns: 'crystal', build: 'slim' },
  12: { kind: 'quadruped', surface: 'fur', proportions: [1.12, 1.06, 1.0], legs: 1.2, ears: 'pointed', tail: 'bushy', snout: 0.8, mane: true, build: 'sturdy' },
  13: { kind: 'bird', surface: 'feather', proportions: [0.95, 1.0, 1.05], head: 1.25, ears: 'pointed', glow: true },
  14: { kind: 'shelled', surface: 'rock', proportions: [1.1, 1.1, 1.18], horns: 'spike' },
  15: { kind: 'quadruped', surface: 'fur', proportions: [0.88, 1.0, 0.9], legs: 1.15, ears: 'long', tail: 'puff', snout: 0.15, build: 'slim' },
  16: { kind: 'quadruped', surface: 'fur', proportions: [1.08, 1.0, 0.9], legs: 1.05, ears: 'pointed', tail: 'bushy', snout: 0.95, spikes: true, build: 'slim' },
  17: { kind: 'blob', surface: 'slime', proportions: [1.05, 1.1, 1.05], glow: true },
  18: { kind: 'shelled', surface: 'rock', proportions: [1, 1, 1.08], horns: 'spike' },
  19: { kind: 'bird', surface: 'feather', proportions: [1.1, 0.92, 0.8], head: 0.9 },
  20: { kind: 'bird', surface: 'feather', proportions: [0.85, 0.85, 1.15], head: 0.95, glow: true },
  21: { kind: 'quadruped', surface: 'rock', proportions: [0.95, 0.9, 1.1], legs: 0.5, ears: 'round', tail: 'puff', snout: 0.75, build: 'sturdy' },
  // ─── 울창한 숲 ───
  22: { kind: 'serpent', surface: 'scale', proportions: [1, 1, 1] },
  23: { kind: 'blob', surface: 'slime', proportions: [1.1, 0.75, 1.15], cap: true },
  24: { kind: 'quadruped', surface: 'scale', proportions: [1.3, 0.78, 0.95], legs: 0.42, ears: 'none', tail: 'lizard', snout: 1.0, spikes: true, build: 'sturdy' },
  25: { kind: 'quadruped', surface: 'fur', proportions: [1.15, 1.0, 0.85], legs: 1.25, ears: 'round', tail: 'thin', snout: 0.5, pattern: 'spots', build: 'slim' },
  26: { kind: 'blob', surface: 'rock', proportions: [1.05, 1.25, 1.0], horns: 'antler', glow: true },
  27: { kind: 'quadruped', surface: 'rock', proportions: [1.2, 1.15, 1.2], legs: 1.1, ears: 'none', tail: 'none', snout: 0.4, horns: 'antler', mane: true, build: 'sturdy' },
  // ─── 험준한 산맥 ───
  28: { kind: 'quadruped', surface: 'fur', proportions: [0.95, 1.0, 0.95], legs: 1.15, ears: 'pointed', tail: 'puff', snout: 0.55, horns: 'curved', build: 'sturdy' },
  29: { kind: 'shelled', surface: 'rock', proportions: [1.05, 0.85, 1.15], horns: 'spike' },
  30: { kind: 'bird', surface: 'feather', proportions: [1.15, 1.1, 1.05], head: 1.0 },
  31: { kind: 'quadruped', surface: 'fur', proportions: [1.05, 1.2, 1.2], legs: 1.25, ears: 'round', tail: 'none', snout: 0.3, mane: true, build: 'sturdy' },
  32: { kind: 'quadruped', surface: 'rock', proportions: [1.25, 1.15, 1.22], legs: 1.15, ears: 'pointed', tail: 'bushy', snout: 0.7, horns: 'curved', mane: true, spikes: true, build: 'sturdy' },
  // ─── 불타는 화산 ───
  33: { kind: 'shelled', surface: 'slime', proportions: [0.9, 0.9, 0.95], glow: true },
  34: { kind: 'bird', surface: 'feather', proportions: [1.0, 1.0, 0.88], head: 0.95 },
  35: { kind: 'quadruped', surface: 'rock', proportions: [1.15, 1.1, 1.25], legs: 0.95, ears: 'none', tail: 'none', snout: 0.35, spikes: true, glow: true, build: 'sturdy' },
  36: { kind: 'bird', surface: 'feather', proportions: [1.1, 1.15, 1.0], head: 1.0, glow: true, horns: 'crystal' },
  37: { kind: 'quadruped', surface: 'rock', proportions: [1.3, 1.2, 1.25], legs: 1.1, ears: 'pointed', tail: 'lizard', snout: 0.85, horns: 'spike', mane: true, spikes: true, glow: true, build: 'sturdy' },
  // ─── 신비한 빙산 ───
  38: { kind: 'quadruped', surface: 'fur', proportions: [1.0, 0.95, 0.9], legs: 1.05, ears: 'pointed', tail: 'bushy', snout: 0.9, build: 'slim' },
  39: { kind: 'quadruped', surface: 'fur', proportions: [1.25, 1.2, 1.3], legs: 1.2, ears: 'round', tail: 'thin', snout: 1.0, horns: 'tusk', mane: true, build: 'sturdy' },
  40: { kind: 'blob', surface: 'slime', proportions: [0.95, 1.2, 0.9], glow: true, horns: 'crystal' },
  41: { kind: 'serpent', surface: 'scale', proportions: [1.2, 1.15, 1.15], spikes: true, horns: 'spike' },
  42: { kind: 'bird', surface: 'feather', proportions: [1.05, 1.2, 1.0], head: 1.05, horns: 'crystal', glow: true },
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
function frame(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  const sph = box.getBoundingSphere(new THREE.Sphere());
  const s = sph.radius > 0.01 ? 0.95 / sph.radius : 1;
  group.scale.setScalar(s);
  // 외접구 중심을 화면 중앙(카메라가 보는 y=0.62)에 두고, 발은 바닥에 붙인다
  group.position.set(-sph.center.x * s, -box.min.y * s, -sph.center.z * s);
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
    const pal = petPalette(shapeId, element);

    // 체형은 안쪽 그룹에 담고 크기 보정을 걸어, 바깥 그룹은 포즈 애니메이션에만 쓴다
    const inner = buildPet(body, pal, seed + shapeId * 13);
    frame(inner);
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
      const t = (performance.now() - t0) / 1000;
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

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(frameLoop);
    };
    raf = requestAnimationFrame(frameLoop);

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
