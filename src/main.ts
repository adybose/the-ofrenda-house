import { AmbientLight, Color, HemisphereLight, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { generateCase } from './case/generate';
import { events } from './core/events';
import { createRng } from './core/rng';
import { readRunSeed } from './core/run-seed';
import { createTextureCache } from './render/atlas';
import { createPostPipeline } from './render/post';
import { WorldView } from './render/world-view';
import { createPlayerController } from './player/controller';
import { DoorController } from './player/doors';
import { Interactions } from './player/interaction';
import { createPlayerState } from './player/movement';
import { createPrompt } from './ui/prompt';
import { createCollisionMap } from './world/collision';
import { createHouse } from './world/house';
import type { ChunkDiff } from './world/types';
import { cellCentre } from './world/units';

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
const interactions = new Interactions();
/** Keys the player holds (spec 11 hands them out). */
const keys = new Set<string>();
const doors = new DoorController({ house, view, interactions, hasKey: (key) => keys.has(key) });
const applyDiff = (diff: ChunkDiff) => {
  view.apply(diff);
  doors.sync(diff);
};

// `?skip=act1` (spec 14 will own it): start at the end of the Act 1 corridor with the way into the house unsealed.
const skipAct1 = url.searchParams.get('skip') === 'act1';
if (skipAct1) house.endAct1();
const startCell = skipAct1 ? '1,2' : house.startCell;
const [startX, startZ] = cellCentre(startCell);
applyDiff(house.update(startCell));

const prompt = createPrompt();
const player = createPlayerController({
  camera,
  canvas: renderer.domElement,
  house,
  collision: createCollisionMap(house, seed),
  interactions,
  prompt,
  // Face north into the portrait hall, or west towards the Act 1 exit.
  start: createPlayerState(startX, startZ, skipAct1 ? Math.PI / 2 : 0),
});
events.on('playerCellChanged', ({ cell }) => applyDiff(house.update(cell)));

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
  // The scripted fps walk drives the camera itself.
  if (walk) walk.frame(dtMs, lastDrawCalls);
  else player.update(dtMs / 1000);
  doors.update(dtMs / 1000);
  renderer.info.reset();
  post.render(renderer, scene, camera, time / 1000);
  lastDrawCalls = renderer.info.render.calls;
  fps?.frame(dtMs, lastDrawCalls);
});

if (debug.size > 0) {
  const { installDebugHooks } = await import('./debug/hooks');
  installDebugHooks({ seed, house, applyDiff, player, prompt, keys, renderer, lastDrawCalls: () => lastDrawCalls });
}
if (debug.has('map')) (await import('./debug/map')).showHouseMap(seed);
if (debug.has('portraits')) (await import('./debug/portraits')).showPortraitSheet(seed);

document.body.dataset.ready = 'true';
events.emit('gameReady', { width: window.innerWidth, height: window.innerHeight });
