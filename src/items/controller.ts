import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  SphereGeometry,
  Vector3,
  type Camera,
  type Scene,
} from 'three';
import type { CharacterId } from '../case/types';
import { events } from '../core/events';
import { LIGHTING } from '../lighting/config';
import type { Interactions } from '../player/interaction';
import { DIR_STEP } from '../world/grid';
import type { House } from '../world/house';
import { standId, standsOf, type Stand } from '../world/stands';
import type { CellId, ChunkDiff, ChunkId } from '../world/types';
import {
  ITEMS,
  candle,
  candleAt,
  createItems,
  hasFlame,
  inLight,
  isSanctuary,
  itemsReducer,
  useLabel,
  type ItemsAction,
  type ItemsEmit,
  type ItemsState,
  type Refusal,
} from './items';

declare module '../core/events' {
  interface GameEvents {
    itemPickedUp: { kind: 'candle' | 'matchbox' | 'key'; id: string };
    matchStruck: { left: number };
    candleLit: { id: string };
    candleOut: { id: string; reason: 'burnt' | 'blown' };
    candlePlaced: { id: string; standId: string };
    keyPickedUp: { keyId: string };
    itemRefused: { reason: Refusal };
  }
}

/** A whole candle, a stub, and how high the candlestick lifts it. */
const CANDLE_HEIGHT = 0.22;
const STUB_HEIGHT = 0.03;
const CANDLESTICK = 0.07;
/** Where the held candle or match sits in view: right, down, forward of the eye. */
const HELD_AT = new Vector3(0.24, -0.4, -0.55);

const wax = new MeshLambertMaterial({ color: 0xd9ceb0 });
/** Wax glows warm around a flame. */
const litWax = new MeshLambertMaterial({ color: 0xd9ceb0, emissive: 0x6a4420 });
const brass = new MeshLambertMaterial({ color: 0xb8913a });
const cardboard = new MeshLambertMaterial({ color: 0x7a2a1c });
const wood = new MeshLambertMaterial({ color: 0x8a6a44 });
const flameMaterial = new MeshBasicMaterial({ color: 0xffc46b });
const candleShape = new CylinderGeometry(0.024, 0.027, 1, 6).translate(0, 0.5, 0);
const flameShape = new SphereGeometry(0.018, 6, 4).scale(1, 2.2, 1);
const boxShape = new BoxGeometry(0.1, 0.03, 0.06);
const keyShape = new BoxGeometry(0.12, 0.012, 0.025);
const matchShape = new BoxGeometry(0.006, 0.006, 0.09);

interface StandView {
  stand: Stand;
  chunkId: ChunkId;
  group: Group;
  candle: Mesh;
  flame: Mesh;
  matchbox?: Mesh;
  keys: Mesh[];
}

const candleHeight = (burnLeft: number) => STUB_HEIGHT + (CANDLE_HEIGHT - STUB_HEIGHT) * (burnLeft / ITEMS.candleSeconds);

/**
 * Candles, matches and keys in the world (spec 18): each stand is usable with E and drawn with
 * its candle, flame, matchbox and keys; the held candle or match is drawn at the bottom right of
 * the view with its own light. The rules are the pure `itemsReducer`; this draws its state and
 * passes its emits on to the event bus.
 */
export class ItemsController {
  private state: ItemsState;
  private readonly views = new Map<string, StandView>();
  private readonly registered = new Map<ChunkId, (() => void)[]>();
  private readonly held = new Group();
  private readonly heldCandle = new Mesh(candleShape, wax);
  private readonly heldFlame = new Mesh(flameShape, flameMaterial);
  private readonly match = new Group();
  private readonly handLight: PointLight;
  private time = 0;

  constructor(private readonly options: { scene: Scene; house: House; interactions: Interactions; matches?: number }) {
    this.state = createItems({ matches: options.matches });
    this.heldCandle.scale.y = CANDLE_HEIGHT;
    this.held.add(this.heldCandle, this.heldFlame, this.match);
    const stick = new Mesh(matchShape, wood);
    stick.rotation.x = -Math.PI / 2.6;
    const matchFlame = new Mesh(flameShape, flameMaterial);
    matchFlame.position.set(0, 0.04, -0.02);
    this.match.add(stick, matchFlame);
    this.match.position.set(-0.08, 0.06, 0);
    this.held.visible = false;
    // Always in the scene, at intensity 0 when there is no flame: adding a light later would
    // recompile every material.
    this.handLight = new PointLight(LIGHTING.candle.color, 0, LIGHTING.candle.distance, LIGHTING.candle.decay);
    this.handLight.castShadow = false;
    options.scene.add(this.held, this.handLight);
  }

  /** The current items state (debug and tests). */
  snapshot(): ItemsState {
    return this.state;
  }

  /** Call with every chunk diff, so stands come and go with their chunks. */
  sync(diff: ChunkDiff): void {
    for (const id of [...diff.unloaded, ...diff.loaded.map((c) => c.id)]) {
      for (const off of this.registered.get(id) ?? []) off();
      this.registered.delete(id);
      for (const [key, view] of this.views) {
        if (view.chunkId !== id) continue;
        view.group.removeFromParent();
        this.views.delete(key);
      }
    }
    for (const chunk of diff.loaded) {
      const offs: (() => void)[] = [];
      for (const room of chunk.rooms) {
        for (const stand of standsOf(room)) {
          this.views.set(stand.id, this.build(stand, chunk.id));
          const label = () => useLabel(this.state, stand.id, stand.matchbox) ?? 'An empty candlestick';
          offs.push(
            this.options.interactions.register({
              id: stand.id,
              x: stand.x,
              z: stand.z,
              kind: 'object',
              get label() {
                return label();
              },
              onInteract: () => this.use(stand),
            }),
          );
        }
      }
      this.registered.set(chunk.id, offs);
    }
  }

  /** E on a stand. */
  use(stand: Stand): void {
    events.emit('interact', { id: stand.id });
    this.dispatch({ type: 'use', standId: stand.id, matchbox: stand.matchbox });
    // A spare candle's room is kept as it is once touched, so a reshuffle can't take it away.
    if (stand.roomId.startsWith('r:')) this.options.house.pinCells(this.options.house.getRoom(stand.roomId)?.cells ?? []);
  }

  /** M. */
  strikeMatch(): void {
    this.dispatch({ type: 'strikeMatch' });
  }

  /** B. */
  blowOut(): void {
    this.dispatch({ type: 'blowOut' });
  }

  /** Spec 26: La Sombra's gust puts out every flame about the player in `cell`: in hand and standing in the room. */
  gust(cell: CellId): void {
    const room = this.options.house.roomAt(cell);
    this.dispatch({ type: 'gust', standIds: room ? standsOf(room).map((s) => s.id) : [] });
  }

  /** Spec 26: the player has light, but only flame a gust could blow out: the torch off, and not in a sanctuary. */
  flameOnly(flashlightLit: boolean, cell: CellId): boolean {
    if (flashlightLit) return false;
    const room = this.options.house.roomAt(cell);
    return !(room && this.isSanctuary(room.id)) && this.inLight(false, cell);
  }

  /** A spirit set at peace: the candle beneath its portrait lights by itself. */
  spiritSolved(characterId: CharacterId): void {
    this.dispatch({ type: 'spiritSolved', characterId });
  }

  /** A spirit's keys, laid on its table once it has gone. */
  layKeys(characterId: CharacterId, keyIds: readonly string[]): void {
    this.dispatch({ type: 'keysLeft', standId: standId(`key:${characterId}`), keyIds });
  }

  /** Whether the player has light where they stand (spec 12). */
  inLight(flashlightLit: boolean, cell: CellId): boolean {
    const room = this.options.house.roomAt(cell);
    return inLight(this.state, { flashlightLit, roomStandIds: room ? standsOf(room).map((s) => s.id) : [] });
  }

  /** A lit candle or a burning match in hand (spec 25: La Sombra is bolder by its light alone). */
  holdsFlame(): boolean {
    return hasFlame(this.state);
  }

  isSanctuary(roomId: string): boolean {
    return isSanctuary(this.state, roomId);
  }

  /** Lit candles standing in the loaded stands, for the candle lights. */
  litStandingCandles(): [number, number, number][] {
    const lit: [number, number, number][] = [];
    for (const view of this.views.values()) {
      const here = candleAt(this.state, view.stand.id);
      if (here?.lit) lit.push([view.stand.x, view.stand.top + CANDLESTICK + candleHeight(here.burnLeft) + 0.05, view.stand.z]);
    }
    return lit;
  }

  /** Each frame: burning, the candles' heights and flames, and the held flame in view. */
  update(dt: number, camera: Camera): void {
    this.time += dt;
    if (dt > 0) this.dispatch({ type: 'tick', dt });
    const flicker = (phase: number) => 1 + 0.12 * Math.sin(this.time * 9 + phase) + 0.08 * Math.sin(this.time * 23 + phase * 1.7);

    let phase = 0;
    for (const view of this.views.values()) {
      phase += 1.3;
      const here = candleAt(this.state, view.stand.id);
      view.candle.visible = here !== undefined;
      view.flame.visible = here?.lit === true;
      view.candle.material = here?.lit ? litWax : wax;
      if (here) {
        const height = candleHeight(here.burnLeft);
        view.candle.scale.y = height;
        view.flame.position.y = view.stand.top + CANDLESTICK + height + 0.03;
        view.flame.scale.setScalar(flicker(phase));
      }
      if (view.matchbox) view.matchbox.visible = !this.state.hasMatchbox;
      const keys = this.state.tableKeys[view.stand.id]?.length ?? 0;
      view.keys.forEach((key, i) => (key.visible = i < keys));
    }

    // The held candle (or the match) at the bottom right of the view, with its own light.
    const { hand, matchLeft } = this.state;
    const held = hand ? candle(this.state, hand) : undefined;
    this.held.visible = held !== undefined || matchLeft > 0;
    this.heldCandle.visible = held !== undefined;
    this.heldFlame.visible = held?.lit === true;
    this.heldCandle.material = held?.lit ? litWax : wax;
    this.match.visible = matchLeft > 0;
    let light = 0;
    if (held) {
      const height = candleHeight(held.burnLeft);
      this.heldCandle.scale.y = height;
      this.heldFlame.position.y = height + 0.03;
      this.heldFlame.scale.setScalar(flicker(0.4));
      if (held.lit) light = 1;
    }
    if (matchLeft > 0) light = Math.max(light, 0.7 * Math.min(1, matchLeft / 2));
    camera.updateMatrixWorld();
    this.held.position.copy(HELD_AT).applyMatrix4(camera.matrixWorld);
    this.held.quaternion.copy(camera.quaternion);
    this.handLight.position.set(0, held?.lit ? candleHeight(held.burnLeft) + 0.06 : 0.1, 0).add(HELD_AT).applyMatrix4(camera.matrixWorld);
    this.handLight.intensity = LIGHTING.candle.intensity * light * (0.9 + 0.1 * flicker(2.1));
  }

  private dispatch(action: ItemsAction): void {
    this.state = itemsReducer(this.state, action);
    for (const emit of this.state.emits) this.emit(emit);
  }

  private emit(emit: ItemsEmit): void {
    switch (emit.name) {
      case 'itemPickedUp':
        events.emit('itemPickedUp', { kind: emit.kind, id: emit.id });
        break;
      case 'matchStruck':
        events.emit('matchStruck', { left: emit.left });
        break;
      case 'candleLit':
        events.emit('candleLit', { id: emit.id });
        break;
      case 'candleOut':
        events.emit('candleOut', { id: emit.id, reason: emit.reason });
        break;
      case 'candlePlaced':
        events.emit('candlePlaced', { id: emit.id, standId: emit.standId });
        break;
      case 'keyPickedUp':
        events.emit('keyPickedUp', { keyId: emit.keyId });
        break;
      case 'refused':
        events.emit('itemRefused', { reason: emit.reason });
        break;
    }
  }

  /** A stand's candle, flame, matchbox and keys (the stand itself is furniture, in the chunk mesh). */
  private build(stand: Stand, chunkId: ChunkId): StandView {
    const group = new Group();
    group.name = stand.id;
    const base = stand.top + CANDLESTICK;
    const candleMesh = new Mesh(candleShape, wax);
    candleMesh.position.set(stand.x, base, stand.z);
    const flame = new Mesh(flameShape, flameMaterial);
    flame.position.set(stand.x, base + CANDLE_HEIGHT + 0.03, stand.z);
    group.add(candleMesh, flame);
    // Along the wall: x for north and south walls, z for east and west.
    const [dx] = DIR_STEP[stand.wall];
    const along = (d: number): [number, number] => (dx === 0 ? [stand.x + d, stand.z] : [stand.x, stand.z + d]);
    let matchbox: Mesh | undefined;
    if (stand.matchbox) {
      matchbox = new Mesh(boxShape, cardboard);
      const [x, z] = along(0.13);
      matchbox.position.set(x, stand.top + 0.015, z);
      matchbox.rotation.y = 0.3;
      group.add(matchbox);
    }
    const keys = [0, 1, 2].map((i) => {
      const key = new Mesh(keyShape, brass);
      const [x, z] = along(-0.16 - i * 0.04);
      key.position.set(x, stand.top + 0.006 + i * 0.012, z);
      key.rotation.y = 0.5 + i * 0.6;
      key.visible = false;
      group.add(key);
      return key;
    });
    this.options.scene.add(group);
    return { stand, chunkId, group, candle: candleMesh, flame, matchbox, keys };
  }
}
