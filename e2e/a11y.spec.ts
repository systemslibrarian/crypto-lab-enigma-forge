import { expect, test, type Page } from '@playwright/test';
import {
  NARROW,
  boot,
  expectBaselineNotStale,
  expectNoNewNonTextFailures,
  expectScrollersReachable,
  scan,
  settle,
} from './gate';

/**
 * WCAG regression gate.
 *
 * Deploys are already gated on the Enigma reference vectors by claims.spec.ts;
 * this gates them on accessibility the same way. See gate.ts for the three
 * rules this file obeys — nothing injected, content asserted before every scan,
 * and `violations` treated as one oracle among five.
 *
 * The page is scanned in both themes, in states a visitor can actually reach,
 * at a 1280px desktop viewport and at a 380px phone one. Almost none of the
 * interesting rendering is the first-paint one: until a key is pressed the
 * signal path is a single line of placeholder text, and until a ciphertext is
 * loaded there are no crib alignments, no menu graph, no Bombe counters, no
 * candidate cards and no verdict banner. Two of the three defects this gate
 * found are only reachable that way, and the third only at 380px.
 */

const THEMES = ['dark'] as const;

/** Wait for the Bombe worker to finish and return a good/bad verdict. */
async function runBombe(page: Page): Promise<void> {
  await page.getByRole('button', { name: '▶ Run simulated Bombe' }).click();
  await expect(page.locator('.bombe-status.good, .bombe-status.bad')).toBeVisible({
    timeout: 120_000,
  });
}

/** Load the bundled challenge: ciphertext, crib and a chosen placement. */
async function startChallenge(page: Page): Promise<void> {
  await page.getByRole('button', { name: '🎯 Start challenge' }).click();
  await expect(page.locator('.align-item').first()).toBeVisible();
  await expect(page.locator('.menu-stats .stat')).toHaveCount(4);
}

/**
 * A state worth scanning: how to reach it from a booted page, and what has to
 * be true once you are there. The assertion is not decoration — it is what
 * stops a scan from passing over a panel that never redrew.
 */
interface State {
  label: string;
  drive: (page: Page) => Promise<void>;
}

const STATES: State[] = [
  {
    // The default mount. Blank machine, empty signal path, no break in progress.
    label: 'first paint / blank machine',
    drive: async (page) => {
      await expect(page.locator('.path-flow')).toContainText('Type a letter to trace its path.');
      await expect(page.locator('.output-box')).toHaveText('—');
      await expect(page.locator('.align-summary')).toContainText('Enter a crib and a ciphertext');
    },
  },
  {
    // Typing fills the signal path with the nine-stage trace, lights a lamp,
    // moves the rotor windows and fills the output box — none of which exists
    // at first paint. The trace is ~1113px wide, so this is also the state that
    // makes `.path-scroll` scroll inside the 926px desktop column.
    label: 'message typed / signal path traced',
    drive: async (page) => {
      await page.locator('#message-input').fill('ENIGMAAAA');
      await expect(page.locator('.path-stage')).toHaveCount(9);
      await expect(page.locator('.lamp.lit')).toHaveCount(1);
      await expect(page.locator('.path-caption')).toContainText('9 stages');
      await expect(page.locator('.output-box')).not.toHaveText('—');
    },
  },
  {
    // The alarm rendering of the machine panel: `.window-cell.double` flips to
    // the alarm fill, `.pos-double` and `.step-badge.alarm` recolour, and the
    // `pulse` keyframe is the one animation reduced motion cancels outright.
    label: 'double-step / alarm rendering',
    drive: async (page) => {
      await page.getByRole('button', { name: '⚙ Double-step demo' }).click();
      await expect(page.locator('.window-cell.double')).toHaveCount(1);
      await expect(page.locator('.step-badge.alarm')).toHaveText(
        '⚙ double-step! middle + left advanced'
      );
      await expect(page.locator('.pos-double')).toBeVisible();
    },
  },
  {
    // The break panel's whole rendering arrives here: every crib placement with
    // its struck-out `.ch.conflict` cells, the rejected/selected item states,
    // the menu statistics, the coach and the SVG menu graph. The conflict cells
    // are where the 1.36:1 dark / 1.38:1 light contrast failure lived, and they
    // do not exist until a ciphertext is loaded.
    label: 'challenge loaded / crib placements + menu',
    drive: async (page) => {
      await startChallenge(page);
      await expect(page.locator('.align-item.rejected').first()).toBeVisible();
      await expect(page.locator('.align-item.selected')).toHaveCount(1);
      await expect(page.locator('.cipher-row .ch.win.conflict').first()).toBeVisible();
      await expect(page.locator('.crib-row .ch.conflict').first()).toBeVisible();
      await expect(page.locator('.menu-graph text.menu-node-label').first()).toBeVisible();
      await expect(page.locator('.menu-coach .coach-headline')).toBeVisible();
      await expect(page.locator('.edge-chip').first()).toBeVisible();
    },
  },
  {
    // The advanced ring search: a warn-toned note, three ranged select rows and
    // the estimate switching to its `.warn` palette. All `hidden` until asked
    // for — the old gate scanned them by stripping the attribute, in a state
    // where they held nothing.
    label: 'ring search widened / warn estimate',
    drive: async (page) => {
      await startChallenge(page);
      await page.locator('#ring-search').check();
      await page.locator('select[aria-label="Left ring to"]').selectOption('Z');
      await expect(page.locator('.ring-row')).toHaveCount(3);
      await expect(page.locator('.search-estimate.warn')).toContainText('this can take a while');
    },
  },
  {
    // The Bombe's own rendering: the counters, the finished progress bar and
    // one `.cand-card` per surviving stop, each with its verified badge and
    // deduced Steckers.
    label: 'bombe run / stops recovered',
    drive: async (page) => {
      await startChallenge(page);
      await runBombe(page);
      await expect(page.locator('.bombe-status.good')).toContainText('stop(s) recovered');
      await expect(page.locator('.cand-card').first()).toBeVisible();
      await expect(page.locator('.bombe-counters .counter')).toHaveCount(3);
      await expect(page.locator('.cand-badge.ok').first()).toHaveText('✓ verified');
    },
  },
  {
    // The only <details> on the page. Its body is display:none until opened, so
    // a first-paint scan checks none of the explanation strips inside it.
    label: 'stop explanation disclosure open',
    drive: async (page) => {
      await startChallenge(page);
      await runBombe(page);
      await page.locator('.cand-why summary').first().click();
      await expect(page.locator('.cand-why').first()).toHaveAttribute('open', '');
      await expect(page.locator('.cand-why .lstrip-text').first()).toBeVisible();
    },
  },
  {
    // Loading a stop back into the machine paints the success banner in the
    // --win palette and flips every step of the tracker to `.done`.
    label: 'verified break / success banner',
    drive: async (page) => {
      await startChallenge(page);
      await runBombe(page);
      await page.getByRole('button', { name: '⤓ Load into Machine & decrypt' }).first().click();
      const banner = page.locator('.success-banner');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('✓ Checked');
      await expect(banner).not.toHaveClass(/failed/);
      await expect(page.locator('.step.done')).toHaveCount(6);
    },
  },
  {
    // The banner re-derives its verdict from the machine, so changing a rotor
    // start after loading a stop turns it into a failure. That is a distinct
    // palette on a real, reachable state — and it had no stylesheet rule at
    // all until this audit, so the failure text was painted in the success
    // colours. Nothing reaches it without driving the whole break first.
    label: 'break invalidated / failed banner',
    drive: async (page) => {
      await startChallenge(page);
      await runBombe(page);
      await page.getByRole('button', { name: '⤓ Load into Machine & decrypt' }).first().click();
      await expect(page.locator('.success-banner')).toContainText('✓ Checked');
      await page
        .locator('select[aria-label="Left (slow) start position (Grundstellung)"]')
        .selectOption('Z');
      const banner = page.locator('.success-banner');
      await expect(banner).toHaveClass(/failed/);
      await expect(banner).toContainText('✗ Not verified');
    },
  },
  {
    // A Bombe run that finds nothing: the `.bombe-status.bad` palette plus the
    // "over-constrained" explanation, which the successful run never renders.
    label: 'bombe run / zero stops',
    drive: async (page) => {
      await page.locator('#crib-input').fill('WETTERBERICHT');
      await page.locator('#cipher-input').fill('QWERTYUIOPASDFGHJKLZXCVBNMQWERTY');
      await page.locator('.align-pick').first().click();
      await runBombe(page);
      await expect(page.locator('.bombe-status.bad')).toContainText('0 stops');
      await expect(page.locator('.cand-card')).toHaveCount(0);
    },
  },
  {
    // The presenter dialog: a fixed-position role="dialog" overlaying the page,
    // `hidden` until opened. Its first beat seeds the challenge, so the panels
    // beneath it are populated too.
    label: 'presenter dialog open',
    drive: async (page) => {
      await page.getByRole('button', { name: '▶ Presenter mode' }).click();
      const overlay = page.locator('.presenter');
      await expect(overlay).toBeVisible();
      await expect(page.locator('.beat-title')).toHaveText('An intercepted message');
      await expect(page.locator('.beat-count')).toHaveText('Beat 1 / 7');
      // Beat 1 disables Prev — the only disabled control on the page, and the
      // one case WCAG 1.4.3 exempts.
      await expect(page.getByRole('button', { name: '‹ Prev' })).toBeDisabled();
    },
  },
  {
    // The import box plus its error message — both `hidden` until asked for.
    label: 'import box open / invalid scenario',
    drive: async (page) => {
      await page.getByRole('button', { name: '📋 Import' }).click();
      await page.locator('.import-box textarea').fill('not a scenario');
      await page.getByRole('button', { name: 'Load', exact: true }).click();
      await expect(page.locator('.import-box .share-msg')).toHaveText(
        '⚠ Not a valid scenario link or JSON.'
      );
    },
  },
  {
    // The machine's validation error: an empty role="alert" until a duplicate
    // rotor is chosen, painted in --alarm.
    label: 'illegal machine settings / error alert',
    drive: async (page) => {
      await page.locator('select[aria-label="Left (slow) rotor"]').selectOption('I');
      await page.locator('select[aria-label="Middle rotor"]').selectOption('I');
      await expect(page.locator('.error')).toHaveText(
        'Each rotor may be used only once (no duplicates).'
      );
    },
  },
  {
    // The plugboard's two live states. `.plug-key.armed` draws a focus-coloured
    // outline and `.plug-key.plugged` swaps to the calm fill and adds a <sub>
    // partner letter in --accent-ink — none of which the unplugged board paints.
    label: 'plugboard armed then wired',
    drive: async (page) => {
      await page.locator('.plug-key').nth(0).click();
      await expect(page.locator('.plug-key.armed')).toHaveCount(1);
      await page.locator('.plug-key').nth(12).click();
      await expect(page.locator('.plug-key.plugged')).toHaveCount(2);
      await expect(page.locator('.plug-key sub').first()).toBeVisible();
      await expect(page.locator('.plug-status')).toHaveText('1 pair(s): A↔M');
    },
  },
  {
    // Both copy chips repaint to "✓ Copied" for 1.2s after a successful copy.
    // That is a real, reachable rendering that reverts on a timer, so it is
    // only ever scannable by driving it.
    label: 'copy confirmation',
    drive: async (page) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('#message-input').fill('ENIGMA');
      await expect(page.locator('.output-box')).not.toHaveText('—');
      await page.getByRole('button', { name: 'Copy output' }).click();
      await expect(page.getByRole('button', { name: 'Copy output' })).toHaveText('✓ Copied');
    },
  },
  {
    // The skip link is parked at `top: -3rem` until focused. The contrast walk
    // deliberately skips text that paints no pixels, so the only way its
    // colours are ever measured is to focus it for real.
    label: 'skip link focused',
    drive: async (page) => {
      await page.locator('.cl-skip-link').focus();
      await expect(page.locator('.cl-skip-link')).toBeFocused();
      // `.cl-skip-link` slides in on a `transition: top .15s ease`, and the
      // shared header declares no reduced-motion override for it, so the
      // transition runs even here. Let it drain before reading geometry —
      // measuring mid-flight reads a position the link only passes through.
      await settle(page);
      const onScreen = await page
        .locator('.cl-skip-link')
        .evaluate((el) => el.getBoundingClientRect().top >= 0);
      expect(onScreen, 'the skip link must slide into view on focus').toBe(true);
    },
  },
];

for (const theme of THEMES) {
  for (const state of STATES) {
    test(`${theme} — ${state.label}`, async ({ page }) => {
      test.setTimeout(180_000);
      await boot(page, theme);
      await state.drive(page);
      await scan(page, `${theme} / ${state.label} / 1280px`);

      // Same state, phone width. Reflow (1.4.10) has no axe rule, and axe's
      // `scrollable-region-focusable` never fires on a container whose content
      // still fits — three of this page's four scrolling regions only overflow
      // here, so a desktop-only gate reports nothing about any of them.
      await page.setViewportSize(NARROW);
      await settle(page);
      await scan(page, `${theme} / ${state.label} / ${NARROW.width}px`);
    });
  }
}

/**
 * The non-text baseline's third rule, which had never run.
 *
 * `nontext-baseline.ts` claims three: a finding not listed fails, a listed
 * finding that got WORSE fails, and a listed finding that has been FIXED fails
 * until its entry is deleted. The first two live in
 * `expectNoNewNonTextFailures` and fire from every `scan` above. The third is
 * `expectBaselineNotStale`, which was exported and never imported — so the
 * baseline could only ever grow.
 *
 * It gets its own test, driving the states itself, rather than a call tacked
 * onto the last state test. `nonTextSeen` is module state, and how much of it
 * any one test sees depends on how Playwright distributes tests across workers:
 * at `--workers=1` every test above shares one module instance and the last one
 * would see the union, while at this config's `fullyParallel` default each gets
 * its own and would see one state's worth. An oracle whose verdict changes with
 * the worker count is not an oracle, so this drives its own full pass and
 * depends on nothing outside itself.
 *
 * Dark alone, and that is measured rather than assumed: the sixteen states at
 * both viewports yield exactly the ten findings the baseline lists — no entry
 * missing, nothing extra. Covering every state matters, because `button.align-pick`
 * does not exist until a ciphertext is loaded, and both widths matter, because
 * the phone rendering is where three of the four scrolling regions appear.
 *
 * It calls `expectNoNewNonTextFailures` rather than the whole of `scan`: that
 * is the function that populates `nonTextSeen`, and re-running axe, the
 * contrast walk and the reflow checks over states the tests above already
 * scanned would roughly double this file's cost to assert nothing new.
 */
test('the non-text baseline has no stale entries', async ({ page }) => {
  test.setTimeout(600_000);
  // One page walks every state, so the desktop width has to be restored by
  // hand — the scans above get a fresh page per test and never need to.
  const WIDE = page.viewportSize() ?? { width: 1280, height: 720 };
  for (const state of STATES) {
    // Each state drives from a fresh mount, exactly as the scans above do.
    await boot(page, 'dark');
    await state.drive(page);
    await expectNoNewNonTextFailures(page, `stale sweep / ${state.label} / ${WIDE.width}px`);
    await page.setViewportSize(NARROW);
    await settle(page);
    await expectNoNewNonTextFailures(page, `stale sweep / ${state.label} / ${NARROW.width}px`);
    await page.setViewportSize(WIDE);
  }
  expectBaselineNotStale();
});

/**
 * WCAG 2.1.1 (Keyboard), asserted end to end rather than per-scan.
 *
 * `scan` already refuses any scrolling container with no keyboard route, but a
 * `tabindex` on an element the sequential walk never arrives at is no better
 * than none — so walk the page with Tab and prove each kind of scrolling
 * container is genuinely reached.
 *
 * There are four kinds and they are reached at different widths: `.path-scroll`
 * overflows as soon as a letter is typed (1113px of trace in a 926px column),
 * while `.strip-wrap` (508px), `.table-scroll` (520px) and every `.align-strips`
 * (569px each) only overflow at phone width.
 */
test('every scrolling container is reachable by Tab', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, 'dark');
  await page.locator('#message-input').fill('ENIGMA');
  await expect(page.locator('.path-stage')).toHaveCount(9);
  await page.getByRole('button', { name: '🎯 Start challenge' }).click();
  await expect(page.locator('.align-item').first()).toBeVisible();

  await page.setViewportSize(NARROW);
  await settle(page);
  await expectScrollersReachable(page, 'tab walk / 380px');

  const KINDS = ['.path-scroll', '.strip-wrap', '.table-scroll', '.align-strips'];
  const reached = new Set<string>();
  for (let i = 0; i < 600 && reached.size < KINDS.length; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((kinds) => {
      const active = document.activeElement;
      return active ? (kinds.find((k) => active.matches(k)) ?? null) : null;
    }, KINDS);
    if (hit) reached.add(hit);
  }
  expect(Array.from(reached).sort(), 'each kind of scrolling container must be tabbable').toEqual(
    [...KINDS].sort()
  );
});
