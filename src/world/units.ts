import { cellId, parseCell } from './grid';
import type { CellId, SizeClass } from './types';

/** One cell is 1.5 m square, so corridors are 1.5 m wide. */
export const CELL_SIZE = 1.5;
export const ROOM_HEIGHT: Record<SizeClass, number> = { small: 2.8, medium: 3.1, large: 3.6 };
export const EYE_HEIGHT = 1.6;
/** Wall faces sit this far inside each room, so walls between rooms have thickness. */
export const WALL_INSET = 0.1;
export const DOOR_WIDTH = 1.0;
export const DOOR_HEIGHT = 2.2;
export const WINDOW_WIDTH = 0.9;
export const WINDOW_SILL = 0.8;
export const WINDOW_TOP = 2.7;

/**
 * World axes: x is east, z is south (three.js looks down -z, so north is -z), y is up.
 * Returns the [x, z] of a cell's centre in metres.
 */
export function cellCentre(cell: CellId): [number, number] {
  const [x, y] = parseCell(cell);
  return [(x + 0.5) * CELL_SIZE, -(y + 0.5) * CELL_SIZE];
}

export function worldToCell(x: number, z: number): CellId {
  return cellId(Math.floor(x / CELL_SIZE), Math.floor(-z / CELL_SIZE));
}
