import { createRng, STREAMS } from '../core/rng';
import { DIR_STEP } from '../world/grid';
import type { Room } from '../world/types';
import { DOOR_SCARE_COOLDOWN } from './door-scares';
import { CELL_SIZE, ROOM_HEIGHT, WALL_INSET, cellCentre } from '../world/units';

/**
 * Jump scares (spec 13), pure: where bats, rats and cats wait, and when one may burst out. Often
 * enough to keep the player on edge, never so often that they pile up or stop being scary.
 */
export const SCARES = {
  /** Seconds between scares. */
  cooldown: 25,
  /** No scare this soon after one of La Sombra's hazards. */
  afterHazard: 10,
  /** Creatures on screen at once. */
  maxActive: 3,
  /** Walking this close sets one off... */
  tripRadius: 2.2,
  /** ...or pointing a lit torch at it, within this angle and distance. */
  beamAngle: 0.3,
  beamRange: 8,
} as const;

export type ScareKind = 'bat' | 'rat' | 'cat';

export interface ScareTrigger {
  id: string;
  kind: ScareKind;
  roomId: string;
  x: number;
  y: number;
  z: number;
}

/** How likely each anchor is to hide its creature. */
const ODDS: Partial<Record<string, { kind: ScareKind; chance: number }>> = {
  chandelier: { kind: 'bat', chance: 0.6 },
  fireplace: { kind: 'bat', chance: 0.5 },
  floorboards: { kind: 'rat', chance: 0.7 },
  darkCorner: { kind: 'cat', chance: 0.5 },
};

/** The scares waiting in a room, from its anchors and its own seeded stream. */
export function placeTriggers(room: Room, seed: number): ScareTrigger[] {
  const rng = createRng(seed).fork(STREAMS.scares).fork(room.id);
  const triggers: ScareTrigger[] = [];
  room.anchors.forEach((anchor, i) => {
    const odds = ODDS[anchor.kind];
    if (!odds || !rng.chance(odds.chance)) return;
    let [x, z] = cellCentre(anchor.cell);
    let y = 0.1;
    if (anchor.kind === 'chandelier') y = ROOM_HEIGHT[room.size] - 0.8;
    if (anchor.kind === 'fireplace' && anchor.side) {
      // In the hearth's mouth, against the wall.
      const [dx, dy] = DIR_STEP[anchor.side];
      const back = CELL_SIZE / 2 - WALL_INSET - 0.25;
      [x, z] = [x + dx * back, z - dy * back];
      y = 0.4;
    }
    triggers.push({ id: `${room.id}:${i}`, kind: odds.kind, roomId: room.id, x, y, z });
  });
  return triggers;
}

export interface ScareState {
  lastAt: number;
  lastHazardAt: number;
  /** The last door scare (spec 25): they keep their own, shorter cooldown. */
  lastDoorAt: number;
  /** A scare has already come in this visit to the current room. */
  firedThisVisit: boolean;
  used: ReadonlySet<string>;
}

export type ScareEvent =
  | { type: 'enterRoom'; roomId: string }
  | { type: 'hazard' }
  | { type: 'trip'; trigger: ScareTrigger; blocked: boolean }
  /** Something behind a door the player opened (spec 24, 25). */
  | { type: 'door'; trigger: ScareTrigger; blocked: boolean }
  /** A story script's scare (the Act 1 bat): it ignores the cooldown. */
  | { type: 'force'; trigger: ScareTrigger };

export function createScareState(): ScareState {
  return { lastAt: -Infinity, lastHazardAt: -Infinity, lastDoorAt: -Infinity, firedThisVisit: false, used: new Set() };
}

export function scareScheduler(state: ScareState, event: ScareEvent, now: number): { state: ScareState; fire?: ScareTrigger } {
  const fired = (trigger: ScareTrigger) => ({
    state: { ...state, lastAt: now, firedThisVisit: true, used: new Set([...state.used, trigger.id]) },
    fire: trigger,
  });
  switch (event.type) {
    case 'enterRoom':
      return { state: { ...state, firedThisVisit: false } };
    case 'hazard':
      return { state: { ...state, lastHazardAt: now } };
    case 'force':
      return fired(event.trigger);
    case 'door': {
      const quiet = !event.blocked && now - state.lastDoorAt >= DOOR_SCARE_COOLDOWN && now - state.lastHazardAt >= SCARES.afterHazard;
      if (!quiet) return { state };
      const { state: next, fire } = fired(event.trigger);
      return { state: { ...next, lastDoorAt: now }, fire };
    }
    case 'trip': {
      const quiet =
        !event.blocked &&
        !state.firedThisVisit &&
        !state.used.has(event.trigger.id) &&
        now - state.lastAt >= SCARES.cooldown &&
        now - state.lastHazardAt >= SCARES.afterHazard;
      return quiet ? fired(event.trigger) : { state };
    }
  }
}
