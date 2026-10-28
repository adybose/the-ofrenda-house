import type { Rng } from '../core/rng';

/** An RGBA image in a plain byte array, row 0 at the top. Pure, so it can be tested in Node. */
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RGB = readonly [number, number, number];

export function createImage(width: number, height: number, colour: RGB = [0, 0, 0]): PixelImage {
  const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  fill(image, colour);
  return image;
}

const wrap = (v: number, size: number) => ((v % size) + size) % size;

/** Sets a pixel; coordinates wrap, so patterns tile. */
export function setPixel(image: PixelImage, x: number, y: number, [r, g, b]: RGB): void {
  const i = (wrap(Math.floor(y), image.height) * image.width + wrap(Math.floor(x), image.width)) * 4;
  image.data[i] = r;
  image.data[i + 1] = g;
  image.data[i + 2] = b;
  image.data[i + 3] = 255;
}

export function getPixel(image: PixelImage, x: number, y: number): RGB {
  const i = (wrap(Math.floor(y), image.height) * image.width + wrap(Math.floor(x), image.width)) * 4;
  return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!];
}

export function fill(image: PixelImage, colour: RGB): void {
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) setPixel(image, x, y, colour);
}

export function rect(image: PixelImage, x: number, y: number, w: number, h: number, colour: RGB): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(image, x + i, y + j, colour);
}

export function ellipse(image: PixelImage, cx: number, cy: number, rx: number, ry: number, colour: RGB): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && x >= 0 && y >= 0 && x < image.width && y < image.height) setPixel(image, x, y, colour);
    }
  }
}

export function line(image: PixelImage, x0: number, y0: number, x1: number, y1: number, colour: RGB): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) setPixel(image, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, colour);
}

export const shade = ([r, g, b]: RGB, f: number): RGB => [r * f, g * f, b * f];

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Tileable value noise in 0..1 over a cells × cells lattice. */
export function valueNoise(rng: Rng, cells: number): (u: number, v: number) => number {
  const lattice = Array.from({ length: cells * cells }, () => rng.float());
  const at = (i: number, j: number) => lattice[wrap(j, cells) * cells + wrap(i, cells)]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = wrap(u, 1) * cells;
    const y = wrap(v, 1) * cells;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

/** Multiplies each pixel by a little random brightness, for the grain of paint, wood and plaster. */
export function jitter(image: PixelImage, rng: Rng, amount: number): void {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      setPixel(image, x, y, shade(getPixel(image, x, y), 1 + (rng.float() - 0.5) * 2 * amount));
    }
  }
}

/** Darkens the image with blotchy damp stains and age, stronger towards the bottom. */
export function age(image: PixelImage, rng: Rng, strength: number): void {
  const noise = valueNoise(rng, 4);
  const fine = valueNoise(rng, 16);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const u = x / image.width;
      const v = y / image.height;
      const stain = Math.max(0, noise(u, v) * 0.7 + fine(u, v) * 0.3 - 0.55) * 2.2;
      const f = 1 - strength * (stain + v * 0.25);
      setPixel(image, x, y, mix(shade(getPixel(image, x, y), f), [60, 52, 30], stain * strength * 0.4));
    }
  }
}

/** A few thin dark cracks wandering down from random points. */
export function cracks(image: PixelImage, rng: Rng, count: number): void {
  for (let c = 0; c < count; c++) {
    let x = rng.int(0, image.width - 1);
    let y = rng.int(0, image.height - 1);
    const length = rng.int(10, 40);
    for (let s = 0; s < length; s++) {
      setPixel(image, x, y, shade(getPixel(image, x, y), 0.45));
      x += rng.int(-1, 1);
      y += rng.chance(0.8) ? 1 : 0;
    }
  }
}
