import type { Rng } from '../core/rng';
import type { SizeClass } from '../world/types';

/** Reverb time (to -60 dB) for each room size. */
export const IMPULSE_SECONDS: Record<SizeClass, number> = { small: 0.6, medium: 1.3, large: 2.6 };

/**
 * A procedural room impulse response: a few early reflections, then decorrelated noise that
 * decays exponentially and darkens as it goes. Pure arrays, so it can be tested in Node.
 */
export function generateImpulse(size: SizeClass, sampleRate: number, rng: Rng): { left: Float32Array; right: Float32Array } {
  const rt60 = IMPULSE_SECONDS[size];
  const length = Math.floor(sampleRate * rt60 * 1.1);
  const channels = [new Float32Array(length), new Float32Array(length)] as const;
  const preDelay = Math.floor(sampleRate * (size === 'small' ? 0.004 : size === 'medium' ? 0.012 : 0.025));

  channels.forEach((data, c) => {
    const noise = rng.fork(`channel:${c}`);
    let smooth = 0;
    for (let i = preDelay; i < length; i++) {
      const t = (i - preDelay) / sampleRate;
      const envelope = Math.exp((-6.91 * t) / rt60);
      // A one-pole low-pass that closes over time: high frequencies die first.
      const damping = Math.min(0.92, 0.15 + (t / rt60) * 0.8);
      smooth = smooth * damping + (noise.float() * 2 - 1) * (1 - damping);
      data[i] = smooth * envelope * 1.6;
    }
    // Early reflections off the walls, a few clear taps before the wash.
    for (let r = 0; r < 6; r++) {
      const at = preDelay + Math.floor(sampleRate * (0.003 + noise.float() * 0.03 * (rt60 / 1.3)));
      if (at < length) data[at] = (data[at] ?? 0) + (noise.chance(0.5) ? 1 : -1) * (0.7 - r * 0.08);
    }
    for (let i = 0; i < length; i++) data[i] = Math.max(-1, Math.min(1, data[i]!));
  });
  return { left: channels[0], right: channels[1] };
}
