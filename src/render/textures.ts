import type { Rng } from '../core/rng';
import {
  age,
  createImage,
  cracks,
  ellipse,
  getPixel,
  jitter,
  line,
  mix,
  rect,
  setPixel,
  shade,
  valueNoise,
  type PixelImage,
  type RGB,
} from './pixels';

export const TEXTURE_KINDS = [
  // Walls, 64 × 128 (one cell wide, floor to ceiling).
  'wallDamask',
  'wallStripes',
  'wallFloral',
  'wallPanelling',
  'wallTiles',
  'plaster',
  'stone',
  'door',
  'window',
  // Floors and ceilings, 64 × 64 (one cell).
  'floorboards',
  'parquet',
  'floorTiles',
  'carpet',
  'stoneFloor',
  'ceiling',
  // Furniture and props, 64 × 64.
  'wood',
  'velvet',
  'porcelain',
  'iron',
  'brass',
  'books',
  'mirror',
  'canvas',
  'frame',
  'bricks',
  'soot',
  'clockFace',
  'cloth',
  'marigold',
  'wax',
  'leaves',
  'whiteFlower',
  'pianoKeys',
  // The exterior (spec 16), 64 × 64.
  'slate',
  'mud',
  'gravel',
  'bark',
] as const;

export type TextureKind = (typeof TEXTURE_KINDS)[number];

const TALL: ReadonlySet<TextureKind> = new Set([
  'wallDamask',
  'wallStripes',
  'wallFloral',
  'wallPanelling',
  'wallTiles',
  'plaster',
  'stone',
  'door',
  'window',
]);

export const textureHeight = (kind: TextureKind): number => (TALL.has(kind) ? 128 : 64);

const W = 64;

/** A muted 1930s wallpaper colour, picked per run. */
function wallpaperBase(rng: Rng): RGB {
  return rng.pick<RGB>([
    [92, 40, 38], // oxblood
    [48, 66, 52], // bottle green
    [86, 70, 44], // ochre
    [52, 50, 72], // dusk blue
    [80, 56, 62], // faded rose
  ]);
}

function damask(rng: Rng): PixelImage {
  const base = wallpaperBase(rng);
  const image = createImage(W, 128, base);
  const motif = shade(base, 1.35);
  // A repeating medallion: a diamond of ellipses, twice down the strip.
  for (const cy of [32, 96]) {
    ellipse(image, 32, cy, 10, 18, motif);
    ellipse(image, 32, cy, 5, 10, base);
    ellipse(image, 32, cy - 16, 4, 4, motif);
    ellipse(image, 32, cy + 16, 4, 4, motif);
    for (const cx of [0, 64]) ellipse(image, cx, cy - 32, 7, 12, motif);
  }
  jitter(image, rng, 0.06);
  age(image, rng, 0.5);
  cracks(image, rng, 2);
  return image;
}

function stripes(rng: Rng): PixelImage {
  const base = wallpaperBase(rng);
  const image = createImage(W, 128, base);
  const light = shade(base, 1.4);
  for (let x = 0; x < W; x++) {
    const band = x % 16;
    if (band < 5) rect(image, x, 0, 1, 128, light);
    else if (band === 7 || band === 9) rect(image, x, 0, 1, 128, shade(base, 0.75));
  }
  jitter(image, rng, 0.05);
  age(image, rng, 0.55);
  cracks(image, rng, 2);
  return image;
}

function floral(rng: Rng): PixelImage {
  const base = wallpaperBase(rng);
  const image = createImage(W, 128, base);
  const petal = mix(base, [200, 170, 140], 0.45);
  const leaf = mix(base, [60, 90, 50], 0.5);
  for (let i = 0; i < 6; i++) {
    const cx = (i % 2) * 32 + 16;
    const cy = Math.floor(i / 2) * 43 + 20;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ellipse(image, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 3, 3, petal);
    }
    ellipse(image, cx, cy, 2, 2, shade(petal, 0.7));
    line(image, cx, cy + 6, cx - 6, cy + 16, leaf);
  }
  jitter(image, rng, 0.06);
  age(image, rng, 0.5);
  cracks(image, rng, 3);
  return image;
}

function panelling(rng: Rng): PixelImage {
  // Dark wood wainscot up to the dado rail, faded paper above.
  const image = createImage(W, 128, wallpaperBase(rng));
  const wood: RGB = [70, 44, 26];
  rect(image, 0, 76, W, 52, wood);
  rect(image, 0, 74, W, 3, shade(wood, 1.4));
  rect(image, 6, 84, 52, 38, shade(wood, 0.8));
  rect(image, 8, 86, 48, 34, shade(wood, 1.1));
  jitter(image, rng, 0.08);
  age(image, rng, 0.45);
  return image;
}

function tiledWall(rng: Rng): PixelImage {
  const tile: RGB = rng.pick<RGB>([
    [190, 196, 180],
    [170, 190, 196],
  ]);
  const image = createImage(W, 128, [90, 90, 84]);
  for (let ty = 0; ty < 128; ty += 16) {
    for (let tx = 0; tx < W; tx += 16) rect(image, tx + 1, ty + 1, 14, 14, shade(tile, 0.9 + rng.float() * 0.15));
  }
  jitter(image, rng, 0.04);
  age(image, rng, 0.6);
  cracks(image, rng, 4);
  return image;
}

function plaster(rng: Rng, height: number): PixelImage {
  const image = createImage(W, height, [150, 140, 122]);
  const noise = valueNoise(rng, 8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < W; x++) setPixel(image, x, y, shade(getPixel(image, x, y), 0.85 + noise(x / W, y / height) * 0.25));
  }
  jitter(image, rng, 0.05);
  age(image, rng, 0.6);
  cracks(image, rng, 5);
  return image;
}

function stoneBlocks(rng: Rng, height: number, rows: number): PixelImage {
  const image = createImage(W, height, [40, 38, 36]);
  const rowH = height / rows;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? 16 : 0;
    for (let c = -1; c < 3; c++) {
      const tone = 80 + rng.int(-14, 14);
      rect(image, c * 32 + offset + 1, r * rowH + 1, 30, rowH - 2, [tone, tone - 4, tone - 10]);
    }
  }
  jitter(image, rng, 0.12);
  age(image, rng, 0.4);
  return image;
}

function door(rng: Rng): PixelImage {
  const wood: RGB = [74, 42, 24];
  const image = createImage(W, 128, wood);
  for (let x = 0; x < W; x++) if (x % 9 === 0) rect(image, x, 0, 1, 128, shade(wood, 0.85));
  // Four raised panels and a brass knob.
  for (const [px, py] of [[8, 10], [36, 10], [8, 70], [36, 70]] as const) {
    rect(image, px, py, 20, 46, shade(wood, 0.7));
    rect(image, px + 2, py + 2, 16, 42, shade(wood, 1.15));
  }
  ellipse(image, 54, 66, 3, 3, [190, 150, 60]);
  jitter(image, rng, 0.08);
  age(image, rng, 0.35);
  return image;
}

function windowPane(rng: Rng): PixelImage {
  // Night outside, rain-streaked glass.
  const image = createImage(W, 128, [10, 14, 26]);
  const noise = valueNoise(rng, 4);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < W; x++) setPixel(image, x, y, mix([8, 10, 20], [26, 34, 56], noise(x / W, y / 128)));
  }
  for (let i = 0; i < 18; i++) {
    const x = rng.int(0, W - 1);
    const y0 = rng.int(0, 100);
    line(image, x, y0, x + rng.int(-1, 1), y0 + rng.int(8, 26), [44, 54, 80]);
  }
  return image;
}

function boards(rng: Rng): PixelImage {
  const image = createImage(W, 64);
  const grain = valueNoise(rng, 8);
  for (let plank = 0; plank < 4; plank++) {
    const tone: RGB = shade([86, 56, 32], 0.8 + rng.float() * 0.35);
    const seam = rng.int(0, 63);
    for (let y = 0; y < 64; y++) {
      for (let x = plank * 16; x < plank * 16 + 16; x++) {
        const edge = x % 16 === 0 || y === seam;
        const g = 0.85 + grain((x * 4) / W, y / 64) * 0.3;
        setPixel(image, x, y, edge ? shade(tone, 0.45) : shade(tone, g));
      }
    }
  }
  jitter(image, rng, 0.05);
  age(image, rng, 0.3);
  return image;
}

function parquet(rng: Rng): PixelImage {
  const image = createImage(W, 64);
  const light: RGB = [110, 74, 42];
  const dark: RGB = [78, 50, 28];
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      const horizontal = (bx + by) % 2 === 0;
      for (let j = 0; j < 16; j++) {
        for (let i = 0; i < 16; i++) {
          const strip = horizontal ? Math.floor(j / 4) : Math.floor(i / 4);
          setPixel(image, bx * 16 + i, by * 16 + j, strip % 2 ? light : dark);
        }
      }
    }
  }
  jitter(image, rng, 0.08);
  age(image, rng, 0.35);
  return image;
}

function floorTiles(rng: Rng): PixelImage {
  const image = createImage(W, 64);
  const a: RGB = [176, 168, 150];
  const b: RGB = [34, 32, 30];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPixel(image, x, y, (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? a : b);
  jitter(image, rng, 0.06);
  age(image, rng, 0.5);
  cracks(image, rng, 3);
  return image;
}

function carpet(rng: Rng): PixelImage {
  const base: RGB = rng.pick<RGB>([
    [96, 22, 26],
    [40, 30, 70],
  ]);
  const image = createImage(W, 64, base);
  const gold: RGB = [150, 110, 50];
  rect(image, 0, 0, 64, 3, gold);
  rect(image, 0, 0, 3, 64, gold);
  for (let i = 0; i < 4; i++) {
    const c = 16 + (i % 2) * 32;
    const r = 16 + Math.floor(i / 2) * 32;
    ellipse(image, c, r, 7, 7, shade(gold, 0.8));
    ellipse(image, c, r, 4, 4, base);
  }
  jitter(image, rng, 0.12);
  age(image, rng, 0.35);
  return image;
}

function ceiling(rng: Rng): PixelImage {
  const image = plaster(rng, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPixel(image, x, y, shade(getPixel(image, x, y), 0.8));
  return image;
}

function woodGrain(rng: Rng, base: RGB): PixelImage {
  const image = createImage(W, 64);
  const grain = valueNoise(rng, 6);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const ring = Math.sin((x / 64) * Math.PI * 10 + grain(x / 64, y / 64) * 6) * 0.5 + 0.5;
      setPixel(image, x, y, shade(base, 0.75 + ring * 0.35));
    }
  }
  jitter(image, rng, 0.05);
  return image;
}

function flatNoisy(rng: Rng, base: RGB, amount: number, scale = 6): PixelImage {
  const image = createImage(W, 64);
  const noise = valueNoise(rng, scale);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) setPixel(image, x, y, shade(base, 1 - amount + noise(x / 64, y / 64) * amount * 2));
  jitter(image, rng, 0.04);
  return image;
}

function books(rng: Rng): PixelImage {
  const image = createImage(W, 64, [30, 20, 14]);
  for (let shelf = 0; shelf < 2; shelf++) {
    let x = 0;
    while (x < 64) {
      const w = rng.int(3, 6);
      const h = rng.int(20, 28);
      const colour = rng.pick<RGB>([
        [90, 26, 24],
        [36, 54, 40],
        [40, 40, 70],
        [96, 76, 40],
        [60, 36, 26],
      ]);
      rect(image, x, shelf * 32 + 30 - h, w - 1, h, colour);
      rect(image, x, shelf * 32 + 34 - h, w - 1, 1, [170, 140, 70]);
      x += w;
    }
    rect(image, 0, shelf * 32 + 30, 64, 2, [70, 44, 26]);
  }
  jitter(image, rng, 0.06);
  return image;
}

function mirror(rng: Rng): PixelImage {
  const image = flatNoisy(rng, [96, 104, 108], 0.3, 4);
  // Silvering lost at the edges.
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const edge = Math.min(x, y, 63 - x, 63 - y);
      if (edge < 6 && rng.chance(0.4)) setPixel(image, x, y, [40, 38, 34]);
    }
  }
  return image;
}

function frame(rng: Rng): PixelImage {
  const image = createImage(W, 64, [120, 90, 36]);
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 64; j++) {
      const ridge = Math.sin((Math.min(i, j, 63 - i, 63 - j) / 64) * Math.PI * 8);
      setPixel(image, i, j, shade([150, 112, 44], 0.7 + ridge * 0.3));
    }
  }
  jitter(image, rng, 0.1);
  return image;
}

function clockFace(rng: Rng): PixelImage {
  const image = createImage(W, 64, [60, 36, 20]);
  ellipse(image, 32, 32, 28, 28, [150, 112, 44]);
  ellipse(image, 32, 32, 25, 25, [214, 204, 176]);
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    setPixel(image, 32 + Math.sin(a) * 21, 32 - Math.cos(a) * 21, [20, 16, 12]);
    setPixel(image, 32 + Math.sin(a) * 20, 32 - Math.cos(a) * 20, [20, 16, 12]);
  }
  // Stopped at a quarter to midnight.
  line(image, 32, 32, 32, 16, [20, 16, 12]);
  line(image, 32, 32, 20, 32, [20, 16, 12]);
  jitter(image, rng, 0.05);
  age(image, rng, 0.3);
  return image;
}

function cloth(rng: Rng): PixelImage {
  const image = flatNoisy(rng, [200, 194, 178], 0.08, 8);
  // Papel picado style cut-out border.
  for (let x = 0; x < 64; x += 8) ellipse(image, x + 4, 6, 2, 2, [150, 40, 90]);
  return image;
}

function marigold(rng: Rng): PixelImage {
  const image = createImage(W, 64, [70, 40, 8]);
  for (let i = 0; i < 70; i++) {
    const colour = rng.pick<RGB>([
      [236, 140, 20],
      [250, 176, 30],
      [210, 100, 14],
    ]);
    ellipse(image, rng.int(0, 63), rng.int(0, 63), rng.int(2, 4), rng.int(2, 4), colour);
  }
  jitter(image, rng, 0.1);
  return image;
}

function leaves(rng: Rng, flower: RGB | undefined): PixelImage {
  const image = createImage(W, 64, [20, 34, 18]);
  for (let i = 0; i < 60; i++) {
    ellipse(image, rng.int(0, 63), rng.int(0, 63), rng.int(2, 5), rng.int(1, 3), shade([46, 84, 40], 0.7 + rng.float() * 0.5));
  }
  if (flower) for (let i = 0; i < 10; i++) ellipse(image, rng.int(4, 60), rng.int(4, 60), 3, 4, shade(flower, 0.9 + rng.float() * 0.2));
  return image;
}

function pianoKeys(rng: Rng): PixelImage {
  const image = createImage(W, 64, [16, 14, 14]);
  rect(image, 0, 34, 64, 30, [220, 212, 190]);
  for (let x = 0; x < 64; x += 6) rect(image, x, 34, 1, 30, [120, 110, 100]);
  for (let x = 4; x < 64; x += 6) if (x % 42 !== 28) rect(image, x, 34, 3, 16, [16, 14, 14]);
  jitter(image, rng, 0.04);
  return image;
}

function slate(rng: Rng): PixelImage {
  const image = createImage(W, 64, [18, 20, 24]);
  // Overlapping courses of slates, each offset by half a slate, with moss creeping in.
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 ? 8 : 0;
    for (let col = -1; col < 4; col++) {
      const tone = 46 + rng.int(-10, 10);
      rect(image, col * 16 + offset + 1, row * 16, 14, 15, [tone, tone + 3, tone + 10]);
      if (rng.chance(0.15)) rect(image, col * 16 + offset + 1, row * 16 + 10, 14, 5, [40, 52, 30]);
    }
  }
  jitter(image, rng, 0.12);
  age(image, rng, 0.35);
  return image;
}

function mud(rng: Rng): PixelImage {
  const image = createImage(W, 64);
  const noise = valueNoise(rng, 6);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = noise(x / 64, y / 64);
      // Dark wet earth, dead grass in patches, and black puddles in the hollows.
      const colour: RGB = n > 0.62 ? [44, 48, 30] : n < 0.28 ? [14, 16, 20] : [40, 32, 24];
      setPixel(image, x, y, shade(colour, 0.8 + rng.float() * 0.3));
    }
  }
  for (let i = 0; i < 40; i++) line(image, rng.int(0, 63), rng.int(0, 63), rng.int(0, 63), rng.int(0, 63), [52, 56, 34]);
  return image;
}

function gravel(rng: Rng): PixelImage {
  const image = createImage(W, 64, [46, 44, 42]);
  for (let i = 0; i < 260; i++) {
    const tone = 50 + rng.int(-25, 45);
    ellipse(image, rng.int(0, 63), rng.int(0, 63), 1 + rng.float() * 1.5, 1 + rng.float() * 1.2, [tone, tone - 2, tone - 6]);
  }
  jitter(image, rng, 0.1);
  return image;
}

function bark(rng: Rng): PixelImage {
  const image = createImage(W, 64);
  const grain = valueNoise(rng, 8);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      // Deep vertical furrows in grey, dead wood.
      const furrow = Math.abs(Math.sin((x / 64) * Math.PI * 9 + grain(x / 64, y / 64) * 4));
      setPixel(image, x, y, shade([58, 52, 46], 0.45 + furrow * 0.7));
    }
  }
  jitter(image, rng, 0.08);
  return image;
}

/** Generates one texture as RGBA pixels. Pure and seeded, so it can be tested in Node. */
export function generateTexture(kind: TextureKind, rng: Rng): PixelImage {
  switch (kind) {
    case 'wallDamask':
      return damask(rng);
    case 'wallStripes':
      return stripes(rng);
    case 'wallFloral':
      return floral(rng);
    case 'wallPanelling':
      return panelling(rng);
    case 'wallTiles':
      return tiledWall(rng);
    case 'plaster':
      return plaster(rng, 128);
    case 'stone':
      return stoneBlocks(rng, 128, 8);
    case 'door':
      return door(rng);
    case 'window':
      return windowPane(rng);
    case 'floorboards':
      return boards(rng);
    case 'parquet':
      return parquet(rng);
    case 'floorTiles':
      return floorTiles(rng);
    case 'carpet':
      return carpet(rng);
    case 'stoneFloor':
      return stoneBlocks(rng, 64, 4);
    case 'ceiling':
      return ceiling(rng);
    case 'wood':
      return woodGrain(rng, [72, 44, 26]);
    case 'velvet':
      return flatNoisy(rng, [104, 22, 30], 0.25, 10);
    case 'porcelain':
      return flatNoisy(rng, [206, 204, 196], 0.08, 4);
    case 'iron':
      return flatNoisy(rng, [34, 32, 32], 0.3, 12);
    case 'brass':
      return flatNoisy(rng, [168, 128, 52], 0.2, 6);
    case 'books':
      return books(rng);
    case 'mirror':
      return mirror(rng);
    case 'canvas':
      return flatNoisy(rng, [196, 184, 156], 0.1, 12);
    case 'frame':
      return frame(rng);
    case 'bricks':
      return stoneBlocks(rng, 64, 8);
    case 'soot':
      return flatNoisy(rng, [16, 12, 10], 0.5, 8);
    case 'clockFace':
      return clockFace(rng);
    case 'cloth':
      return cloth(rng);
    case 'marigold':
      return marigold(rng);
    case 'wax':
      return flatNoisy(rng, [222, 210, 170], 0.1, 4);
    case 'leaves':
      return leaves(rng, undefined);
    case 'whiteFlower':
      return leaves(rng, [236, 236, 226]);
    case 'pianoKeys':
      return pianoKeys(rng);
    case 'slate':
      return slate(rng);
    case 'mud':
      return mud(rng);
    case 'gravel':
      return gravel(rng);
    case 'bark':
      return bark(rng);
  }
}
