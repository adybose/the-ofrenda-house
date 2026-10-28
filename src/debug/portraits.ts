import { generateCase } from '../case/generate';
import { createRng, STREAMS } from '../core/rng';
import { PORTRAIT_HEIGHT, PORTRAIT_VARIANTS, PORTRAIT_WIDTH, generatePortrait } from '../render/portraits';

/** `?debug=portraits`: every character's portrait and every variant, scaled up, with labels. */
export function showPortraitSheet(seed: number): void {
  const caseFile = generateCase(seed);
  const render = createRng(seed).fork(STREAMS.render);
  const scale = 3;
  const pad = 18;
  const columns = caseFile.characters.length;
  const rows = PORTRAIT_VARIANTS.length;
  const canvas = document.createElement('canvas');
  canvas.width = columns * (PORTRAIT_WIDTH * scale + pad) + pad;
  canvas.height = rows * (PORTRAIT_HEIGHT * scale + pad + 12) + pad;
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    margin: 'auto',
    maxWidth: '100vw',
    maxHeight: '100vh',
    imageRendering: 'pixelated',
    background: '#111',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.font = '11px monospace';
  ctx.fillStyle = '#ccc';

  PORTRAIT_VARIANTS.forEach((variant, row) => {
    caseFile.characters.forEach((character, column) => {
      const image = generatePortrait(character, variant, render.fork(`portrait:${character.id}`));
      const tile = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
      const small = document.createElement('canvas');
      small.width = image.width;
      small.height = image.height;
      small.getContext('2d')!.putImageData(tile, 0, 0);
      const x = pad + column * (PORTRAIT_WIDTH * scale + pad);
      const y = pad + row * (PORTRAIT_HEIGHT * scale + pad + 12);
      ctx.drawImage(small, x, y + 12, PORTRAIT_WIDTH * scale, PORTRAIT_HEIGHT * scale);
      const killer = character.id === caseFile.killerId ? ' *' : '';
      ctx.fillText(`${variant}: ${character.shortName}${killer}`.slice(0, 22), x, y + 9);
    });
  });
  document.body.dataset.portraitsReady = 'true';
}
