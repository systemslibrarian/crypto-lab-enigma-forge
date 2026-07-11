import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the Enigma reference
 * vectors; this gates them on accessibility the same way. Scans the full page
 * in both themes with every collapsible / [hidden] region revealed.
 *
 * This lab has no <details>. Panels are class/attribute-toggled: several
 * regions ship with the `hidden` attribute (ring controls, Bombe progress,
 * cancel button, import box, success banner) and the presenter overlay is a
 * role="dialog" that is `hidden` until opened. We reveal all of them up front
 * so their contents are scanned, and neutralize animations/transitions so
 * nothing is scanned mid-flight.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function neutralizeMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; opacity: 1 !important; }\n' +
      'body { animation: none !important; }',
  });
}

async function revealCollapsibles(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Any native <details> (defensive — this lab currently ships none).
    for (const details of document.querySelectorAll('details')) {
      (details as HTMLDetailsElement).open = true;
    }
    // Reveal every [hidden] region (ring controls, Bombe progress, cancel
    // button, import box, success banner, presenter dialog overlay).
    for (const el of document.querySelectorAll<HTMLElement>('[hidden]')) {
      el.hidden = false;
      el.removeAttribute('hidden');
    }
    // Reveal any inline display:none regions.
    for (const el of document.querySelectorAll<HTMLElement>('[style*="display"]')) {
      if (el.style && el.style.display === 'none') el.style.display = '';
    }
    // Reveal class-toggled panels commonly gated on .open/.active/.hidden.
    for (const el of document.querySelectorAll<HTMLElement>('.hidden')) {
      el.classList.remove('hidden');
    }
  });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

async function runSuite(page: Page): Promise<void> {
  await revealCollapsibles(page);
  await neutralizeMotion(page);
  await scan(page);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await runSuite(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await runSuite(page);
});
