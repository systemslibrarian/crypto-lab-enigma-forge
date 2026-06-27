// SECTION 2 — THE FLAW. An interactive proof that, for the current settings, no
// letter ever maps to itself. The empty diagonal IS the crack the Bombe pries
// open. Styled as ALARM (this is the cipher's weakness), with icon + text +
// colour so it is never colour-only.

import { el, clear, ALPHA } from './dom';
import type { AppState } from './state';
import type { Panel } from './machine-panel';
import { Machine } from '../enigma/machine';
import { toChar } from '../enigma/wirings';

const SVG = 'http://www.w3.org/2000/svg';
const N = 26;
const CELL = 14;
const PAD = 18;

export function buildFlawPanel(): Panel {
  const matrixWrap = el('div', { class: 'flaw-matrix-scroll' });
  const strip = el('div', { class: 'flaw-strip mono', 'aria-hidden': 'false' });
  const verdict = el('p', { class: 'flaw-verdict', role: 'status', 'aria-live': 'polite' });

  const root = el('section', { class: 'panel flaw', 'aria-labelledby': 'flaw-h' }, [
    el('h2', { id: 'flaw-h' }, ['2 · The Flaw']),
    el('p', { class: 'lead' }, [
      'Because the reflector pairs every letter with a ',
      el('em', {}, ['different']),
      ' letter, the whole machine can never encrypt a letter to itself. Here is the input→output map ',
      'for the current settings at the start position — the diagonal is provably empty.',
    ]),
    el('p', { class: 'aside' }, [
      'That single fact is the crack in the armour: it lets an attacker reject any crib placement ',
      'where a guessed letter sits over an equal ciphertext letter (Section 3).',
    ]),
    el('div', { class: 'flaw-grid' }, [
      el('figure', { class: 'flaw-fig' }, [
        matrixWrap,
        el('figcaption', {}, ['Input (columns) → output (rows). A marker off the red diagonal for every column; never on it.']),
      ]),
    ]),
    el('div', { class: 'strip-wrap' }, [strip]),
    verdict,
  ]);

  const update = (s: AppState) => {
    const m = new Machine(s.settings);
    const map = m.currentMapping(); // involution, no fixed points

    // --- SVG matrix ---
    clear(matrixWrap);
    const size = PAD * 2 + N * CELL;
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('class', 'flaw-matrix');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Substitution matrix for the current settings. Every column has exactly one marker, and none lie on the diagonal — no letter maps to itself.',
    );

    // forbidden diagonal
    const diag = document.createElementNS(SVG, 'line');
    diag.setAttribute('x1', String(PAD));
    diag.setAttribute('y1', String(PAD));
    diag.setAttribute('x2', String(PAD + N * CELL));
    diag.setAttribute('y2', String(PAD + N * CELL));
    diag.setAttribute('class', 'flaw-diagonal');
    svg.append(diag);

    // axis ticks (every other letter to stay legible)
    for (let i = 0; i < N; i++) {
      if (i % 2 === 0) {
        const tx = document.createElementNS(SVG, 'text');
        tx.setAttribute('x', String(PAD + i * CELL + CELL / 2));
        tx.setAttribute('y', String(PAD - 6));
        tx.setAttribute('class', 'flaw-axis');
        tx.textContent = ALPHA[i];
        svg.append(tx);
        const ty = document.createElementNS(SVG, 'text');
        ty.setAttribute('x', String(PAD - 6));
        ty.setAttribute('y', String(PAD + i * CELL + CELL / 2 + 3));
        ty.setAttribute('class', 'flaw-axis flaw-axis-y');
        ty.textContent = ALPHA[i];
        svg.append(ty);
      }
    }

    for (let i = 0; i < N; i++) {
      const o = map[i];
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', String(PAD + i * CELL + CELL / 2));
      dot.setAttribute('cy', String(PAD + o * CELL + CELL / 2));
      dot.setAttribute('r', '3.4');
      dot.setAttribute('class', 'flaw-dot');
      const title = document.createElementNS(SVG, 'title');
      title.textContent = `${ALPHA[i]} → ${ALPHA[o]}`;
      dot.append(title);
      svg.append(dot);
    }
    matrixWrap.append(svg);

    // --- textual strip (accessible + copyable alternative) ---
    clear(strip);
    let selfMaps = 0;
    for (let i = 0; i < N; i++) {
      if (map[i] === i) selfMaps++;
      strip.append(
        el('span', { class: 'flaw-cell' }, [
          el('span', { class: 'fc-in' }, [ALPHA[i]]),
          el('span', { class: 'fc-arrow', 'aria-hidden': 'true' }, ['↓']),
          el('span', { class: 'fc-out' }, [toChar(map[i])]),
        ]),
      );
    }

    verdict.classList.toggle('broken', selfMaps === 0);
    verdict.textContent =
      selfMaps === 0
        ? '✗ 0 of 26 letters map to themselves — the diagonal is empty. Exploitable: this is the flaw.'
        : `⚠ ${selfMaps} self-map(s) found — impossible for a real Enigma; check the wiring.`;
  };

  return { root, update };
}
