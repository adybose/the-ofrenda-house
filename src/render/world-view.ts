import type { Group, Object3D } from 'three';
import type { Chunk, ChunkDiff, ChunkId } from '../world/types';
import type { TextureCache } from './atlas';
import { buildChunkMesh, disposeChunkMesh, type ChunkMeshData } from './chunk-mesh';

/** Keeps the scene in step with the house: builds chunks as they load and frees them as they unload. */
export class WorldView {
  private readonly chunks = new Map<ChunkId, Group>();
  /** Chunks waiting to be rebuilt in place, one per frame (see `apply`). */
  private readonly pending = new Map<ChunkId, Chunk>();

  constructor(
    private readonly parent: Object3D,
    private readonly textures: TextureCache,
  ) {}

  /**
   * Applies a diff. With `spread`, chunks that are being replaced (a reshuffle unloads and reloads
   * them) keep their old meshes and are rebuilt one per `update`, so a strike doesn't stall a frame.
   * Reshuffled chunks are never in view, so the short delay can't be seen.
   */
  apply(diff: ChunkDiff, options: { spread?: boolean } = {}): void {
    const reloaded = new Set(diff.loaded.map((c) => c.id));
    for (const id of diff.unloaded) {
      if (options.spread && reloaded.has(id) && this.chunks.has(id)) continue;
      const group = this.chunks.get(id);
      this.pending.delete(id);
      if (!group) continue;
      disposeChunkMesh(group);
      this.chunks.delete(id);
    }
    for (const chunk of diff.loaded) {
      if (options.spread && this.chunks.has(chunk.id)) this.pending.set(chunk.id, chunk);
      else this.build(chunk);
    }
  }

  /** Rebuilds at most one waiting chunk. Call once a frame. */
  update(): void {
    const next = this.pending.values().next();
    if (next.done) return;
    this.pending.delete(next.value.id);
    this.build(next.value);
  }

  private build(chunk: Chunk): void {
    const old = this.chunks.get(chunk.id);
    if (old) disposeChunkMesh(old);
    const group = buildChunkMesh(chunk, this.textures);
    this.chunks.set(chunk.id, group);
    this.parent.add(group);
  }

  chunk(id: ChunkId): Group | undefined {
    return this.chunks.get(id);
  }

  /** Every candle light point in the loaded chunks. */
  candles(): [number, number, number][] {
    return [...this.chunks.values()].flatMap((group) => (group.userData as ChunkMeshData).candles);
  }

  get size(): number {
    return this.chunks.size;
  }
}
