import type { WebGLRenderer } from 'three';
import type { AudioEngine } from '../audio/engine';
import { SOUND_NAMES, type SoundName } from '../audio/synths';
import { events, type GameEvents } from '../core/events';
import type { Flashlight } from '../lighting/flashlight';
import type { Lightning, StrikeOptions } from '../lighting/lightning';
import type { PlayerController } from '../player/controller';
import type { PlayerState } from '../player/movement';
import { DIRS, DIR_STEP, SLOT_CELLS, parseCell, slotOfCell } from '../world/grid';
import type { House } from '../world/house';
import type { CellId, ChunkDiff, DoorId, Room } from '../world/types';
import { CELL_SIZE, cellCentre } from '../world/units';

/** Events the hook records for tests. */
const RECORDED = ['arrivalStage', 'interact', 'doorOpened', 'doorClosed', 'doorUnlocked', 'doorLocked', 'doorSealed', 'footstep', 'playerCellChanged', 'flashlightToggled', 'lightning'] as const;

export type DebugRoomKind = 'filler' | 'key' | 'corridor';

/** Test and debugging handle on window.__ofrenda, only installed when the URL has a debug flag. */
export interface OfrendaDebug {
  seed: number;
  house: House;
  /** Loads the chunks around a cell, as if the player stood there. */
  moveTo(cell: CellId): void;
  /** Puts the player at a world position (metres) looking at a yaw (radians, 0 = north). */
  place(x: number, z: number, yaw: number): void;
  player(): PlayerState;
  setControlsEnabled(enabled: boolean): void;
  /** Stands the player one cell from a door, facing it: on side a, side b, or outside a key room. */
  standFacingDoor(doorId: DoorId, side: 'a' | 'b' | 'outside'): void;
  /** The text of the E prompt, or '' when hidden. */
  prompt(): string;
  /** Recorded game events, oldest first. */
  events(): ({ name: string } & Record<string, unknown>)[];
  giveKey(keyId: string): void;
  flashlight(): { on: boolean; level: number };
  /** A lightning strike now. */
  strike(options?: StrikeOptions): void;
  /** Holds a lightning flash at a level through the nearest window (undefined lets go), for screenshots. */
  holdLightning(level: number | undefined): void;
  /** Where the lightning light is and which window it uses. */
  lightningInfo(): { window: unknown; position: number[]; target: number[]; visible: boolean; intensity: number };
  soundNames(): SoundName[];
  /** Renders a sound offline and summarises it (spec 07's check). */
  /** `audibleFor`: seconds until the last sample above 0.005; `onsetRms`: the level of the first half second. */
  renderSound(name: SoundName, param?: number): Promise<{ peak: number; rms: number; onsetRms: number; audibleFor: number; hasNaN: boolean; seconds: number }>;
  audioState(): string;
  ambienceGain(): number;
  masterGain(): number;
  testVoice(seconds: number): void;
  setTension(level: number): void;
  audioLevels(): { ambience: number; storm: number; thunder: number; master: number };
  setOutdoors(on: boolean): void;
  /** Whether a grandfather clock is ticking near the player. */
  ticking(): boolean;
  /** Where the player is in the arrival (spec 16), and whether the outside still exists. */
  arrival(): { stage: string; exterior: boolean };
  /** Moves to a room of the given kind and frames it for a screenshot. */
  viewRoom(kind: DebugRoomKind): boolean;
  frames(count: number): Promise<void>;
  memory(): { geometries: number; textures: number };
  drawCalls(): number;
}

declare global {
  interface Window {
    __ofrenda?: OfrendaDebug;
  }
}

export function installDebugHooks(options: {
  seed: number;
  house: House;
  applyDiff(diff: ChunkDiff): void;
  player: PlayerController;
  prompt: { text(): string };
  keys: Set<string>;
  flashlight: Flashlight;
  lightning: Lightning;
  audio: AudioEngine;
  arrival(): { stage: string; exterior: boolean };
  renderer: WebGLRenderer;
  lastDrawCalls: () => number;
}): void {
  const { house, player, renderer } = options;
  const moveTo = (cell: CellId) => options.applyDiff(house.update(cell));
  const place = (x: number, z: number, yaw: number) => player.teleport(x, z, yaw);
  const log: ({ name: string } & Record<string, unknown>)[] = [];
  for (const name of RECORDED) {
    events.on(name, (payload: GameEvents[typeof name]) => log.push({ name, ...payload }));
  }

  const findRoom = (kind: DebugRoomKind): Room | undefined => {
    if (kind === 'key') {
      const id = house.keyRooms().find((k) => k.roomId)?.roomId;
      return id ? house.getRoom(id) : undefined;
    }
    for (let ring = 0; ring < 4; ring++) {
      for (let cy = 0; cy <= ring + 1; cy++) {
        for (let cx = -ring; cx <= ring; cx++) {
          const rooms = house.chunkAt(cx, cy).rooms;
          const found =
            kind === 'corridor'
              ? rooms.find((r) => r.kind === 'corridor' && r.cells.length >= 7)
              : rooms.find((r) => r.kind === 'parlour') ?? rooms.find((r) => r.kind === 'bedroom');
          if (found) return found;
        }
      }
    }
    return undefined;
  };

  window.__ofrenda = {
    seed: options.seed,
    house,
    moveTo,
    place,
    viewRoom(kind) {
      const room = findRoom(kind);
      if (!room) return false;
      const [sx, sy] = slotOfCell(...parseCell(room.cells[0]!));
      const centreX = (sx * SLOT_CELLS + 2.5) * CELL_SIZE;
      const centreZ = -(sy * SLOT_CELLS + 2.5) * CELL_SIZE;
      moveTo(room.cells[0]!);
      if (kind === 'corridor') {
        // Stand at the end of one arm and look down it.
        const inRoom = new Set(room.cells);
        const [cx, cy] = [sx * SLOT_CELLS + 2, sy * SLOT_CELLS + 2];
        const dir = DIRS.find((d) => inRoom.has(`${cx + DIR_STEP[d][0] * 2},${cy + DIR_STEP[d][1] * 2}`)) ?? 'N';
        const [dx, dy] = DIR_STEP[dir];
        const yaw = { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[dir];
        place(centreX - dx * 1.6 * CELL_SIZE, centreZ + dy * 1.6 * CELL_SIZE, yaw);
      } else {
        // Stand near the south wall and look north across the room.
        place(centreX + 0.3, centreZ + 1.9 * CELL_SIZE, -0.15);
      }
      return true;
    },
    frames(count) {
      return new Promise((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    },
    player: () => player.state(),
    setControlsEnabled: (enabled) => player.setControlsEnabled(enabled),
    standFacingDoor(doorId, side) {
      const door = house.getDoor(doorId);
      if (!door) throw new Error(`no door ${doorId}`);
      const inKeyRoom = (cell: CellId) => house.roomAt(cell)?.kind === 'key';
      const cell = side === 'a' ? door.a : side === 'b' ? door.b : inKeyRoom(door.a) ? door.b : door.a;
      moveTo(cell);
      const [x, z] = cellCentre(cell);
      const [ax, az] = cellCentre(door.a);
      const [bx, bz] = cellCentre(door.b);
      const [dx, dz] = [(ax + bx) / 2 - x, (az + bz) / 2 - z];
      place(x, z, Math.atan2(-dx, -dz));
    },
    prompt: () => options.prompt.text(),
    events: () => [...log],
    giveKey: (keyId) => options.keys.add(keyId),
    flashlight: () => ({ on: options.flashlight.on, level: options.flashlight.level }),
    strike: (strikeOptions) => void options.lightning.strike(strikeOptions),
    holdLightning: (level) => options.lightning.hold(level, { yaw: 0.2 }),
    soundNames: () => [...SOUND_NAMES],
    async renderSound(name, chosen) {
      // Long enough for each sound's tail; by default thunder close, the clock striking three.
      const seconds = name === 'thunder' ? 9 : name === 'clock' ? 8 : name === 'stinger' ? 7 : name === 'whisper' ? 4 : 3;
      const param = chosen ?? (name === 'thunder' ? 0.9 : name === 'clock' ? 3 : 0);
      const samples = await options.audio.renderOffline(name, seconds, param);
      // Interleaved stereo at 44.1 kHz.
      const onset = Math.min(samples.length, 44_100);
      let peak = 0;
      let sum = 0;
      let onsetSum = 0;
      let last = 0;
      let hasNaN = false;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i]!;
        if (Number.isNaN(v)) hasNaN = true;
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        if (i < onset) onsetSum += v * v;
        if (Math.abs(v) > 0.005) last = i;
      }
      return { peak, rms: Math.sqrt(sum / samples.length), onsetRms: Math.sqrt(onsetSum / onset), audibleFor: last / 2 / 44_100, hasNaN, seconds };
    },
    audioState: () => options.audio.state,
    ambienceGain: () => options.audio.levels().ambience,
    masterGain: () => options.audio.levels().master,
    testVoice: (seconds) => options.audio.testVoice(seconds),
    setTension: (level) => options.audio.setTension(level),
    audioLevels: () => options.audio.levels(),
    setOutdoors: (on) => options.audio.setOutdoors(on),
    ticking: () => options.audio.ticking,
    arrival: () => options.arrival(),
    lightningInfo: () => {
      const light = options.lightning.light;
      return {
        window: light.userData.window,
        position: light.position.toArray(),
        target: light.target.position.toArray(),
        visible: light.visible,
        intensity: light.intensity,
      };
    },
    memory: () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
    drawCalls: options.lastDrawCalls,
  };
}
