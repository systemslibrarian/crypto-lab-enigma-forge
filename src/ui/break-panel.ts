// SECTION 3 — THE BREAK. Crib placement (self-map rejection), menu construction,
// and the simulated Bombe. Everything here is ALARM/exploit-styled: a struck-out
// alignment and a killed Bombe branch are wins for the attacker / failures of the
// cipher, and are styled as such (icon + text + colour).

import { el, clear, copyButton } from './dom';
import type { AppState } from './state';
import type { Panel } from './machine-panel';
import { findCribAlignments, cleanText } from '../break/crib';
import { buildMenu, type Menu } from '../break/menu';
import { rotorOrderPermutations, type BombeResult, type BombeCandidate, type BombeSearchSpec } from '../break/bombe';
import { ROTOR_NAMES, toChar } from '../enigma/wirings';
import type { RotorName } from '../enigma/types';

const SVG = 'http://www.w3.org/2000/svg';

export function buildBreakPanel(state: AppState, refresh: () => void): Panel {
  // ---- inputs ----
  const cribInput = el('input', {
    type: 'text', id: 'crib-input', class: 'mono', value: state.crib, spellcheck: 'false',
    autocapitalize: 'characters', placeholder: 'e.g. WETTERBERICHT',
    oninput: () => { state.crib = cribInput.value; state.selectedOffset = null; renderAll(); },
  }) as HTMLInputElement;

  const cipherInput = el('textarea', {
    type: 'text', id: 'cipher-input', class: 'mono', rows: '3', spellcheck: 'false',
    placeholder: 'Paste ciphertext, or load the message output from Section 1…',
    oninput: () => { state.breakCiphertext = cipherInput.value; state.selectedOffset = null; renderAll(); },
  }) as HTMLTextAreaElement;

  const loadOutputBtn = el('button', {
    type: 'button', class: 'btn',
    onclick: () => {
      state.breakCiphertext = state.output;
      cipherInput.value = state.output;
      state.selectedOffset = null;
      renderAll();
    },
  }, ['↑ Load Section 1 output']);

  // ---- containers ----
  const alignSummary = el('p', { class: 'align-summary', 'aria-live': 'polite' });
  const alignList = el('div', { class: 'align-list' });
  const menuBox = el('div', { class: 'menu-box' });

  // ---- bombe controls ----
  const scopeSelect = el('select', { id: 'scope-select', 'aria-label': 'Rotor-order search scope' }, [
    el('option', { value: 'current' }, ['Current rotor order only (fast)']),
    el('option', { value: 'all' }, ['All 60 rotor orders of I–V (slow)']),
  ]) as HTMLSelectElement;

  const runBtn = el('button', { type: 'button', class: 'btn btn-attack', disabled: true,
    onclick: () => runBombe() }, ['▶ Run simulated Bombe']);
  const bombeStatus = el('p', { class: 'bombe-status', role: 'status', 'aria-live': 'polite' });
  const bombeResults = el('div', { class: 'bombe-results' });

  let worker: Worker | null = null;

  // ---------- rendering ----------
  function renderAlignments(): { crib: string; cipher: string } {
    const crib = cleanText(state.crib);
    const cipher = cleanText(state.breakCiphertext);
    clear(alignList);

    if (!crib || !cipher) {
      alignSummary.textContent = 'Enter a crib and a ciphertext to search for valid placements.';
      runBtn.disabled = true;
      return { crib, cipher };
    }
    if (crib.length > cipher.length) {
      alignSummary.textContent = `Crib (${crib.length}) is longer than the ciphertext (${cipher.length}) — no placement is possible.`;
      runBtn.disabled = true;
      return { crib, cipher };
    }

    const aligns = findCribAlignments(crib, cipher);
    const valid = aligns.filter((a) => a.valid);
    alignSummary.innerHTML = '';
    alignSummary.append(
      el('strong', {}, [`${valid.length}`]),
      ` of ${aligns.length} offsets survive self-map rejection`,
      valid.length === 0
        ? el('span', { class: 'tag bad' }, [' ✗ all eliminated — the crib cannot occur here'])
        : el('span', { class: 'muted' }, ['  — pick a surviving placement to build its menu.']),
    );

    for (const a of aligns) {
      const cribRow = el('div', { class: 'mono crib-row' });
      // leading spaces to align under ciphertext
      for (let i = 0; i < a.offset; i++) cribRow.append(el('span', { class: 'ch blank' }, ['·']));
      for (let i = 0; i < crib.length; i++) {
        const conflict = a.conflicts.includes(i);
        cribRow.append(el('span', { class: `ch${conflict ? ' conflict' : ''}` }, [crib[i]]));
      }

      const cipherRow = el('div', { class: 'mono cipher-row' });
      for (let i = 0; i < cipher.length; i++) {
        const inWindow = i >= a.offset && i < a.offset + crib.length;
        const conflict = inWindow && a.conflicts.includes(i - a.offset);
        cipherRow.append(
          el('span', { class: `ch${inWindow ? ' win' : ''}${conflict ? ' conflict' : ''}` }, [cipher[i]]),
        );
      }

      const selected = state.selectedOffset === a.offset;
      const head = a.valid
        ? el('button', {
            type: 'button',
            class: `align-pick${selected ? ' selected' : ''}`,
            'aria-pressed': selected ? 'true' : 'false',
            onclick: () => { state.selectedOffset = a.offset; renderAll(); },
          }, [selected ? '● ' : '○ ', `offset ${a.offset} — build menu`])
        : el('span', { class: 'align-rejected' }, [`✗ offset ${a.offset} rejected`]);

      alignList.append(
        el('div', { class: `align-item${a.valid ? '' : ' rejected'}${selected ? ' selected' : ''}` }, [
          head,
          el('div', { class: 'align-strips' }, [cribRow, cipherRow]),
        ]),
      );
    }
    return { crib, cipher };
  }

  function renderMenu(crib: string, cipher: string): Menu | null {
    clear(menuBox);
    if (state.selectedOffset == null) {
      runBtn.disabled = true;
      menuBox.append(el('p', { class: 'muted' }, ['Select a surviving placement above to construct its menu.']));
      return null;
    }
    const menu = buildMenu(crib, cipher, state.selectedOffset);
    runBtn.disabled = false;

    const stats = el('div', { class: 'menu-stats' }, [
      stat('Letters', String(menu.nodes.length)),
      stat('Edges', String(menu.edges.length)),
      stat('Loops', String(menu.loops), menu.loops > 0 ? 'good' : 'warn'),
      stat('Central', menu.central || '—'),
    ]);

    const note = menu.loops > 0
      ? el('p', { class: 'menu-note good' }, ['✓ Loops present — the Bombe can reject wrong settings by contradiction.'])
      : el('p', { class: 'menu-note warn' }, ['⚠ No loops — under-constrained. The Bombe will still find stops, but many will be coincidental.']);

    menuBox.append(
      el('h3', {}, [`Menu for offset ${state.selectedOffset}`]),
      stats,
      note,
      buildMenuGraph(menu),
      buildEdgeList(menu),
    );
    return menu;
  }

  function renderAll() {
    // a changed crib/ciphertext/placement invalidates any previous Bombe run
    worker?.terminate();
    worker = null;
    clear(bombeResults);
    bombeStatus.className = 'bombe-status';
    bombeStatus.textContent = '';
    const { crib, cipher } = renderAlignments();
    renderMenu(crib, cipher);
  }

  // ---------- bombe run ----------
  function runBombe() {
    const crib = cleanText(state.crib);
    const cipher = cleanText(state.breakCiphertext);
    if (state.selectedOffset == null || !crib || !cipher) return;

    const rotorOrders: RotorName[][] =
      scopeSelect.value === 'all'
        ? rotorOrderPermutations([...ROTOR_NAMES] as RotorName[], 3)
        : [[...state.settings.rotorOrder] as RotorName[]];

    const spec: BombeSearchSpec = {
      reflector: state.settings.reflector,
      ringSettings: [...state.settings.ringSettings],
      rotorOrders,
    };

    runBtn.disabled = true;
    clear(bombeResults);
    bombeStatus.className = 'bombe-status running';
    bombeStatus.textContent = `⏳ Searching ${rotorOrders.length} rotor order(s) × 17,576 start positions… (rings assumed ${state.settings.ringSettings.map(toChar).join('')})`;

    worker?.terminate();
    worker = new Worker(new URL('../break/bombe.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ result: BombeResult }>) => {
      renderResults(e.data.result, cipher);
      runBtn.disabled = false;
      worker?.terminate();
      worker = null;
    };
    worker.onerror = () => {
      bombeStatus.className = 'bombe-status bad';
      bombeStatus.textContent = '⚠ Bombe worker failed to run.';
      runBtn.disabled = false;
    };
    worker.postMessage({ crib, ciphertext: cipher, offset: state.selectedOffset, spec });
  }

  function renderResults(result: BombeResult, cipher: string) {
    clear(bombeResults);
    const n = result.candidates.length;
    bombeStatus.className = `bombe-status ${n > 0 ? 'good' : 'bad'}`;
    if (n === 0) {
      bombeStatus.textContent = `✗ ${result.configsTested.toLocaleString()} settings tested — 0 survived. Over-constrained or wrong crib/rotor scope.`;
      bombeResults.append(el('p', { class: 'muted' }, [
        'Every candidate Stecker hypothesis hit a contradiction or failed the crib re-check. Try a different crib, placement, or widen the rotor scope.',
      ]));
      return;
    }
    bombeStatus.textContent = `✓ ${result.configsTested.toLocaleString()} settings tested — ${n} candidate stop(s) recovered.`;
    if (result.underConstrained || n > 8) {
      bombeResults.append(el('p', { class: 'menu-note warn' }, [
        `⚠ ${n} stops — this menu is under-constrained. A longer crib or one with more loops narrows it.`,
      ]));
    }

    for (const c of result.candidates.slice(0, 24)) {
      bombeResults.append(candidateCard(c, cipher));
    }
    if (n > 24) bombeResults.append(el('p', { class: 'muted' }, [`… and ${n - 24} more.`]));
  }

  function candidateCard(c: BombeCandidate, cipher: string): HTMLElement {
    const steck = c.stecker.map((p) => `${p.a}↔${p.b}`).join(' ') || '(none deduced)';
    const loadBtn = el('button', { type: 'button', class: 'btn btn-load',
      onclick: () => {
        state.settings = {
          rotorOrder: [...c.rotorOrder],
          ringSettings: [...c.ringSettings],
          positions: [...c.positions],
          reflector: c.reflector,
          plugboard: c.stecker.map((p) => ({ ...p })),
        };
        state.message = cipher;
        refresh();
        document.getElementById('machine-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, ['⤓ Load into Machine & decrypt']);

    // preview decrypt of the crib region for confidence
    return el('div', { class: 'cand-card' }, [
      el('div', { class: 'cand-head' }, [
        el('span', { class: 'cand-badge ok' }, ['✓ verified']),
        el('span', { class: 'cand-pos' }, [`pos ${c.positions.map(toChar).join('')}`]),
        el('span', { class: 'cand-rotors' }, [c.rotorOrder.join('-')]),
      ]),
      el('dl', { class: 'cand-meta' }, [
        el('dt', {}, ['Rings']), el('dd', {}, [c.ringSettings.map(toChar).join('')]),
        el('dt', {}, ['Reflector']), el('dd', {}, [`UKW-${c.reflector}`]),
        el('dt', {}, ['Stecker']), el('dd', { class: 'mono' }, [steck]),
      ]),
      loadBtn,
    ]);
  }

  // ---------- static structure ----------
  const root = el('section', { class: 'panel break', 'aria-labelledby': 'break-h' }, [
    el('h2', { id: 'break-h' }, ['3 · The Break']),
    el('p', { class: 'lead' }, [
      'Turing & Welchman’s Bombe weaponised the flaw above. Place a ',
      el('em', {}, ['crib']),
      ' (known/guessed plaintext) against ciphertext, build the linkage ',
      el('em', {}, ['menu']),
      ', then let the simulated Bombe deduce settings by propagating a plugboard guess until it ',
      'closes consistently or hits a contradiction.',
    ]),
    el('p', { class: 'aside' }, [
      'Teaching-scale logical search, not a cycle-accurate 1940s hardware emulation. ',
      'Rings (Ringstellung) are assumed known and taken from Section 1; the search is over rotor order + start position.',
    ]),

    el('div', { class: 'break-inputs' }, [
      el('div', { class: 'field grow' }, [
        el('label', { for: 'crib-input' }, ['Crib (known plaintext)']),
        cribInput,
      ]),
      el('div', { class: 'field grow' }, [
        el('div', { class: 'io-head' }, [
          el('label', { for: 'cipher-input' }, ['Ciphertext']),
          loadOutputBtn,
        ]),
        cipherInput,
      ]),
    ]),

    el('h3', {}, ['Crib placement — watch the search space collapse']),
    alignSummary,
    el('div', { class: 'align-scroll' }, [alignList]),

    menuBox,

    el('h3', {}, ['Simulated Bombe']),
    el('div', { class: 'bombe-controls' }, [
      el('div', { class: 'field' }, [el('label', { for: 'scope-select' }, ['Search scope']), scopeSelect]),
      runBtn,
    ]),
    bombeStatus,
    bombeResults,
  ]);

  // initial paint
  renderAll();

  const update = (_s: AppState) => {
    // keep the ciphertext box in sync if a load happened elsewhere; otherwise
    // the break section is user-driven and doesn't re-render on machine typing.
    if (cipherInput.value !== state.breakCiphertext) cipherInput.value = state.breakCiphertext;
    if (cribInput.value !== state.crib) cribInput.value = state.crib;
  };

  return { root, update };
}

// ---------- small builders ----------
function stat(label: string, value: string, tone = ''): HTMLElement {
  return el('div', { class: `stat ${tone}` }, [
    el('span', { class: 'stat-value' }, [value]),
    el('span', { class: 'stat-label' }, [label]),
  ]);
}

function buildEdgeList(menu: Menu): HTMLElement {
  const wrap = el('div', { class: 'edge-wrap' }, [
    el('div', { class: 'io-head' }, [
      el('span', { class: 'muted' }, ['Edges (position: plain–cipher)']),
      copyButton(() => menu.edges.map((e) => `${e.label}: ${e.plain}-${e.cipher}`).join('\n'), 'Copy menu'),
    ]),
  ]);
  const list = el('div', { class: 'mono edge-list' });
  for (const e of menu.edges) {
    list.append(el('span', { class: 'edge-chip' }, [`${e.label}:${e.plain}–${e.cipher}`]));
  }
  wrap.append(list);
  return wrap;
}

function buildMenuGraph(menu: Menu): SVGSVGElement {
  const W = 320, H = 320, R = 120, cx = W / 2, cy = H / 2;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'menu-graph');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label',
    `Menu graph: ${menu.nodes.length} letters, ${menu.edges.length} links, ${menu.loops} loop(s). Central letter ${menu.central}.`);

  const pos = new Map<string, { x: number; y: number }>();
  menu.nodes.forEach((n, i) => {
    const ang = (2 * Math.PI * i) / menu.nodes.length - Math.PI / 2;
    pos.set(n, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
  });

  for (const e of menu.edges) {
    const a = pos.get(e.plain)!, b = pos.get(e.cipher)!;
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y));
    line.setAttribute('class', 'menu-edge');
    const t = document.createElementNS(SVG, 'title');
    t.textContent = `position ${e.label}: ${e.plain}–${e.cipher}`;
    line.append(t);
    svg.append(line);
  }
  for (const n of menu.nodes) {
    const p = pos.get(n)!;
    const isCentral = n === menu.central;
    const c = document.createElementNS(SVG, 'circle');
    c.setAttribute('cx', String(p.x)); c.setAttribute('cy', String(p.y));
    c.setAttribute('r', isCentral ? '14' : '11');
    c.setAttribute('class', `menu-node${isCentral ? ' central' : ''}`);
    svg.append(c);
    const tx = document.createElementNS(SVG, 'text');
    tx.setAttribute('x', String(p.x)); tx.setAttribute('y', String(p.y + 4));
    tx.setAttribute('class', 'menu-node-label');
    tx.textContent = n;
    svg.append(tx);
  }
  return svg;
}
