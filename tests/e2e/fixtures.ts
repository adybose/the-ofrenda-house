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
