import { CAUGHT_LINE } from '../ui/caught';

/** The story's clock and endings (spec 14), pure. */

/** Real minutes from midnight to dawn. */
export const DAWN_MINUTES = 24;
const NIGHT_MINUTES = 6 * 60;

/** The in-game time after `elapsedMs` of Act 2: midnight to 6 am, clamped at dawn. */
export function gameClock(elapsedMs: number, dawnMinutes = DAWN_MINUTES): { hour: number; minute: number; dawn: boolean } {
  const span = dawnMinutes * 60_000;
  const dawn = elapsedMs >= span;
  const minutes = dawn ? NIGHT_MINUTES : Math.max(0, Math.floor((elapsedMs / span) * NIGHT_MINUTES));
  return { hour: Math.floor(minutes / 60), minute: minutes % 60, dawn };
}

/** Elapsed ms that puts the clock at `HH:MM` (0:00 to 6:00), for `&clock=`. */
export function clockStart(hhmm: string, dawnMinutes = DAWN_MINUTES): number {
  const [h, m] = hhmm.split(':').map(Number);
  const minutes = Math.min(NIGHT_MINUTES, Math.max(0, (h ?? 0) * 60 + (m ?? 0)));
  return Math.ceil((minutes / NIGHT_MINUTES) * dawnMinutes * 60_000);
}

/** "12:00 am", "5:59 am". */
export function clockLabel(hour: number, minute: number): string {
  return `${hour === 0 ? 12 : hour}:${String(minute).padStart(2, '0')} am`;
}

export type EndingKind = 'true' | 'escape' | 'possessed' | 'trapped';

/** Which ending the night has come to. */
export function resolveEnding(input: { named: boolean; toldTheTruth: boolean; caught: boolean; dawnWrong: boolean }): EndingKind {
  if (input.caught) return 'possessed';
  if (input.dawnWrong) return 'trapped';
  if (input.named) return input.toldTheTruth ? 'true' : 'escape';
  return 'trapped';
}

/** The story's words for each ending. */
export const ENDINGS: Record<EndingKind, { title: string; text: string }> = {
  true: {
    title: 'The true ending',
    text: "The spirits turn on the Shadow, and it burns away. The painter unveils a last painting: a baby, Elena. You know that face. It is your grandmother's. The patriarch lets you go. Dawn breaks on 2 November.",
  },
  escape: {
    title: 'The escape ending',
    text: 'The Shadow is bound, and you walk out into the night. Behind you the spirits stay, and the house waits for the next trespasser.',
  },
  possessed: {
    title: 'The possessed ending',
    text: `${CAUGHT_LINE} Your vision goes dark. In the portrait hall, a new portrait hangs: your own face.`,
  },
  trapped: {
    title: 'The trapped ending',
    text: 'The clock strikes six and the rooms stop moving, with you inside one of them forever. A new portrait hangs in the hall, with your face.',
  },
};
