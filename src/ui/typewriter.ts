/** How fast a line types out without speech. */
export const CHARS_PER_SECOND = 40;

/**
 * How many characters of a line to show after `elapsedMs`: 40 a second, or spread evenly over the
 * speech's duration when there is one, so the text and the voice finish together.
 */
export function shownChars(elapsedMs: number, length: number, durationMs?: number): number {
  const progress = durationMs && durationMs > 0 ? (elapsedMs / durationMs) * length : (elapsedMs / 1000) * CHARS_PER_SECOND;
  return Math.max(0, Math.min(length, Math.floor(progress)));
}
