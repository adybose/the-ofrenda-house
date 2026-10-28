import { BufferGeometry, Mesh } from 'three';
import type { Furniture } from '../world/furniture';
import type { TextureCache } from './atlas';
import { GeometryBuilder, at, frameBox, type Frame, type Tint } from './builder';

// Props are drawn into a GeometryBuilder so a chunk can merge them into one mesh.
// The `props` factories at the bottom wrap the same code as standalone meshes for
// specs 12, 13 and 14 (falling chandeliers, the ofrenda, scattered petals).

const DARK: Tint = [0.7, 0.7, 0.7];

/** A fireplace against a wall: brick surround, sooty opening, wooden mantel. */
export function addFireplace(b: GeometryBuilder, t: TextureCache, f: Frame): void {
  frameBox(b, f, [-0.9, -0.55], [0, 1.2], [0, 0.35], t.uv('bricks'));
  frameBox(b, f, [0.55, 0.9], [0, 1.2], [0, 0.35], t.uv('bricks'));
  frameBox(b, f, [-0.55, 0.55], [0.85, 1.2], [0, 0.35], t.uv('bricks'));
  // The dark mouth, set back into the wall.
  b.tile(at(f, -0.55, 0, 0.05), at(f, 0.55, 0, 0.05), at(f, 0.55, 0.85, 0.05), at(f, -0.55, 0.85, 0.05), t.uv('soot'));
  frameBox(b, f, [-1.0, 1.0], [1.2, 1.3], [0, 0.45], t.uv('wood'));
  frameBox(b, f, [-0.6, 0.6], [0, 0.04], [0.35, 0.8], t.uv('stoneFloor'), DARK);
}

/** A tall gilt-framed mirror. */
export function addMirror(b: GeometryBuilder, t: TextureCache, f: Frame): void {
  frameBox(b, f, [-0.45, 0.45], [0.9, 2.3], [0, 0.04], t.uv('frame'));
  b.tile(at(f, -0.38, 0.97, 0.05), at(f, 0.38, 0.97, 0.05), at(f, 0.38, 2.23, 0.05), at(f, -0.38, 2.23, 0.05), t.uv('mirror'));
}

/** The grandfather clock that strikes midnight and six. */
export function addClock(b: GeometryBuilder, t: TextureCache, f: Frame): void {
  frameBox(b, f, [-0.3, 0.3], [0, 2.0], [0, 0.4], t.uv('wood'));
  frameBox(b, f, [-0.35, 0.35], [2.0, 2.3], [0, 0.45], t.uv('wood'), [1.2, 1.2, 1.2]);
  b.tile(at(f, -0.24, 1.5, 0.41), at(f, 0.24, 1.5, 0.41), at(f, 0.24, 1.98, 0.41), at(f, -0.24, 1.98, 0.41), t.uv('clockFace'));
  frameBox(b, f, [-0.03, 0.03], [0.6, 1.4], [0.4, 0.42], t.uv('brass'));
  frameBox(b, f, [-0.1, 0.1], [0.55, 0.7], [0.4, 0.43], t.uv('brass'));
}

/** A gilt frame around a portrait; the picture itself goes in the portrait mesh. */
export function addPortraitFrame(b: GeometryBuilder, t: TextureCache, f: Frame, y: number): void {
  frameBox(b, f, [-0.45, 0.45], [y - 0.6, y + 0.6], [0, 0.05], t.uv('frame'));
}

export function addPortraitPicture(b: GeometryBuilder, rect: ReturnType<TextureCache['portraitUv']>, f: Frame, y: number): void {
  b.tile(at(f, -0.36, y - 0.48, 0.06), at(f, 0.36, y - 0.48, 0.06), at(f, 0.36, y + 0.48, 0.06), at(f, -0.36, y + 0.48, 0.06), rect);
}

export function addCandle(b: GeometryBuilder, t: TextureCache, x: number, y: number, z: number, height = 0.18): void {
  b.prism(x, z, 0.03, y, y + height, 6, t.uv('wax'));
}

/** A small orange heap of cempasúchil petals on the floor. */
export function addMarigolds(b: GeometryBuilder, t: TextureCache, x: number, z: number, radius: number, y = 0.01): void {
  const r = radius;
  b.tile([x - r, y, z + r], [x + r, y, z + r], [x + r, y, z - r], [x - r, y, z - r], t.uv('marigold'));
}

/** The ofrenda: a cloth-covered table with two tiers, candles and marigolds. Centred on the frame. */
export function addOfrenda(b: GeometryBuilder, t: TextureCache, f: Frame): void {
  frameBox(b, f, [-1.2, 1.2], [0, 0.8], [-0.6, 0.6], t.uv('cloth'));
  frameBox(b, f, [-0.9, 0.9], [0.8, 1.05], [-0.6, 0.1], t.uv('cloth'));
  frameBox(b, f, [-0.6, 0.6], [1.05, 1.3], [-0.6, -0.2], t.uv('cloth'));
  for (const along of [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0]) {
    const p = at(f, along, 0, 0.4);
    addCandle(b, t, p[0], 0.8, p[2]);
  }
  for (const along of [-1.1, 0, 1.1]) {
    const p = at(f, along, 0, 0.9);
    addMarigolds(b, t, p[0], p[2], 0.3);
  }
}

/** A brass chandelier, centred on the origin and hanging down from y = 0. */
export function addChandelier(b: GeometryBuilder, t: TextureCache): void {
  const brass = t.uv('brass');
  b.prism(0, 0, 0.03, -0.6, 0, 6, brass);
  b.prism(0, 0, 0.12, -0.75, -0.6, 8, brass);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.45;
    const z = Math.sin(a) * 0.45;
    b.box([Math.min(0, x) - 0.02, -0.7, Math.min(0, z) - 0.02], [Math.max(0, x) + 0.02, -0.66, Math.max(0, z) + 0.02], brass);
    b.prism(x, z, 0.05, -0.72, -0.66, 6, brass);
    addCandle(b, t, x, -0.66, z, 0.12);
  }
}

/** A door panel with its hinge at the origin, opening along +x, 5 cm thick. */
export function addDoorPanel(b: GeometryBuilder, t: TextureCache, width: number, height: number): void {
  b.box([0.02, 0, -0.025], [width - 0.02, height - 0.02, 0.025], t.uv('door'));
}

/** Draws one piece of furniture from its footprint. */
export function addFurniture(b: GeometryBuilder, t: TextureCache, item: Furniture): void {
  const [wx, wz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[item.wall] as [number, number];
  // Frame at the footprint centre, `out` pointing away from the wall into the room.
  const f: Frame = { x: item.x, z: item.z, right: wz !== 0 ? [1, 0] : [0, 1], out: [-wx, -wz] };
  const hw = item.w / 2;
  const hd = item.d / 2;
  const wood = t.uv('wood');
  const legs = (top: number, inset = 0.05) => {
    for (const a of [-hw + inset, hw - inset - 0.05]) for (const o of [-hd + inset, hd - inset - 0.05]) frameBox(b, f, [a, a + 0.05], [0, top], [o, o + 0.05], wood);
  };
  const back = -hd; // against the wall
  switch (item.kind) {
    case 'sofa':
    case 'armchair':
      frameBox(b, f, [-hw, hw], [0.15, 0.45], [-hd, hd], t.uv('velvet'));
      frameBox(b, f, [-hw, hw], [0.45, item.h], [back, back + 0.2], t.uv('velvet'), [0.85, 0.85, 0.85]);
      frameBox(b, f, [-hw, -hw + 0.15], [0.45, 0.7], [-hd, hd], t.uv('velvet'));
      frameBox(b, f, [hw - 0.15, hw], [0.45, 0.7], [-hd, hd], t.uv('velvet'));
      legs(0.15);
      return;
    case 'sideTable':
    case 'nightstand':
    case 'table':
    case 'desk':
    case 'sewingTable':
      frameBox(b, f, [-hw, hw], [item.h - 0.05, item.h], [-hd, hd], wood, [1.1, 1.1, 1.1]);
      legs(item.h - 0.05);
      if (item.kind === 'desk') frameBox(b, f, [hw - 0.5, hw - 0.05], [0.3, item.h - 0.05], [-hd + 0.05, hd - 0.05], wood);
      if (item.kind === 'nightstand') addCandle(b, t, ...([at(f, 0, 0, 0)[0], item.h, at(f, 0, 0, 0)[2]] as const));
      if (item.kind === 'sewingTable') frameBox(b, f, [-0.2, 0.2], [item.h, item.h + 0.25], [-0.1, 0.1], t.uv('iron'));
      return;
    case 'bed':
      frameBox(b, f, [-hw, hw], [0, 0.35], [-hd, hd], wood);
      frameBox(b, f, [-hw + 0.05, hw - 0.05], [0.35, 0.55], [-hd + 0.05, hd - 0.05], t.uv('cloth'));
      frameBox(b, f, [-hw, -hw + 0.08], [0, 1.1], [-hd, hd], wood);
      frameBox(b, f, [-hw + 0.1, -hw + 0.45], [0.55, 0.68], [-hd + 0.15, hd - 0.15], t.uv('cloth'), [1.1, 1.1, 1.1]);
      return;
    case 'wardrobe':
    case 'toyChest':
    case 'stove':
    case 'washstand':
    case 'bathtub':
    case 'altar': {
      const skin = { wardrobe: wood, toyChest: wood, stove: t.uv('iron'), washstand: t.uv('porcelain'), bathtub: t.uv('porcelain'), altar: t.uv('cloth') }[item.kind];
      frameBox(b, f, [-hw, hw], [0, item.h], [-hd, hd], skin);
      if (item.kind === 'stove') frameBox(b, f, [-0.08, 0.08], [item.h, 2.6], [back, back + 0.16], t.uv('iron'));
      if (item.kind === 'altar') for (const a of [-0.4, 0.4]) addCandle(b, t, at(f, a, 0, 0)[0], item.h, at(f, a, 0, 0)[2], 0.3);
      return;
    }
    case 'bookshelf':
    case 'shelf':
      frameBox(b, f, [-hw, hw], [0, item.h], [-hd, hd - 0.02], wood);
      b.tile(at(f, -hw + 0.05, 0.1, hd), at(f, hw - 0.05, 0.1, hd), at(f, hw - 0.05, item.h - 0.1, hd), at(f, -hw + 0.05, item.h - 0.1, hd), t.uv('books'));
      return;
    case 'crib':
      frameBox(b, f, [-hw, hw], [0.3, 0.4], [-hd, hd], wood);
      for (let a = -hw; a <= hw; a += 0.15) {
        frameBox(b, f, [a, a + 0.03], [0, item.h], [-hd, -hd + 0.03], wood);
        frameBox(b, f, [a, a + 0.03], [0, item.h], [hd - 0.03, hd], wood);
      }
      return;
    case 'chair':
    case 'rockingChair':
      frameBox(b, f, [-hw, hw], [0.42, 0.47], [-hd, hd], wood);
      frameBox(b, f, [-hw, hw], [0.47, item.h], [back, back + 0.05], wood);
      legs(0.42);
      if (item.kind === 'rockingChair') frameBox(b, f, [-hw, hw], [0, 0.04], [-hd - 0.1, hd + 0.1], wood);
      return;
    case 'easel':
      frameBox(b, f, [-0.3, -0.25], [0, item.h], [0, 0.05], wood);
      frameBox(b, f, [0.25, 0.3], [0, item.h], [0, 0.05], wood);
      frameBox(b, f, [-0.03, 0.03], [0, item.h], [-hd, -hd + 0.05], wood);
      b.tile(at(f, -0.35, 0.8, 0.06), at(f, 0.35, 0.8, 0.06), at(f, 0.35, 1.6, 0.06), at(f, -0.35, 1.6, 0.06), t.uv('canvas'));
      return;
    case 'planter':
      frameBox(b, f, [-hw, hw], [0, 0.6], [-hd, hd], wood);
      frameBox(b, f, [-hw + 0.05, hw - 0.05], [0.6, item.h], [-hd + 0.05, hd - 0.05], t.uv('whiteFlower'));
      return;
    case 'stairs': {
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        frameBox(b, f, [-hw + (s * item.w) / steps, hw], [0, ((s + 1) * item.h) / steps], [-hd, hd], wood);
      }
      return;
    }
    case 'piano':
      frameBox(b, f, [-hw, hw], [0, item.h], [-hd, hd - 0.3], t.uv('iron'));
      frameBox(b, f, [-hw, hw], [0.6, 0.75], [hd - 0.3, hd], t.uv('iron'));
      b.tile(at(f, -hw, 0.751, hd), at(f, hw, 0.751, hd), at(f, hw, 0.751, hd - 0.3), at(f, -hw, 0.751, hd - 0.3), t.uv('pianoKeys'));
      return;
    case 'pew':
    case 'bench':
      frameBox(b, f, [-hw, hw], [0.4, 0.46], [-hd, hd], wood);
      if (item.kind === 'pew' || item.h > 0.6) frameBox(b, f, [-hw, hw], [0.46, item.h], [back, back + 0.06], wood);
      legs(0.4, 0.1);
      return;
  }
}

function standalone(t: TextureCache, draw: (b: GeometryBuilder) => void): Mesh {
  const b = new GeometryBuilder();
  draw(b);
  const geometry: BufferGeometry = b.build();
  return new Mesh(geometry, t.material);
}

const ORIGIN: Frame = { x: 0, z: 0, right: [1, 0], out: [0, 1] };

/** Standalone prop meshes, each facing +z with its base (or hook, for the chandelier) at the origin. */
export const props = {
  chandelier: (t: TextureCache) => standalone(t, (b) => addChandelier(b, t)),
  grandfatherClock: (t: TextureCache) => standalone(t, (b) => addClock(b, t, ORIGIN)),
  fireplace: (t: TextureCache) => standalone(t, (b) => addFireplace(b, t, ORIGIN)),
  mirror: (t: TextureCache) => standalone(t, (b) => addMirror(b, t, ORIGIN)),
  ofrendaTable: (t: TextureCache) => standalone(t, (b) => addOfrenda(b, t, ORIGIN)),
  candle: (t: TextureCache) => standalone(t, (b) => addCandle(b, t, 0, 0, 0)),
  marigoldPetals: (t: TextureCache, radius = 0.6) => standalone(t, (b) => addMarigolds(b, t, 0, 0, radius)),
};
