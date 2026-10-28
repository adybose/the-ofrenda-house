import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/core/events';

interface TestEvents {
  ping: { n: number };
  pong: { text: string };
}

describe('createEventBus', () => {
  it('delivers emitted payloads to listeners of that event only', () => {
    const bus = createEventBus<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.on('ping', ping);
    bus.on('pong', pong);
    bus.emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledWith({ n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('calls every listener for an event', () => {
    const bus = createEventBus<TestEvents>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.emit('ping', { n: 2 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('stops calling a listener after off', () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    bus.on('ping', listener);
    bus.off('ping', listener);
    bus.emit('ping', { n: 3 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops calling a listener after the unsubscribe returned by on', () => {
    const bus = createEventBus<TestEvents>();
    const listener = vi.fn();
    const unsubscribe = bus.on('ping', listener);
    unsubscribe();
    bus.emit('ping', { n: 4 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('lets a listener remove itself while an event is being emitted', () => {
    const bus = createEventBus<TestEvents>();
    const second = vi.fn();
    const first = vi.fn(() => bus.off('ping', first));
    bus.on('ping', first);
    bus.on('ping', second);
    bus.emit('ping', { n: 5 });
    bus.emit('ping', { n: 6 });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('rejects a wrong payload at compile time', () => {
    const bus = createEventBus<TestEvents>();
    // @ts-expect-error: ping carries { n: number }, not { text: string }
    bus.emit('ping', { text: 'nope' });
    // @ts-expect-error: unknown event name
    bus.emit('missing', {});
    expect(true).toBe(true);
  });
});
