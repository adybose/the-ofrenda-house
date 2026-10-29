import { AmbientLight, Color, FogExp2, HemisphereLight, PerspectiveCamera, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { AudioEngine } from './audio/engine';
import { connectGameAudio } from './audio/game-audio';
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
import { createExteriorScene } from './render/exterior-mesh';
import { Arrival } from './story/arrival';
import { Encounters } from './story/encounters';
import { EXIT_KEY } from './story/accusation';
import { Finale } from './story/finale';
import { Monologue } from './story/thoughts';
import { createThoughts } from './ui/thought';
import { ItemsController } from './items/controller';
import { Hazards } from './spirits/hazards';
import { Scares } from './scares/scares';
import { ShadowController } from './spirits/shadow-controller';
import { createCaption } from './ui/caption';
import { StoryFlow } from './story/act1';
import { clockStart } from './story/flow';
import { showEnding, type EndingKind } from './ui/ending';
import { candleSummary } from './items/items';
import { speakerFor } from './audio/voice';
import { createDialogue } from './ui/dialogue-box';
import { createHud } from './ui/hud';
import { createJournal, type Journal } from './ui/journal';
import { createPrompt } from './ui/prompt';
import { createCollisionMap } from './world/collision';
import { composeCollision, exteriorCollision, exteriorLayout } from './world/exterior';
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
  /** Keys the player holds: picked up from beside a spirit's candle (spec 18). */
  const keys = new Set<string>();
  const doors = new DoorController({ house, view, interactions, hasKey: (key) => keys.has(key) });
  // Candles, matches and keys (spec 18). `&matches=N` puts N matches in the box (debug).
  const items = new ItemsController({ scene, house, interactions, matches: url.searchParams.has('matches') ? Number(url.searchParams.get('matches')) : undefined });
  // Built once the audio and torch exist (spec 13); it catches up on the chunks loaded before then.
  let scares: Scares | undefined = undefined;
  const applyDiff = (diff: ChunkDiff, options?: { spread?: boolean }) => {
    view.apply(diff, options);
    doors.sync(diff);
    items.sync(diff);
    scares?.sync(diff);
  };

  // The game opens outside the house (spec 16). `?skip=prologue` starts in the entrance hall with
  // Act 1 to play; `?skip=act1` at midnight at the end of the Act 1 corridor, with the way into the
  // house unsealed; `?skip=exit` the same, holding every clue and the key to the way out (spec 14).
  // The fps walk drives the camera inside, so it skips the arrival and the story.
  const skip = url.searchParams.get('skip');
  const atMidnight = skip === 'act1' || skip === 'exit';
  const walkSeconds = Number(url.searchParams.get('walk') ?? 0);
  const outside = skip !== 'prologue' && !atMidnight && walkSeconds === 0;
  if (atMidnight) house.endAct1();
  const layout = outside ? exteriorLayout(seed) : undefined;
  const startCell = atMidnight ? '1,2' : house.startCell;
  const [cellX, cellZ] = cellCentre(startCell);
  const start = layout?.start ?? { x: cellX, z: cellZ, yaw: atMidnight ? Math.PI / 2 : 0 };
  // Outside, only the entrance wing is built (seen through the doorway); the rest of the house
  // waits until the door has slammed, so nothing inside can show past the mansion's outer walls.
  if (outside) applyDiff({ loaded: [house.chunkAt(0, 0)], unloaded: [] });
  else applyDiff(house.update(startCell));

  const houseCollision = createCollisionMap(house, seed);
  let hazards: Hazards | undefined = undefined;
  const grounds = layout ? exteriorCollision(layout) : undefined;
  let inGrounds = outside;
  const prompt = createPrompt();
  const player = createPlayerController({
    camera,
    canvas: renderer.domElement,
    house,
    collision: {
      boxesNear: (x, z, r) => {
        const house = inGrounds && grounds ? composeCollision(houseCollision, grounds) : houseCollision;
        // A chandelier or mirror La Sombra brought down blocks the way (spec 12).
        return hazards ? [...house.boxesNear(x, z, r), ...hazards.boxesNear(x, z, r)] : house.boxesNear(x, z, r);
      },
    },
    interactions,
    prompt,
    start: createPlayerState(start.x, start.z, start.yaw),
  });
  // Built once the lightning and audio it drives exist; read by handlers set up before then.
  let arrival: Arrival | undefined = undefined;
  events.on('playerCellChanged', ({ cell }) => {
    if (!arrival || arrival.stage === 'inside') applyDiff(house.update(cell));
  });

  // The dark: faint ambient light and black fog; outside, blue-black fog the mansion can be seen
  // through. `?debug=fullbright` lights everything for screenshots.
  const indoorFog = new FogExp2(LIGHTING.fog.color, LIGHTING.fog.density);
  if (debug.has('fullbright')) {
    scene.add(new AmbientLight(0xffffff, 1.6));
    scene.add(new HemisphereLight(0xfff2dd, 0x40342a, 1.2));
  } else {
    scene.add(new AmbientLight(LIGHTING.ambient.color, LIGHTING.ambient.intensity));
    scene.fog = outside ? new FogExp2(0x0b0e16, 0.012) : indoorFog;
  }
  let exterior = layout ? createExteriorScene(scene, textures, layout, seed) : undefined;
  let flash = 0;

  // `?battery=0.08` starts the torch at 8% (debug).
  const batteryParam = url.searchParams.get('battery');
  const flashlight = new Flashlight(scene, renderer, { rng: createRng(seed).fork(STREAMS.lighting), level: batteryParam ? Number(batteryParam) : undefined });
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
    outdoors: () => (arrival ? arrival.stage !== 'inside' : outside),
    onFlash: (level) => (flash = level),
    // Outside, the storm announces itself early.
    firstIn: outside ? 4 : undefined,
    // The house rearranges in the dark after each flash (spec 03).
    onEnd: () => {
      if (arrival && arrival.stage !== 'inside') return;
      const cell = worldToCell(camera.position.x, camera.position.z);
      applyDiff(house.reshuffle(visibleCells(cell), cell), { spread: true });
    },
  });
  const candles = new CandleLights(scene);

  // Sound: unlocked by the first click or key press. `?mute=1` keeps it silent (automated tests).
  const audio = new AudioEngine({ seed, muted: url.searchParams.get('mute') === '1' });
  connectGameAudio(audio, house, outside ? undefined : startCell);
  audio.setOutdoors(outside);
  let windowCheck = 0;

  // Conversations, the journal and the HUD (spec 10). Dialogue or the journal stops the player
  // moving; the journal also pauses the world while it is open.
  const hud = createHud({ prompt });
  events.on('batteryChanged', ({ level }) => hud.set('battery', level));
  let journal: Journal | undefined = undefined;
  let encounters: Encounters | undefined = undefined;
  let caught = false;
  let finale: Finale | undefined = undefined;
  let story: StoryFlow | undefined = undefined;
  let storyHolds = false;
  const syncControls = () =>
    player.setControlsEnabled(!caught && !storyHolds && !finale?.isActive() && !dialogue.isOpen() && !journal?.isOpen() && !encounters?.isActive());
  const dialogue = createDialogue({ speaker: speakerFor(audio), onOpenChange: syncControls, inputBlocked: () => journal?.isOpen() ?? false });
  journal = createJournal({ caseFile, seed, onOpenChange: syncControls });

  // The spirits (spec 11): an encounter in each key room, once per run.
  encounters = new Encounters({
    seed,
    caseFile,
    house,
    scene,
    camera,
    player,
    dialogue,
    journal,
    audio,
    flashlight,
    onActiveChange: syncControls,
    // Once a spirit has gone: its candle lights if it was set at peace, and its keys lie by the candle.
    onSpiritLeft: ({ characterId, outcome, keyIds }) => {
      if (outcome === 'reward') items.spiritSolved(characterId);
      items.layKeys(characterId, keyIds);
      if (outcome === 'reward') monologue.solved();
    },
    allClues: url.searchParams.get('clues') === 'all' || skip === 'exit',
  });

  // The stranger's thoughts (spec 20); the story thinks the first one at midnight.
  const monologue = new Monologue({ caseFile, house, items, flashlight, player, thoughts: createThoughts() });
  let ended = false;
  events.on('ending', () => (ended = true));

  // Bats, rats and cats (spec 13), in the rooms already loaded and every chunk from now on.
  scares = new Scares({ seed, house, scene, camera, audio, flashlight, player });
  scares.sync({ loaded: house.loadedChunks(), unloaded: [] });

  // Spec 21: the key to the way out reveals the dining room, locked by that key; walking in with it
  // plays the finale and the ending.
  finale = new Finale({
    seed,
    caseFile,
    house,
    scene,
    player,
    dialogue,
    hasKey: (keyId) => keys.has(keyId),
    toldTheTruth: () => encounters!.trust.toldTheTruth,
    onActiveChange: syncControls,
  });
  events.on('playerCellChanged', ({ cell }) => finale!.enterCell(cell));

  // What the player carries, on the HUD, and the keys into their pocket and journal (spec 18).
  const showCarried = () => {
    const state = items.snapshot();
    hud.set('matches', state.hasMatchbox ? state.matches : undefined);
    hud.set('candles', candleSummary(state));
    hud.set('keys', keys.size ? `Keys: ${keys.size}` : undefined);
  };
  events.on('keyPickedUp', ({ keyId }) => {
    keys.add(keyId);
    journal!.addKey(keyId);
    if (keyId !== EXIT_KEY) return;
    const { x, z, yaw } = player.state();
    const cell = worldToCell(x, z);
    const quarter = Math.round((((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2)) % 4;
    applyDiff(house.revealDiningRoom(visibleCells(cell), cell, (['N', 'W', 'S', 'E'] as const)[quarter]!, EXIT_KEY));
  });
  for (const name of ['itemPickedUp', 'matchStruck', 'candleLit', 'candleOut', 'candlePlaced', 'keyPickedUp'] as const) events.on(name, showCarried);
  let carriedCheck = 0;
  // M strikes a match (lighting the candle in hand if it is unlit); B blows the candle out.
  window.addEventListener('keydown', (event) => {
    if (event.repeat || dialogue.isOpen() || journal!.isOpen() || encounters!.isActive()) return;
    if (event.code === 'KeyM') items.strikeMatch();
    if (event.code === 'KeyB') items.blowOut();
  });

  // La Sombra and its hazards (spec 12). It wakes when Act 2 begins: for now `?skip=act1`
  // (spec 14 will wake it at the midnight chime); `&shadow=0` keeps it asleep.
  const shadow = new ShadowController({
    seed,
    house,
    items,
    flashlight,
    audio,
    speaker: speakerFor(audio),
    doors,
    player,
    scene,
    caption: createCaption(),
    suppressed: () => caught || story!.isActive() || finale!.isActive() || dialogue.isOpen() || journal!.isOpen() || encounters!.isActive(),
  });
  hazards = new Hazards({ seed, house, doors, flashlight, audio, player, scene, textures });
  events.on('caughtByShadow', () => {
    caught = true;
    syncControls();
    showEnding('possessed');
    events.emit('ending', { kind: 'possessed' });
  });
  events.on('playerCellChanged', ({ cell }) => {
    if (!arrival || arrival.stage === 'inside') encounters!.enterCell(cell);
  });

  arrival = new Arrival({
    house,
    doors,
    audio,
    lightning,
    door: layout?.door ?? { x: 0, z: 0 },
    outside,
    onInside: () => {
      // The outside is gone: back to the dark house, the muffled storm and normal loading.
      exterior?.dispose();
      exterior = undefined;
      inGrounds = false;
      if (!debug.has('fullbright')) scene.fog = indoorFog;
      audio.setOutdoors(false);
      applyDiff(house.update(worldToCell(camera.position.x, camera.position.z)));
      story?.inside();
    },
  });

  // The story (spec 14): the title, the prologue's captions, the scripted Act 1, and the clock.
  story = new StoryFlow({
    seed,
    caseFile,
    house,
    scene,
    textures,
    player,
    dialogue,
    speaker: speakerFor(audio),
    audio,
    lightning,
    scares: scares!,
    monologue,
    hud,
    applyDiff,
    wakeShadow: () => {
      if (url.searchParams.get('shadow') !== '0') shadow.enable();
    },
    holdControls: (held) => {
      storyHolds = held;
      syncControls();
    },
    captions: {
      story: createCaption({ id: 'story-caption', colour: '#efe4c8', bottom: '55%' }),
      hint: createCaption({ id: 'hint', colour: '#d9b46c', bottom: '14%' }),
      line: createCaption({ id: 'patriarch-line', colour: '#efe4c8', bottom: '40%' }),
    },
  });
  if (walkSeconds > 0) {
    // The fps walk: no story.
  } else if (atMidnight) {
    const clock = url.searchParams.get('clock');
    story.startAct2(clock ? clockStart(clock) : 0);
    // Every clue held and the key to the way out in hand: the dining room is waiting.
    if (skip === 'exit') events.emit('keyPickedUp', { keyId: EXIT_KEY });
  } else if (skip === 'prologue') {
    story.inside();
  } else if (debug.size === 0 || url.searchParams.get('title') === '1') {
    story.title();
  } else {
    story.prologue();
  }
  const forward = new Vector3();

  const fpsTools = debug.has('fps') ? await import('./debug/fps') : undefined;
  const fps = fpsTools?.createFpsOverlay();
  const walk =
    fpsTools && walkSeconds > 0
      ? fpsTools.startScriptedWalk({ seconds: walkSeconds, house, view, camera, rng: createRng(seed).fork('walk') })
      : undefined;
  if (walk && !debug.has('fullbright')) flashlight.toggle();

  // Compile every shader now, with all lights in place, and wait for the GPU to finish, so the
  // opening shot doesn't freeze while programs link in the background.
  await renderer.compileAsync(scene, camera);
  // One warm-up frame while still loading, so both shadow maps are first drawn here rather than
  // in the opening shot.
  flashlight.update(0, camera);
  lightning.update(0);
  post.render(renderer, scene, camera, 0);

  let lastDrawCalls = 0;
  const timer = new Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dtMs = timer.getDelta() * 1000;
    const dt = dtMs / 1000;
    // The world stands still while the journal is open; the frame is still drawn behind it.
    const paused = journal?.isOpen() ?? false;
    // The scripted fps walk drives the camera itself.
    if (walk) walk.frame(dtMs, lastDrawCalls);
    else if (!paused) {
      player.update(dt);
      arrival?.update(dt, player.state().x, player.state().z);
    }
    exterior?.update(time / 1000, camera.position, flash);
    view.update();
    if (!paused) {
      doors.update(dt);
      lightning.update(dt);
      items.update(dt, camera);
      candles.update(dt, camera.position, [...view.candles(), ...items.litStandingCandles()]);
      // The held candle's minutes left, now and then.
      if ((carriedCheck -= dt) <= 0) {
        carriedCheck = 1;
        showCarried();
      }
      encounters.update(dt, time / 1000);
      story!.update(dt, time / 1000);
      shadow.update(dt, time / 1000);
      hazards.update(dt, (shadow.mode === 'stalking' || shadow.mode === 'hunting') && !caught && !story!.isActive() && !finale!.isActive() && !dialogue.isOpen() && !encounters.isActive(), shadow.threat);
      finale!.update(dt, time / 1000);
      const heldOff = caught || ended || story!.isActive() || finale!.isActive() || dialogue.isOpen() || journal!.isOpen() || encounters.isActive();
      monologue.update(dt, heldOff);
      scares!.update(dt, heldOff);
    }
    flashlight.update(paused ? 0 : dt, camera);
    camera.getWorldDirection(forward);
    audio.setListener(camera.position.toArray(), forward.toArray());
    if (!exterior && (windowCheck -= dt) <= 0) {
      // Twice a second is plenty for how muffled the storm sounds.
      windowCheck = 0.5;
      const near = nearestWindow(exteriorWindows(), camera.position.x, camera.position.z, 30);
      audio.setWindowDistance(near ? Math.hypot(near.x - camera.position.x, near.z - camera.position.z) : 30);
    }
    audio.update();
    renderer.info.reset();
    post.render(renderer, scene, camera, time / 1000);
    lastDrawCalls = renderer.info.render.calls;
    fps?.frame(dtMs, lastDrawCalls);
  });

  if (debug.size > 0) {
    const { installDebugHooks } = await import('./debug/hooks');
    installDebugHooks({
      seed,
      house,
      applyDiff,
      player,
      prompt,
      keys,
      flashlight,
      lightning,
      audio,
      arrival: () => ({ stage: arrival!.stage, exterior: exterior !== undefined }),
      renderer,
      lastDrawCalls: () => lastDrawCalls,
    });
  }
  if (debug.has('map')) (await import('./debug/map')).showHouseMap(seed);
  if (debug.has('portraits')) (await import('./debug/portraits')).showPortraitSheet(seed);
  if (debug.has('soundboard')) (await import('./debug/soundboard')).showSoundboard(audio);
  if (debug.has('voices')) (await import('./debug/voices')).showVoicePanel(audio, seed, caseFile);
  if (debug.has('dialogue')) (await import('./debug/dialogue')).installDialogueDebug({ dialogue, journal, caseFile, seed, demo: url.searchParams.get('demo') !== '0' });
  if (debug.has('encounter')) (await import('./debug/encounter')).installEncounterDebug({ encounters, house, camera, scene, caseFile });
  if (debug.has('spirits')) (await import('./debug/encounter')).showSpiritLineup({ caseFile, seed, scene, player });
  if (debug.has('items')) (await import('./debug/items')).installItemsDebug({ items, house, player, flashlight });
  if (debug.has('shadow')) (await import('./debug/shadow')).installShadowDebug({ shadow, hazards });
  if (debug.has('scares')) (await import('./debug/scares')).installScaresDebug({ scares: scares!, player, fire: url.searchParams.get('fire') });

  if (debug.size > 0) window.__story = { stage: () => story!.stage, clock: () => story!.clockLabel() };
  // `&ending=true|escape|possessed|trapped`: straight to an ending screen.
  const ending = url.searchParams.get('ending');
  if (ending === 'true' || ending === 'escape' || ending === 'possessed' || ending === 'trapped') {
    showEnding(ending as EndingKind);
    events.emit('ending', { kind: ending as EndingKind });
  }

  document.body.dataset.ready = 'true';
  events.emit('gameReady', { width: window.innerWidth, height: window.innerHeight });
}
