import { test } from '@playwright/test';
import { auditContrast } from './contrast';

test('time auditContrast', async ({ page }) => {
  test.setTimeout(600_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('.');
  await page.getByRole('button', { name: '🎯 Start challenge' }).click();
  await page.locator('.align-item').first().waitFor();
  const counts = await page.evaluate(() => ({
    all: document.querySelectorAll('body *').length,
    ch: document.querySelectorAll('.ch').length,
  }));
  console.log('counts', JSON.stringify(counts));
  for (const w of [1280, 380]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (let i = 0; i < 2; i++) {
      const t0 = Date.now();
      const f = await auditContrast(page);
      console.log(`auditContrast @${w} run${i}: ${Date.now() - t0}ms, ${f.length} failures`);
    }
  }
});
