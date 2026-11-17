import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startMobileFixture, user } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const directory = resolve(process.env.THEME_EVIDENCE || '/tmp/chesstrace-m9-ui');
const fixture = await startMobileFixture();
let browser;
try {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      ...(width === 390 ? devices['Pixel 7'] : {}),
      viewport: { width, height: width === 390 ? 844 : 900 },
    });
    await context.addInitScript(account => {
      localStorage.setItem('token', 'fixture-token');
      localStorage.setItem('user', JSON.stringify(account));
    }, user);
    await context.route('**/parse-screenshot', async route => {
      const response = await route.fetch();
      const parsed = await response.json();
      parsed.theme_match_confidence = .51;
      parsed.warnings = ['The piece set could not be matched reliably. Check the highlighted squares or retake the screenshot with a flat piece set and a clear board.'];
      await route.fulfill({ response, json: parsed });
    });
    const page = await context.newPage();
    await page.goto(fixture.origin + '/lens');
    await page.getByLabel('Board screenshot').setInputFiles(resolve('vision-engine/examples/synthetic_chesscom_neo.png'));
    await page.getByText(/The piece set could not be matched reliably/).waitFor();
    await page.getByRole('button', { name: 'Review next square' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
    await page.screenshot({ path: resolve(directory, width + '-theme-review.png'), fullPage: true, scale: 'css' });
    await context.close();
  }
  console.log('Verified weak-theme feedback and square review at 390 and 1280 CSS pixels.');
} finally {
  await browser?.close();
  fixture.close();
}
