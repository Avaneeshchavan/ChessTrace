import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMobileFixture, user } from './mobile-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const load = name => import(pathToFileURL(require.resolve(name)).href);
const { default: lighthouse } = await load(process.env.LIGHTHOUSE_PACKAGE || 'lighthouse');
const { launch } = await load(process.env.CHROME_LAUNCHER_PACKAGE || 'chrome-launcher');
const directory = resolve(process.env.MOBILE_EVIDENCE || '/tmp/chesstrace-m5-evidence');
const fixture = await startMobileFixture();
const scores = [];
const routes = ['/', '/dashboard', '/lens', '/sandbox', '/turning-points', '/vault', '/vault/review', '/settings'];

try {
  await mkdir(directory, { recursive: true });
  for (const route of routes) {
    const chrome = await launch({ chromePath: process.env.CHROME_PATH, chromeFlags: ['--headless', '--disable-gpu'] });
    let browser;
    try {
      browser = await chromium.connectOverCDP('http://localhost:' + chrome.port);
      if (route !== '/') {
        const page = await browser.contexts()[0].newPage();
        await page.goto(fixture.origin + '/fixture-session.html');
        await page.evaluate(account => {
          localStorage.setItem('token', 'mobile-fixture');
          localStorage.setItem('user', JSON.stringify(account));
        }, user);
        await page.close();
      }
      const run = await lighthouse(fixture.origin + route, {
        port: chrome.port, output: 'html', logLevel: 'error', disableStorageReset: true,
      });
      if (run.lhr.runtimeError) throw new Error(run.lhr.runtimeError.message);
      if (new URL(run.lhr.finalDisplayedUrl).pathname !== route) throw new Error('Lighthouse audited the wrong route');
      const categories = Object.fromEntries(Object.entries(run.lhr.categories).map(([name, { score }]) =>
        [name, score === null ? null : Math.round(score * 100)]));
      scores.push({ route, ...categories });
      const name = route === '/' ? 'landing' : route.slice(1).replaceAll('/', '-');
      await writeFile(resolve(directory, 'lighthouse-' + name + '.html'), run.report);
      console.log(route, categories);
    } finally {
      await browser?.close();
      await chrome.kill();
    }
  }
  await writeFile(resolve(directory, 'lighthouse.json'), JSON.stringify(scores, null, 2) + '\n');
} finally {
  fixture.close();
}
