import type { PerspectiveCamera } from 'three';
import type { WorldView } from '../render/world-view';
import type { House } from '../world/house';
import type { CellId } from '../world/types';
import { EYE_HEIGHT, cellCentre, worldToCell } from '../world/units';
import type { Rng } from '../core/rng';

/** `?debug=fps`: a small overlay with frames per second, frame time and draw calls. */
export function createFpsOverlay(): { frame(dtMs: number, drawCalls: number): void } {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    padding: '4px 8px',
    font: '12px monospace',
    color: '#9be08f',
    background: 'rgba(0,0,0,0.6)',
    zIndex: '10',
  });
  document.body.appendChild(box);
  let frames = 0;
  let elapsed = 0;
  return {
    frame(dtMs, drawCalls) {
      frames++;
      elapsed += dtMs;
      if (elapsed < 500) return;
      box.textContent = `${((frames * 1000) / elapsed).toFixed(0)} fps · ${(elapsed / frames).toFixed(1)} ms · ${drawCalls} calls`;
      frames = 0;
      elapsed = 0;
    },
  };
}

/**
 * `?debug=fps&walk=60`: walks the camera through the house for that many seconds at
 * running pace, loading chunks as it goes, then writes the result to body[data-fps-result].
 */
export function startScriptedWalk(options: { seconds: number; house: House; view: WorldView; camera: PerspectiveCamera; rng: Rng }) {
  let metres = 0;
  let maxDrawCalls = 0;
  const cells = new Set<CellId>();
  const { house, view, camera, rng } = options;
  house.endAct1();
  let cell: CellId = '-1,2';
  let path: CellId[] = [];
  const frameTimes: number[] = [];
  let walked = 0;
  // Running pace (Shift), the hardest case for chunk streaming.
  const speed = 2.5;
  const [startX, startZ] = cellCentre(cell);
  camera.position.set(startX, EYE_HEIGHT, startZ);
  view.apply(house.update(cell));

  // Travel, don't wander: hold a heading (north, east or west) and aim well ahead,
  // so the walk keeps crossing into new chunks like a lost player would.
  let heading: [number, number] = [0, 1];
  const nextPath = () => {
    if (rng.chance(0.3)) heading = rng.pick<[number, number]>([[0, 1], [1, 0], [-1, 0]]);
    for (let tries = 0; tries < 30 && path.length < 2; tries++) {
      const [x, y] = cell.split(',').map(Number) as [number, number];
      const reach = rng.int(15, 30);
      const target = `${x + heading[0] * reach + rng.int(-6, 6)},${Math.max(1, y + heading[1] * reach + rng.int(-6, 6))}`;
      path = house.pathBetween(cell, target) ?? [];
      if (path.length < 2 && tries % 5 === 4) heading = rng.pick<[number, number]>([[0, 1], [1, 0], [-1, 0]]);
    }
  };

  return {
    frame(dtMs: number, drawCalls = 0) {
      if (walked >= options.seconds * 1000) return;
      maxDrawCalls = Math.max(maxDrawCalls, drawCalls);
      walked += dtMs;
      frameTimes.push(dtMs);
      if (path.length < 2) nextPath();
      const next = path[1];
      if (next) {
        const [tx, tz] = cellCentre(next);
        const dx = tx - camera.position.x;
        const dz = tz - camera.position.z;
        const distance = Math.hypot(dx, dz);
        const step = (speed * dtMs) / 1000;
        camera.rotation.set(0, Math.atan2(-dx, -dz), 0);
        metres += Math.min(distance, step);
        if (distance <= step) {
          camera.position.set(tx, EYE_HEIGHT, tz);
          path.shift();
        } else {
          camera.position.x += (dx / distance) * step;
          camera.position.z += (dz / distance) * step;
        }
        const now = worldToCell(camera.position.x, camera.position.z);
        if (now !== cell) {
          cell = now;
          cells.add(cell);
          view.apply(house.update(cell));
        }
      }
      if (walked >= options.seconds * 1000) {
        const sorted = [...frameTimes].sort((a, b) => b - a);
        const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
        const result = {
          seconds: walked / 1000,
          frames: frameTimes.length,
          averageFps: (frameTimes.length * 1000) / walked,
          onePercentLowFps: 1000 / (worst.reduce((s, t) => s + t, 0) / worst.length),
          worstFrameMs: sorted[0],
          metresWalked: Math.round(metres),
          cellsVisited: cells.size,
          chunksVisited: new Set([...cells].map((c) => house.roomAt(c)?.chunkId)).size,
          maxDrawCalls,
        };
        document.body.dataset.fpsResult = JSON.stringify(result);
        console.info('Scripted walk', result);
      }
    },
  };
}
