import { test as base, expect } from '@playwright/test';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalUrl(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  if (protocol === 'data:' || protocol === 'blob:') return true;
  return LOCAL_HOSTS.has(hostname);
}

interface Fixtures {
  /** Every URL the page requested during the test. */
  requests: string[];
  /** Console errors and uncaught page errors seen during the test. */
  consoleErrors: string[];
}

// Every e2e test imports `test` from here, so every test fails if the page
// reaches outside localhost (the offline rule in CLAUDE.md).
export const test = base.extend<Fixtures>({
  requests: async ({ page }, use) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await use(requests);
    expect(requests.filter((url) => !isLocalUrl(url)), 'requests outside localhost').toEqual([]);
  },
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
  },
});

export { expect };

/** Brightness statistics (0-255, mean of RGB) for a screenshot, over the whole frame or a region in 0..1 coordinates. */
export interface Stats {
  mean: number;
  p99: number;
  max: number;
}

export async function imageStats(
  page: import('@playwright/test').Page,
  png: Buffer,
  regions: Record<string, [number, number, number, number]> = { all: [0, 0, 1, 1] },
): Promise<Record<string, Stats>> {
  return page.evaluate(
    async ({ base64, regions }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const result: Record<string, { mean: number; p99: number; max: number }> = {};
      for (const [name, [x0, y0, x1, y1]] of Object.entries(regions)) {
        const left = Math.floor(x0 * image.width);
        const top = Math.floor(y0 * image.height);
        const { data } = ctx.getImageData(left, top, Math.max(1, Math.floor((x1 - x0) * image.width)), Math.max(1, Math.floor((y1 - y0) * image.height)));
        const values: number[] = [];
        for (let i = 0; i < data.length; i += 4) values.push((data[i]! + data[i + 1]! + data[i + 2]!) / 3);
        values.sort((a, b) => a - b);
        result[name] = {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          p99: values[Math.floor(values.length * 0.99)] ?? 0,
          max: values.at(-1) ?? 0,
        };
      }
      return result;
    },
    { base64: png.toString('base64'), regions },
  );
}

/** The house at night: ambient light is near-black, not zero, so "dark" means this or darker. */
export const NEAR_BLACK = { mean: 6, p99: 40 };
