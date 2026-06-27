// @vitest-environment happy-dom
//
// Runtime smoke tests for the UI construction code: every panel must build and
// update without throwing, and the key interactive flows (typing, plugboard,
// crib placement, menu) must produce the expected DOM. The Bombe worker itself
// is covered by break.test.ts; here we exercise everything around it.

import { describe, it, expect, beforeEach } from 'vitest';
import { createState, recomputeMachine } from '../src/ui/state';
import { buildMachinePanel } from '../src/ui/machine-panel';
import { buildPathVisualizer } from '../src/ui/path-visualizer';
import { buildFlawPanel } from '../src/ui/flaw-panel';
import { buildBreakPanel } from '../src/ui/break-panel';

function mountAll() {
  const state = createState();
  const panels = [
    buildMachinePanel(state, () => refresh()),
    buildPathVisualizer(),
    buildFlawPanel(),
    buildBreakPanel(state, () => refresh()),
  ];
  const root = document.createElement('div');
  for (const p of panels) root.append(p.root);
  document.body.append(root);
  const refresh = () => {
    recomputeMachine(state);
    for (const p of panels) p.update(state);
  };
  refresh();
  return { state, panels, root, refresh };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('panel construction', () => {
  it('builds and updates all panels without throwing', () => {
    expect(() => mountAll()).not.toThrow();
  });

  it('renders the four numbered sections', () => {
    const { root } = mountAll();
    const headings = [...root.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.some((t) => t?.includes('The Machine'))).toBe(true);
    expect(headings.some((t) => t?.includes('The Flaw'))).toBe(true);
    expect(headings.some((t) => t?.includes('The Break'))).toBe(true);
  });

  it('links the Cipher Museum exactly once (differentiation note)', () => {
    const { root } = mountAll();
    const links = [...root.querySelectorAll('a')].filter((a) =>
      a.getAttribute('href')?.includes('ciphermuseum.com'),
    );
    expect(links.length).toBe(1);
  });
});

describe('flaw panel proves the empty diagonal', () => {
  it('shows 0 self-maps and draws 26 markers', () => {
    const { root } = mountAll();
    const verdict = root.querySelector('.flaw-verdict')!;
    expect(verdict.textContent).toContain('0 of 26');
    expect(root.querySelectorAll('.flaw-dot').length).toBe(26);
    // no dot sits on the diagonal: verified structurally by the engine test,
    // here we just confirm the strip renders all 26 cells
    expect(root.querySelectorAll('.flaw-cell').length).toBe(26);
  });
});

describe('machine typing flow', () => {
  it('encrypts into the output box and lights a lamp', () => {
    const { state, root, refresh } = mountAll();
    state.message = 'AAAAA';
    refresh();
    const out = root.querySelector('.output-box')!;
    expect(out.textContent).toBe('BDZGO'); // known vector, end-to-end through the UI state
    expect(root.querySelectorAll('.lamp.lit').length).toBe(1);
  });

  it('traces a signal path with plugboard + reflector stages', () => {
    const { state, root, refresh } = mountAll();
    state.message = 'A';
    refresh();
    const names = [...root.querySelectorAll('.path-stage-name')].map((n) => n.textContent);
    expect(names[0]).toContain('Plugboard in');
    expect(names).toContain('Reflector');
    expect(names[names.length - 1]).toContain('Plugboard out');
  });
});

describe('break panel crib placement', () => {
  it('strikes out self-map alignments and offers valid placements', () => {
    const { state, root, refresh } = mountAll();
    // craft a ciphertext via the machine so the true placement is valid
    state.message = 'WETTERBERICHTXX';
    refresh();
    state.crib = 'WETTERBERICHT';
    state.breakCiphertext = state.output;
    refresh();
    // trigger the break panel's own input handler path by dispatching input
    const cipherInput = root.querySelector('#cipher-input') as HTMLTextAreaElement;
    cipherInput.value = state.output;
    cipherInput.dispatchEvent(new Event('input'));
    const cribInput = root.querySelector('#crib-input') as HTMLInputElement;
    cribInput.value = 'WETTERBERICHT';
    cribInput.dispatchEvent(new Event('input'));

    const summary = root.querySelector('.align-summary')!;
    expect(summary.textContent).toMatch(/survive self-map rejection/);
    // offset 0 is the true placement and must be selectable (valid)
    const picks = root.querySelectorAll('.align-pick');
    expect(picks.length).toBeGreaterThan(0);
  });

  it('builds a menu when a placement is selected', () => {
    const { state, root, refresh } = mountAll();
    state.message = 'WETTERBERICHTXX';
    refresh();
    const cipher = state.output;
    const cribInput = root.querySelector('#crib-input') as HTMLInputElement;
    const cipherInput = root.querySelector('#cipher-input') as HTMLTextAreaElement;
    cribInput.value = 'WETTERBERICHT';
    cribInput.dispatchEvent(new Event('input'));
    cipherInput.value = cipher;
    cipherInput.dispatchEvent(new Event('input'));
    // select the first valid placement
    const pick = root.querySelector('.align-pick') as HTMLButtonElement;
    pick.click();
    expect(root.querySelector('.menu-graph')).toBeTruthy();
    expect(root.querySelectorAll('.menu-node').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('.edge-chip').length).toBe(13);
  });
});

describe('plugboard interaction', () => {
  it('wires a pair on two clicks and reflects it in settings', () => {
    const { state, root } = mountAll();
    const keys = [...root.querySelectorAll('.plug-key')] as HTMLButtonElement[];
    const a = keys.find((k) => k.textContent?.startsWith('A'))!;
    const b = keys.find((k) => k.textContent?.startsWith('B'))!;
    a.click();
    b.click();
    expect(state.settings.plugboard).toEqual([{ a: 'A', b: 'B' }]);
  });
});
