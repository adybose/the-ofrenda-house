import { BufferGeometry, Float32BufferAttribute, LineSegments, ShaderMaterial, Vector3 } from 'three';
import { createRng } from '../core/rng';

const DROPS = 3500;
/** The box of rain kept around the camera (metres). */
const BOX = [26, 16, 26] as const;

const vertexShader = /* glsl */ `
  attribute vec3 seed;
  attribute float tail;
  uniform float time;
  uniform vec3 centre;
  uniform vec3 box;
  varying float vFade;
  void main() {
    // Each drop falls at its own speed and wraps round inside the box, so the rain never ends.
    float speed = 9.0 + seed.y * 4.0;
    vec3 p = seed * box;
    p.y -= time * speed;
    p.x += time * 1.3;
    p.z += time * 0.5;
    p = mod(p - centre + box * 0.5, box) + centre - box * 0.5;
    // The tail end trails up and against the wind: a streak.
    p += vec3(-0.06, 0.45, -0.025) * tail;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    vFade = clamp(1.0 + view.z / 22.0, 0.0, 1.0) * (1.0 - tail * 0.6);
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float flash;
  varying float vFade;
  void main() {
    vec3 colour = mix(vec3(0.20, 0.23, 0.30), vec3(0.85, 0.9, 1.0), flash);
    gl_FragColor = vec4(colour, vFade * (0.35 + 0.4 * flash));
  }
`;

/** Rain streaks around the camera, animated entirely on the GPU. */
export function createRain(): { mesh: LineSegments; update(time: number, camera: Vector3, flash: number): void; dispose(): void } {
  const rng = createRng(31);
  const seeds: number[] = [];
  const tails: number[] = [];
  for (let i = 0; i < DROPS; i++) {
    const s = [rng.float(), rng.float(), rng.float()];
    seeds.push(...s, ...s);
    tails.push(0, 1);
  }
  const geometry = new BufferGeometry();
  // Positions are computed in the shader; three still wants a position attribute.
  geometry.setAttribute('position', new Float32BufferAttribute(new Array(DROPS * 6).fill(0), 3));
  geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 3));
  geometry.setAttribute('tail', new Float32BufferAttribute(tails, 1));
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { time: { value: 0 }, centre: { value: new Vector3() }, box: { value: new Vector3(...BOX) }, flash: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new LineSegments(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, camera, flash) {
      material.uniforms.time!.value = time;
      (material.uniforms.centre!.value as Vector3).copy(camera);
      material.uniforms.flash!.value = flash;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
