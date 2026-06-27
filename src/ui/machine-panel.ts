// SECTION 1 — THE MACHINE. Settings, an authentic-layout keyboard + lampboard,
// rotor windows (with the double-step called out), and live encryption.

import { el, clear, copyButton, ALPHA } from './dom';
import type { AppState } from './state';
import { Machine, validateSettings } from '../enigma/machine';
import { ROTOR_NAMES, REFLECTOR_NAMES, toChar, toIdx } from '../enigma/wirings';
import type { RotorName, ReflectorName } from '../enigma/types';

const KEYBOARD_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];

export interface Panel {
  root: HTMLElement;
  update: (s: AppState) => void;
}

export function buildMachinePanel(state: AppState, refresh: () => void): Panel {
  const errorBox = el('p', { class: 'error', role: 'alert', 'aria-live': 'assertive' });

  // --- rotor / ring / position pickers ---
  const rotorSelects: HTMLSelectElement[] = [];
  const ringSelects: HTMLSelectElement[] = [];
  const posSelects: HTMLSelectElement[] = [];
  const labels = ['Left (slow)', 'Middle', 'Right (fast)'];

  const tryApply = (mutate: () => void, revert: () => void) => {
    const snapshot = JSON.stringify(state.settings);
    mutate();
    try {
      validateSettings(state.settings);
      errorBox.textContent = '';
      refresh();
    } catch (e) {
      Object.assign(state.settings, JSON.parse(snapshot));
      revert();
      errorBox.textContent = (e as Error).message;
    }
  };

  const rotorCols = labels.map((lab, i) => {
    const rotorSel = el('select', {
      'aria-label': `${lab} rotor`,
      onchange: () => {
        const prev = state.settings.rotorOrder[i];
        tryApply(
          () => {
            state.settings.rotorOrder[i] = rotorSel.value as RotorName;
          },
          () => {
            rotorSel.value = prev;
          },
        );
      },
    }) as HTMLSelectElement;
    for (const name of ROTOR_NAMES) rotorSel.append(el('option', { value: name }, [name]));
    rotorSel.value = state.settings.rotorOrder[i];
    rotorSelects.push(rotorSel);

    const ringSel = letterSelect(`${lab} ring setting (Ringstellung)`, state.settings.ringSettings[i]);
    ringSel.addEventListener('change', () => {
      state.settings.ringSettings[i] = toIdx(ringSel.value);
      refresh();
    });
    ringSelects.push(ringSel);

    const posSel = letterSelect(`${lab} start position (Grundstellung)`, state.settings.positions[i]);
    posSel.addEventListener('change', () => {
      state.settings.positions[i] = toIdx(posSel.value);
      refresh();
    });
    posSelects.push(posSel);

    return el('div', { class: 'rotor-col' }, [
      el('span', { class: 'rotor-col-title' }, [lab]),
      field('Rotor', rotorSel),
      field('Ring', ringSel),
      field('Start', posSel),
    ]);
  });

  // --- reflector ---
  const reflectorGroup = el('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': 'Reflector' });
  const reflectorInputs: HTMLInputElement[] = [];
  for (const name of REFLECTOR_NAMES) {
    const id = `refl-${name}`;
    const input = el('input', {
      type: 'radio',
      name: 'reflector',
      id,
      value: name,
      checked: state.settings.reflector === name,
      onchange: () => {
        state.settings.reflector = name as ReflectorName;
        refresh();
      },
    }) as HTMLInputElement;
    reflectorInputs.push(input);
    reflectorGroup.append(el('label', { class: 'radio', for: id }, [input, ` UKW-${name}`]));
  }

  // --- plugboard editor ---
  const plugStatus = el('p', { class: 'plug-status', 'aria-live': 'polite' });
  const plugGrid = el('div', { class: 'plug-grid', role: 'group', 'aria-label': 'Plugboard letters' });
  let armed: string | null = null;

  const partnerOf = (c: string): string | null => {
    const p = state.settings.plugboard.find((x) => x.a === c || x.b === c);
    if (!p) return null;
    return p.a === c ? p.b : p.a;
  };
  const clickPlug = (c: string) => {
    const existing = partnerOf(c);
    if (existing) {
      // remove the pair
      state.settings.plugboard = state.settings.plugboard.filter(
        (x) => x.a !== c && x.b !== c,
      );
      armed = null;
    } else if (armed === null) {
      armed = c;
    } else if (armed === c) {
      armed = null;
    } else {
      state.settings.plugboard.push({ a: armed, b: c });
      armed = null;
    }
    renderPlug();
    refresh();
  };
  const renderPlug = () => {
    clear(plugGrid);
    for (const c of ALPHA) {
      const partner = partnerOf(c);
      const isArmed = armed === c;
      const btn = el(
        'button',
        {
          type: 'button',
          class: `plug-key${partner ? ' plugged' : ''}${isArmed ? ' armed' : ''}`,
          'aria-pressed': partner || isArmed ? 'true' : 'false',
          'aria-label': partner
            ? `${c}, plugged to ${partner}. Activate to unplug.`
            : isArmed
              ? `${c}, selected. Pick a second letter to wire, or press again to cancel.`
              : `${c}, unplugged`,
          onclick: () => clickPlug(c),
        },
        [c, partner ? el('sub', {}, [partner]) : null],
      );
      plugGrid.append(btn);
    }
    const pairs = state.settings.plugboard.map((p) => `${p.a}↔${p.b}`).join('  ');
    plugStatus.textContent = state.settings.plugboard.length
      ? `${state.settings.plugboard.length} pair(s): ${pairs}`
      : 'No pairs wired. Click a letter, then its partner.';
  };
  renderPlug();

  // --- rotor windows ---
  const windowCells = labels.map(() => el('span', { class: 'window-cell' }, ['A']));
  const stepBadge = el('span', { class: 'step-badge', 'aria-live': 'polite' });
  const rotorWindows = el('div', { class: 'rotor-windows', 'aria-label': 'Rotor windows' }, [
    el('span', { class: 'rotor-windows-label' }, ['Windows']),
    ...windowCells.map((c, i) =>
      el('span', { class: 'window-box' }, [el('small', {}, [labels[i].split(' ')[0]]), c]),
    ),
    stepBadge,
  ]);

  // --- keyboard + lampboard ---
  const lamps = new Map<string, HTMLElement>();
  const lampboard = el('div', { class: 'lampboard', 'aria-label': 'Lampboard (output)' });
  for (const row of KEYBOARD_ROWS) {
    const r = el('div', { class: 'kb-row' });
    for (const c of row) {
      const lamp = el('span', { class: 'lamp', 'data-letter': c }, [c]);
      lamps.set(c, lamp);
      r.append(lamp);
    }
    lampboard.append(r);
  }

  const keyboard = el('div', { class: 'keyboard', 'aria-label': 'Enigma keyboard' });
  for (const row of KEYBOARD_ROWS) {
    const r = el('div', { class: 'kb-row' });
    for (const c of row) {
      r.append(
        el(
          'button',
          {
            type: 'button',
            class: 'key',
            'aria-label': `Type ${c}`,
            onclick: () => {
              state.message += c;
              messageInput.value = state.message;
              refresh();
            },
          },
          [c],
        ),
      );
    }
    keyboard.append(r);
  }

  // --- message + output ---
  const messageInput = el('textarea', {
    id: 'message-input',
    class: 'mono',
    rows: '3',
    spellcheck: 'false',
    autocapitalize: 'characters',
    placeholder: 'Type a message — letters are encrypted, spaces/punctuation pass through…',
    oninput: () => {
      state.message = messageInput.value;
      refresh();
    },
  }) as HTMLTextAreaElement;

  const outputBox = el('output', { class: 'mono output-box', 'aria-live': 'polite' });
  const outRow = el('div', { class: 'io-row' }, [
    el('div', { class: 'io-col' }, [
      el('label', { for: 'message-input' }, ['Input']),
      messageInput,
    ]),
    el('div', { class: 'io-col' }, [
      el('div', { class: 'io-head' }, [el('span', {}, ['Output']), copyButton(() => state.output, 'Copy output')]),
      outputBox,
    ]),
  ]);

  const root = el('section', { class: 'panel machine', 'aria-labelledby': 'machine-h' }, [
    el('h2', { id: 'machine-h' }, ['1 · The Machine']),
    el('p', { class: 'lead' }, [
      'A faithful Enigma I (3-rotor Wehrmacht) simulation: plugboard → rotors → reflector → back. ',
      'Encryption is its own inverse — the same settings decrypt. ',
    ]),
    el('p', { class: 'aside' }, [
      'Not a history tour — for the narrative exhibit see the ',
      el('a', { href: 'https://ciphermuseum.com', target: '_blank', rel: 'noopener' }, ['Cipher Museum']),
      '. This is the technical companion: how it works, and (below) how it broke.',
    ]),
    el('div', { class: 'settings-grid' }, [...rotorCols]),
    el('div', { class: 'settings-row' }, [
      field('Reflector (UKW)', reflectorGroup),
    ]),
    el('fieldset', { class: 'plugboard' }, [
      el('legend', {}, ['Plugboard (Steckerbrett) — click a letter, then its partner']),
      plugGrid,
      plugStatus,
    ]),
    errorBox,
    rotorWindows,
    el('div', { class: 'console' }, [lampboard, keyboard]),
    outRow,
  ]);

  let lastPlugSig = '';
  const update = (s: AppState) => {
    // sync control values (e.g. after the Bombe loads a candidate)
    for (let i = 0; i < 3; i++) {
      rotorSelects[i].value = s.settings.rotorOrder[i];
      ringSelects[i].value = toChar(s.settings.ringSettings[i]);
      posSelects[i].value = toChar(s.settings.positions[i]);
    }
    for (const inp of reflectorInputs) inp.checked = inp.value === s.settings.reflector;

    // Only rebuild the plugboard when it actually changed — rebuilding on every
    // keystroke would steal keyboard focus from a plug key being navigated.
    const plugSig = s.settings.plugboard.map((p) => p.a + p.b).join('');
    if (plugSig !== lastPlugSig) {
      lastPlugSig = plugSig;
      renderPlug();
    }
    // Avoid clobbering the caret while the user is mid-edit: only assign when the
    // value genuinely differs (e.g. a candidate was loaded from the Bombe).
    if (messageInput.value !== s.message) messageInput.value = s.message;

    // rotor windows reflect the last keystroke's post-step positions
    const t = s.lastAlphaTrace;
    const pos = t ? t.rotorPositionsAfter : s.settings.positions;
    windowCells.forEach((cell, i) => {
      cell.textContent = toChar(pos[i]);
    });
    windowCells[0].classList.toggle('stepped', !!t && t.stepped[0]);
    windowCells[1].classList.toggle('double', !!t && t.doubleStep);
    stepBadge.textContent = t
      ? t.doubleStep
        ? '⚙ double-step! middle + left advanced'
        : t.stepped[0]
          ? '⚙ left advanced (carry)'
          : '⚙ right advanced'
      : '';
    stepBadge.className = `step-badge${t && t.doubleStep ? ' alarm' : ''}`;

    // lampboard
    for (const lamp of lamps.values()) lamp.classList.remove('lit');
    if (t) lamps.get(t.output)?.classList.add('lit');

    outputBox.textContent = s.output || '—';
  };

  return { root, update };
}

// --- small builders ---

function field(label: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'field' }, [el('span', { class: 'field-label' }, [label]), control]);
}

function letterSelect(ariaLabel: string, value: number): HTMLSelectElement {
  const sel = el('select', { 'aria-label': ariaLabel }) as HTMLSelectElement;
  for (let i = 0; i < 26; i++) {
    sel.append(el('option', { value: toChar(i) }, [`${toChar(i)} (${String(i + 1).padStart(2, '0')})`]));
  }
  sel.value = toChar(value);
  return sel;
}

// Re-export so other modules can build a quick machine for previews.
export { Machine };
