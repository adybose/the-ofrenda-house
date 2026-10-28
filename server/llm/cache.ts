/** A small least-recently-used cache: prefetched lines wait here until the player arrives. */
export class LruCache<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly capacity: number) {}

  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}
