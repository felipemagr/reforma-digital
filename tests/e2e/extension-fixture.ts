import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';

/** VISUAL_QA=1 (visual-qa workflow): slowed-down video and 1280/390 screenshots of each test. */
const visualQa = process.env.VISUAL_QA === '1';

/** Chromium with the test build (dist-test) loaded; shared by every e2e spec. */
export const test = base.extend<{ extension: BrowserContext }>({
  extension: async ({}, use, testInfo) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'reforma-digital-test-'));
    const extension = path.resolve('dist-test');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      ...(process.env.BG_CHROMIUM_PATH ? { executablePath: process.env.BG_CHROMIUM_PATH } : {}),
      ...(visualQa
        ? {
            slowMo: 500,
            recordVideo: { dir: testInfo.outputPath(), size: { width: 1280, height: 720 } },
          }
        : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      await use(context);
      const page = context
        .pages()
        .reverse()
        .find((p) => p.url().startsWith('http'));
      if (visualQa && page) {
        await page.screenshot({ path: testInfo.outputPath('1280.png'), fullPage: true });
        // Viewport only: stacked mobile lists make full-page captures tens of thousands of px tall.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: testInfo.outputPath('390.png') });
      }
    } finally {
      // Chromium's initial blank tab would add an empty video to every test.
      const blank = await Promise.all(
        context
          .pages()
          .filter((p) => p.url() === 'about:blank')
          .map((p) => p.video()?.path()),
      );
      await context.close();
      await Promise.all(blank.map((file) => file && rm(file, { force: true })));
      await rm(profile, { recursive: true, force: true });
    }
  },
});
