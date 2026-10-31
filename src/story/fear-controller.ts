import type { AudioEngine } from '../audio/engine';
import { events } from '../core/events';
import type { Hud } from '../ui/hud';
import { FRIGHTS, bpm, createFear, fearReducer, type FearEvent, type FearState } from './fear';

declare module '../core/events' {
  interface GameEvents {
    /** The patriarch has come out of his portrait at the player (spec 24). */
    patriarchRevealed: Record<string, never>;
    /** The patriarch says a line to the player coming back into his corridor (spec 24). */
    patriarchSpoke: { line: string };
  }
}

/**
 * The player's fear in the game (spec 24): frights from the event bus raise it, La Sombra's nearness
 * holds it up, and it drives the heartbeat and the heart on the HUD.
 */
export class FearController {
  private state: FearState = createFear();
  private shown = 0;

  constructor(private readonly options: { audio: AudioEngine; hud: Hud }) {
    const spike = (amount: number) => () => this.dispatch({ type: 'spike', amount });
    events.on('scareFired', ({ kind }) => this.dispatch({ type: 'spike', amount: kind === 'cat' ? FRIGHTS.catScream : FRIGHTS.scare }));
    events.on('hazard', spike(FRIGHTS.hazard));
    events.on('caughtByShadow', spike(FRIGHTS.caught));
    events.on('patriarchRevealed', spike(FRIGHTS.patriarch));
    events.on('patriarchSpoke', spike(FRIGHTS.patriarchSpeaks));
    events.on('shadowStateChanged', ({ state }) => {
      if (state === 'hunting') this.dispatch({ type: 'spike', amount: FRIGHTS.shadowAppears });
      if (state === 'confronting') this.dispatch({ type: 'spike', amount: FRIGHTS.shadowConfronts });
    });
  }

  /** La Sombra's nearness (a chase holds fear high). */
  hold(level: number): void {
    this.dispatch({ type: 'floor', level });
  }

  get level(): number {
    return this.state.level;
  }

  update(dt: number): void {
    this.dispatch({ type: 'tick', dt });
    this.options.audio.setTension(this.state.level);
    const now = bpm(this.state.level);
    if (now !== this.shown) {
      this.shown = now;
      this.options.hud.heart(now);
    }
  }

  private dispatch(event: FearEvent): void {
    this.state = fearReducer(this.state, event);
  }
}
