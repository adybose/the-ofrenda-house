import type { Character, Role } from '../case/types';
import type { Rng } from '../core/rng';
import { age, createImage, ellipse, getPixel, jitter, line, mix, rect, setPixel, shade, valueNoise, type PixelImage, type RGB } from './pixels';

export const PORTRAIT_WIDTH = 48;
export const PORTRAIT_HEIGHT = 64;

/**
 * normal: the character as painted; empty: the frame after they step out (Act 1);
 * smile: the killer's portrait in the possessed ending; elena: the painter's last
 * painting (true ending); player: the new portrait in the hall (possessed ending).
 */
export const PORTRAIT_VARIANTS = ['normal', 'empty', 'smile', 'elena', 'player'] as const;
export type PortraitVariant = (typeof PORTRAIT_VARIANTS)[number];

type AgeBand = 'young' | 'adult' | 'elder';

const ROLE_AGE: Record<Role, AgeBand> = {
  patriarch: 'elder',
  matriarch: 'adult',
  grandmother: 'elder',
  painter: 'young',
  eldestChild: 'young',
  bookkeeper: 'adult',
  housekeeper: 'adult',
  cook: 'adult',
  doctor: 'adult',
  gardener: 'adult',
};

/** Clothing colours by role: the family in dark finery, the household in plainer cloth. */
const ROLE_CLOTHES: Record<Role, readonly RGB[]> = {
  patriarch: [[24, 22, 26], [40, 30, 24]],
  matriarch: [[70, 16, 30], [30, 24, 44]],
  grandmother: [[20, 18, 20], [44, 36, 40]],
  painter: [[60, 52, 40], [36, 50, 60]],
  eldestChild: [[30, 34, 48], [54, 24, 24]],
  bookkeeper: [[50, 44, 36], [36, 36, 36]],
  housekeeper: [[36, 36, 40], [56, 46, 40]],
  cook: [[180, 172, 156], [90, 70, 50]],
  doctor: [[26, 28, 30], [48, 44, 40]],
  gardener: [[64, 70, 42], [82, 64, 40]],
};

const SKIN: readonly RGB[] = [
  [214, 170, 132],
  [190, 140, 100],
  [160, 112, 76],
  [126, 88, 60],
];

type Expression = 'stern' | 'neutral' | 'soft' | 'grin';

function expressionFor(personality: string): Expression {
  if (/proud|trusted no one|strict|nervous|stern|reckless/.test(personality)) return 'stern';
  if (/gifted|famous|dreamer|sang|bees|spoke to|stories|stars|quiet/.test(personality)) return 'soft';
  return 'neutral';
}

function background(image: PixelImage, rng: Rng, base: RGB): void {
  // Dark, brushy, lit from the upper left like an old oil portrait.
  const noise = valueNoise(rng, 5);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const light = 1.2 - (x / image.width) * 0.4 - (y / image.height) * 0.5;
      setPixel(image, x, y, shade(base, light * (0.7 + noise(x / image.width, y / image.height) * 0.5)));
    }
  }
}

function face(image: PixelImage, rng: Rng, character: Character, expression: Expression, eyes: RGB): void {
  const band = ROLE_AGE[character.role];
  const skin = rng.pick(SKIN);
  const clothes = rng.pick(ROLE_CLOTHES[character.role]);
  const hair: RGB = band === 'elder' ? [170, 166, 160] : rng.pick<RGB>([[24, 18, 14], [50, 34, 22], [80, 56, 34]]);
  const female = character.gender === 'female';
  const cx = 24 + rng.int(-2, 2);

  // Shoulders and clothes.
  ellipse(image, cx, 64, 22, 18, clothes);
  ellipse(image, cx, 50, 5, 6, shade(clothes, 0.6));
  if (character.role === 'cook' || character.role === 'housekeeper') rect(image, cx - 6, 52, 12, 12, [200, 196, 184]);
  if (!female) {
    // Collar and tie.
    line(image, cx - 4, 48, cx, 54, [220, 214, 200]);
    line(image, cx + 4, 48, cx, 54, [220, 214, 200]);
    rect(image, cx - 1, 54, 2, 8, shade(clothes, 0.4));
  }

  // Head, longer hair for women, a shawl for the grandmother.
  if (female) ellipse(image, cx, 30, 14, 20, hair);
  ellipse(image, cx, 46, 4, 4, shade(skin, 0.85));
  ellipse(image, cx, 30, 10, 13, skin);
  ellipse(image, cx, 20, 10 + (female ? 1 : 0), 6, hair);
  if (character.role === 'grandmother') ellipse(image, cx, 18, 13, 8, [30, 26, 30]);

  // Age lines.
  if (band === 'elder') {
    line(image, cx - 6, 26, cx - 3, 26, shade(skin, 0.75));
    line(image, cx + 3, 26, cx + 6, 26, shade(skin, 0.75));
  }
  // Moustache for some men.
  if (!female && band !== 'young' && rng.chance(0.6)) rect(image, cx - 4, 35, 8, 2, hair);

  // Eyes.
  for (const ex of [cx - 4, cx + 4]) {
    rect(image, ex - 1, 28, 3, 2, [230, 226, 216]);
    setPixel(image, ex, 28, eyes);
    setPixel(image, ex, 29, eyes);
  }
  if (expression === 'stern') {
    line(image, cx - 6, 25, cx - 2, 26, hair);
    line(image, cx + 2, 26, cx + 6, 25, hair);
  }

  // Mouth.
  const lip = shade(skin, 0.55);
  if (expression === 'grin') {
    // The killer's smile: too wide, too many teeth.
    line(image, cx - 7, 36, cx + 7, 36, [40, 6, 6]);
    rect(image, cx - 6, 37, 13, 3, [40, 6, 6]);
    for (let t = cx - 6; t <= cx + 6; t += 2) setPixel(image, t, 37, [236, 230, 210]);
    line(image, cx - 7, 36, cx - 8, 34, lip);
    line(image, cx + 7, 36, cx + 8, 34, lip);
  } else if (expression === 'soft') {
    line(image, cx - 3, 37, cx + 3, 37, lip);
    setPixel(image, cx - 4, 36, lip);
    setPixel(image, cx + 4, 36, lip);
  } else if (expression === 'stern') {
    line(image, cx - 3, 37, cx + 3, 37, shade(lip, 0.8));
  } else {
    line(image, cx - 2, 37, cx + 2, 37, lip);
  }
}

function baby(image: PixelImage, rng: Rng): void {
  // Baby Elena in a white christening blanket.
  ellipse(image, 24, 46, 18, 16, [222, 216, 204]);
  ellipse(image, 24, 30, 9, 9, [222, 216, 204]);
  ellipse(image, 24, 31, 6, 6, rng.pick(SKIN));
  setPixel(image, 22, 30, [30, 22, 18]);
  setPixel(image, 26, 30, [30, 22, 18]);
  line(image, 23, 33, 25, 33, [170, 100, 90]);
  // A sprig of cempasúchil in the blanket.
  ellipse(image, 30, 44, 2, 2, [236, 140, 20]);
  ellipse(image, 33, 42, 2, 2, [250, 176, 30]);
}

/** Paints one portrait from a character's traits. Pure and seeded. */
export function generatePortrait(character: Character, variant: PortraitVariant, rng: Rng): PixelImage {
  const image = createImage(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  // Each variant draws from its own stream, so the normal portrait never depends on the others.
  const paint = rng.fork(variant);
  const tone: RGB = paint.pick<RGB>([[40, 34, 28], [28, 32, 30], [36, 26, 30], [30, 30, 40]]);
  background(image, paint, variant === 'player' ? [26, 26, 30] : tone);

  if (variant === 'normal') face(image, rng.fork('sitter'), character, expressionFor(character.personality), [30, 22, 16]);
  if (variant === 'smile') face(image, rng.fork('sitter'), character, 'grin', [140, 10, 10]);
  if (variant === 'elena') baby(image, paint);
  if (variant === 'player') {
    // A stranger in modern clothes, painted in a hurry.
    face(image, paint, { ...character, role: 'eldestChild', personality: 'quiet' }, 'neutral', [20, 20, 24]);
    rect(image, 10, 52, 28, 12, [44, 64, 90]);
  }
  if (variant === 'empty') {
    // A faint pale outline where the sitter was.
    const ghost = rng.fork('sitter');
    const outline = createImage(PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
    face(outline, ghost, character, 'neutral', [0, 0, 0]);
    for (let y = 0; y < PORTRAIT_HEIGHT; y++) {
      for (let x = 0; x < PORTRAIT_WIDTH; x++) {
        const [r] = getPixel(outline, x, y);
        if (r > 0 && (x + y) % 3 === 0) setPixel(image, x, y, mix(getPixel(image, x, y), [120, 116, 104], 0.25));
      }
    }
  }

  jitter(image, paint, 0.06);
  age(image, paint, 0.35);
  return image;
}
