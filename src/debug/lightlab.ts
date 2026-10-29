import {
  AmbientLight,
  BoxGeometry,
  Mesh,
  MeshLambertMaterial,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { createRng } from '../core/rng';
import { LIGHTING } from '../lighting/config';
import { Flashlight } from '../lighting/flashlight';
import { Lightning } from '../lighting/lightning';
import type { WindowSpot } from '../lighting/windows';
import type { PostPipeline } from '../render/post';

/** `?debug=lightlab`: the real flashlight and lightning against a pillar and a window, measured. */
export interface LightLab {
  /** Floor brightness where the pillar's shadow falls, with the pillar casting a shadow and without. */
  measurePillar(): { withShadow: number; withoutShadow: number };
  /** Brightness range across the lit patch under the window, with the frame casting shadows and without. */
  measureWindow(): { withFrame: { min: number; max: number }; withoutFrame: { min: number; max: number } };
  /** Frames one of the two setups on screen for a screenshot. */
  show(which: 'pillar' | 'window'): void;
}

declare global {
  interface Window {
    __lightlab?: LightLab;
  }
}

const WINDOW_Z = -6;
const WINDOW: WindowSpot = { x: 0, z: WINDOW_Z, outward: [0, -1] };

export function runLightLab(renderer: WebGLRenderer, post: PostPipeline): void {
  const scene = new Scene();
  scene.add(new AmbientLight(LIGHTING.ambient.color, LIGHTING.ambient.intensity));
  const grey = new MeshLambertMaterial({ color: 0xb8b0a0 });
  const add = (geometry: BoxGeometry | PlaneGeometry, x: number, y: number, z: number) => {
    const mesh = new Mesh(geometry, grey);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  const floor = add(new PlaneGeometry(30, 30), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;

  // The pillar, lit by a flashlight held to its right.
  const pillar = add(new BoxGeometry(0.4, 1.6, 0.4), 4, 0.8, 0);

  // A wall with a tall window: an opening with a cross of mullions, 20 cm thick, facing +z.
  const wall = (w: number, h: number, x: number, y: number) => add(new BoxGeometry(w, h, 0.2), x, y, WINDOW_Z);
  wall(4, 4, -2.45, 2);
  wall(4, 4, 2.45, 2);
  wall(0.9, 0.8, 0, 0.4);
  wall(0.9, 1.3, 0, 3.35);
  // A ceiling, as every room in the house has: without it, the sky lights the floor beyond the window's patch.
  add(new BoxGeometry(30, 0.2, 16), 0, 3.7, WINDOW_Z + 8.1);
  const mullions = [add(new BoxGeometry(0.06, 1.9, 0.1), 0, 1.75, WINDOW_Z + 0.05), add(new BoxGeometry(0.9, 0.06, 0.1), 0, 2.0, WINDOW_Z + 0.05)];

  const glass = new MeshBasicMaterial({ color: 0x000000 });
  const flashlight = new Flashlight(scene, renderer, { rng: createRng(1), level: 1 });
  const lightning = new Lightning(scene, { rng: createRng(1), window: () => WINDOW, glass, every: 1e9 });

  // The torch stands at shoulder height to the pillar's right, pointing at its foot.
  const torch = new PerspectiveCamera();
  torch.position.set(5.8, 1.4, 0.4);
  torch.lookAt(4, 0.3, 0);
  torch.updateMatrixWorld();
  flashlight.toggle();

  const camera = new PerspectiveCamera(60, 16 / 9, 0.05, 50);
  const target = new WebGLRenderTarget(320, 180);
  const pixels = new Uint8Array(4);

  const settle = () => {
    for (let i = 0; i < 30; i++) {
      flashlight.update(1 / 60, torch);
      lightning.update(1 / 60);
    }
  };

  const brightnessAt = (point: Vector3): number => {
    const ndc = point.clone().project(camera);
    const x = Math.round(((ndc.x + 1) / 2) * (target.width - 1));
    const y = Math.round(((ndc.y + 1) / 2) * (target.height - 1));
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, x, y, 1, 1, pixels);
    renderer.setRenderTarget(null);
    return (pixels[0]! + pixels[1]! + pixels[2]!) / 3;
  };

  const viewPillar = () => {
    camera.position.set(1.5, 2.6, 2.5);
    camera.lookAt(3, 0, -0.5);
    camera.updateMatrixWorld();
    lightning.hold(undefined);
    flashlight.toggle();
    if (!flashlight.on) flashlight.toggle();
    settle();
  };

  const viewWindow = () => {
    camera.position.set(2.2, 2.4, WINDOW_Z + 6);
    camera.lookAt(0, 0, WINDOW_Z + 2);
    camera.updateMatrixWorld();
    if (flashlight.on) flashlight.toggle();
    lightning.hold(1, { spot: WINDOW, yaw: 0 });
    settle();
  };

  // Where the pillar's shadow lands: from the torch, past the pillar's middle, down to the floor.
  const shadowPoint = (): Vector3 => {
    const from = flashlight.light.position.clone();
    const through = new Vector3(4, 0.5, 0);
    const dir = through.clone().sub(from);
    return from.addScaledVector(dir, -from.y / dir.y);
  };

  const elevation = LIGHTING.lightning.elevation;
  // The vertical mullion's shadow crosses the floor along x = 0 at this depth.
  const barZ = WINDOW_Z + 0.05 + 1.4 / Math.tan(elevation);

  window.__lightlab = {
    measurePillar() {
      viewPillar();
      const at = shadowPoint();
      pillar.castShadow = false;
      const withoutShadow = brightnessAt(at);
      pillar.castShadow = true;
      const withShadow = brightnessAt(at);
      return { withShadow, withoutShadow };
    },
    measureWindow() {
      viewWindow();
      const sample = () => {
        const values: number[] = [];
        for (let x = -0.3; x <= 0.3; x += 0.02) values.push(brightnessAt(new Vector3(x, 0, barZ)));
        return { min: Math.min(...values), max: Math.max(...values) };
      };
      for (const m of mullions) m.castShadow = false;
      const withoutFrame = sample();
      for (const m of mullions) m.castShadow = true;
      const withFrame = sample();
      return { withFrame, withoutFrame };
    },
    show(which) {
      if (which === 'pillar') viewPillar();
      else viewWindow();
    },
  };

  viewPillar();
  renderer.setAnimationLoop((time) => post.render(renderer, scene, camera, time / 1000));
  document.body.dataset.lightlabReady = 'true';
}
