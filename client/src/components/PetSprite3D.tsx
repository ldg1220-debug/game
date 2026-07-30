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
  tail?: 'bushy' | 'thin' | 'none';
  horns?: boolean;
}

let shared: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} | null = null;

function getShared() {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
  key.shadow.mapSize.set(512, 512);
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

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(2.9, 1.35, 3.0);
  camera.lookAt(0, 0.66, 0);

  shared = { renderer, scene, camera };
  return shared;
}

/** 프리미티브를 조합해 몸을 만든다 */
function buildPet(body: PetBody, color: string, accent: string, seed: number): THREE.Group {
  const g = new THREE.Group();
  const mat = petMaterial(body.surface, color, seed, body.surface === 'scale' ? 1.1 : 1.25);
  const accentMat = petMaterial(body.surface, accent, seed + 7, 1.1);
  const dark = new THREE.MeshStandardMaterial({ color: 0x151020, roughness: 0.35 });
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

  const sphere = (r: number, seg = 20) => new THREE.SphereGeometry(r, seg, seg);
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 16);

  if (body.kind === 'quadruped') {
    // 몸통
    add(capsule(0.34 * pw, 0.52 * pl), mat, [0, 0.62, 0], [0, 0, Math.PI / 2]);
    // 가슴
    add(sphere(0.33 * pw), mat, [0.3 * pl, 0.64, 0]);
    // 엉덩이
    add(sphere(0.3 * pw), mat, [-0.32 * pl, 0.6, 0]);
    // 머리
    const head = add(sphere(0.28 * ph), mat, [0.62 * pl, 0.92 * ph, 0]);
    head.scale.set(1, 0.94, 0.92);
    // 주둥이
    add(capsule(0.12 * ph, 0.14), mat, [0.82 * pl, 0.84 * ph, 0], [0, 0, Math.PI / 2]);
    add(sphere(0.05), dark, [0.93 * pl, 0.86 * ph, 0]);
    // 눈
    for (const s of [-1, 1]) {
      add(sphere(0.055, 12), dark, [0.72 * pl, 0.99 * ph, s * 0.14]);
      add(sphere(0.02, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }), [
        0.755 * pl,
        1.01 * ph,
        s * 0.15,
      ]);
    }
    // 귀
    if (body.ears === 'pointed') {
      for (const s of [-1, 1]) {
        add(new THREE.ConeGeometry(0.1, 0.26, 10), mat, [0.58 * pl, 1.16 * ph, s * 0.15], [0, 0, s * 0.18]);
      }
    } else if (body.ears === 'long') {
      for (const s of [-1, 1]) {
        add(capsule(0.07, 0.3), mat, [0.55 * pl, 1.3 * ph, s * 0.13], [0, 0, s * 0.22]);
      }
    }
    if (body.horns) {
      for (const s of [-1, 1]) {
        add(new THREE.ConeGeometry(0.07, 0.3, 8), accentMat, [0.58 * pl, 1.22 * ph, s * 0.14], [0, 0, s * 0.5]);
      }
    }
    // 다리 4개
    for (const fx of [0.34, -0.3]) {
      for (const s of [-1, 1]) {
        add(capsule(0.09, 0.3), mat, [fx * pl, 0.28, s * 0.22]);
        add(sphere(0.1, 12), mat, [fx * pl, 0.1, s * 0.22]);
      }
    }
    // 꼬리
    if (body.tail === 'bushy') {
      add(capsule(0.17, 0.4), accentMat, [-0.62 * pl, 0.78, 0], [0, 0, -0.9]);
      add(sphere(0.15), accentMat, [-0.82 * pl, 1.0, 0]);
    } else if (body.tail === 'thin') {
      add(capsule(0.06, 0.42), mat, [-0.6 * pl, 0.7, 0], [0, 0, -0.7]);
    }
  } else if (body.kind === 'blob') {
    const b = add(sphere(0.5 * pw, 28), mat, [0, 0.52 * ph, 0]);
    b.scale.set(1, 1.08 * ph, 1);
    // 물방울 꼭지
    add(new THREE.ConeGeometry(0.2, 0.4, 18), mat, [0, 1.02 * ph, 0]);
    for (const s of [-1, 1]) {
      add(sphere(0.07, 14), dark, [0.34, 0.62 * ph, s * 0.18]);
      add(sphere(0.026, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }), [
        0.38,
        0.65 * ph,
        s * 0.19,
      ]);
    }
  } else if (body.kind === 'shelled') {
    // 등껍질
    const shell = add(sphere(0.52 * pw, 24), accentMat, [0, 0.48, 0]);
    shell.scale.set(1.05, 0.62, 0.92);
    // 배
    const belly = add(sphere(0.46 * pw, 20), mat, [0, 0.34, 0]);
    belly.scale.set(1, 0.42, 0.9);
    // 머리
    add(sphere(0.2), mat, [0.6 * pl, 0.44, 0]);
    add(sphere(0.045, 10), dark, [0.72 * pl, 0.5, 0.09]);
    add(sphere(0.045, 10), dark, [0.72 * pl, 0.5, -0.09]);
    for (const fx of [0.3, -0.3]) {
      for (const s of [-1, 1]) {
        add(capsule(0.09, 0.12), mat, [fx, 0.16, s * 0.34], [0, 0, Math.PI / 2]);
      }
    }
    add(capsule(0.06, 0.16), mat, [-0.6 * pl, 0.34, 0], [0, 0, Math.PI / 2]);
  } else if (body.kind === 'bird') {
    const b = add(sphere(0.33 * pw, 22), mat, [0, 0.66, 0]);
    b.scale.set(1, 1.12, 0.95);
    add(sphere(0.24), mat, [0.16, 1.02, 0]);
    add(new THREE.ConeGeometry(0.09, 0.24, 10), accentMat, [0.42, 0.99, 0], [0, 0, -Math.PI / 2]);
    for (const s of [-1, 1]) {
      add(sphere(0.05, 10), dark, [0.28, 1.08, s * 0.11]);
      // 날개
      const w = add(sphere(0.3, 16), accentMat, [-0.05, 0.72, s * 0.34]);
      w.scale.set(0.9, 0.5, 0.24);
      w.rotation.z = s * 0.2;
    }
    // 꼬리깃
    const t = add(sphere(0.25, 14), accentMat, [-0.42, 0.6, 0]);
    t.scale.set(0.8, 0.3, 0.5);
    for (const s of [-1, 1]) add(capsule(0.05, 0.12), mat, [0.02, 0.28, s * 0.13]);
  } else {
    // serpent
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      add(sphere(0.28 - t * 0.16, 18), mat, [
        -0.55 + Math.cos(t * Math.PI * 1.3) * 0.75,
        0.32 + Math.sin(t * Math.PI * 1.1) * 0.34,
        Math.sin(t * Math.PI * 1.6) * 0.28,
      ]);
    }
    const head = add(sphere(0.28, 20), mat, [0.66, 0.62, 0]);
    head.scale.set(1.1, 0.86, 0.9);
    for (const s of [-1, 1]) add(sphere(0.05, 10), dark, [0.82, 0.7, s * 0.12]);
  }

  return g;
}

/** 종별 체형 정의 (프로토타입: 대표 5종) */
export const PET_BODIES: Record<number, PetBody> = {
  1: { kind: 'quadruped', surface: 'fur', proportions: [0.9, 1.0, 0.95], ears: 'long', tail: 'bushy' },
  2: { kind: 'quadruped', surface: 'fur', proportions: [1.0, 1.0, 0.9], ears: 'pointed', tail: 'bushy' },
  3: { kind: 'blob', surface: 'slime', proportions: [1, 1, 1] },
  4: { kind: 'shelled', surface: 'scale', proportions: [1, 1, 1] },
  5: { kind: 'bird', surface: 'feather', proportions: [1, 1, 1] },
  12: { kind: 'quadruped', surface: 'fur', proportions: [1.05, 1.05, 1.0], ears: 'pointed', tail: 'bushy' },
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
    const group = buildPet(body, pal.main, pal.sub, seed + shapeId * 13);

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
