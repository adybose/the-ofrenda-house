import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { UvRect } from './atlas';

export type Vec3 = readonly [number, number, number];
/** Vertex colour, 0..1 per channel; it multiplies the texture. */
export type Tint = readonly [number, number, number];

const WHITE: Tint = [1, 1, 1];

/** Collects triangles with atlas UVs and vertex colours, then makes one BufferGeometry. */
export class GeometryBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colours: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  private vertex(p: Vec3, n: Vec3, u: number, v: number, c: Tint): void {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(u, v);
    this.colours.push(c[0], c[1], c[2]);
  }

  /**
   * A quad from p0 (bottom left) to p3 (top left), counter-clockwise seen from the front.
   * `uv` gives [u, v] for each corner; `tints` one colour per corner or one for all.
   */
  quad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, uv: readonly (readonly [number, number])[], tints: Tint | readonly Tint[] = WHITE): void {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    const normal: Vec3 = [n[0]! / len, n[1]! / len, n[2]! / len];
    const tint = (i: number): Tint => (Array.isArray(tints[0]) ? (tints as readonly Tint[])[i]! : (tints as Tint));
    const corners = [p0, p1, p2, p3];
    for (const i of [0, 1, 2, 0, 2, 3]) this.vertex(corners[i]!, normal, uv[i]![0], uv[i]![1], tint(i));
  }

  /** A quad showing a whole atlas tile. */
  tile(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, rect: UvRect, tints?: Tint | readonly Tint[]): void {
    this.quad(p0, p1, p2, p3, [
      [rect.u0, rect.vBottom],
      [rect.u1, rect.vBottom],
      [rect.u1, rect.vTop],
      [rect.u0, rect.vTop],
    ], tints);
  }

  /** An axis-aligned box from min to max, every face but the bottom showing the tile. */
  box(min: Vec3, max: Vec3, rect: UvRect, tint: Tint = WHITE): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const top = shadeTint(tint, 1.1);
    this.tile([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], rect, tint); // +z
    this.tile([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], rect, tint); // -z
    this.tile([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], rect, tint); // +x
    this.tile([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], rect, tint); // -x
    this.tile([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], rect, top); // +y
  }

  /** An upright n-sided prism (candles, posts, the chandelier stem), with a top cap. */
  prism(cx: number, cz: number, radius: number, y0: number, y1: number, sides: number, rect: UvRect, tint: Tint = WHITE): void {
    const point = (i: number, y: number): Vec3 => {
      const a = (i / sides) * Math.PI * 2;
      return [cx + Math.cos(a) * radius, y, cz - Math.sin(a) * radius];
    };
    for (let i = 0; i < sides; i++) {
      this.tile(point(i, y0), point(i + 1, y0), point(i + 1, y1), point(i, y1), rect, tint);
      const centre: Vec3 = [cx, y1, cz];
      const mid = (rect.u0 + rect.u1) / 2;
      this.quad(centre, point(i, y1), point(i + 1, y1), centre, [
        [mid, rect.vTop],
        [rect.u0, rect.vBottom],
        [rect.u1, rect.vBottom],
        [mid, rect.vTop],
      ], tint);
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colours, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

export const shadeTint = ([r, g, b]: Tint, f: number): Tint => [r * f, g * f, b * f];

/**
 * A local frame on the floor: `right` and `out` are unit vectors in (x, z).
 * Wall props use the wall's face as origin, `out` pointing into the room.
 */
export interface Frame {
  x: number;
  z: number;
  right: readonly [number, number];
  out: readonly [number, number];
}

export function at(frame: Frame, along: number, y: number, out: number): Vec3 {
  return [frame.x + frame.right[0] * along + frame.out[0] * out, y, frame.z + frame.right[1] * along + frame.out[1] * out];
}

/** A box in a frame's local coordinates (along, y, out), turned into a world axis-aligned box. */
export function frameBox(
  builder: GeometryBuilder,
  frame: Frame,
  along: readonly [number, number],
  y: readonly [number, number],
  out: readonly [number, number],
  rect: UvRect,
  tint?: Tint,
): void {
  const a = at(frame, along[0], y[0], out[0]);
  const b = at(frame, along[1], y[1], out[1]);
  builder.box(
    [Math.min(a[0], b[0]), y[0], Math.min(a[2], b[2])],
    [Math.max(a[0], b[0]), y[1], Math.max(a[2], b[2])],
    rect,
    tint,
  );
}
