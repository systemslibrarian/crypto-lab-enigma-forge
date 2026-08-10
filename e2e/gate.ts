import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText, formatNonTextFailures, type NonTextFailure } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Three rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The previous version of
 *     this gate pushed `*, *::before, *::after { animation: none !important;
 *     transition: none !important; opacity: 1 !important }` before running axe.
 *     The `opacity` clause does not suppress a check, it FABRICATES THE INPUT:
 *     partial opacity is real rendering, and forcing a partly-transparent
 *     element opaque hands axe a foreground colour the page never paints. It is
 *     deleted rather than replaced. Motion is settled honestly instead (see
 *     `settle`), and the composite-aware arithmetic in contrast.ts measures the
 *     colours the page actually paints, at the opacity it actually paints them.
 *
 *     The old gate also unhid things: it walked the DOM stripping `[hidden]`
 *     and `.hidden` off every element, so the presenter dialog, the ring-search
 *     controls, the import box, the progress bar and the success banner were
 *     scanned in a state no visitor can produce — all open at once, none of
 *     them populated. Every one of those is reachable by a click, and this gate
 *     reaches them that way instead.
 *
 *  2. EVERY SCAN ASSERTS ITS CONTENT IS PRESENT FIRST, and there are scans well
 *     past first paint. axe over an empty container passes having checked
 *     nothing, and on this page the containers start empty: no keystroke has
 *     been typed, so the signal path holds one line of placeholder text; no
 *     ciphertext is loaded, so there are no crib alignments, no menu, and no
 *     Bombe stops. The states worth scanning are all downstream of a click.
 *
 *  3. `violations` IS NOT THE WHOLE ORACLE. See `scan`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 *
 * The 20s ceiling is deliberately generous rather than tight: on a loaded
 * machine the raf cadence stretches, and the correct response to that is a
 * longer wait, never a narrower scan.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set, and a gate
 * that injects `opacity: 1` paints it back for the scanner alone.
 *
 * This lab's reduced-motion blocks CANCEL (`animation: none`) rather than
 * fast-forward, which is the dangerous half of that pattern — but the two
 * animations they cancel both ramp *up* from a state no base rule declares.
 * `pathEnter` runs `opacity: 0 -> 1` on `.path-stage.enter` / `.path-node.enter`
 * / `.path-arrow.enter`, and none of those selectors sets `opacity` outside the
 * keyframes, so cancelling leaves the computed `opacity: 1`; `pulse` only
 * scales a transform. Nothing goes blank. That is a property of the stylesheet
 * as it stands rather than a guarantee, so it is asserted on every state.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1 — at
 * file level and inside `test.describe` alike — so the emulation is applied
 * imperatively and then *asserted* from inside the page. Without that assertion
 * a gate can believe it is testing a reduced-motion rendering while the page
 * happily animates. It decides more than the animation here: the signal path
 * reads `matchMedia('(prefers-reduced-motion: reduce)')` in JS and only adds
 * the `.enter` class when the query is false, so the emulation picks which of
 * two renderings is under test.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (theme === 'light') {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  }
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  // The whole lab is injected by JS into an empty <main>. Assert the structure
  // every scan relies on is really there, so no scan can pass over a shell.
  await expect(page.locator('#app .cl-hero-title')).toHaveText('Enigma Forge');
  await expect(page.locator('#app > section.panel')).toHaveCount(8);
  await expect(page.locator('.plug-key')).toHaveCount(26);
  await expect(page.locator('.flaw-cell')).toHaveCount(26);
  await expect(page.locator('.flaw-verdict')).toContainText('the diagonal is empty');
  await expect(page.locator('.vec-table tbody tr')).toHaveCount(3);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this page is a
 * plausible offender: it prints ciphertext, a 26-cell substitution strip, a
 * nine-stage signal trace and one crib/cipher alignment per surviving offset,
 * several of them `min-width: max-content`. Each of those does live inside its
 * own `overflow-x: auto` container, which is the correct answer — but a
 * container missed, or a long string outside one, pushes the document sideways.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;
    const widest = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right)[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * `tabindex="0"` alone, deliberately: adding `role="region"` + `aria-label`
 * would turn containers that are re-created on every keystroke and every
 * re-render into landmarks, and the resulting accessibility-tree churn is a
 * measured source of flake elsewhere in the fleet.
 *
 * axe's own `scrollable-region-focusable` covers this, but only where the
 * content actually overflows — three of this page's four offenders fit inside
 * the 926px desktop column and only overflow at phone width, so a desktop-only
 * gate never saw them. This assertion runs alongside the axe rule because it
 * names the element and its measurements, which the rule's node target does not.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Five assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - `violations` — the usual WCAG A/AA rule failures.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. That exemption is doing real work here: at first
 *    paint axe decides 312 contrast results and files 68 as incomplete, and
 *    once a scenario is loaded it decides 2157 and files 1763 — at 380px it
 *    files MORE than it decides (1622 decided, 2295 incomplete). Its stated
 *    reasons are background images, "content contains only non-text
 *    characters", and content "too short to determine if it is actual text",
 *    which between them describe most of a page built out of single letters.
 *    Also in this bucket, and the reason the exemption is one rule id rather
 *    than a blanket pass: `aria-prohibited-attr` on three role-less divs, a
 *    real defect that survived the entire life of the old gate because
 *    incomplete results never reached its assertion.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node,
 *    measured against the surface the text is genuinely painted on, including
 *    SVG `<text>` (which takes its ink from `fill`, and whose backdrop is a
 *    preceding sibling shape rather than an ancestor's background).
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node. Both were being found by hand-sampling screenshot pixels, which does
 * not regress-test.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate, and this sweep has spent its whole length deleting checks
 * that could not fail. So it ratchets instead: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it. Opt-in via env, and the run is
  // deliberately left failing at the end by `expectBaselineNotStale` so a
  // capture pass can never be mistaken for a passing gate.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(
        `WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`
      );
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  expect(violations, `axe violations in state: ${label}`).toEqual([]);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  expect(unexplainedIncomplete, `axe incomplete results in state: ${label}`).toEqual([]);

  // Deduplicated: a single stylesheet mistake can repeat across 700+ identical
  // letter cells, and an assertion diff that long is unreadable.
  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  expect(contrast, `measured contrast failures in state: ${label}`).toEqual([]);

  await expectNoNewNonTextFailures(page, label);
  await expectScrollersReachable(page, label);
  await expectNoHorizontalOverflow(page, label);
}
