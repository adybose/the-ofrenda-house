import type { CaseFile, CharacterId } from '../case/types';
import { events } from '../core/events';
import type { ItemsController } from '../items/controller';
import { candle } from '../items/items';
import type { Flashlight } from '../lighting/flashlight';
import type { PlayerController } from '../player/controller';
import type { Thoughts } from '../ui/thought';
import type { House } from '../world/house';
import { standsOf } from '../world/stands';
import { worldToCell } from '../world/units';
import { EXIT_KEY } from './accusation';
import { createMonologue, monologueReducer, type MonologueContext, type MonologueEvent, type Trigger, type Vars } from './monologue';

declare module '../core/events' {
  interface GameEvents {
    thoughtShown: { id: string };
  }
}

/** Standing this close to the Act 1 stand counts as seeing its candle and matchbox. */
const NEAR_STAND = 2.5;

export interface MonologueDeps {
  caseFile: CaseFile;
  house: House;
  items: ItemsController;
  flashlight: Flashlight;
  player: PlayerController;
  thoughts: Thoughts;
}

/**
 * The stranger's thoughts in the game (spec 20): game events become triggers for the pure rules in
 * `monologue.ts`, and whatever they say is due is shown on screen.
 */
export class Monologue {
  private state = createMonologue();
  private now = 0;
  private wasBlocked = false;
  private readonly stand;

  constructor(private readonly deps: MonologueDeps) {
    const corridor = deps.house.getRoom('act1-corridor');
    this.stand = corridor ? standsOf(corridor)[0] : undefined;
    this.connect();
  }

  /** A script's thought, by id (spec 14 calls `think('findCandle')` after the patriarch's line). */
  think(id: string): void {
    this.dispatch({ type: 'think', id, now: this.now });
  }

  /** Each frame. `blocked`: an encounter, the journal, a dialogue, the finale or an ending holds the screen. */
  update(dt: number, blocked: boolean): void {
    this.now += dt;
    // Whatever takes the screen clears the thought at once.
    if (blocked && !this.wasBlocked) this.deps.thoughts.hide();
    this.wasBlocked = blocked;
    this.dispatch({ type: 'tick', ctx: this.context(), now: this.now, blocked });
  }

  private fire(trigger: Trigger, vars?: Vars): void {
    this.dispatch({ type: 'trigger', trigger, ctx: this.context(), now: this.now, vars });
  }

  private dispatch(event: MonologueEvent): void {
    this.state = monologueReducer(this.state, event);
    const show = this.state.show;
    if (!show) return;
    this.deps.thoughts.show(show.id, show.text);
    events.emit('thoughtShown', { id: show.id });
  }

  private context(): MonologueContext {
    const { items, flashlight, player } = this.deps;
    const s = items.snapshot();
    const held = s.hand ? candle(s, s.hand) : undefined;
    const p = player.state();
    return {
      battery: flashlight.level,
      critical: flashlight.critical,
      hasMatchbox: s.hasMatchbox,
      matches: s.matches,
      hasCandle: s.hand !== undefined || s.pocket.length > 0,
      heldLit: held?.lit ?? false,
      heldBurnLeft: held?.burnLeft ?? 0,
      nearMatchbox: this.stand !== undefined && Math.hypot(this.stand.x - p.x, this.stand.z - p.z) <= NEAR_STAND,
      inLight: items.inLight(flashlight.lit, worldToCell(p.x, p.z)),
    };
  }

  private connect(): void {
    const { caseFile, items } = this.deps;
    events.on('batteryChanged', () => this.fire('battery'));
    events.on('flashlightCutOut', () => this.fire('torchDied'));
    events.on('flashlightToggled', ({ on }) => {
      if (!on && this.deps.flashlight.level <= 0.051) this.fire('torchDied');
    });
    events.on('hazard', ({ kind }) => {
      if (kind === 'torch') this.fire('torchDied');
    });
    events.on('matchStruck', () => this.fire('matchStruck'));
    events.on('keyAwarded', () => this.fire('keyLaid'));
    events.on('keyPickedUp', ({ keyId }) => {
      const owner = caseFile.characters.find((c) => `key:${c.id}` === keyId);
      const room = owner?.roomKind.replace(/([A-Z])/g, ' $1').toLowerCase();
      this.fire('keyTaken', { exit: keyId === EXIT_KEY, name: owner?.shortName, room });
    });
    events.on('riddleFailed', () => this.fire('riddleFailed'));
    events.on('guideWhisper', () => this.fire('guideWhisper'));
    events.on('doorLocked', () => this.fire('doorLocked'));
    events.on('shadowStateChanged', ({ state }) => {
      if (state === 'confronting') this.fire('shadowConfronts');
      if (state === 'chasing') this.fire('shadowChases');
    });
    events.on('accused', ({ correct, key }) => {
      if (!correct) this.fire('wrongName', { key });
    });
    // Carrying a burning candle out of a spirit's sanctuary leaves its room dark.
    events.on('itemPickedUp', ({ kind, id }) => {
      if (kind !== 'candle' || !id.startsWith('candle:stand:key:')) return;
      const s = items.snapshot();
      const characterId = id.slice('candle:stand:key:'.length) as CharacterId;
      if (s.solved.includes(characterId) && candle(s, id).lit) this.fire('sanctuaryLeft');
    });
  }

  /** Set free at dawn: the way back to the front door (spec 22). */
  dawnFree(): void {
    this.fire('dawnFree');
  }

  /** A spirit set at peace: its candle has lit by itself. */
  solved(): void {
    this.fire('solved');
  }
}
