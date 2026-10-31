import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { DOOR_SCARE_COOLDOWN } from '../../src/scares/door-scares';
import { SCARES, createScareState, placeTriggers, scareScheduler, type ScareState, type ScareTrigger } from '../../src/scares/scheduler';
import { newHouse } from './house-helpers';

const trigger = (id: string, roomId = 'r:0,0:0'): ScareTrigger => ({ id, kind: 'bat', roomId, x: 0, y: 0, z: 0 });

describe('the scare scheduler', () => {
  it('over ten minutes of random trips: never closer than the cooldown, never while blocked or just after a hazard, once per room visit', () => {
    for (const seed of [1, 2, 3]) {
      const rng = createRng(seed);
      let state: ScareState = createScareState();
      let room = 'room:0';
      let lastHazard = -Infinity;
      const fires: { at: number; room: string; visit: number }[] = [];
      let visit = 0;
      for (let now = 0; now < 600; now += 0.25) {
        if (rng.chance(0.004)) {
          room = `room:${rng.int(0, 5)}`;
          visit++;
          state = scareScheduler(state, { type: 'enterRoom', roomId: room }, now).state;
        }
        if (rng.chance(0.002)) {
          lastHazard = now;
          state = scareScheduler(state, { type: 'hazard' }, now).state;
        }
        if (!rng.chance(0.2)) continue;
        const blocked = rng.chance(0.3);
        const result = scareScheduler(state, { type: 'trip', trigger: trigger(`${room}:${rng.int(0, 400)}`, room), blocked }, now);
        state = result.state;
        if (!result.fire) continue;
        expect(blocked).toBe(false);
        expect(now - lastHazard).toBeGreaterThanOrEqual(SCARES.afterHazard);
        fires.push({ at: now, room, visit });
      }
      expect(fires.length).toBeGreaterThan(3);
      for (let i = 1; i < fires.length; i++) {
        expect(fires[i]!.at - fires[i - 1]!.at).toBeGreaterThanOrEqual(SCARES.cooldown);
        expect(fires[i]!.visit).not.toBe(fires[i - 1]!.visit);
      }
    }
  });

  it('fires each trigger once per run', () => {
    let state = createScareState();
    const t = trigger('room:1:0');
    state = scareScheduler(state, { type: 'trip', trigger: t, blocked: false }, 0).state;
    state = scareScheduler(state, { type: 'enterRoom', roomId: 'room:1' }, 100).state;
    expect(scareScheduler(state, { type: 'trip', trigger: t, blocked: false }, 100).fire).toBeUndefined();
  });

  it('lets door scares come on their own shorter cooldown (spec 25), never while blocked', () => {
    expect(DOOR_SCARE_COOLDOWN).toBeLessThan(SCARES.cooldown);
    let state = scareScheduler(createScareState(), { type: 'trip', trigger: trigger('a'), blocked: false }, 0).state;
    // A room scare just now doesn't hold a door scare back past its own cooldown...
    expect(scareScheduler(state, { type: 'door', trigger: trigger('d1'), blocked: false }, DOOR_SCARE_COOLDOWN).fire?.id).toBe('d1');
    state = scareScheduler(state, { type: 'door', trigger: trigger('d1'), blocked: false }, DOOR_SCARE_COOLDOWN).state;
    // ...but two door scares are at least that far apart, and none while blocked.
    expect(scareScheduler(state, { type: 'door', trigger: trigger('d2'), blocked: false }, DOOR_SCARE_COOLDOWN * 1.5).fire).toBeUndefined();
    expect(scareScheduler(state, { type: 'door', trigger: trigger('d2'), blocked: true }, DOOR_SCARE_COOLDOWN * 2.5).fire).toBeUndefined();
    expect(scareScheduler(state, { type: 'door', trigger: trigger('d2'), blocked: false }, DOOR_SCARE_COOLDOWN * 2.5).fire?.id).toBe('d2');
  });

  it('lets a story script force one, even during the cooldown, the same visit, or while blocked', () => {
    let state = scareScheduler(createScareState(), { type: 'trip', trigger: trigger('a'), blocked: false }, 0).state;
    expect(scareScheduler(state, { type: 'trip', trigger: trigger('b'), blocked: false }, 5).fire).toBeUndefined();
    const forced = scareScheduler(state, { type: 'force', trigger: trigger('b') }, 5);
    expect(forced.fire?.id).toBe('b');
    state = forced.state;
    expect(state.lastAt).toBe(5);
  });
});

describe('placement', () => {
  it('is the same for a seed and room, and puts each creature at its anchor', () => {
    const house = newHouse(42);
    house.update(house.startCell);
    const rooms = house.loadedChunks().flatMap((c) => c.rooms);
    let placed = 0;
    for (const room of rooms) {
      const triggers = placeTriggers(room, 42);
      expect(placeTriggers(room, 42)).toEqual(triggers);
      for (const t of triggers) {
        placed++;
        const anchor = room.anchors[Number(t.id.split(':').at(-1))]!;
        expect({ chandelier: 'bat', fireplace: 'bat', floorboards: 'rat', darkCorner: 'cat' }[anchor.kind as string]).toBe(t.kind);
        if (t.kind === 'bat' && anchor.kind === 'chandelier') expect(t.y).toBeGreaterThan(1.5);
        if (t.kind !== 'bat') expect(t.y).toBeLessThan(0.5);
      }
    }
    expect(placed).toBeGreaterThan(10);
    const other = newHouse(43);
    other.update(other.startCell);
    const elsewhere = other.loadedChunks().flatMap((c) => c.rooms).flatMap((r) => placeTriggers(r, 43));
    expect(elsewhere).not.toEqual(rooms.flatMap((r) => placeTriggers(r, 42)));
  });
});
