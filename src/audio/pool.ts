/** Caps how many one-shots play at once; when full, the oldest is stopped to make room. */
export class OneShotPool {
  private playing: { handle: { stop(): void }; endsAt: number }[] = [];

  constructor(private readonly cap: number) {}

  get size(): number {
    return this.playing.length;
  }

  add(handle: { stop(): void }, endsAt: number, now: number): void {
    this.playing = this.playing.filter((p) => p.endsAt > now);
    while (this.playing.length >= this.cap) this.playing.shift()!.handle.stop();
    this.playing.push({ handle, endsAt });
  }
}
