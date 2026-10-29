import type { Page } from '@playwright/test';
import { expect } from './fixtures';

// Shared by the encounter tests (specs 11 and 18).

export interface Mock {
  prefetchAt: number[];
}

/** A mock model: a line for each step, and a riddle whose right answer is the first option. */
export async function mockModel(page: Page, answer: () => string): Promise<Mock> {
  const mock: Mock = { prefetchAt: [] };
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.route('**/api/spirit/prefetch', (route) => {
    mock.prefetchAt.push(Date.now());
    return route.fulfill({ status: 202, contentType: 'application/json', body: '{"queued":1}' });
  });
  await page.route('**/api/spirit/line', (route) => {
    const { step } = route.request().postDataJSON() as { step: string };
    const lines: Record<string, string> = {
      greeting: 'Who walks in my house on the night of the dead?',
      whoAreYou: 'Tell me who you are, stranger.',
      reaction: 'Hm. So you say.',
      reward: 'Then hear what I know.',
      silence: 'No. Go away.',
    };
    const body =
      step === 'riddle'
        ? { source: 'llm', line: 'What do I keep?', riddle: { question: 'What do I keep?', options: [answer(), 'A candle', 'A spoon', 'A shoe'], correctIndex: 0 } }
        : { source: 'llm', line: lines[step] ?? '...' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return mock;
}

/** Stand at the door, open it with E and walk in with the arrow key until the spirit appears. */
export async function walkIn(page: Page, doorId: string) {
  await page.evaluate((id) => window.__ofrenda!.standFacingDoor(id, 'outside'), doorId);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => page.evaluate(() => window.__encounter!.active()), { timeout: 8000 }).toBe(true);
  await page.keyboard.up('ArrowUp');
}

/** Space past the typing and on. */
export async function next(page: Page) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  await page.keyboard.press('Space');
}

/** Plays a whole encounter to its reward: the reply 1, then the riddle's first option (the mock's right answer). */
export async function winEncounter(page: Page, doorId: string) {
  await walkIn(page, doorId);
  await expect(page.locator('#dialogue-text')).toContainText('Who walks', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-options button')).not.toHaveCount(0, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('So you say', { timeout: 8000 });
  await next(page);
  await expect(page.locator('#dialogue-options button')).toHaveCount(4, { timeout: 8000 });
  await page.keyboard.press('Digit1');
  await expect(page.locator('#dialogue-text')).toContainText('hear what I know', { timeout: 8000 });
  await next(page);
  await expect.poll(() => page.evaluate(() => window.__encounter!.active())).toBe(false);
}
