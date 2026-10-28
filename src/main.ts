import { AmbientLight, Color, FogExp2, HemisphereLight, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { generateCase } from './case/generate';
import { events } from './core/events';
import { STREAMS, createRng } from './core/rng';
import { readRunSeed } from './core/run-seed';
import { CandleLights } from './lighting/candles';
import { LIGHTING } from './lighting/config';
import { Flashlight } from './lighting/flashlight';
import { Lightning } from './lighting/lightning';
import { nearestWindow } from './lighting/windows';
import { createTextureCache } from './render/atlas';
import { createPostPipeline } from './render/post';
import { WorldView } from './render/world-view';
import { createPlayerController } from './player/controller';
import { DoorController } from './player/doors';
import { Interactions } from './player/interaction';
import { createPlayerState } from './player/movement';
import { createPrompt } from './ui/prompt';
import { createCollisionMap } from './world/collision';
import { DIR_STEP, cellId, parseCell } from './world/grid';
import { createHouse } from './world/house';
import type { CellId, ChunkDiff, Room } from './world/types';
import { cellCentre, worldToCell } from './world/units';

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

const camera = new PerspectiveCamera(70, 1, 0.05, 60);
camera.rotation.order = 'YXZ';
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

if (debug.has('lightlab')) {
  (await import('./debug/lightlab')).runLightLab(renderer, post);
} else {
  await startGame();
}

async function startGame(): Promise<void> {
  const scene = new Scene();
  scene.background = new Color(0x000000);

  const caseFile = generateCase(seed);
  const house = createHouse(seed, caseFile);
  const textures = createTextureCache(seed, caseFile);
  const view = new WorldView(scene, textures);
  const interactions = new Interactions();
  /** Keys the player holds (spec 11 hands them out). */
  const keys = new Set<string>();
  const doors = new DoorController({ house, view, interactions, hasKey: (key) => keys.has(key) });
  const applyDiff = (diff: ChunkDiff, options?: { spread?: boolean }) => {
    view.apply(diff, options);
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

  // The dark: faint ambient light and black fog. `?debug=fullbright` lights everything for screenshots.
  if (debug.has('fullbright')) {
    scene.add(new AmbientLight(0xffffff, 1.6));
    scene.add(new HemisphereLight(0xfff2dd, 0x40342a, 1.2));
  } else {
    scene.add(new AmbientLight(LIGHTING.ambient.color, LIGHTING.ambient.intensity));
    scene.fog = new FogExp2(LIGHTING.fog.color, LIGHTING.fog.density);
  }

  const flashlight = new Flashlight(scene, renderer);
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyF' && !event.repeat) flashlight.toggle();
  });

  /** Rooms within two doors: what the player could plausibly see, so a reshuffle leaves it alone. */
  const visibleCells = (cell: CellId): Set<CellId> => {
    const cells = new Set<CellId>();
    for (const [id] of house.distancesFrom(cell, 2)) for (const c of house.getRoom(id)?.cells ?? []) cells.add(c);
    return cells;
  };

  /** Windows that look out on nothing (the façade, corridor sides, the wing), facing the player. */
  const exteriorWindows = (): Room[] => {
    const { x, z } = camera.position;
    return house.loadedChunks().flatMap((chunk) =>
      chunk.rooms.map((room) => ({
        ...room,
        windows: room.windows.filter((w) => {
          const [cx, cy] = parseCell(w.cell);
          const [dx, dy] = DIR_STEP[w.side];
          if (house.roomAt(cellId(cx + dx, cy + dy))) return false;
          const [wx, wz] = cellCentre(w.cell);
          // The player must be inside, on the room side of the glass.
          return (x - wx) * dx - (z - wz) * dy <= 0.75;
        }),
      })),
    );
  };

  const every = Number(url.searchParams.get('lightning') ?? 0) || undefined;
  /** The player's own exterior window if the room has one, otherwise the nearest one close by. */
  const lightningWindow = () => {
    const { x, z } = camera.position;
    const rooms = exteriorWindows();
    const here = house.roomAt(worldToCell(x, z))?.id;
    const own = nearestWindow(rooms.filter((r) => r.id === here), x, z, LIGHTING.lightning.windowRange);
    return own ?? nearestWindow(rooms, x, z, LIGHTING.lightning.windowRange);
  };

  const lightning = new Lightning(scene, {
    rng: createRng(seed).fork(STREAMS.lighting),
    window: lightningWindow,
    glass: textures.glassMaterial,
    every,
    // The house rearranges in the dark after each flash (spec 03).
    onEnd: () => {
      const cell = worldToCell(camera.position.x, camera.position.z);
      applyDiff(house.reshuffle(visibleCells(cell), cell), { spread: true });
    },
  });
  const candles = new CandleLights(scene);

  const fpsTools = debug.has('fps') ? await import('./debug/fps') : undefined;
  const fps = fpsTools?.createFpsOverlay();
  const walkSeconds = Number(url.searchParams.get('walk') ?? 0);
  const walk =
    fpsTools && walkSeconds > 0
      ? fpsTools.startScriptedWalk({ seconds: walkSeconds, house, view, camera, rng: createRng(seed).fork('walk') })
      : undefined;
  if (walk && !debug.has('fullbright')) flashlight.toggle();

  // Compile every shader now, with all lights in place, rather than mid-game.
  renderer.compile(scene, camera);

  let lastDrawCalls = 0;
  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dtMs = timer.getDelta() * 1000;
    const dt = dtMs / 1000;
    // The scripted fps walk drives the camera itself.
    if (walk) walk.frame(dtMs, lastDrawCalls);
    else player.update(dt);
    view.update();
    doors.update(dt);
    flashlight.update(dt, camera);
    lightning.update(dt);
    candles.update(dt, camera.position, view.candles());
    renderer.info.reset();
    post.render(renderer, scene, camera, time / 1000);
    lastDrawCalls = renderer.info.render.calls;
    fps?.frame(dtMs, lastDrawCalls);
  });

  if (debug.size > 0) {
    const { installDebugHooks } = await import('./debug/hooks');
    installDebugHooks({ seed, house, applyDiff, player, prompt, keys, flashlight, lightning, renderer, lastDrawCalls: () => lastDrawCalls });
  }
  if (debug.has('map')) (await import('./debug/map')).showHouseMap(seed);
  if (debug.has('portraits')) (await import('./debug/portraits')).showPortraitSheet(seed);

  document.body.dataset.ready = 'true';
  events.emit('gameReady', { width: window.innerWidth, height: window.innerHeight });
}
