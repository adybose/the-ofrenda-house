import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform float flash;
  uniform vec3 moon;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float clouds(vec3 d) {
    vec3 p = d * 3.0 + vec3(time * 0.02, 0.0, time * 0.012);
    float v = 0.0;
    float a = 0.55;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.2, 1.0);
    float c = clouds(d);
    // Storm clouds: dark navy gaps, heavier grey-blue billows.
    vec3 gap = vec3(0.008, 0.010, 0.018);
    vec3 billow = vec3(0.045, 0.050, 0.068);
    vec3 colour = mix(gap, billow, smoothstep(0.35, 0.75, c));
    // The moon, smothered: a soft glow through the thinner cloud.
    float glow = pow(max(dot(d, normalize(moon)), 0.0), 18.0);
    colour += vec3(0.07, 0.08, 0.10) * glow * (1.2 - c);
    // Lightning lights the cloud undersides from within.
    colour += vec3(0.55, 0.60, 0.80) * flash * (0.35 + c);
    // Darker towards and below the horizon, into the hills.
    colour *= smoothstep(-0.15, 0.25, up) * 0.85 + 0.15;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** A dim, slowly churning storm sky with a hidden moon. It follows the camera; lightning brightens it. */
export function createSky(): { mesh: Mesh; update(time: number, camera: Vector3, flash: number): void; dispose(): void } {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { time: { value: 0 }, flash: { value: 0 }, moon: { value: new Vector3(-0.35, 0.45, -0.82) } },
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  // Inside the camera's 60 m far plane.
  const mesh = new Mesh(new SphereGeometry(55, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, camera, flash) {
      mesh.position.copy(camera);
      material.uniforms.time!.value = time;
      material.uniforms.flash!.value = flash;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
