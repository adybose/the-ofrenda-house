import type { Hazards, HazardKind } from '../spirits/hazards';
import type { ShadowMode } from '../spirits/shadow';
import type { ShadowController } from '../spirits/shadow-controller';

/** Test handle on window.__shadow, installed by `?debug=shadow` (spec 12). */
export interface ShadowDebug {
  mode(): ShadowMode;
  threat(): number;
  /** Metres to the player while it is in the house; null when it isn't. */
  distance(): number | null;
  position(): [number, number];
  /** Brings it about `metres` from the player, along a path, in `mode`. */
  summon(metres: number, mode?: ShadowMode): boolean;
  setThreat(threat: number): void;
  hazard(kind: HazardKind): boolean;
}

declare global {
  interface Window {
    __shadow?: ShadowDebug;
  }
}

export function installShadowDebug(options: { shadow: ShadowController; hazards: Hazards }): void {
  const { shadow, hazards } = options;
  window.__shadow = {
    mode: () => shadow.mode,
    threat: () => shadow.threat,
    distance: () => (Number.isFinite(shadow.distance()) ? shadow.distance() : null),
    position: () => shadow.position(),
    summon: (metres, mode) => shadow.summon(metres, mode),
    setThreat: (threat) => shadow.setThreat(threat),
    hazard: (kind) => hazards.fire(kind),
  };
}
