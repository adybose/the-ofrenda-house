/**
 * The stranger's thoughts (spec 20), as a pure reducer: which hand-written thought to show and
 * when. Hints must always be right, so none of this comes from the model. Each thought fires on a
 * trigger (a game event, a script, or `tick` for conditions checked every frame), once per run unless
 * it may repeat after a cooldown, one at a time, and never while something else holds the screen.
 */

/** What the rules can see of the game. */
export interface MonologueContext {
  battery: number;
  critical: boolean;
  hasMatchbox: boolean;
  matches: number;
  /** A candle in hand or pocket. */
  hasCandle: boolean;
  heldLit: boolean;
  /** Seconds left on the candle in hand. */
  heldBurnLeft: number;
  /** Standing by the Act 1 stand with its matchbox. */
  nearMatchbox: boolean;
  inLight: boolean;
}

export type Trigger =
  | 'findCandle'
  | 'tick'
  | 'battery'
  | 'torchDied'
  | 'matchStruck'
  | 'solved'
  | 'keyLaid'
  | 'keyTaken'
  | 'riddleFailed'
  | 'sanctuaryLeft'
  | 'doorLocked'
  | 'shadowConfronts'
  | 'shadowChases'
  | 'wrongName'
  | 'dawnFree';

export type Vars = Readonly<Record<string, string | boolean | undefined>>;

export interface Thought {
  id: string;
  on: Trigger;
  when?(ctx: MonologueContext, vars: Vars): boolean;
  line: string | ((vars: Vars) => string);
  /** May show again this many seconds after it last did; otherwise once per run. */
  repeatEvery?: number;
  /** Another thought this long after, unless the player has acted by then. */
  followUp?: { id: string; after: number; unless(ctx: MonologueContext): boolean };
}

/** Seconds a thought holds the screen before the next may show. */
export const THOUGHT_SECONDS = 4.5;

export const THOUGHTS: readonly Thought[] = [
  {
    id: 'findCandle',
    on: 'findCandle',
    line: 'There must be a candle somewhere here.',
    followUp: { id: 'findCandleAgain', after: 20, unless: (ctx) => ctx.hasCandle || ctx.hasMatchbox },
  },
  { id: 'findCandleAgain', on: 'findCandle', when: () => false, line: 'Something on that stand, in the corner…' },
  { id: 'seeCandle', on: 'tick', when: (ctx) => ctx.nearMatchbox && !ctx.hasMatchbox, line: 'A candle, and matches. Might come in handy.' },
  { id: 'batteryLow', on: 'battery', when: (ctx) => ctx.battery < 0.3 && !ctx.critical, line: "The battery's going. I should save it." },
  { id: 'batteryCritical', on: 'battery', when: (ctx) => ctx.critical, line: 'Come on… not now.' },
  { id: 'reachForMatches', on: 'torchDied', when: (ctx) => ctx.hasMatchbox && ctx.matches > 0 && !ctx.inLight, line: 'Matches. I have matches.', repeatEvery: 120 },
  { id: 'lastMatch', on: 'matchStruck', when: (ctx) => ctx.matches === 0, line: 'That was my last match. Only a lit candle can light another now.' },
  { id: 'solved', on: 'solved', line: "Its candle lit by itself. La Sombra won't come in while it burns." },
  { id: 'keyLaid', on: 'keyLaid', line: 'Something glints by the candle.', repeatEvery: 60 },
  { id: 'keyTaken', on: 'keyTaken', when: (_, v) => !v.exit, line: (v) => `The key to ${v.name}'s ${v.room}.`, repeatEvery: 0 },
  { id: 'exitKey', on: 'keyTaken', when: (_, v) => v.exit === true, line: "This one's different. The way out." },
  { id: 'failed', on: 'riddleFailed', line: 'Silence. Whatever it knew is lost.', repeatEvery: 90 },
  { id: 'sanctuaryLeft', on: 'sanctuaryLeft', line: 'Without its candle, this room is dark again.' },
  { id: 'lockedDoor', on: 'doorLocked', line: 'Locked. Someone in this house has the key.', repeatEvery: 60 },
  { id: 'candleLow', on: 'tick', when: (ctx) => ctx.heldLit && ctx.heldBurnLeft < 60, line: "This candle won't last much longer.", repeatEvery: 240 },
  { id: 'shadowInLight', on: 'shadowConfronts', line: "It won't come near the light." },
  { id: 'chasedInDark', on: 'shadowChases', line: 'Light. I need light!', repeatEvery: 30 },
  { id: 'lastUntilDawn', on: 'wrongName', when: (_, v) => !v.key, line: "Nothing… I'll have to last until dawn." },
  { id: 'dawnFree', on: 'dawnFree', line: 'The front door. I have to find my way back.' },
];

export interface MonologueState {
  /** When each thought last showed (or was queued). */
  last: Readonly<Record<string, number>>;
  queue: readonly { id: string; text: string }[];
  followUps: readonly { id: string; at: number; unless(ctx: MonologueContext): boolean }[];
  busyUntil: number;
  /** The thought to show now, if any. */
  show?: { id: string; text: string };
}

export type MonologueEvent =
  | { type: 'trigger'; trigger: Trigger; ctx: MonologueContext; now: number; vars?: Vars }
  | { type: 'think'; id: string; now: number }
  | { type: 'tick'; ctx: MonologueContext; now: number; blocked: boolean };

export function createMonologue(): MonologueState {
  return { last: {}, queue: [], followUps: [], busyUntil: 0 };
}

const lineOf = (thought: Thought, vars: Vars) => (typeof thought.line === 'string' ? thought.line : thought.line(vars));

/** Whether a thought may be queued now: never shown, or repeatable and cooled down, and not already waiting. */
function ready(state: MonologueState, thought: Thought, now: number): boolean {
  if (state.queue.some((q) => q.id === thought.id)) return false;
  const last = state.last[thought.id];
  return last === undefined || (thought.repeatEvery !== undefined && now - last >= thought.repeatEvery);
}

function enqueue(state: MonologueState, thought: Thought, now: number, vars: Vars): MonologueState {
  const followUps = thought.followUp ? [...state.followUps, { id: thought.followUp.id, at: now + thought.followUp.after, unless: thought.followUp.unless }] : state.followUps;
  return { ...state, last: { ...state.last, [thought.id]: now }, queue: [...state.queue, { id: thought.id, text: lineOf(thought, vars) }], followUps };
}

function fire(state: MonologueState, trigger: Trigger, ctx: MonologueContext, now: number, vars: Vars): MonologueState {
  let next = state;
  for (const thought of THOUGHTS) {
    if (thought.on !== trigger || !ready(next, thought, now) || (thought.when && !thought.when(ctx, vars))) continue;
    next = enqueue(next, thought, now, vars);
  }
  return next;
}

export function monologueReducer(state: MonologueState, event: MonologueEvent): MonologueState {
  const base = state.show ? { ...state, show: undefined } : state;
  switch (event.type) {
    case 'trigger':
      return fire(base, event.trigger, event.ctx, event.now, event.vars ?? {});
    case 'think': {
      const thought = THOUGHTS.find((t) => t.id === event.id);
      return thought && ready(base, thought, event.now) ? enqueue(base, thought, event.now, {}) : base;
    }
    case 'tick': {
      const { ctx, now, blocked } = event;
      let next = fire(base, 'tick', ctx, now, {});
      // Follow-ups that are due: a nudge, unless the player has already done it.
      const due = next.followUps.filter((f) => f.at <= now);
      if (due.length) {
        next = { ...next, followUps: next.followUps.filter((f) => f.at > now) };
        for (const f of due) {
          const thought = THOUGHTS.find((t) => t.id === f.id);
          if (thought && !f.unless(ctx) && ready(next, thought, now)) next = enqueue(next, thought, now, {});
        }
      }
      if (blocked || now < next.busyUntil || next.queue.length === 0) return next;
      const [show, ...queue] = next.queue;
      return { ...next, queue, show, busyUntil: now + THOUGHT_SECONDS };
    }
  }
}
