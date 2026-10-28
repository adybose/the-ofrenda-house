/** Seconds between a flash and its thunder: sound covers about a kilometre every 3 s. */
export function thunderDelay(distanceKm: number): number {
  return Math.min(6, Math.max(0.5, distanceKm * 3));
}
