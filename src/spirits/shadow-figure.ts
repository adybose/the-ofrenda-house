import { CylinderGeometry, Group, IcosahedronGeometry, LatheGeometry, Mesh, ShaderMaterial, Vector2, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// La Sombra (spec 12): a tall faceless silhouette in a long cloak, blacker than the dark around it.
// It lights itself with nothing: the torch passes over it, so it shows as a shape against the beam,
// candlelight and lightning, its edges eaten by moving noise.

const VERTEX = /* glsl */ `
uniform float time;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main() {
  vec3 p = position;
  // The cloak stirs as if in a draught that isn't there.
  p.x += sin(time * 1.7 + position.y * 4.0) * 0.03 * (1.0 - position.y / 2.4);
  p.z += cos(time * 1.3 + position.y * 3.0) * 0.03 * (1.0 - position.y / 2.4);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform float time;
uniform float fade;
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
  vec3 toEye = normalize(cameraPosition - vWorld);
  float rim = 1.0 - abs(dot(normalize(vNormal), toEye));
  float n = noise(vWorld * 5.0 + vec3(0.0, time * 0.8, time * 0.3));
  // Solid black in the middle; at the edges the noise eats it away.
  float edge = smoothstep(0.35, 0.95, rim + (n - 0.5) * 0.6);
  // It frays into nothing at the hem.
  float hem = smoothstep(0.0, 0.35, vHeight);
  float alpha = (0.97 - 0.9 * edge) * hem * fade;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(vec3(0.0), alpha);
}
`;

/** The figure: about 2.3 m tall, a hooded head with no face, long thin arms hanging low. */
function silhouette(): BufferGeometry {
  const profile = [
    [0.02, 0],
    [0.42, 0.02],
    [0.34, 0.6],
    [0.26, 1.3],
    [0.24, 1.6],
    [0.3, 1.75],
    [0.15, 1.85],
    [0.05, 1.9],
  ].map(([r, y]) => new Vector2(r!, y!));
  const body = new LatheGeometry(profile, 9);
  // The hood, stretched tall.
  const head = new IcosahedronGeometry(0.16, 1).scale(0.9, 1.5, 1).translate(0, 2.08, 0.02);
  const arms = [-1, 1].map((side) => new CylinderGeometry(0.05, 0.03, 1.2, 5).translate(side * 0.33, 1.15, 0.04));
  const parts = [body, head, ...arms].map((g) => g.toNonIndexed());
  const merged = mergeGeometries(parts)!;
  for (const g of [body, head, ...arms, ...parts]) g.dispose();
  return merged;
}

export class ShadowFigure extends Group {
  private readonly material: ShaderMaterial;
  private fadeLevel = 0;

  constructor() {
    super();
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { time: { value: 0 }, fade: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new Mesh(silhouette(), this.material);
    mesh.renderOrder = 9;
    this.add(mesh);
    this.name = 'la-sombra';
  }

  get fade(): number {
    return this.fadeLevel;
  }

  /** 0 gone (every fragment discarded: it stays in the scene, so its shader is compiled at load), 1 there. */
  setFade(level: number): void {
    this.fadeLevel = Math.max(0, Math.min(1, level));
  }

  update(time: number): void {
    this.material.uniforms.time!.value = time;
    this.material.uniforms.fade!.value = this.fadeLevel;
  }
}
