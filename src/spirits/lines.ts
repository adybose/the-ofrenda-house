import type { Rng } from '../core/rng';

/**
 * Lines for La Sombra and the patriarch (spec 24): hand-written, at most 12 words, never the same
 * line twice in a row of five.
 */

/** When the player's light goes out and La Sombra comes for them. */
export const DARK_LINES: readonly string[] = [
  'I can see your darkness.',
  'I can smell your fear.',
  'Your light is gone. I am not.',
  'In the dark, you are mine.',
  'Do you hear me breathing? I hear you.',
  'Darkness suits you, little thief.',
  'No flame now. Only me.',
  'The dark is my house too.',
  'Your heart is so loud in the dark.',
  'There you are. I knew you would come to me.',
  'Shh. Let the dark hold you.',
  'Every shadow is my hand.',
];

/** When it meets a player who holds a light: it laughs and flees, for now. */
export const FLEE_LINES: readonly string[] = [
  'Hide behind your little flame. For now.',
  'Light burns out. I can wait.',
  'Not yet. Soon.',
  'Keep your candle close. It will not last.',
  'I will be here when it goes dark.',
  'Run along, little light.',
  'Your flame is shaking. So are you.',
  'Enjoy the light while it lasts.',
  'The night is long. I am patient.',
  'One breath, and your light is gone.',
  'I will see you in the dark.',
  'You cannot carry that light forever.',
];

/** Spec 26: as it blows out the player's flame, or takes hold of them in the dark. */
export const GRASP_LINES: readonly string[] = [
  'Too close, little thief.',
  'Now you are mine.',
  'Your flame is gone. So are you.',
  'You walked right into my arms.',
  'Shh. Let me in.',
  'Come here.',
  'No light left. Only me.',
  'I have you now.',
];

/** The patriarch, to a player who comes back into his corridor after Act 1. */
export const PATRIARCH_LINES: readonly string[] = [
  'Still here? The candle burns, stranger.',
  'Ask them. The dead remember.',
  'Dawn will not wait for you.',
  'Find the one who did this.',
  'You come back to me? Go. Ask them.',
  'My family is waiting for you in the dark.',
  'The house is watching. So am I.',
  'Do not trust every face that smiles.',
  'Go. Before the last candle burns down.',
  'The poison was in my house. Find it.',
];

/** A line not among the last five said; returns it and the updated memory. */
export function pickLine(lines: readonly string[], recent: readonly string[], rng: Rng): { line: string; recent: string[] } {
  const fresh = lines.filter((l) => !recent.includes(l));
  const line = rng.pick(fresh.length ? fresh : lines);
  return { line, recent: [...recent, line].slice(-5) };
}
