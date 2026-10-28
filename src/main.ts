import { AmbientLight, Color, HemisphereLight, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { generateCase } from './case/generate';
import { events } from './core/events';
import { createRng } from './core/rng';
import { readRunSeed } from './core/run-seed';
import { createTextureCache } from './render/atlas';
import { createPostPipeline } from './render/post';
import { WorldView } from './render/world-view';
import { createHouse } from './world/house';
import { EYE_HEIGHT, cellCentre } from './world/units';

const url = new URL(window.location.href);
const debug = new Set(url.searchParams.getAll('debug').flatMap((value) => value.split(',')));

const { seed, fromUrl } = readRunSeed(url);
if (!fromUrl) console.info(`Run seed ${seed}. Replay this run with ?seed=${seed}`);
// Read by the Playwright seed test.
document.body.dataset.seed = String(seed);

const renderer = new WebGLRenderer({ antialias: false });
renderer.setClearColor(0x000000, 1);
// The scene is drawn 360 px tall anyway, so a high pixel ratio would only cost time.
renderer.setPixelRatio(1);
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x000000);
const camera = new PerspectiveCamera(70, 1, 0.05, 60);
camera.rotation.order = 'YXZ';

const caseFile = generateCase(seed);
const house = createHouse(seed, caseFile);
const textures = createTextureCache(seed, caseFile);
const view = new WorldView(scene, textures);
view.apply(house.update(house.startCell));
const [startX, startZ] = cellCentre(house.startCell);
camera.position.set(startX, EYE_HEIGHT, startZ);

if (debug.has('fullbright')) {
  // A flat light so rooms can be seen before spec 06 brings the dark.
  scene.add(new AmbientLight(0xffffff, 1.6));
  scene.add(new HemisphereLight(0xfff2dd, 0x40342a, 1.2));
}

const post = createPostPipeline();

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  post.resize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // Read by the Playwright resize test.
  document.body.dataset.cameraAspect = String(camera.aspect);
}

window.addEventListener('resize', resize);
resize();

const fpsTools = debug.has('fps') ? await import('./debug/fps') : undefined;
const fps = fpsTools?.createFpsOverlay();
const walkSeconds = Number(url.searchParams.get('walk') ?? 0);
const walk =
  fpsTools && walkSeconds > 0
    ? fpsTools.startScriptedWalk({ seconds: walkSeconds, house, view, camera, rng: createRng(seed).fork('walk') })
    : undefined;

let lastDrawCalls = 0;
const timer = new Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dtMs = timer.getDelta() * 1000;
  walk?.frame(dtMs, lastDrawCalls);
  renderer.info.reset();
  post.render(renderer, scene, camera, time / 1000);
  lastDrawCalls = renderer.info.render.calls;
  fps?.frame(dtMs, lastDrawCalls);
});

if (debug.size > 0) {
  const { installDebugHooks } = await import('./debug/hooks');
  installDebugHooks({ seed, house, view, camera, renderer, lastDrawCalls: () => lastDrawCalls });
}
if (debug.has('map')) (await import('./debug/map')).showHouseMap(seed);
if (debug.has('portraits')) (await import('./debug/portraits')).showPortraitSheet(seed);

document.body.dataset.ready = 'true';
events.emit('gameReady', { width: window.innerWidth, height: window.innerHeight });
