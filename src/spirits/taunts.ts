import { SHADOW_TAUNTS } from '../../server/fallbacks/shadow';

/** How long to wait for the local server before La Sombra says a hand-written line instead. */
const TAUNT_TIMEOUT_MS = 3000;
/** The story's rule for its lines (spec 08). */
const MAX_WORDS = 12;

/**
 * One of La Sombra's lines (spec 12): from the local server (the model, or its own fallbacks), or,
 * if the server is down, slow or odd, one of the hand-written taunts, chosen by `pick` (0..1).
 */
export async function fetchTaunt(seed: number, context: 'chase' | 'whisper', pick: number): Promise<string> {
  const local = () => SHADOW_TAUNTS[Math.min(SHADOW_TAUNTS.length - 1, Math.floor(pick * SHADOW_TAUNTS.length))]!;
  try {
    const response = await fetch('/api/shadow/taunt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seed, context }),
      signal: AbortSignal.timeout(TAUNT_TIMEOUT_MS),
    });
    if (!response.ok) return local();
    const { line } = (await response.json()) as { line?: unknown };
    return typeof line === 'string' && line.trim() && line.trim().split(/\s+/).length <= MAX_WORDS ? line.trim() : local();
  } catch {
    return local();
  }
}
