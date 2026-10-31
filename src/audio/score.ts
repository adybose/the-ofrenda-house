/**
 * The suspense score (spec 25), pure: how loud each layer plays at a level of fear. A low drone
 * creeps in first, a high tremolo string cluster above it, and low pulse hits once the heart races.
 */
export const SCORE = {
  drone: { from: 0.1, full: 0.5, cap: 0.09 },
  strings: { from: 0.45, full: 0.85, cap: 0.06 },
  pulseFrom: 0.55,
  /** Seconds between pulse hits. */
  pulseEvery: 2.2,
} as const;

const ramp = (fear: number, { from, full, cap }: { from: number; full: number; cap: number }) =>
  cap * Math.min(1, Math.max(0, (fear - from) / (full - from)));

export function scoreLevels(fear: number): { drone: number; strings: number; pulse: boolean } {
  return { drone: ramp(fear, SCORE.drone), strings: ramp(fear, SCORE.strings), pulse: fear >= SCORE.pulseFrom };
}
