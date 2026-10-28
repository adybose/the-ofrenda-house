import type { CharacterId, RoomKind as KeyRoomStyle } from '../case/types';

/** "x,y" in cells. */
export type CellId = string;
/** "cx,cy" in chunks. */
export type ChunkId = string;
/** "sx,sy" in slots. */
export type SlotKey = string;
export type DoorId = string;

export type Dir = 'N' | 'E' | 'S' | 'W';

export type FillerKind = 'parlour' | 'bedroom' | 'nursery' | 'bathroom' | 'corridor';
export type WingKind = 'entranceHall' | 'portraitHall' | 'act1Corridor';
export type RoomKind = FillerKind | WingKind | 'key' | 'diningRoom';

export type SizeClass = 'small' | 'medium' | 'large';
export type DoorState = 'open' | 'closed' | 'locked' | 'sealed';

export interface Door {
  id: DoorId;
  /** The cell on the west or south side (inside the house for the front door). */
  a: CellId;
  b: CellId;
  state: DoorState;
  keyId?: string;
}

/** A tall window in the wall on `side` of `cell`. */
export interface Window {
  cell: CellId;
  side: Dir;
}

export type AnchorKind =
  | 'fireplace'
  | 'chandelier'
  | 'floorboards'
  | 'darkCorner'
  | 'mirror'
  | 'clock'
  | 'portrait'
  | 'ofrenda';

/** A place for a prop, scare or hazard. Wall anchors say which wall with `side`. */
export interface Anchor {
  kind: AnchorKind;
  cell: CellId;
  side?: Dir;
  characterId?: CharacterId;
}

export interface Room {
  id: string;
  kind: RoomKind;
  /** For key rooms: the room the case file gave the spirit (library, studio...). */
  style?: KeyRoomStyle;
  characterId?: CharacterId;
  size: SizeClass;
  chunkId: ChunkId;
  cells: CellId[];
  doors: DoorId[];
  windows: Window[];
  anchors: Anchor[];
}

export interface Chunk {
  id: ChunkId;
  cx: number;
  cy: number;
  epoch: number;
  rooms: Room[];
  /** Doors this chunk owns: those whose west or south side is in the chunk. */
  doors: Door[];
}

export interface ChunkDiff {
  loaded: Chunk[];
  unloaded: ChunkId[];
}

export interface KeyRoomState {
  characterId: CharacterId;
  style: KeyRoomStyle;
  /** The key that opens this room. */
  keyId: string;
  locked: boolean;
  /** The spirit who gives this room's key, when it is locked. */
  keyHolderId?: CharacterId;
  visited: boolean;
  roomId?: string;
  doorId?: DoorId;
}
