import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * FUNCTIONAL gate: the load-bearing claims this page makes, asserted against the
 * rendered page rather than against the source.
 *
 * The rule everywhere below is that the expected value is RECOMPUTED from what
 * the page itself shows (its ciphertext, its crib, its menu edges, its counters)
 * instead of being pasted in as a literal. A hardcoded expectation only proves
 * the page still says what it said; a recomputed one proves the page's headline
 * verdict matches the page's own arithmetic. The few literals that remain are
 * external facts the demo is claiming to reproduce (the published Enigma I test
 * vector BDZGO, the 26^3 search space) — those are the point of asserting.
 */

const ALPHA_ONLY = /[^A-Z]/g;
const clean = (s: string) => s.toUpperCase().replace(ALPHA_ONLY, '');
const num = (s: string) => Number(s.replace(/[^\d]/g, ''));

/** Read a `.stat` / `.counter` group into { label -> value }. */
async function readPairs(group: Locator, valueSel: string, labelSel: string) {
  const out = new Map<string, string>();
  for (const item of await group.all()) {
    const label = ((await item.locator(labelSel).textContent()) ?? '').trim().toLowerCase();
    const value = ((await item.locator(valueSel).textContent()) ?? '').trim();
    out.set(label, value);
  }
  return out;
}

const menuStats = (page: Page) =>
  readPairs(page.locator('.menu-stats .stat'), '.stat-value', '.stat-label');
const bombeCounters = (page: Page) =>
  readPairs(page.locator('.bombe-counters .counter'), '.counter-value', '.counter-label');

async function runBombe(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Run simulated Bombe' }).click();
  const status = page.locator('.bombe-status.good, .bombe-status.bad');
  await status.waitFor({ timeout: 120_000 });
  return (await status.textContent()) ?? '';
}

/** Machine settings the page is currently showing, read out of the controls. */
async function currentStart(page: Page): Promise<string> {
  const labels = ['Left (slow)', 'Middle', 'Right (fast)'];
  const letters = [];
  for (const l of labels) {
    letters.push(await page.locator(`select[aria-label="${l} start position (Grundstellung)"]`).inputValue());
  }
  return letters.join('');
}

// ---------------------------------------------------------------------------
// 1 · THE MACHINE
// ---------------------------------------------------------------------------

test('encrypts a typed message, and the same settings decrypt it (own inverse)', async ({ page }) => {
  await page.goto('.');
  const plain = 'HELLOWORLDFROMBLETCHLEYPARK';
  await page.locator('#message-input').fill(plain);
  const cipher = ((await page.locator('.output-box').textContent()) ?? '').trim();

  expect(cipher).toHaveLength(plain.length);
  expect(cipher).not.toBe(plain);
  // The structural claim, checked on real output: no letter ever encrypts to itself.
  for (let i = 0; i < plain.length; i++) expect(cipher[i]).not.toBe(plain[i]);

  // Feed the ciphertext back through the unchanged machine — it must come out
  // as the original plaintext. That is the whole "its own inverse" claim.
  await page.locator('#message-input').fill(cipher);
  await expect(page.locator('.output-box')).toHaveText(plain);
});

test('reproduces the published Enigma I vector, and the appendix agrees with the machine', async ({ page }) => {
  await page.goto('.');
  // Default settings are I-II-III / rings AAA / positions AAA / UKW-B, the
  // configuration whose AAAAA -> BDZGO vector is published in the literature.
  await page.locator('#message-input').fill('AAAAA');
  await expect(page.locator('.output-box')).toHaveText('BDZGO');

  // The appendix computes its vectors with a second, independent call into the
  // same engine; the two must not disagree.
  const row = page.locator('.vec-table tbody tr').filter({ hasText: 'Classic I-II-III' });
  await expect(row.locator('.vec-out')).toHaveText('BDZGO');
  const reflectorC = page.locator('.vec-table tbody tr').filter({ hasText: 'Reflector C' });
  const cText = ((await reflectorC.locator('.vec-out').textContent()) ?? '').trim();
  expect(cText).not.toBe('BDZGO'); // a different reflector must give a different vector
  expect(cText).toHaveLength(5);
});

test('lampboard, rotor windows and signal path all describe the same keystroke', async ({ page }) => {
  await page.goto('.');
  await page.locator('#message-input').fill('ENIGMA');
  const cipher = ((await page.locator('.output-box').textContent()) ?? '').trim();
  const last = cipher[cipher.length - 1];

  // exactly one lamp is lit, and it is the last output letter
  await expect(page.locator('.lamp.lit')).toHaveCount(1);
  await expect(page.locator('.lamp.lit')).toHaveText(last);

  // the caption names the same in/out pair the machine produced
  await expect(page.locator('.path-caption')).toContainText(`A → ${last}`);
  await expect(page.locator('.path-caption')).toContainText(
    `the reflector is why A could never come out as A`,
  );

  // rotor windows equal the "after" triple the path visualizer prints
  const positions = ((await page.locator('.path-positions').textContent()) ?? '');
  const after = /([A-Z]{3})\s*→\s*([A-Z]{3})/.exec(positions);
  expect(after, positions).toBeTruthy();
  const windows = (await page.locator('.window-cell').allTextContents()).join('');
  expect(windows).toBe(after![2]);

  // the step badge is never blank once a key has been pressed
  await expect(page.locator('.step-badge')).toContainText('⚙');
});

test('the double-step demo reaches the documented ADU sequence', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Double-step demo' }).click();

  await expect(page.locator('.step-badge')).toHaveText('⚙ double-step! middle + left advanced');
  await expect(page.locator('.step-badge')).toHaveClass(/alarm/);
  await expect(page.locator('.path-positions')).toContainText('AEW → BFX');
  await expect(page.locator('.path-positions')).toContainText('double-step');
  expect((await page.locator('.window-cell').allTextContents()).join('')).toBe('BFX');

  // the appendix's live-computed window sequence must tell the same story
  await expect(page.locator('.appendix')).toContainText('ADV → AEW → BFX → BFY');
});

test('an illegal machine setting is rejected and rolled back', async ({ page }) => {
  await page.goto('.');
  const middle = page.locator('select[aria-label="Middle rotor"]');
  const before = await middle.inputValue();
  await page.locator('select[aria-label="Left (slow) rotor"]').selectOption('I');
  await middle.selectOption('I'); // duplicate rotor — impossible on a real machine

  await expect(page.locator('.error')).toHaveText('Each rotor may be used only once (no duplicates).');
  await expect(middle).toHaveValue(before); // reverted, not silently accepted

  // and a legal change clears the error again
  await middle.selectOption('IV');
  await expect(page.locator('.error')).toHaveText('');
});

// ---------------------------------------------------------------------------
// 2 · THE FLAW
// ---------------------------------------------------------------------------

test('the empty-diagonal verdict matches the mapping the page actually rendered', async ({ page }) => {
  await page.goto('.');

  const check = async () => {
    const cells = await page.locator('.flaw-cell').all();
    expect(cells).toHaveLength(26);
    const map = new Map<string, string>();
    for (const cell of cells) {
      const from = ((await cell.locator('.fc-in').textContent()) ?? '').trim();
      const to = ((await cell.locator('.fc-out').textContent()) ?? '').trim();
      map.set(from, to);
    }
    const selfMaps = [...map].filter(([from, to]) => from === to).length;
    // the verdict is a claim about the table above it — recount the table
    await expect(page.locator('.flaw-verdict')).toHaveText(
      `✗ ${selfMaps} of 26 letters map to themselves — the diagonal is empty. Exploitable: this is the flaw.`,
    );
    expect(selfMaps).toBe(0);
    await expect(page.locator('.flaw-verdict')).toHaveClass(/broken/);
    // and the rendered map is a genuine involution (reflector symmetry)
    for (const [from, to] of map) expect(map.get(to)).toBe(from);
  };

  await check();
  // Recompute after changing rotors AND wiring a plug pair: the panel must be
  // re-deriving this from the live machine, not painting a fixed picture.
  await page.locator('select[aria-label="Right (fast) rotor"]').selectOption('V');
  await page.locator('select[aria-label="Left (slow) start position (Grundstellung)"]').selectOption('Q');
  await page.getByRole('button', { name: 'A, unplugged', exact: true }).click();
  await page.getByRole('button', { name: 'M, unplugged', exact: true }).click();
  await expect(page.locator('.plug-status')).toHaveText('1 pair(s): A↔M');
  await check();
});

// ---------------------------------------------------------------------------
// 3 · THE BREAK — crib placement
// ---------------------------------------------------------------------------

test('crib placement: every surviving offset is exactly the self-map-free one', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();

  const crib = clean(await page.locator('#crib-input').inputValue());
  const cipher = clean(await page.locator('#cipher-input').inputValue());

  // recompute the rejection independently from the two strings on the page
  const expectedValid: number[] = [];
  for (let o = 0; o + crib.length <= cipher.length; o++) {
    let ok = true;
    for (let i = 0; i < crib.length; i++) if (crib[i] === cipher[o + i]) ok = false;
    if (ok) expectedValid.push(o);
  }
  const total = cipher.length - crib.length + 1;

  const summary = (await page.locator('.align-summary').textContent()) ?? '';
  const m = /(\d+) of (\d+) offsets survive self-map rejection/.exec(summary);
  expect(m, summary).toBeTruthy();
  expect(Number(m![1])).toBe(expectedValid.length);
  expect(Number(m![2])).toBe(total);

  await expect(page.locator('.align-item')).toHaveCount(total);
  await expect(page.locator('.align-pick')).toHaveCount(expectedValid.length);
  await expect(page.locator('.align-rejected')).toHaveCount(total - expectedValid.length);

  const shown = (await page.locator('.align-pick').allTextContents()).map((t) =>
    Number(/offset (\d+)/.exec(t)![1]),
  );
  expect(shown).toEqual(expectedValid);

  // a rejected row must SHOW its conflict; a surviving row must have none
  for (const item of await page.locator('.align-item').all()) {
    const rejected = (await item.locator('.align-rejected').count()) > 0;
    const conflicts = await item.locator('.crib-row .conflict').count();
    expect(conflicts > 0).toBe(rejected);
  }
});

test('crib placement failure paths: empty, over-long, and fully eliminated', async ({ page }) => {
  await page.goto('.');
  const run = page.getByRole('button', { name: 'Run simulated Bombe' });

  // (a) nothing entered yet
  await expect(page.locator('.align-summary')).toHaveText(
    'Enter a crib and a ciphertext to search for valid placements.',
  );
  await expect(page.locator('.menu-box')).toContainText('Select a surviving placement above');
  await expect(run).toBeDisabled();

  // (b) crib longer than the ciphertext — no placement can exist
  await page.locator('#crib-input').fill('WETTERBERICHT');
  await page.locator('#cipher-input').fill('ABC');
  await expect(page.locator('.align-summary')).toHaveText(
    'Crib (13) is longer than the ciphertext (3) — no placement is possible.',
  );
  await expect(run).toBeDisabled();
  await expect(page.locator('.align-item')).toHaveCount(0);

  // (c) every offset eliminated by the no-self-encryption rule
  await page.locator('#crib-input').fill('AA');
  await page.locator('#cipher-input').fill('AAA');
  await expect(page.locator('.align-summary')).toContainText('0 of 2 offsets survive self-map rejection');
  await expect(page.locator('.align-summary')).toContainText('✗ all eliminated — the crib cannot occur here');
  await expect(page.locator('.align-pick')).toHaveCount(0);
  await expect(page.locator('.align-rejected')).toHaveCount(2);
  await expect(run).toBeDisabled();
});

// ---------------------------------------------------------------------------
// 3 · THE BREAK — menu
// ---------------------------------------------------------------------------

test('menu statistics are consistent with the menu edges the page drew', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();

  const chips = await page.locator('.edge-chip').allTextContents();
  const edges = chips.map((c) => {
    const m = /^(\d+):([A-Z]).([A-Z])$/.exec(c.trim());
    expect(m, c).toBeTruthy();
    return { pos: Number(m![1]), plain: m![2], cipher: m![3] };
  });

  const crib = clean(await page.locator('#crib-input').inputValue());
  expect(edges).toHaveLength(crib.length); // one edge per crib letter
  expect(edges.map((e) => e.plain).join('')).toBe(crib);

  // recompute nodes / degree / central / components / loops from those edges
  const degree = new Map<string, number>();
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    for (const n of [e.plain, e.cipher]) {
      degree.set(n, (degree.get(n) ?? 0) + 1);
      if (!adj.has(n)) adj.set(n, new Set());
    }
    adj.get(e.plain)!.add(e.cipher);
    adj.get(e.cipher)!.add(e.plain);
  }
  const nodes = [...degree.keys()].sort();
  let central = nodes[0];
  for (const n of nodes) if (degree.get(n)! > degree.get(central)!) central = n;
  const seen = new Set<string>();
  let components = 0;
  for (const start of nodes) {
    if (seen.has(start)) continue;
    components++;
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      if (seen.has(u)) continue;
      seen.add(u);
      for (const v of adj.get(u)!) if (!seen.has(v)) stack.push(v);
    }
  }
  const loops = edges.length - nodes.length + components;

  const stats = await menuStats(page);
  expect(Number(stats.get('letters'))).toBe(nodes.length);
  expect(Number(stats.get('edges'))).toBe(edges.length);
  expect(Number(stats.get('loops'))).toBe(loops);
  expect(stats.get('central')).toBe(central);
  expect(loops).toBeGreaterThan(0); // the bundled challenge ships a looped menu

  // the SVG's screen-reader label repeats the same four numbers
  const label = await page.locator('.menu-graph').getAttribute('aria-label');
  expect(label).toContain(`${nodes.length} letters`);
  expect(label).toContain(`${edges.length} links`);
  expect(label).toContain(`${loops} loop(s)`);
  expect(label).toContain(`Central letter ${central}`);
});

test('the menu coach grades a looped menu good and a loopless one bad', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();
  let stats = await menuStats(page);
  await expect(page.locator('.menu-coach')).toHaveClass(/good/);
  await expect(page.locator('.coach-headline')).toContainText('Strong menu');
  await expect(page.locator('.coach-tips')).toContainText(`${stats.get('loops')} loops`);

  await page.locator('select[aria-label="Load an example scenario"]').selectOption({
    label: 'Weak menu (few loops)',
  });
  stats = await menuStats(page);
  expect(Number(stats.get('loops'))).toBe(0);
  await expect(page.locator('.menu-coach')).toHaveClass(/bad/);
  await expect(page.locator('.coach-headline')).toContainText('Weak menu — no loops');
  await expect(page.locator('.coach-tips')).toContainText('Expect many coincidental stops');
});

// ---------------------------------------------------------------------------
// 3 · THE BREAK — the Bombe
// ---------------------------------------------------------------------------

test('the search-space estimate is the arithmetic it claims', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();
  const estimate = page.locator('.search-estimate');

  const positions = 26 * 26 * 26;
  expect(num((await estimate.textContent()) ?? '')).toBe(positions);
  await expect(estimate).not.toHaveClass(/warn/);

  await page.locator('#scope-select').selectOption('all');
  expect(num((await estimate.textContent()) ?? '')).toBe(60 * positions); // 60 rotor orders of I-V
  await expect(estimate).toHaveClass(/warn/);
  await expect(estimate).toContainText('consider the Cancel button');

  await page.locator('#scope-select').selectOption('current');
  await page.locator('#ring-search').check();
  await expect(page.locator('.ring-controls')).toBeVisible();
  // default advanced window is the right ring only: one more factor of 26
  expect(num((await estimate.textContent()) ?? '')).toBe(positions * 26);
  await expect(page.locator('.ring-controls')).toContainText('searching rings multiplies the space fast');
});

test('a successful Bombe run: counters partition the space and the stop verifies', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();

  const cipher = clean(await page.locator('#cipher-input').inputValue());
  const crib = clean(await page.locator('#crib-input').inputValue());
  const truth = await currentStart(page); // the challenge's real Grundstellung

  // Blank the start position the challenge preloaded, so the answer is no longer
  // sitting in the controls when the search runs.
  for (const label of ['Left (slow)', 'Middle', 'Right (fast)']) {
    await page.locator(`select[aria-label="${label} start position (Grundstellung)"]`).selectOption('A');
  }
  expect(await currentStart(page)).toBe('AAA');

  const status = await runBombe(page);
  const m = /([\d,]+) settings in [\d.]+s — (\d+) stop/.exec(status);
  expect(m, status).toBeTruthy();
  const tested = num(m![1]);
  const stops = Number(m![2]);
  expect(tested).toBe(26 * 26 * 26); // the space the estimate promised
  expect(stops).toBeGreaterThan(0);

  // every tested setting lands in exactly one bucket
  const counters = await bombeCounters(page);
  const contradiction = num(counters.get('✗ contradiction') ?? '');
  const cribReject = num(counters.get('✗ crib re-check') ?? '');
  const stopCount = num(counters.get('✓ stops') ?? '');
  expect(contradiction + cribReject + stopCount).toBe(tested);
  expect(stopCount).toBe(stops);
  await expect(page.locator('.pbar')).toHaveJSProperty('value', 100);

  // the stop is the setting that actually produced the ciphertext
  await expect(page.locator('.cand-card')).toHaveCount(stops);
  const card = page.locator('.cand-card').first();
  await expect(card.locator('.cand-badge')).toHaveText('✓ verified');
  await expect(card.locator('.cand-pos')).toHaveText(`pos ${truth}`);

  // "why this survived" shows the real crib window and the real decryption
  await card.locator('.cand-why summary').click();
  const strips = card.locator('.cand-why .lstrip-text');
  const offset = Number(
    /at offset\s*(\d+)/.exec((await card.locator('.cand-why p').first().textContent()) ?? '')![1],
  );
  await expect(strips.nth(0)).toHaveText(cipher.slice(offset, offset + crib.length));
  await expect(strips.nth(1)).toHaveText(crib);

  // loop closures are a property of the menu's edges, so they can never exceed
  // the independent loop count the menu panel reports
  const loops = Number((await menuStats(page)).get('loops'));
  const why = await card.locator('.cand-why').innerText();
  const closures = Number(/(\d+) consistent loop closure/.exec(why)?.[1] ?? '0');
  expect(closures, why).toBeGreaterThan(0);
  expect(closures).toBeLessThanOrEqual(loops);
});

test('a wrong placement reaches the no-stops failure state and says why', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();

  // pick a surviving-but-wrong offset: self-map rejection cannot rule it out,
  // only the Bombe's contradictions and crib re-check can
  await page.locator('.align-pick').nth(1).click();
  await expect(page.locator('.align-pick.selected')).toHaveCount(1);

  const status = await runBombe(page);
  await expect(page.locator('.bombe-status')).toHaveClass(/bad/);
  expect(status).toContain('0 stops. Over-constrained or wrong crib/scope.');
  await expect(page.locator('.bombe-results')).toContainText(
    'Every Stecker hypothesis hit a contradiction or failed the crib re-check.',
  );
  await expect(page.locator('.cand-card')).toHaveCount(0);

  const tested = num(/([\d,]+) settings/.exec(status)![1]);
  const counters = await bombeCounters(page);
  expect(
    num(counters.get('✗ contradiction') ?? '') +
      num(counters.get('✗ crib re-check') ?? '') +
      num(counters.get('✓ stops') ?? ''),
  ).toBe(tested);
  expect(num(counters.get('✓ stops') ?? '')).toBe(0);
});

test('a loopless menu surfaces many stops and admits it is under-constrained', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  await page.locator('select[aria-label="Load an example scenario"]').selectOption({
    label: 'Weak menu (few loops)',
  });
  expect(Number((await menuStats(page)).get('loops'))).toBe(0);

  const status = await runBombe(page);
  const tested = num(/([\d,]+) settings/.exec(status)![1]);
  const stops = Number(/— (\d+) stop/.exec(status)![1]);
  expect(stops).toBeGreaterThan(8);

  const counters = await bombeCounters(page);
  expect(
    num(counters.get('✗ contradiction') ?? '') +
      num(counters.get('✗ crib re-check') ?? '') +
      num(counters.get('✓ stops') ?? ''),
  ).toBe(tested);
  expect(num(counters.get('✓ stops') ?? '')).toBe(stops);

  await expect(page.locator('.bombe-results .menu-note')).toContainText(
    `⚠ ${stops} stops — under-constrained.`,
  );
  // the list is capped at 24 and the remainder is accounted for, not dropped
  await expect(page.locator('.cand-card')).toHaveCount(24);
  await expect(page.locator('.bombe-results .muted').last()).toHaveText(`… and ${stops - 24} more.`);
});

test('a running search can be cancelled and the panel returns to a runnable state', async ({ page }) => {
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();
  await page.locator('#scope-select').selectOption('all'); // ~1M settings: long enough to catch mid-flight

  const run = page.getByRole('button', { name: 'Run simulated Bombe' });
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await run.click();
  await expect(page.locator('.bombe-status.running')).toContainText('Searching 60 rotor order(s)');
  await expect(page.locator('.bombe-progress')).toBeVisible();
  await expect(run).toBeDisabled();

  await cancel.click();
  await expect(cancel).toBeHidden();
  await expect(run).toBeEnabled();
  await expect(page.locator('.bombe-status.good, .bombe-status.bad')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// RECOVERY — the headline verdict and its failure path
// ---------------------------------------------------------------------------

test('loading a stop re-decrypts the crib, and the banner re-checks it against live output', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();

  const plaintext = clean(await page.locator('#message-input').inputValue()); // the true message
  const crib = clean(await page.locator('#crib-input').inputValue());
  await runBombe(page);
  await page.getByRole('button', { name: 'Load into Machine & decrypt' }).first().click();

  const banner = page.locator('.success-banner');
  await expect(banner).toBeVisible();
  await expect(banner).not.toHaveClass(/failed/);
  await expect(banner).toContainText('✓ Checked:');
  await expect(banner).toContainText(`re-decrypts offset 0 to “${crib}”`);
  await expect(banner).toContainText(`start ${await currentStart(page)}`);
  const plugs = Number(/^(\d+) pair/.exec((await page.locator('.plug-status').textContent()) ?? '')![1]);
  await expect(banner).toContainText(`${plugs} Stecker pair(s)`);

  // the banner's claim, checked against the machine's own output
  const decrypted = clean((await page.locator('.output-box').textContent()) ?? '');
  expect(decrypted.slice(0, crib.length)).toBe(crib);

  // The honest limit the README and the panel both promise: a Stecker the menu
  // never touched is NOT recovered, so the rest of the message is still wrong.
  expect(decrypted).not.toBe(plaintext);
  await expect(banner).toContainText('letters outside the crib may read transposed');

  // Finish the plugboard by hand and the whole message comes back.
  await page.getByRole('button', { name: 'F, unplugged', exact: true }).click();
  await page.getByRole('button', { name: 'L, unplugged', exact: true }).click();
  await expect(page.locator('.output-box')).toHaveText(plaintext);
  await expect(banner).not.toHaveClass(/failed/);
});

test('the success verdict fails when the settings stop reproducing the crib', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();
  const crib = clean(await page.locator('#crib-input').inputValue());
  await runBombe(page);
  await page.getByRole('button', { name: 'Load into Machine & decrypt' }).first().click();

  const banner = page.locator('.success-banner');
  await expect(banner).toContainText('✓ Checked:');

  // (a) tamper with the reflector
  await page.locator('#refl-C').check();
  await expect(banner).toHaveClass(/failed/);
  await expect(banner).toContainText('✗ Not verified:');
  await expect(banner).toContainText('UKW-C');
  await expect(banner).toContainText(
    'The settings have been changed since the stop was loaded, so this is no longer a break.',
  );
  // the letters it reports are the ones the machine really produced
  let got = /decrypts offset 0 to “([A-Z—]*)”/.exec((await banner.textContent()) ?? '')![1];
  expect(got).not.toBe(crib);
  expect(clean((await page.locator('.output-box').textContent()) ?? '').slice(0, crib.length)).toBe(got);

  // (b) restore the reflector, then tamper with the rotor start instead
  await page.locator('#refl-B').check();
  await expect(banner).not.toHaveClass(/failed/);
  await page.locator('select[aria-label="Right (fast) start position (Grundstellung)"]').selectOption('B');
  await expect(banner).toHaveClass(/failed/);
  got = /decrypts offset 0 to “([A-Z—]*)”/.exec((await banner.textContent()) ?? '')![1];
  expect(got).not.toBe(crib);
  expect(clean((await page.locator('.output-box').textContent()) ?? '').slice(0, crib.length)).toBe(got);

  // (c) an unsteckered break recovers the message completely
  await page.locator('select[aria-label="Load an example scenario"]').selectOption({
    label: 'Easy crib (no plugboard)',
  });
  await expect(banner).toBeHidden(); // a new scenario invalidates the old verdict
  const plaintext = clean(await page.locator('#message-input').inputValue());
  await runBombe(page);
  await page.getByRole('button', { name: 'Load into Machine & decrypt' }).first().click();
  await expect(banner).not.toHaveClass(/failed/);
  await expect(page.locator('.plug-status')).toHaveText('No pairs wired. Click a letter, then its partner.');
  await expect(page.locator('.output-box')).toHaveText(plaintext);
});

// ---------------------------------------------------------------------------
// GUIDED PATH, SHARING, RESET
// ---------------------------------------------------------------------------

test('the guided step tracker only ticks steps that actually happened', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('.');
  const done = page.locator('.step.done');
  const steps = page.locator('.stepper .step');
  await expect(steps).toHaveCount(6);
  await expect(done).toHaveCount(0);

  await page.getByRole('button', { name: 'Start challenge' }).click();
  // message + ciphertext + a chosen placement, but nothing run yet
  await expect(done).toHaveCount(4);
  await expect(page.locator('.step.active .step-label')).toHaveText('Run the Bombe');

  await runBombe(page);
  await expect(done).toHaveCount(5);
  await expect(page.locator('.step.active .step-label')).toHaveText('Recover & check');

  await page.getByRole('button', { name: 'Load into Machine & decrypt' }).first().click();
  await expect(done).toHaveCount(6);

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(done).toHaveCount(0);
  await expect(page.locator('.output-box')).toHaveText('—');
  await expect(page.locator('.success-banner')).toBeHidden();
});

test('a shared link reproduces the state it was copied from', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('.');
  await page.getByRole('button', { name: 'Start challenge' }).click();
  const output = ((await page.locator('.output-box').textContent()) ?? '').trim();
  const plugs = (await page.locator('.plug-status').textContent()) ?? '';
  const cipher = await page.locator('#cipher-input').inputValue();

  await page.getByRole('button', { name: 'Share link' }).click();
  const url = page.url();
  expect(url).toContain('#s=');

  // A fresh document, so the state can only come from the link itself — the same
  // page with a changed hash would be a same-document navigation and prove nothing.
  const shared = await context.newPage();
  await shared.goto(url);
  await expect(shared.locator('.output-box')).toHaveText(output);
  await expect(shared.locator('.plug-status')).toHaveText(plugs);
  expect(await shared.locator('#cipher-input').inputValue()).toBe(cipher);
  await shared.close();
});

test('an unparseable import is refused instead of silently loading', async ({ page }) => {
  await page.goto('.');
  await page.locator('#message-input').fill('KEEPME');
  const before = ((await page.locator('.output-box').textContent()) ?? '').trim();

  await page.getByRole('button', { name: 'Import' }).click();
  await page.locator('.import-box textarea').fill('{"v":1,"nonsense":true}');
  await page.locator('.import-actions button').filter({ hasText: 'Load' }).click();

  await expect(page.locator('.import-box .share-msg')).toHaveText('⚠ Not a valid scenario link or JSON.');
  await expect(page.locator('.import-box')).toBeVisible(); // stays open on failure
  await expect(page.locator('.output-box')).toHaveText(before); // state untouched
});

test('the ciphertext handed to the break panel is the machine output verbatim', async ({ page }) => {
  await page.goto('.');
  await page.locator('#message-input').fill('ATTACK AT DAWN ON THE EASTERN FRONT');
  const output = ((await page.locator('.output-box').textContent()) ?? '').trim();
  await page.getByRole('button', { name: 'Load Section 1 output' }).click();
  expect(await page.locator('#cipher-input').inputValue()).toBe(output);
  // spaces pass through the machine untouched, so the break panel cleans them
  expect(output).toContain(' ');
  await expect(page.locator('.align-summary')).toContainText('offsets survive self-map rejection');
});
