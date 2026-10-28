import type { Group, Object3D } from 'three';
import type { ChunkDiff, ChunkId } from '../world/types';
import type { TextureCache } from './atlas';
import { buildChunkMesh, disposeChunkMesh } from './chunk-mesh';

/** Keeps the scene in step with the house: builds chunks as they load and frees them as they unload. */
export class WorldView {
  private readonly chunks = new Map<ChunkId, Group>();

  constructor(
    private readonly parent: Object3D,
    private readonly textures: TextureCache,
  ) {}

  apply(diff: ChunkDiff): void {
    for (const id of diff.unloaded) {
      const group = this.chunks.get(id);
      if (!group) continue;
      disposeChunkMesh(group);
      this.chunks.delete(id);
    }
    for (const chunk of diff.loaded) {
      const old = this.chunks.get(chunk.id);
      if (old) disposeChunkMesh(old);
      const group = buildChunkMesh(chunk, this.textures);
      this.chunks.set(chunk.id, group);
      this.parent.add(group);
    }
  }

  chunk(id: ChunkId): Group | undefined {
    return this.chunks.get(id);
  }

  get size(): number {
    return this.chunks.size;
  }
}
