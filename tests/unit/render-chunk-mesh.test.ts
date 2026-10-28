import { describe, expect, it } from 'vitest';
import { BufferGeometry, InstancedMesh, Mesh } from 'three';
import { generateCase } from '../../src/case/generate';
import { buildChunkMesh, disposeChunkMesh, setDoorOpen } from '../../src/render/chunk-mesh';
import { createTextureCache } from '../../src/render/atlas';
import { createHouse } from '../../src/world/house';

function setup(seed: number) {
  const caseFile = generateCase(seed);
  const house = createHouse(seed, caseFile);
  const textures = createTextureCache(seed, caseFile);
  return { house, textures };
}

function meshes(group: ReturnType<typeof buildChunkMesh>): Mesh[] {
  const found: Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof Mesh) found.push(o);
  });
  return found;
}

describe('buildChunkMesh', () => {
  it('draws a chunk in at most 4 meshes: static, portraits, doors and chandeliers', () => {
    const { house, textures } = setup(42);
    for (let cx = -2; cx <= 2; cx++) {
      for (let cy = 0; cy <= 2; cy++) {
        const chunk = house.chunkAt(cx, cy);
        const group = buildChunkMesh(chunk, textures);
        const all = meshes(group);
        expect(all.length).toBeLessThanOrEqual(4);
        const staticMesh = all.find((m) => m.name === 'static');
        expect(staticMesh?.geometry.getAttribute('position').count).toBeGreaterThan(1000);
        const doors = all.find((m) => m.name === 'doors') as InstancedMesh | undefined;
        expect(doors?.count ?? 0).toBe(chunk.doors.length);
        disposeChunkMesh(group);
      }
    }
  });

  it('gives every owned door an instance that can swing open', () => {
    const { house, textures } = setup(42);
    const chunk = house.chunkAt(-1, 1);
    const group = buildChunkMesh(chunk, textures);
    const doors = group.getObjectByName('doors') as InstancedMesh;
    const door = chunk.doors[0]!;
    const before = doors.instanceMatrix.array.slice();
    setDoorOpen(group, door.id, 1);
    expect(doors.instanceMatrix.array).not.toEqual(before);
    setDoorOpen(group, door.id, 0);
    expect(Array.from(doors.instanceMatrix.array)).toEqual(Array.from(before));
  });

  it('hangs portraits in the portrait hall and the key rooms', () => {
    const { house, textures } = setup(42);
    const wing = buildChunkMesh(house.chunkAt(0, 0), textures);
    expect(wing.getObjectByName('portraits')).toBeDefined();
    const key = house.keyRooms()[0]!;
    const keyRoom = house.getRoom(key.roomId!)!;
    const [cx, cy] = keyRoom.chunkId.split(',').map(Number) as [number, number];
    expect(buildChunkMesh(house.chunkAt(cx, cy), textures).getObjectByName('portraits')).toBeDefined();
  });

  it('disposes the chunk geometry but not the shared textures, materials or instanced shapes', () => {
    const { house, textures } = setup(42);
    const group = buildChunkMesh(house.chunkAt(1, 1), textures);
    const disposed = new Set<BufferGeometry>();
    const shared = new Set<BufferGeometry>();
    for (const mesh of meshes(group)) {
      mesh.geometry.addEventListener('dispose', () => disposed.add(mesh.geometry));
      if (mesh instanceof InstancedMesh) shared.add(mesh.geometry);
    }
    let materialDisposed = false;
    textures.material.addEventListener('dispose', () => (materialDisposed = true));
    disposeChunkMesh(group);
    const own = meshes(group).filter((m) => !(m instanceof InstancedMesh));
    for (const mesh of own) expect(disposed.has(mesh.geometry)).toBe(true);
    for (const geometry of shared) expect(disposed.has(geometry)).toBe(false);
    expect(materialDisposed).toBe(false);
  });
});
