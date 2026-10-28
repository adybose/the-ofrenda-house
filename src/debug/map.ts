import { generateCase } from '../case/generate';
import { parseCell } from '../world/grid';
import { createHouse } from '../world/house';
import type { DoorState, RoomKind } from '../world/types';

const ROOM_COLOURS: Record<RoomKind, string> = {
  parlour: '#5b4636',
  bedroom: '#4a4058',
  nursery: '#3f5250',
  bathroom: '#3c4a5c',
  corridor: '#6b6250',
  key: '#c08a2e',
  entranceHall: '#7a3b3b',
  portraitHall: '#8a4a4a',
  act1Corridor: '#6e4545',
  diningRoom: '#d4a017',
};

const DOOR_COLOURS: Record<DoorState, string> = {
  open: '#9be08f',
  closed: '#d8c8a8',
  locked: '#ff4a4a',
  sealed: '#c86bff',
};

/**
 * `?debug=map`: a top-down view of the house around the entrance, drawn from the
 * same data the game uses. Key rooms are labelled with their spirit.
 */
export function showHouseMap(seed: number): void {
  const house = createHouse(seed, generateCase(seed));
  const radius = 3;
  const cellPx = 6;
  const span = (2 * radius + 1) * 15;
  const canvas = document.createElement('canvas');
  canvas.id = 'debug-map';
  canvas.width = span * cellPx;
  canvas.height = span * cellPx;
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    margin: 'auto',
    maxWidth: '100vw',
    maxHeight: '100vh',
    imageRendering: 'pixelated',
    background: '#050505',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // World y grows north, so flip it for the screen.
  const minX = -radius * 15;
  const maxY = (2 * radius + 1) * 15 - 1;
  const toScreen = (x: number, y: number): [number, number] => [(x - minX) * cellPx, (maxY - y) * cellPx];

  const chunks = [];
  for (let cy = 0; cy <= 2 * radius; cy++) for (let cx = -radius; cx <= radius; cx++) chunks.push(house.chunkAt(cx, cy));

  for (const chunk of chunks) {
    for (const room of chunk.rooms) {
      ctx.fillStyle = ROOM_COLOURS[room.kind];
      for (const cell of room.cells) {
        const [sx, sy] = toScreen(...parseCell(cell));
        ctx.fillRect(sx + 0.5, sy + 0.5, cellPx - 1, cellPx - 1);
      }
    }
  }
  for (const chunk of chunks) {
    for (const door of chunk.doors) {
      const [ax, ay] = toScreen(...parseCell(door.a));
      const [bx, by] = toScreen(...parseCell(door.b));
      ctx.fillStyle = DOOR_COLOURS[door.state];
      ctx.fillRect((ax + bx) / 2 + cellPx / 4, (ay + by) / 2 + cellPx / 4, cellPx / 2, cellPx / 2);
    }
  }
  ctx.font = `bold ${cellPx * 2}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const chunk of chunks) {
    for (const room of chunk.rooms.filter((r) => r.kind === 'key')) {
      const [x, y] = parseCell(room.cells[12] ?? room.cells[0]!);
      const [sx, sy] = toScreen(x, y);
      ctx.fillStyle = '#000';
      ctx.fillText(room.characterId!.slice(0, 2).toUpperCase(), sx + cellPx / 2, sy + cellPx / 2);
    }
  }
  const [startX, startY] = toScreen(...parseCell(house.startCell));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(startX + cellPx / 2, startY + cellPx / 2, cellPx, 0, Math.PI * 2);
  ctx.fill();
  document.body.dataset.mapReady = 'true';
}
