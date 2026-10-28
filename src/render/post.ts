import {
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from 'three';

/** The scene is drawn this many pixels tall, then scaled up with nearest filtering. */
export const LOW_HEIGHT = 360;
/** Levels per colour channel after quantising (PS1-era 15-bit colour has 32). */
const LEVELS = 32;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 lowRes;
  uniform float time;
  uniform float levels;
  varying vec2 vUv;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i]) + 0.5) / 16.0;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 linear = texture2D(tScene, vUv).rgb;
    // Gamma by hand: the low-res target holds linear colour.
    vec3 c = pow(max(linear, 0.0), vec3(1.0 / 2.2));
    vec2 px = floor(vUv * lowRes);
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    // Film grain, fading to nothing on pure black so the dark stays dark.
    c += (hash(px + fract(time) * 97.0) - 0.5) * 0.09 * smoothstep(0.0, 0.12, lum);
    // Ordered dither into a few levels per channel. Black stays exactly black.
    c = floor(c * levels + bayer4(px)) / levels;
    float vignette = smoothstep(0.85, 0.3, length(vUv - 0.5));
    c *= mix(0.45, 1.0, vignette);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export interface PostPipeline {
  resize(width: number, height: number): void;
  render(renderer: WebGLRenderer, scene: Object3D, camera: Camera, time: number): void;
  dispose(): void;
}

/** Renders to a low-res target, then one full-screen pass for grain, dither and vignette. */
export function createPostPipeline(): PostPipeline {
  const target = new WebGLRenderTarget(640, LOW_HEIGHT, { magFilter: NearestFilter, minFilter: NearestFilter, depthBuffer: true });
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tScene: { value: target.texture },
      lowRes: { value: [640, LOW_HEIGHT] },
      time: { value: 0 },
      levels: { value: LEVELS },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const postScene = new Scene();
  postScene.add(quad);
  const postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    resize(width, height) {
      const lowWidth = Math.max(1, Math.round((LOW_HEIGHT * width) / Math.max(height, 1)));
      target.setSize(lowWidth, LOW_HEIGHT);
      material.uniforms.lowRes!.value = [lowWidth, LOW_HEIGHT];
    },
    render(renderer, scene, camera, time) {
      material.uniforms.time!.value = time;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
    dispose() {
      target.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
