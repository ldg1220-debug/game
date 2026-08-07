import * as THREE from 'three';

/**
 * 펫 재질 — 부팅 시 CPU에서 절차적으로 굽는 PBR 세트.
 *
 * 외부 이미지를 쓰지 않는다. 타일러블 값 노이즈로 높이장을 만들고,
 * 거기서 albedo(sRGB) · 탄젠트 노멀(높이장 Sobel) · ORM(r=AO, g=roughness,
 * b=metalness)을 굽는다. MeshStandardMaterial이 map / normalMap /
 * aoMap·roughnessMap·metalnessMap으로 그대로 샘플링하는 배치다.
 *
 * 평면 SVG로는 볼륨과 질감이 나오지 않는다. 조명이 붙는 3D 재질로 가야
 * 털·비늘·바위 같은 표면이 표현된다.
 */

/** 이음매 없는 값 노이즈 */
class TileNoise {
  private tab: Float32Array;
  private perm: Uint16Array;

  constructor(seed: number) {
    let s = seed >>> 0;
    const rnd = () => {
      // xorshift32
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
    this.tab = new Float32Array(2048);
    this.perm = new Uint16Array(2048);
    for (let i = 0; i < 2048; i++) this.tab[i] = rnd();
    for (let i = 0; i < 2048; i++) this.perm[i] = Math.floor(rnd() * 2047);
  }

  private h(ix: number, iy: number, period: number): number {
    const p = period | 0;
    const x = ((ix % p) + p) % p;
    const y = ((iy % p) + p) % p;
    return this.tab[(this.perm[(x * 73 + y * 151) & 2047] + x * 31 + y * 17) & 2047];
  }

  n2(u: number, v: number, period: number): number {
    const x = u * period;
    const y = v * period;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.h(ix, iy, period);
    const b = this.h(ix + 1, iy, period);
    const c = this.h(ix, iy + 1, period);
    const d = this.h(ix + 1, iy + 1, period);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }

  fbm(u: number, v: number, period: number, oct = 4, gain = 0.5): number {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let p = period;
    for (let i = 0; i < oct; i++) {
      sum += amp * this.n2(u, v, p);
      norm += amp;
      amp *= gain;
      p *= 2;
    }
    return sum / norm;
  }

  /** 결이 선명한 능선 노이즈. 털·비늘 구조에 쓴다. */
  ridge(u: number, v: number, period: number, oct = 3): number {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let p = period;
    for (let i = 0; i < oct; i++) {
      sum += amp * (1 - Math.abs(this.n2(u, v, p) * 2 - 1));
      norm += amp;
      amp *= 0.55;
      p *= 2;
    }
    return sum / norm;
  }
}

export type SurfaceKind = 'fur' | 'scale' | 'slime' | 'rock' | 'feather';

export interface PetMaterialSet {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  ormMap: THREE.DataTexture;
}

const SIZE = 256;
const cache = new Map<string, PetMaterialSet>();

function srgb(v: number): number {
  return Math.max(0, Math.min(255, Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2))));
}

/** 표면 종류별 높이장. 이 한 장에서 albedo·노멀·거칠기를 모두 파생시킨다. */
function heightField(kind: SurfaceKind, noise: TileNoise): Float32Array {
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      let value: number;
      switch (kind) {
        case 'fur':
          // 결이 한 방향으로 흐르도록 v를 늘려 샘플링한다
          value = noise.ridge(u * 1.0, v * 2.2, 26, 3) * 0.5 + noise.fbm(u, v, 9, 4) * 0.5;
          break;
        case 'scale': {
          // 어긋나게 쌓인 비늘 격자
          const cols = 14;
          const rows = 18;
          const row = Math.floor(v * rows);
          const su = (u * cols + (row % 2) * 0.5) % 1;
          const sv = (v * rows) % 1;
          const d = Math.sqrt((su - 0.5) ** 2 + ((sv - 0.5) * 1.25) ** 2);
          value = Math.max(0, 1 - d * 2.1) * 0.75 + noise.fbm(u, v, 9, 3) * 0.25;
          break;
        }
        case 'slime':
          value = noise.fbm(u, v, 3, 4, 0.55) * 0.85 + 0.15;
          break;
        case 'rock':
          value = noise.fbm(u, v, 5, 5, 0.55) * 0.6 + noise.ridge(u, v, 11, 3) * 0.4;
          break;
        case 'feather': {
          const rows = 22;
          const row = Math.floor(v * rows);
          const su = (u * 9 + (row % 2) * 0.5) % 1;
          const sv = (v * rows) % 1;
          value = (1 - Math.abs(su - 0.5) * 1.6) * (1 - sv * 0.6) * 0.7 + noise.fbm(u, v, 8, 3) * 0.3;
          break;
        }
      }
      h[y * SIZE + x] = Math.max(0, Math.min(1, value));
    }
  }
  return h;
}

/**
 * 재질 세트를 굽는다. baseColor는 종·원소에서 정해지고, 표면 종류가
 * 결·거칠기·금속감을 정한다. 같은 조합은 캐시된다.
 */
export function bakePetMaterial(kind: SurfaceKind, baseColor: string, seed: number): PetMaterialSet {
  const key = `${kind}|${baseColor}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const noise = new TileNoise(seed || 1);
  const h = heightField(kind, noise);

  const c = new THREE.Color(baseColor);
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const normal = new Uint8Array(SIZE * SIZE * 4);
  const orm = new Uint8Array(SIZE * SIZE * 4);

  const at = (x: number, y: number) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];

  // 표면별 거칠기/금속감 기준값
  const baseRough = kind === 'slime' ? 0.22 : kind === 'scale' ? 0.42 : kind === 'rock' ? 0.9 : 0.72;
  const baseMetal = kind === 'scale' ? 0.18 : kind === 'rock' ? 0.05 : 0.0;
  // 높이장이 색을 얼마나 흔드는지
  const tone = kind === 'slime' ? 0.1 : kind === 'rock' ? 0.3 : 0.24;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const hv = h[y * SIZE + x];

      // albedo: 높이가 낮은 골은 어둡게, 마루는 밝게
      const shade = 1 - tone * 0.5 + hv * tone;
      albedo[i] = srgb(c.r * shade);
      albedo[i + 1] = srgb(c.g * shade);
      albedo[i + 2] = srgb(c.b * shade);
      albedo[i + 3] = 255;

      // 노멀: 높이장 Sobel
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      const strength = kind === 'slime' ? 1.0 : 1.7;
      const nx = dx * strength;
      const ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      normal[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;

      // ORM: 골에 AO, 마루는 조금 매끈하게
      orm[i] = Math.round((0.55 + hv * 0.45) * 255);
      orm[i + 1] = Math.round(Math.max(0, Math.min(1, baseRough - (hv - 0.5) * 0.25)) * 255);
      orm[i + 2] = Math.round(baseMetal * 255);
      orm[i + 3] = 255;
    }
  }

  const make = (data: Uint8Array, srgbSpace: boolean) => {
    const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    if (srgbSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };

  const set: PetMaterialSet = {
    map: make(albedo, true),
    normalMap: make(normal, false),
    ormMap: make(orm, false),
  };
  cache.set(key, set);
  return set;
}

export function petMaterial(
  kind: SurfaceKind,
  baseColor: string,
  seed: number,
  repeat = 2,
): THREE.MeshStandardMaterial {
  const set = bakePetMaterial(kind, baseColor, seed);
  const clone = (t: THREE.DataTexture) => {
    const c = t.clone();
    c.repeat.set(repeat, repeat);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    envMapIntensity: 0.55,
    map: clone(set.map),
    normalMap: clone(set.normalMap),
    aoMap: clone(set.ormMap),
    roughnessMap: clone(set.ormMap),
    metalnessMap: clone(set.ormMap),
    normalScale: new THREE.Vector2(0.62, 0.62),
    roughness: 1,
    metalness: 1,
  });
}
