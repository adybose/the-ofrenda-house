import { describe, expect, it, vi } from 'vitest';
import { INTERACT_ANGLE, INTERACT_RANGE, Interactions, pickInteractable } from '../../src/player/interaction';

const viewer = { x: 0, z: 0, yaw: 0 }; // facing north (-z)
const at = (id: string, x: number, z: number) => ({ id, x, z });

describe('pickInteractable', () => {
  it('picks the nearest item within 1.5 m and 45° of the view', () => {
    expect(INTERACT_RANGE).toBe(1.5);
    expect(INTERACT_ANGLE).toBeCloseTo(Math.PI / 4, 5);
    expect(pickInteractable(viewer, [at('far', 0, -1.4), at('near', 0.2, -0.8)])?.id).toBe('near');
  });

  it('ignores items out of range, behind or off to the side', () => {
    expect(pickInteractable(viewer, [at('too far', 0, -1.6)])).toBeUndefined();
    expect(pickInteractable(viewer, [at('behind', 0, 1)])).toBeUndefined();
    expect(pickInteractable(viewer, [at('side', -1, -0.5)])).toBeUndefined();
    expect(pickInteractable(viewer, [at('edge of cone', -0.6, -0.7)])?.id).toBe('edge of cone');
  });

  it('respects the way the viewer faces', () => {
    const west = { x: 0, z: 0, yaw: Math.PI / 2 };
    expect(pickInteractable(west, [at('west', -1, 0), at('north', 0, -1)])?.id).toBe('west');
  });
});

describe('Interactions', () => {
  it('registers, picks and unregisters interactables, and calls onInteract', () => {
    const interactions = new Interactions();
    const onInteract = vi.fn();
    const off = interactions.register({ id: 'door', x: 0, z: -1, kind: 'door', label: 'Open door', onInteract });
    expect(interactions.target(viewer)?.id).toBe('door');
    interactions.interact(viewer);
    expect(onInteract).toHaveBeenCalledOnce();
    off();
    expect(interactions.target(viewer)).toBeUndefined();
    expect(interactions.interact(viewer)).toBe(false);
  });
});
