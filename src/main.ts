import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { events } from './core/events';
import { readRunSeed } from './core/run-seed';

const { seed, fromUrl } = readRunSeed(new URL(window.location.href));
if (!fromUrl) console.info(`Run seed ${seed}. Replay this run with ?seed=${seed}`);
// Read by the Playwright seed test.
document.body.dataset.seed = String(seed);

const renderer = new WebGLRenderer({ antialias: false });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(70, 1, 0.05, 100);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // Read by the Playwright resize test.
  document.body.dataset.cameraAspect = String(camera.aspect);
}

window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});

document.body.dataset.ready = 'true';
events.emit('gameReady', { width: window.innerWidth, height: window.innerHeight });

if (new URL(window.location.href).searchParams.get('debug') === 'map') {
  void import('./debug/map').then(({ showHouseMap }) => showHouseMap(seed));
}
