import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Character, Role } from '../case/types';
import type { Rng } from '../core/rng';

// A spirit (spec 11): a low-poly figure shaped by its character (age by role, a skirt or a coat by
// gender), tinted by role, drawn with a translucent shader. Animated 3D noise drifts through it, a
// rim glows at its edges, it flickers, floats and fades. It lights itself: it glows in the dark.
// The killer looks exactly like the others. A soft halo around it shows it faintly even in total
// darkness, and it can drift through walls (spec 19).

/** A pale tint per role, so spirits are told apart at a glance. */
const TINT: Record<Role, string> = {
  patriarch: '#c9b48a',
  painter: '#b9a3d9',
  matriarch: '#d99a9a',
  bookkeeper: '#9fc6c9',
  housekeeper: '#a9b4c6',
  cook: '#e0b07e',
  eldestChild: '#e3a6c4',
  doctor: '#a6c3e6',
  grandmother: '#d3d3d3',
  gardener: '#a9cf9a',
};

/** Height and breadth by role; the old stoop. */
const BUILD: Partial<Record<Role, { height: number; breadth: number; stoop: number }>> = {
  patriarch: { height: 1.02, breadth: 1.15, stoop: 0 },
  grandmother: { height: 0.88, breadth: 0.95, stoop: 0.16 },
  eldestChild: { height: 0.94, breadth: 0.88, stoop: 0 },
};

const VERTEX = /* glsl */ `
uniform float time;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main() {
  vec3 p = position;
  // A slow ripple, as if it stood in moving water.
  p.x += sin(time * 1.3 + position.y * 3.0) * 0.015;
  p.z += cos(time * 1.1 + position.y * 2.5) * 0.012;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 tint;
uniform float time;
uniform float fade;
uniform float lit;
uniform float flicker;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
void main() {
  // Mist rising through the figure.
  float n = noise(vWorld * 3.0 + vec3(0.0, -time * 0.6, time * 0.2)) * 0.6 + noise(vWorld * 7.0 + vec3(time * 0.3, -time * 0.9, 0.0)) * 0.4;
  vec3 toEye = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - abs(dot(normalize(vNormal), toEye)), 2.0);
  // It fades into nothing towards the floor.
  float feet = smoothstep(0.0, 0.55, vHeight);
  float alpha = (0.14 + 0.3 * n + 0.4 * rim) * feet * fade * flicker * (1.0 + 0.35 * lit);
  vec3 colour = tint * (0.55 + 0.65 * n) + rim * vec3(0.55, 0.7, 0.85);
  colour *= 1.0 + 0.8 * lit;
  gl_FragColor = vec4(colour, clamp(alpha, 0.0, 0.8));
}
`;

/** A soft round glow, built from bytes (no canvas), shared by every halo. */
const HALO_TEXTURE = (() => {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, 1 - d) ** 2.2;
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
})();

/** How strong the halo is at full fade. */
const HALO_OPACITY = 0.45;
/** It floats this high above the floor, give or take the bob. */
const FLOAT = 0.32;
const BOB = 0.06;

interface Drift {
  from: Vector3;
  to: Vector3;
  seconds: number;
  start?: number;
  resolve(): void;
}

/** A spirit: an Object3D with its fade, its brightness in the torch beam and its animation. */
export class Spirit extends Group {
  private readonly material: ShaderMaterial;
  private readonly phase: number;
  private readonly flickerRate: number;
  private readonly halo: Sprite;
  private fadeLevel = 0;
  private litLevel = 0;
  private haloLevel = 1;
  private drifting: Drift | undefined;
  private driftProgress = 1;

  constructor(body: BufferGeometry, tint: Color, phase: number, flickerRate: number) {
    super();
    this.phase = phase;
    this.flickerRate = flickerRate;
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        tint: { value: tint },
        time: { value: 0 },
        fade: { value: 0 },
        lit: { value: 0 },
        flicker: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new Mesh(body, this.material);
    mesh.renderOrder = 10;
    this.halo = new Sprite(new SpriteMaterial({ map: HALO_TEXTURE, color: tint, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    this.halo.scale.set(1.4, 2.4, 1);
    this.halo.position.y = 0.95;
    this.halo.renderOrder = 11;
    mesh.add(this.halo);
    this.add(mesh);
  }

  /** 0..1: the glow around it (spec 19). */
  setHalo(level: number): void {
    this.haloLevel = Math.max(0, Math.min(1, level));
  }

  /** Glides from `from` to `to` (through a wall, if one is in the way), resolving on arrival. */
  drift(from: Vector3, to: Vector3, seconds: number): Promise<void> {
    this.drifting?.resolve();
    this.position.copy(from);
    this.driftProgress = 0;
    return new Promise((resolve) => (this.drifting = { from: from.clone(), to: to.clone(), seconds, resolve }));
  }

  /** How far along the current drift it is, 0..1 (1 when still). */
  get drift01(): number {
    return this.driftProgress;
  }

  /** 0 is gone, 1 fully there. */
  setFade(level: number): void {
    this.fadeLevel = Math.max(0, Math.min(1, level));
  }

  get fade(): number {
    return this.fadeLevel;
  }

  /** 0..1: brighter while the torch beam is on it. */
  setLit(level: number): void {
    this.litLevel = Math.max(0, Math.min(1, level));
  }

  get lit(): number {
    return this.litLevel;
  }

  /** Each frame: the float, the drifting mist and the flicker. */
  update(time: number): void {
    const t = time + this.phase;
    const u = this.material.uniforms;
    u.time!.value = t;
    u.fade!.value = this.fadeLevel;
    u.lit!.value = this.litLevel;
    // Flicker: two unrelated waves, with a rare deeper dip.
    const wave = Math.sin(t * this.flickerRate) * Math.sin(t * this.flickerRate * 2.7 + 1.3);
    const flicker = 0.85 + 0.15 * wave - (Math.sin(t * 0.7) > 0.97 ? 0.35 : 0);
    u.flicker!.value = flicker;
    this.children[0]!.position.y = FLOAT + Math.sin(t * 0.9) * BOB;
    this.halo.material.opacity = HALO_OPACITY * this.haloLevel * this.fadeLevel * flicker;

    const drift = this.drifting;
    if (drift) {
      drift.start ??= time;
      const k = Math.min(1, (time - drift.start) / drift.seconds);
      this.driftProgress = k;
      this.position.lerpVectors(drift.from, drift.to, k * k * (3 - 2 * k));
      if (k >= 1) {
        this.drifting = undefined;
        drift.resolve();
      }
    }
  }

  dispose(): void {
    const mesh = this.children[0] as Mesh;
    mesh.geometry.dispose();
    this.material.dispose();
    this.halo.material.dispose();
  }
}

/** A figure shaped by the character: a lathe-turned robe or dress, shoulders and a head. */
function figure(character: Character, rng: Rng): BufferGeometry {
  const build = BUILD[character.role] ?? { height: 1, breadth: 1, stoop: 0 };
  const skirt = character.gender === 'female';
  const h = build.height * (0.97 + rng.float() * 0.06);
  const w = build.breadth * (0.95 + rng.float() * 0.1);
  // [radius, height] from the hem up: a flared skirt, or a straighter coat.
  const profile = [
    [0.02, 0],
    [skirt ? 0.36 : 0.27, 0.02],
    [skirt ? 0.3 : 0.25, 0.45],
    [0.21, 0.92],
    [0.19, 1.12],
    [0.25, 1.3],
    [0.12, 1.4],
    [0.04, 1.44],
  ].map(([r, y]) => new Vector2(r! * w, y! * h));
  const body = new LatheGeometry(profile, 7);
  const head = new IcosahedronGeometry(0.115 * w, 0).translate(0, 1.56 * h, 0);
  const arms = [-1, 1].map((side) => new CylinderGeometry(0.045 * w, 0.035 * w, 0.62 * h, 5).translate(side * 0.25 * w, 1.0 * h, 0.02));
  const parts = [body, head, ...arms].map((g) => g.toNonIndexed());
  const merged = mergeGeometries(parts)!;
  for (const g of [body, head, ...arms, ...parts]) g.dispose();
  // The old bend forward from the waist.
  if (build.stoop) {
    const pos = merged.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.8 * h) pos.setZ(i, pos.getZ(i) + (y - 0.8 * h) * build.stoop);
    }
    merged.computeVertexNormals();
  }
  return merged;
}

/** The spirit of a character, from its own stream (the seed nudges its shape, tint and rhythm). */
export function createSpirit(character: Character, rng: Rng): Spirit & Object3D {
  const tint = new Color(TINT[character.role]).offsetHSL((rng.float() - 0.5) * 0.04, 0, (rng.float() - 0.5) * 0.06);
  return new Spirit(figure(character, rng), tint, rng.float() * 100, 5 + rng.float() * 4);
}
