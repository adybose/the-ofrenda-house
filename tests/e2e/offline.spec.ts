import { expect, isLocalUrl, test } from './fixtures';

test('every request the page makes goes to localhost', async ({ page, requests }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.waitForLoadState('networkidle');
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((url) => !isLocalUrl(url))).toEqual([]);
});

test('the guard recognises outside URLs', () => {
  expect(isLocalUrl('http://localhost:4173/src/main.ts')).toBe(true);
  expect(isLocalUrl('http://127.0.0.1:8787/api/health')).toBe(true);
  expect(isLocalUrl('data:image/png;base64,AAAA')).toBe(true);
  expect(isLocalUrl('https://cdn.jsdelivr.net/npm/three')).toBe(false);
  expect(isLocalUrl('https://fonts.googleapis.com/css')).toBe(false);
});
