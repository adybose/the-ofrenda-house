import { DataTexture, MeshLambertMaterial, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import type { CaseFile, CharacterId } from '../case/types';
import { createRng, STREAMS } from '../core/rng';
import type { PixelImage } from './pixels';
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, generatePortrait } from './portraits';
import { TEXTURE_KINDS, generateTexture, textureHeight, type TextureKind } from './textures';

/** Where a tile sits in an atlas. v runs top to bottom, matching the pixel rows. */
export interface UvRect {
  u0: number;
  u1: number;
  vTop: number;
  vBottom: number;
}

export type PortraitKey = CharacterId | 'smile' | 'empty' | 'elena' | 'player';

/** The shared textures and materials for a run. Built once; chunks never dispose them. */
export interface TextureCache {
  /** The run seed, for anything placed per room (furniture, wallpaper choice). */
  seed: number;
  atlas: DataTexture;
  material: MeshLambertMaterial;
  portraitAtlas: DataTexture;
  portraitMaterial: MeshLambertMaterial;
  uv(kind: TextureKind): UvRect;
  portraitUv(key: PortraitKey): UvRect;
  dispose(): void;
}

const CELL_W = 64;
const CELL_H = 128;
const COLUMNS = 8;

function blit(target: Uint8ClampedArray, targetWidth: number, image: PixelImage, left: number, top: number): void {
  for (let y = 0; y < image.height; y++) {
    const from = y * image.width * 4;
    target.set(image.data.subarray(from, from + image.width * 4), ((top + y) * targetWidth + left) * 4);
  }
}

function dataTexture(data: Uint8ClampedArray, width: number, height: number): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  // Nearest filtering and no mipmaps: crisp, shimmering PS1-era texels.
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

export function createTextureCache(seed: number, caseFile: CaseFile): TextureCache {
  const render = createRng(seed).fork(STREAMS.render);

  // Surface atlas: 8 columns of 64 × 128 cells, row 0 at the top (v = 0).
  const rows = Math.ceil(TEXTURE_KINDS.length / COLUMNS);
  const width = COLUMNS * CELL_W;
  const height = rows * CELL_H;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const rects = new Map<TextureKind, UvRect>();
  TEXTURE_KINDS.forEach((kind, i) => {
    const left = (i % COLUMNS) * CELL_W;
    const top = Math.floor(i / COLUMNS) * CELL_H;
    blit(pixels, width, generateTexture(kind, render.fork(kind)), left, top);
    // Half-texel inset so nearest sampling never reads the neighbouring tile.
    rects.set(kind, {
      u0: (left + 0.5) / width,
      u1: (left + CELL_W - 0.5) / width,
      vTop: (top + 0.5) / height,
      vBottom: (top + textureHeight(kind) - 0.5) / height,
    });
  });
  const atlas = dataTexture(pixels, width, height);

  // Portrait atlas: the household on row 0, the variants on row 1.
  const pWidth = 8 * PORTRAIT_WIDTH;
  const pHeight = 2 * PORTRAIT_HEIGHT;
  const portraitPixels = new Uint8ClampedArray(pWidth * pHeight * 4);
  const portraitRects = new Map<PortraitKey, UvRect>();
  const placePortrait = (key: PortraitKey, image: PixelImage, column: number, row: number) => {
    const left = column * PORTRAIT_WIDTH;
    const top = row * PORTRAIT_HEIGHT;
    blit(portraitPixels, pWidth, image, left, top);
    portraitRects.set(key, {
      u0: (left + 0.5) / pWidth,
      u1: (left + PORTRAIT_WIDTH - 0.5) / pWidth,
      vTop: (top + 0.5) / pHeight,
      vBottom: (top + PORTRAIT_HEIGHT - 0.5) / pHeight,
    });
  };
  const portraitRng = (id: string) => render.fork(`portrait:${id}`);
  caseFile.characters.forEach((c, i) => placePortrait(c.id, generatePortrait(c, 'normal', portraitRng(c.id)), i, 0));
  const killer = caseFile.characters.find((c) => c.id === caseFile.killerId)!;
  const patriarch = caseFile.characters.find((c) => c.role === 'patriarch')!;
  placePortrait('smile', generatePortrait(killer, 'smile', portraitRng(killer.id)), 0, 1);
  placePortrait('empty', generatePortrait(patriarch, 'empty', portraitRng(patriarch.id)), 1, 1);
  placePortrait('elena', generatePortrait(patriarch, 'elena', portraitRng('elena')), 2, 1);
  placePortrait('player', generatePortrait(patriarch, 'player', portraitRng('player')), 3, 1);
  const portraitAtlas = dataTexture(portraitPixels, pWidth, pHeight);

  const material = new MeshLambertMaterial({ map: atlas, vertexColors: true });
  const portraitMaterial = new MeshLambertMaterial({ map: portraitAtlas, vertexColors: true });

  return {
    seed,
    atlas,
    material,
    portraitAtlas,
    portraitMaterial,
    uv: (kind) => rects.get(kind)!,
    portraitUv: (key) => portraitRects.get(key) ?? portraitRects.get('empty')!,
    dispose() {
      atlas.dispose();
      portraitAtlas.dispose();
      material.dispose();
      portraitMaterial.dispose();
    },
  };
}
