import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import {
  AMBUSH,
  GRASP,
  RUN_SPEED,
  ambushOdds,
  blowsOut,
  SHADOW,
  canCatch,
  chooseSpawn,
  createShadow,
  findPath,
  outOfView,
  shadowReducer,
  speedFor,
  type ShadowEvent,
  type ShadowState,
  type SpawnCandidate,
} from '../../src/spirits/shadow';
import { cellId } from '../../src/world/grid';
import { newHouse } from './house-helpers';

type Tick = Extract<ShadowEvent, { type: 'tick' }>;
const tick = (changes: Partial<Tick> = {}): Tick => ({ type: 'tick', dt: 0.1, sees: false, distance: 10, inLight: false, suppressed: false, flameOnly: false, approach: 0, ...changes });
const run = (state: ShadowState, ...events: ShadowEvent[]) => events.reduce(shadowReducer, state);
/** Ticks until the mode changes (or `limit` seconds), collecting everything emitted. */
function until(state: ShadowState, event: Tick, limit = 200) {
  const emits: string[] = [];
  let s = state;
  for (let t = 0; t < limit && s.mode === state.mode; t += event.dt) {
    s = shadowReducer(s, event);
    emits.push(...s.emits);
  }
  return { state: s, emits };
}
const hunting = (threat = 0) => run(createShadow(1, threat), { type: 'enable' }, { type: 'force', mode: 'hunting' });

describe('modes', () => {
  it('sleeps until enabled, stalks with whispers, then hunts', () => {
    expect(shadowReducer(createShadow(1), tick({ dt: 500 })).mode).toBe('dormant');
    const stalking = shadowReducer(createShadow(1), { type: 'enable' });
    expect(stalking.mode).toBe('stalking');
    const { state, emits } = until(stalking, tick({ dt: 0.5 }));
    expect(state.mode).toBe('hunting');
    expect(state.emits).toEqual(['appear']);
    expect(emits.filter((e) => e === 'whisper').length).toBe(Math.floor((SHADOW.stalkSeconds[0] - 0.5) / SHADOW.whisperSeconds[0]));
  });

  it('confronts a player in light: threatens once, then withdraws for 30 to 60 s, then stalks', () => {
    const confronting = shadowReducer(hunting(), tick({ sees: true, inLight: true, distance: 6 }));
    expect(confronting.mode).toBe('confronting');
    // It laughs, then says its piece (spec 24).
    expect(confronting.emits).toEqual(['laugh', 'threaten']);
    // It never chases or catches a player in light, however close.
    const { state, emits } = until(confronting, tick({ sees: true, inLight: true, distance: 0.5 }));
    expect(emits.filter((e) => e === 'threaten')).toHaveLength(0);
    expect(emits).not.toContain('caught');
    expect(state.mode).toBe('withdrawn');
    expect(state.away).toBeGreaterThanOrEqual(30);
    expect(state.away).toBeLessThanOrEqual(60);
    const back = until(state, tick({ dt: 1 }));
    expect(back.state.mode).toBe('stalking');
    expect(back.state.modeTime).toBe(0);
  });

  it('chases a player in the dark, and confronts instead the moment they have light', () => {
    const chasing = shadowReducer(hunting(), tick({ sees: true, distance: 9 }));
    expect(chasing.mode).toBe('chasing');
    expect(chasing.emits).toEqual(['taunt']);
    const lit = shadowReducer(chasing, tick({ sees: true, inLight: true, distance: 3 }));
    expect(lit.mode).toBe('confronting');
    expect(lit.emits).toEqual(['laugh', 'threaten']);
  });

  it('loses the player beyond 15 m, or after 4 s out of sight', () => {
    const chasing = shadowReducer(hunting(), tick({ sees: true, distance: 9 }));
    expect(shadowReducer(chasing, tick({ sees: true, distance: 15.1 })).mode).toBe('lost');
    const hidden = until(chasing, tick({ distance: 8 }));
    expect(hidden.state.mode).toBe('lost');
    expect(hidden.state.emits).toEqual(['vanish']);
    // Seen again in time: the count starts over.
    const glimpsed = run(chasing, ...Array.from({ length: 30 }, () => tick({ distance: 8 })), tick({ sees: true, distance: 8 }), ...Array.from({ length: 30 }, () => tick({ distance: 8 })));
    expect(glimpsed.mode).toBe('chasing');
  });

  it('seizes only within 1 m and only in the dark, and catches after the grace (spec 26)', () => {
    const chasing = shadowReducer(hunting(), tick({ sees: true, distance: 9 }));
    expect(shadowReducer(chasing, tick({ sees: true, distance: 1.2 })).mode).toBe('chasing');
    const seized = shadowReducer(chasing, tick({ sees: true, distance: 0.9 }));
    expect(seized.mode).toBe('grasping');
    expect(seized.emits).toEqual(['grab']);
    const caught = run(seized, tick({ dt: GRASP.grace, distance: 0.5 }));
    expect(caught.mode).toBe('caught');
    expect(caught.emits).toEqual(['caught']);
    expect(shadowReducer(caught, tick({ dt: 100 })).mode).toBe('caught');
    for (const d of [0, 0.5, 1]) {
      expect(canCatch(d, true)).toBe(false);
      expect(canCatch(d, false)).toBe(true);
    }
    expect(canCatch(1.01, false)).toBe(false);
  });

  it('slips away and keeps quiet while an encounter or the journal is open', () => {
    const chasing = shadowReducer(hunting(), tick({ sees: true, distance: 3 }));
    const hushed = shadowReducer(chasing, tick({ suppressed: true, distance: 0.5 }));
    expect(hushed.mode).toBe('stalking');
    expect(hushed.emits).toEqual(['vanish']);
    const { emits, state } = until(hushed, tick({ dt: 1, suppressed: true }), 300);
    expect(state.mode).toBe('stalking');
    expect(emits).toEqual([]);
  });
});

describe('drawn by darkness, and stepping out in front (spec 24)', () => {
  it('comes when the light goes out, from stalking, withdrawn or lost, saying something about the dark', () => {
    const stalking = run(createShadow(1), { type: 'enable' });
    const drawn = shadowReducer(stalking, { type: 'attract' });
    expect(drawn.mode).toBe('hunting');
    expect(drawn.emits).toEqual(['appear', 'darkLine']);
    for (const mode of ['withdrawn', 'lost'] as const) {
      expect(run(stalking, { type: 'force', mode }, { type: 'attract' }).mode).toBe('hunting');
    }
  });

  it('does not when asleep, already here, or done', () => {
    expect(shadowReducer(createShadow(1), { type: 'attract' }).mode).toBe('dormant');
    const chasing = run(createShadow(1), { type: 'enable' }, { type: 'force', mode: 'chasing' });
    expect(shadowReducer(chasing, { type: 'attract' }).mode).toBe('chasing');
    const caught = run(chasing, tick({ sees: true, distance: 0.5 }), tick({ dt: GRASP.grace, distance: 0.5 }));
    expect(caught.mode).toBe('caught');
    expect(shadowReducer(caught, { type: 'attract' }).mode).toBe('caught');
    expect(shadowReducer(caught, { type: 'ambush' }).mode).toBe('caught');
  });

  it('steps out in front of the player, then laughs and flees a light, or charges the dark', () => {
    const ambush = run(createShadow(1), { type: 'enable' }, { type: 'ambush' });
    expect(ambush.mode).toBe('hunting');
    expect(ambush.emits).toEqual(['ambush']);
    expect(shadowReducer(ambush, tick({ sees: true, inLight: true, distance: 5 })).emits).toEqual(['laugh', 'threaten']);
    expect(shadowReducer(ambush, tick({ sees: true, inLight: false, distance: 5 })).mode).toBe('chasing');
  });
});

describe('threat', () => {
  it('rises on a failed riddle, a wrong name and each hour, to 5, and never falls', () => {
    let s = createShadow(1);
    const events: ShadowEvent[] = [{ type: 'riddleFailed' }, { type: 'wrongName' }, { type: 'hourPassed' }];
    for (let i = 0; i < 9; i++) {
      const before = s.threat;
      s = run(s, events[i % 3]!, tick({ dt: 5 }), { type: 'enable' }, { type: 'force', mode: 'chasing' });
      expect(s.threat).toBe(Math.min(5, before + 1));
    }
    expect(s.threat).toBe(SHADOW.maxThreat);
  });

  it('is slower than the player’s run below threat 3, and hunts slower than it chases', () => {
    for (let threat = 0; threat < 3; threat++) expect(speedFor(threat, 'chasing')).toBeLessThan(RUN_SPEED);
    for (let threat = 0; threat <= 5; threat++) expect(speedFor(threat, 'hunting')).toBeLessThan(speedFor(threat, 'chasing'));
    expect(speedFor(5, 'chasing')).toBeGreaterThan(RUN_SPEED);
    expect(speedFor(2, 'confronting')).toBe(0);
  });
});

describe('spawning', () => {
  it('always appears at least 8 m away and out of view (500 random layouts)', () => {
    const rng = createRng(12);
    let spawned = 0;
    for (let i = 0; i < 500; i++) {
      const player = { x: rng.float() * 40, z: -rng.float() * 40, yaw: rng.float() * Math.PI * 2, roomId: `room:${rng.int(0, 4)}` };
      const candidates: SpawnCandidate[] = Array.from({ length: rng.int(0, 60) }, () => {
        const [x, z] = [rng.float() * 40, -rng.float() * 40];
        return { cell: cellId(Math.floor(x / 1.5), Math.floor(-z / 1.5)), x, z, roomId: `room:${rng.int(0, 4)}`, doors: rng.int(0, 4) };
      });
      const spawn = chooseSpawn(candidates, player, rng.float());
      const fit = candidates.filter((c) => Math.hypot(c.x - player.x, c.z - player.z) >= 8 && outOfView(c, player));
      if (!spawn) {
        expect(fit).toEqual([]);
        continue;
      }
      spawned++;
      expect(Math.hypot(spawn.x - player.x, spawn.z - player.z)).toBeGreaterThanOrEqual(8);
      expect(outOfView(spawn, player)).toBe(true);
      expect(spawn.roomId).not.toBe(player.roomId);
    }
    expect(spawned).toBeGreaterThan(300);
  });

  it('counts a room off to the side or behind as out of view, but not one straight ahead through a door', () => {
    const player = { x: 0, z: 0, yaw: 0, roomId: 'a' };
    const at = (x: number, z: number, doors: number) => ({ cell: '0,0', x, z, roomId: 'b', doors });
    expect(outOfView(at(0, -10, 1), player)).toBe(false);
    expect(outOfView(at(0, 10, 1), player)).toBe(true);
    expect(outOfView(at(10, 0, 1), player)).toBe(true);
    expect(outOfView(at(0, -10, 2), player)).toBe(true);
    expect(outOfView({ ...at(0, 10, 0), roomId: 'a' }, player)).toBe(false);
  });
});

describe('paths', () => {
  it('never enters a sanctuary while its candle burns, and can once it is gone; never crosses a locked door', () => {
    for (const seed of [1, 7, 42]) {
      const house = newHouse(seed);
      house.update(house.startCell);
      house.endAct1();
      const open = house.keyRooms().find((k) => !k.locked && k.roomId)!;
      const room = house.getRoom(open.roomId!)!;
      const inside = room.cells[0]!;
      const sanctuary = new Set(room.cells);
      const start = '1,2';
      expect(findPath(house, start, inside, (c) => sanctuary.has(c))).toBeNull();
      const path = findPath(house, start, inside);
      expect(path).not.toBeNull();
      expect(path!.at(-1)).toBe(inside);

      const locked = house.keyRooms().find((k) => k.locked && k.roomId)!;
      expect(findPath(house, start, house.getRoom(locked.roomId!)!.cells[0]!)).toBeNull();
    }
  });

  it('jams a slammed door shut for a while, then releases it', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    house.endAct1();
    const doorId = 'd:-1,0:E';
    const [a, b] = ['0,2', '-1,2'];
    expect(house.getDoor(doorId)?.state).toBe('closed');
    expect(house.holdShut(doorId, true)).toBe(true);
    expect(house.getDoor(doorId)?.state).toBe('locked');
    expect(house.getDoor(doorId)?.keyId).toBeUndefined();
    expect(findPath(house, a, b)).toBeNull();
    expect(house.holdShut(doorId, false)).toBe(true);
    expect(house.getDoor(doorId)?.state).toBe('closed');
    expect(findPath(house, a, b)).toEqual([a, b]);
    // Never a key room's door, a sealed door, or a door it didn't jam.
    const keyDoor = house.keyRooms().find((k) => k.doorId)!.doorId!;
    expect(house.holdShut(keyDoor, true)).toBe(false);
    expect(house.holdShut('front-door', true)).toBe(false);
    expect(house.holdShut(doorId, false)).toBe(false);
  });
});

describe('hazards', () => {
  it('never fire, nor creak, while La Sombra is held off (an encounter, the journal)', async () => {
    const { Hazards } = await import('../../src/spirits/hazards');
    const { events } = await import('../../src/core/events');
    const played: string[] = [];
    const fired: string[] = [];
    const off = events.on('hazard', ({ kind }) => fired.push(kind));
    const hazards = new Hazards({
      seed: 1,
      house: newHouse(1),
      doors: { force: () => undefined } as never,
      flashlight: { on: true, kill: () => fired.push('killed') } as never,
      audio: { play: (name: string) => played.push(name) } as never,
      player: { state: () => ({ x: 7.5 * 1.5, z: -2.5 * 1.5, yaw: 0, pitch: 0 }) } as never,
      scene: { add: () => undefined } as never,
      textures: {} as never,
    });
    for (let t = 0; t < 1000; t++) hazards.update(1, false, 5);
    expect(played).toEqual([]);
    expect(fired).toEqual([]);
    // Free to act, it does: a creak, then the hazard (here the torch, the only one with a fake to use).
    expect(hazards.fire('torch')).toBe(true);
    hazards.update(0.6, false, 5);
    expect(played).toEqual(['creak']);
    expect(fired).toEqual(['killed', 'torch']);
    off();
  });
});

describe('ambush odds (spec 25)', () => {
  it('step out at a door or corner 30% plus 5% per threat of the time, at most every 30 s', () => {
    expect(ambushOdds(0, false)).toEqual({ chance: 0.3, gap: 30 });
    expect(ambushOdds(2, false).chance).toBeCloseTo(0.4);
    expect(ambushOdds(4, false).gap).toBe(30);
  });

  it('by candlelight alone: 65%, at most every 18 s, and tried every 15 s as the player walks', () => {
    expect(ambushOdds(0, true)).toEqual({ chance: 0.65, gap: 18 });
    expect(ambushOdds(3, true)).toEqual({ chance: 0.65, gap: 18 });
    expect(AMBUSH.candleEvery).toBe(15);
  });
});

describe('walking into it by candlelight (spec 26)', () => {
  const flame = { inLight: true, flameOnly: true };

  it('blows the flames out when the player closes in within 2.5 m, or stands within 1.2 m, by flame alone', () => {
    expect(blowsOut({ distance: 2.4, approach: 1, ...flame })).toBe(true);
    expect(blowsOut({ distance: 2, approach: 0, ...flame })).toBe(false);
    expect(blowsOut({ distance: 2, approach: 0.3, ...flame })).toBe(false);
    expect(blowsOut({ distance: 2.6, approach: 2, ...flame })).toBe(false);
    expect(blowsOut({ distance: 1, approach: 0, ...flame })).toBe(true);
    // Never with the torch on (or in a sanctuary), and there is nothing to blow out in the dark.
    expect(blowsOut({ distance: 1, approach: 1, inLight: true, flameOnly: false })).toBe(false);
    expect(blowsOut({ distance: 1, approach: 1, inLight: false, flameOnly: false })).toBe(false);
  });

  it('a candle-holder walking at it while it threatens: a gust, and it seizes them', () => {
    const confronting = shadowReducer(hunting(), tick({ sees: true, distance: 4, ...flame }));
    expect(confronting.mode).toBe('confronting');
    expect(shadowReducer(confronting, tick({ sees: true, distance: 2, ...flame })).mode).toBe('confronting');
    const seized = shadowReducer(confronting, tick({ sees: true, distance: 2, approach: 1.4, ...flame }));
    expect(seized.mode).toBe('grasping');
    expect(seized.emits).toEqual(['gust']);
    // While hunting too, before it would only threaten.
    expect(shadowReducer(hunting(), tick({ sees: true, distance: 1, ...flame })).emits).toEqual(['gust']);
    // With the torch on, it only threatens, however close.
    expect(shadowReducer(confronting, tick({ sees: true, distance: 1, approach: 1.4, inLight: true })).mode).toBe('confronting');
  });

  it('light within the grace throws it off; none, and the player is caught', () => {
    const seized = shadowReducer(shadowReducer(hunting(), tick({ sees: true, distance: 4, ...flame })), tick({ sees: true, distance: 1, ...flame }));
    expect(seized.mode).toBe('grasping');
    const held = run(seized, ...Array.from({ length: 12 }, () => tick({ distance: 0.55 })));
    expect(held.mode).toBe('grasping');
    const thrown = shadowReducer(held, tick({ distance: 0.55, inLight: true }));
    expect(thrown.mode).toBe('withdrawn');
    expect(thrown.emits).toEqual(['laugh', 'repelled']);
    expect(thrown.away).toBeGreaterThanOrEqual(30);
    const { state, emits } = until(seized, tick({ distance: 0.55 }));
    expect(state.mode).toBe('caught');
    expect(emits).toEqual(['caught']);
    expect(state.emits).toEqual(['caught']);
    expect(run(seized, ...Array.from({ length: 14 }, () => tick({ distance: 0.55 }))).mode).toBe('grasping');
    expect(run(seized, ...Array.from({ length: 16 }, () => tick({ distance: 0.55 }))).mode).toBe('caught');
  });

  it('slips away from a seizure when an encounter opens', () => {
    const seized = run(createShadow(1), { type: 'enable' }, { type: 'force', mode: 'grasping' });
    const hushed = shadowReducer(seized, tick({ suppressed: true }));
    expect(hushed.mode).toBe('stalking');
    expect(hushed.emits).toEqual(['vanish']);
  });
});
