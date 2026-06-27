// SECTION 3 — THE BREAK. Crib placement (self-map rejection), menu construction
// with a quality coach, and the simulated Bombe with a live, cancellable search
// that shows the space collapsing. Everything is ALARM/exploit-styled: a
// struck-out alignment and a killed Bombe branch are wins for the attacker /
// failures of the cipher (icon + text + colour, never colour alone).

import { el, clear, copyButton } from './dom';
import type { AppState } from './state';
import type { Panel } from './machine-panel';
import { findCribAlignments, cleanText } from '../break/crib';
import { buildMenu, menuCoach, type Menu } from '../break/menu';
import {
  rotorOrderPermutations,
  type BombeResult,
  type BombeCandidate,
  type BombeSearchSpec,
} from '../break/bombe';
import type { BombeWorkerMessage } from '../break/bombe.worker';
import { ROTOR_NAMES, toChar, toIdx } from '../enigma/wirings';
import type { RotorName } from '../enigma/types';

const SVG = 'http://www.w3.org/2000/svg';
const ROTOR_LABELS = ['Left', 'Middle', 'Right'];

export function buildBreakPanel(
  state: AppState,
  refresh: () => void,
  notify: () => void = () => {},
): Panel {
  // ---- inputs ----
  const cribInput = el('input', {
    type: 'text', id: 'crib-input', class: 'mono', value: state.crib, spellcheck: 'false',
    autocapitalize: 'characters', placeholder: 'e.g. WETTERBERICHT',
    oninput: () => { state.crib = cribInput.value; state.selectedOffset = null; renderAll(); },
  }) as HTMLInputElement;

  const cipherInput = el('textarea', {
    id: 'cipher-input', class: 'mono', rows: '3', spellcheck: 'false',
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
  const scopeSelect = el('select', { id: 'scope-select', 'aria-label': 'Rotor-order search scope',
    onchange: () => { state.scope = scopeSelect.value === 'all' ? 'all' : 'current'; updateEstimate(); },
  }, [
    el('option', { value: 'current' }, ['Current rotor order only (fast)']),
    el('option', { value: 'all' }, ['All 60 rotor orders of I–V (slow)']),
  ]) as HTMLSelectElement;

  // ring search (advanced) ---------------------------------------------------
  const ringToggle = el('input', { type: 'checkbox', id: 'ring-search',
    onchange: () => { state.ringSearch.enabled = ringToggle.checked; renderRingControls(); updateEstimate(); },
  }) as HTMLInputElement;
  const ringControls = el('div', { class: 'ring-controls', hidden: true });
  const estimate = el('p', { class: 'search-estimate', 'aria-live': 'polite' });

  function renderRingControls() {
    clear(ringControls);
    ringControls.hidden = !state.ringSearch.enabled;
    if (!state.ringSearch.enabled) return;
    ringControls.append(
      el('p', { class: 'menu-note warn' }, [
        '⚠ Advanced: searching rings multiplies the space fast. Default searches only the ',
        'right ring; widen others knowingly.',
      ]),
    );
    const grid = el('div', { class: 'ring-grid' });
    for (let i = 0; i < 3; i++) {
      const [lo, hi] = state.ringSearch.ranges[i];
      const from = rangeSelect(`${ROTOR_LABELS[i]} ring from`, lo, (v) => {
        state.ringSearch.ranges[i][0] = Math.min(v, state.ringSearch.ranges[i][1]);
        renderRingControls(); updateEstimate();
      });
      const to = rangeSelect(`${ROTOR_LABELS[i]} ring to`, hi, (v) => {
        state.ringSearch.ranges[i][1] = Math.max(v, state.ringSearch.ranges[i][0]);
        renderRingControls(); updateEstimate();
      });
      grid.append(el('div', { class: 'ring-row' }, [
        el('span', { class: 'ring-row-label' }, [ROTOR_LABELS[i]]),
        from, el('span', { class: 'muted' }, ['→']), to,
      ]));
    }
    ringControls.append(grid);
  }

  function searchSize(): number {
    const orders = state.scope === 'all' ? 60 : 1;
    let ringCombos = 1;
    if (state.ringSearch.enabled) {
      for (const [lo, hi] of state.ringSearch.ranges) ringCombos *= hi - lo + 1;
    }
    return orders * 26 * 26 * 26 * ringCombos;
  }

  function updateEstimate() {
    const n = searchSize();
    const heavy = n > 500_000;
    estimate.className = `search-estimate${heavy ? ' warn' : ''}`;
    estimate.textContent = `${heavy ? '⚠ ' : ''}≈ ${n.toLocaleString()} settings to test${
      heavy ? ' — this can take a while; consider the Cancel button.' : '.'
    }`;
  }

  const runBtn = el('button', { type: 'button', class: 'btn btn-attack', disabled: true,
    onclick: () => runBombe() }, ['▶ Run simulated Bombe']);
  const cancelBtn = el('button', { type: 'button', class: 'btn', hidden: true,
    onclick: () => cancelBombe() }, ['■ Cancel']);

  const bombeStatus = el('p', { class: 'bombe-status', role: 'status', 'aria-live': 'polite' });
  const progressWrap = el('div', { class: 'bombe-progress', hidden: true });
  const progressBar = el('progress', { class: 'pbar', max: '100', value: '0' }) as HTMLProgressElement;
  const counters = el('div', { class: 'bombe-counters' });
  progressWrap.append(progressBar, counters);
  const bombeResults = el('div', { class: 'bombe-results' });

  let worker: Worker | null = null;
  let cancelled = false;

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
    clear(alignSummary);
    alignSummary.append(
      el('strong', {}, [`${valid.length}`]),
      ` of ${aligns.length} offsets survive self-map rejection`,
      valid.length === 0
        ? el('span', { class: 'tag bad' }, [' ✗ all eliminated — the crib cannot occur here'])
        : el('span', { class: 'muted' }, ['  — pick a surviving placement to build its menu.']),
    );

    for (const a of aligns) {
      const cribRow = el('div', { class: 'mono crib-row' });
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
            type: 'button', class: `align-pick${selected ? ' selected' : ''}`,
            'aria-pressed': selected ? 'true' : 'false',
            onclick: () => { state.selectedOffset = a.offset; renderAll(); },
          }, [selected ? '● ' : '○ ', `offset ${a.offset} — build menu`])
        : el('span', { class: 'align-rejected' }, [`✗ offset ${a.offset} rejected`]);
      alignList.append(
        el('div', { class: `align-item${a.valid ? '' : ' rejected'}${selected ? ' selected' : ''}` }, [
          head, el('div', { class: 'align-strips' }, [cribRow, cipherRow]),
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

    // menu quality coach
    const coach = menuCoach(menu, crib.length);
    const coachBox = el('div', { class: `menu-coach ${coach.tone}` }, [
      el('p', { class: 'coach-headline' }, [
        coach.tone === 'good' ? '✓ ' : coach.tone === 'warn' ? '◐ ' : '⚠ ',
        coach.headline,
      ]),
      el('ul', { class: 'coach-tips' }, coach.tips.map((t) => el('li', {}, [t]))),
    ]);

    menuBox.append(
      el('h3', {}, [`Menu for offset ${state.selectedOffset}`]),
      stats,
      coachBox,
      buildMenuGraph(menu),
      buildEdgeList(menu),
    );
    return menu;
  }

  function renderAll() {
    cancelBombe();
    clear(bombeResults);
    bombeStatus.className = 'bombe-status';
    bombeStatus.textContent = '';
    progressWrap.hidden = true;
    state.bombeStops = null; // changing inputs invalidates a prior run
    const { crib, cipher } = renderAlignments();
    renderMenu(crib, cipher);
    renderRingControls();
    updateEstimate();
    notify();
  }

  // ---------- bombe run ----------
  function cancelBombe() {
    if (worker) {
      cancelled = true;
      worker.terminate();
      worker = null;
    }
    cancelBtn.hidden = true;
    runBtn.disabled = state.selectedOffset == null;
  }

  function runBombe() {
    const crib = cleanText(state.crib);
    const cipher = cleanText(state.breakCiphertext);
    if (state.selectedOffset == null || !crib || !cipher) return;

    const rotorOrders: RotorName[][] =
      state.scope === 'all'
        ? rotorOrderPermutations([...ROTOR_NAMES] as RotorName[], 3)
        : [[...state.settings.rotorOrder] as RotorName[]];

    const spec: BombeSearchSpec = {
      reflector: state.settings.reflector,
      ringSettings: [...state.settings.ringSettings],
      rotorOrders,
      ...(state.ringSearch.enabled
        ? { ringRanges: state.ringSearch.ranges.map((r) => [...r]) as [number, number][] }
        : {}),
    };

    cancelled = false;
    runBtn.disabled = true;
    cancelBtn.hidden = false;
    clear(bombeResults);
    progressWrap.hidden = false;
    progressBar.value = 0;
    renderCounters({ contradictionRejects: 0, cribRejects: 0, stops: 0 });
    bombeStatus.className = 'bombe-status running';
    bombeStatus.textContent = `⏳ Searching ${rotorOrders.length} rotor order(s)…`;

    worker?.terminate();
    worker = new Worker(new URL('../break/bombe.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<BombeWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        const p = msg.progress;
        progressBar.value = p.total ? Math.min(100, (p.configsTested / p.total) * 100) : 0;
        renderCounters(p);
        bombeStatus.textContent = `⏳ ${p.configsTested.toLocaleString()} / ${p.total.toLocaleString()} · ${(msg.elapsedMs / 1000).toFixed(1)}s · testing ${p.current.rotorOrder.join('-')} ${p.current.positions.map(toChar).join('')}`;
      } else {
        progressBar.value = 100;
        renderCounters(msg.result);
        renderResults(msg.result, cipher, msg.elapsedMs);
        cancelBtn.hidden = true;
        runBtn.disabled = false;
        worker?.terminate();
        worker = null;
        state.bombeStops = msg.result.candidates.length;
        notify();
      }
    };
    worker.onerror = () => {
      if (cancelled) return;
      bombeStatus.className = 'bombe-status bad';
      bombeStatus.textContent = '⚠ Bombe worker failed to run.';
      cancelBtn.hidden = true;
      runBtn.disabled = false;
    };
    worker.postMessage({ crib, ciphertext: cipher, offset: state.selectedOffset, spec });
  }

  function renderCounters(p: {
    contradictionRejects: number; cribRejects: number; stops: number;
  }) {
    clear(counters);
    counters.append(
      counterChip('✗ contradiction', p.contradictionRejects, 'bad'),
      counterChip('✗ crib re-check', p.cribRejects, 'warn'),
      counterChip('✓ stops', p.stops, 'good'),
    );
  }

  function renderResults(result: BombeResult, cipher: string, elapsedMs: number) {
    clear(bombeResults);
    const n = result.candidates.length;
    bombeStatus.className = `bombe-status ${n > 0 ? 'good' : 'bad'}`;
    const took = `${result.configsTested.toLocaleString()} settings in ${(elapsedMs / 1000).toFixed(1)}s`;
    if (n === 0) {
      bombeStatus.textContent = `✗ ${took} — 0 stops. Over-constrained or wrong crib/scope.`;
      bombeResults.append(el('p', { class: 'muted' }, [
        'Every Stecker hypothesis hit a contradiction or failed the crib re-check. ',
        'Try a different crib, placement, or widen the rotor scope.',
      ]));
      return;
    }
    bombeStatus.textContent = `✓ ${took} — ${n} stop(s) recovered.`;
    if (result.underConstrained || n > 8) {
      bombeResults.append(el('p', { class: 'menu-note warn' }, [
        `⚠ ${n} stops — under-constrained. A longer crib or one with more loops narrows it.`,
      ]));
    }
    for (const c of result.candidates.slice(0, 24)) bombeResults.append(candidateCard(c, cipher));
    if (n > 24) bombeResults.append(el('p', { class: 'muted' }, [`… and ${n - 24} more.`]));
  }

  function candidateCard(c: BombeCandidate, cipher: string): HTMLElement {
    const steck = c.stecker.map((p) => `${p.a}↔${p.b}`).join(' ') || '(none deduced)';
    const loadBtn = el('button', { type: 'button', class: 'btn btn-load',
      onclick: () => {
        state.settings = {
          rotorOrder: [...c.rotorOrder], ringSettings: [...c.ringSettings],
          positions: [...c.positions], reflector: c.reflector,
          plugboard: c.stecker.map((p) => ({ ...p })),
        };
        state.message = cipher;
        state.candidateLoaded = true;
        refresh();
        notify();
        document.getElementById('machine-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, ['⤓ Load into Machine & decrypt']);

    // "Why this survived" — the crib window decrypted, plus the deduced pairs
    const cribWin = cleanText(cipher).slice(c.offset, c.offset + c.decryptedCrib.length);
    const why = el('details', { class: 'cand-why' }, [
      el('summary', {}, ['Why this stop survived']),
      el('p', {}, [
        'This setting decrypts the ciphertext at offset ',
        el('strong', {}, [String(c.offset)]),
        ' back to the crib, and its deduced Stecker is self-consistent:',
      ]),
      el('div', { class: 'why-strip' }, [
        labelledStrip('cipher', cribWin),
        labelledStrip('→ plain', c.decryptedCrib),
      ]),
      el('p', { class: 'muted' }, [
        `${c.loopsClosed > 0 ? `${c.loopsClosed} consistent loop closure(s); ` : 'No loops to close; '}`,
        'every contradiction the propagation hit eliminated a competing guess.',
      ]),
    ]);

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
      why,
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
      'Reflector and (by default) rings come from Section 1; the search is over rotor order + start ',
      'position, plus ring settings if you enable the advanced option.',
    ]),

    el('div', { class: 'break-inputs' }, [
      el('div', { class: 'field grow' }, [
        el('label', { for: 'crib-input' }, ['Crib (known plaintext)']),
        cribInput,
      ]),
      el('div', { class: 'field grow' }, [
        el('div', { class: 'io-head' }, [el('label', { for: 'cipher-input' }, ['Ciphertext']), loadOutputBtn]),
        cipherInput,
      ]),
    ]),

    el('h3', {}, ['Crib placement — watch the search space collapse']),
    alignSummary,
    el('div', { class: 'align-scroll' }, [alignList]),

    menuBox,

    el('h3', {}, ['Simulated Bombe']),
    el('div', { class: 'bombe-controls' }, [
      el('div', { class: 'field' }, [el('label', { for: 'scope-select' }, ['Rotor scope']), scopeSelect]),
      el('label', { class: 'ring-toggle', for: 'ring-search' }, [ringToggle, ' Search ring settings (advanced)']),
      runBtn,
      cancelBtn,
    ]),
    ringControls,
    estimate,
    bombeStatus,
    progressWrap,
    bombeResults,
  ]);

  // initial paint
  renderAll();

  const update = (_s: AppState) => {
    if (cipherInput.value !== state.breakCiphertext) cipherInput.value = state.breakCiphertext;
    if (cribInput.value !== state.crib) cribInput.value = state.crib;
    if (scopeSelect.value !== state.scope) scopeSelect.value = state.scope;
    if (ringToggle.checked !== state.ringSearch.enabled) {
      ringToggle.checked = state.ringSearch.enabled;
      renderRingControls();
    }
    updateEstimate();
  };

  return { root, update, rerender: renderAll };
}

// ---------- small builders ----------
function stat(label: string, value: string, tone = ''): HTMLElement {
  return el('div', { class: `stat ${tone}` }, [
    el('span', { class: 'stat-value' }, [value]),
    el('span', { class: 'stat-label' }, [label]),
  ]);
}

function counterChip(label: string, value: number, tone: string): HTMLElement {
  return el('div', { class: `counter ${tone}` }, [
    el('span', { class: 'counter-value' }, [value.toLocaleString()]),
    el('span', { class: 'counter-label' }, [label]),
  ]);
}

function labelledStrip(label: string, text: string): HTMLElement {
  return el('div', { class: 'lstrip' }, [
    el('span', { class: 'lstrip-label muted' }, [label]),
    el('span', { class: 'mono lstrip-text' }, [text]),
  ]);
}

function rangeSelect(ariaLabel: string, value: number, onChange: (v: number) => void): HTMLSelectElement {
  const sel = el('select', { 'aria-label': ariaLabel,
    onchange: () => onChange(toIdx(sel.value)),
  }) as HTMLSelectElement;
  for (let i = 0; i < 26; i++) sel.append(el('option', { value: toChar(i) }, [toChar(i)]));
  sel.value = toChar(value);
  return sel;
}

function buildEdgeList(menu: Menu): HTMLElement {
  const wrap = el('div', { class: 'edge-wrap' }, [
    el('div', { class: 'io-head' }, [
      el('span', { class: 'muted' }, ['Edges (position: plain–cipher)']),
      copyButton(() => menu.edges.map((e) => `${e.label}: ${e.plain}-${e.cipher}`).join('\n'), 'Copy menu'),
    ]),
  ]);
  const list = el('div', { class: 'mono edge-list' });
  for (const e of menu.edges) list.append(el('span', { class: 'edge-chip' }, [`${e.label}:${e.plain}–${e.cipher}`]));
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
