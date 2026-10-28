import type { PerspectiveCamera } from 'three';
import { events } from '../core/events';
import type { House } from '../world/house';
import { footstepSurface, type FootstepSurface } from '../world/surfaces';
import type { CellId } from '../world/types';
import { EYE_HEIGHT, worldToCell } from '../world/units';
import type { Interactions } from './interaction';
import { NO_INPUT, stepPlayer, type CollisionMap, type InputState, type PlayerState } from './movement';

declare module '../core/events' {
  interface GameEvents {
    playerCellChanged: { cell: CellId };
    footstep: { surface: FootstepSurface; running: boolean };
  }
}

/** Radians per pixel of mouse movement while the pointer is locked. */
const MOUSE_SENSITIVITY = 0.0025;
const HANDLED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'ShiftLeft', 'ShiftRight', 'KeyE']);

export interface PlayerController {
  update(dt: number): void;
  setControlsEnabled(enabled: boolean): void;
  teleport(x: number, z: number, yaw: number): void;
  state(): PlayerState;
}

/**
 * Keyboard and mouse in, camera out. Arrow keys walk and turn, Shift runs, the mouse
 * (after a click locks the pointer) and Page Up/Down look, E uses the nearest thing.
 */
export function createPlayerController(options: {
  camera: PerspectiveCamera;
  canvas: HTMLElement;
  house: House;
  collision: CollisionMap;
  interactions: Interactions;
  prompt: { show(text: string): void; hide(): void };
  start: PlayerState;
}): PlayerController {
  const { camera, canvas, house, collision, interactions, prompt } = options;
  let state = options.start;
  let enabled = true;
  let cell = worldToCell(state.x, state.z);
  const held = new Set<string>();
  let mouseX = 0;
  let mouseY = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!HANDLED_KEYS.has(event.code)) return;
    event.preventDefault();
    held.add(event.code);
    if (event.code === 'KeyE' && !event.repeat && enabled) interactions.interact(state);
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => held.clear();
  const onClick = () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock?.()?.catch?.(() => undefined);
  };
  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    mouseX += event.movementX;
    mouseY += event.movementY;
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('click', onClick);
  document.addEventListener('mousemove', onMouseMove);

  const readInput = (): InputState => {
    const axis = (plus: string, minus: string) => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);
    const input: InputState = {
      forward: axis('ArrowUp', 'ArrowDown'),
      turn: axis('ArrowLeft', 'ArrowRight'),
      run: held.has('ShiftLeft') || held.has('ShiftRight'),
      pitch: axis('PageUp', 'PageDown'),
      lookYaw: -mouseX * MOUSE_SENSITIVITY,
      lookPitch: -mouseY * MOUSE_SENSITIVITY,
    };
    mouseX = 0;
    mouseY = 0;
    return input;
  };

  const placeCamera = () => {
    camera.position.set(state.x, EYE_HEIGHT + state.bob, state.z);
    camera.rotation.set(state.pitch, state.yaw, 0);
  };
  placeCamera();

  return {
    update(dt) {
      const input = readInput();
      const before = state;
      // A long stall (a background tab) shouldn't fling the player; cap the frame.
      state = stepPlayer(state, enabled ? input : NO_INPUT, Math.min(dt, 0.1), collision);
      placeCamera();

      const now = worldToCell(state.x, state.z);
      if (now !== cell) {
        cell = now;
        events.emit('playerCellChanged', { cell });
      }
      if (state.steps > before.steps) {
        const room = house.roomAt(cell);
        if (room) events.emit('footstep', { surface: footstepSurface(room, cell), running: state.running });
      }

      const target = enabled ? interactions.target(state) : undefined;
      if (target) prompt.show(`E  ${target.label}`);
      else prompt.hide();
    },
    setControlsEnabled(value) {
      enabled = value;
      if (!value) held.clear();
    },
    teleport(x, z, yaw) {
      state = { ...state, x, z, yaw, pitch: 0, bob: 0 };
      placeCamera();
      const now = worldToCell(x, z);
      if (now !== cell) {
        cell = now;
        events.emit('playerCellChanged', { cell });
      }
    },
    state: () => state,
  };
}
