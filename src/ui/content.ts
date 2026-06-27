// Static context panels: the comparison thesis (why it looked unbreakable vs why
// it broke), the model-limits disclosure, and a correctness appendix whose test
// vectors are COMPUTED LIVE by the same engine — so they cannot drift — plus a
// glossary that fixes terminology.

import { el } from './dom';
import type { Panel } from './machine-panel';
import { Machine } from '../enigma/machine';
import { toChar } from '../enigma/wirings';
import type { MachineSettings } from '../enigma/types';

const noop = () => {};

// ---- comparison: secure-looking vs actually weak (chat.md #11) ----
export function buildComparisonPanel(): Panel {
  const col = (cls: string, head: string, items: [string, string][]) =>
    el('div', { class: `cmp-col ${cls}` }, [
      el('h3', {}, [head]),
      el('ul', { class: 'cmp-list' }, items.map(([icon, text]) =>
        el('li', {}, [el('span', { class: 'cmp-icon', 'aria-hidden': 'true' }, [icon]), text]),
      )),
    ]);

  const root = el('section', { class: 'panel comparison', 'aria-labelledby': 'cmp-h' }, [
    el('h2', { id: 'cmp-h' }, ['Why it looked unbreakable — and why it broke']),
    el('p', { class: 'lead' }, [
      'The takeaway is not merely “Enigma was broken,” but that a vast keyspace can fail when ',
      'exploitable structure leaks. Operators trusted the left column; cryptanalysts lived in the right.',
    ]),
    el('div', { class: 'cmp-grid' }, [
      col('cmp-strong', '🛡 Looked unbreakable', [
        ['#', '≈ 1.5 × 10²³ keys — rotor order, positions, rings and plugboard combined.'],
        ['#', 'Keys changed daily; yesterday’s break bought nothing today.'],
        ['#', 'Plugboard alone added ≈ 1.5 × 10¹⁴ pairings.'],
        ['#', 'Rotors stepped every keystroke — the substitution never repeated for 16,900 letters.'],
      ]),
      col('cmp-weak', '💥 Actually weak', [
        ['✗', 'No letter ever encrypts to itself — a free filter on every guess.'],
        ['✗', 'Predictable operator habits gave reliable cribs (WETTERBERICHT, fixed openings).'],
        ['✗', 'Cribs form menu loops that pin settings by contradiction.'],
        ['✗', 'The plugboard’s symmetry lets one guess propagate and self-refute mechanically.'],
      ]),
    ]),
    el('p', { class: 'cmp-thesis' }, [
      '⚑ Large keyspaces are necessary, not sufficient. Structure that survives the keyspace — ',
      'fixed points avoided, symmetry, predictable plaintext — is where ciphers actually fail.',
    ]),
  ]);
  return { root, update: noop };
}

// ---- model limits / historical boundaries (chat.md #8) ----
export function buildLimitsPanel(): Panel {
  const item = (h: string, body: string) => el('li', {}, [el('strong', {}, [h, ': ']), body]);
  const root = el('section', { class: 'panel limits', 'aria-labelledby': 'limits-h' }, [
    el('h2', { id: 'limits-h' }, ['Model limits — what this is and isn’t']),
    el('p', { class: 'lead' }, ['Precise boundaries, so the model is never mistaken for a complete simulator.']),
    el('ul', { class: 'limits-list' }, [
      item('Machine', 'Enigma I only — Wehrmacht 3-rotor, rotors I–V, reflectors UKW-B / UKW-C, ' +
        'historically-correct wirings and notches. No naval M4, no Lorenz.'),
      item('Bombe', 'A teaching-scale logical search, not a cycle-accurate emulation of the ' +
        'electromechanical hardware. It models the real deduction (menu propagation + contradiction), ' +
        'not the wiring of Turing’s machine.'),
      item('Ring search', 'Rings are assumed known by default (taken from Section 1). The advanced ' +
        'option searches them, but the space multiplies fast — guardrails warn before you commit.'),
      item('Plugboard deduction', 'Only Steckers that touch the menu’s letters are recovered. ' +
        'Pairs between two letters that never appear in the crib region are invisible to the search ' +
        '(they don’t affect the crib, so the stop still verifies).'),
      item('Toward M4', 'A naval break would need a 4th (thin) rotor, the thin UKW-b/c reflectors, and ' +
        'a longer rotor stack. The engine already takes a variable-length stack and pluggable reflectors ' +
        '— see the “M4 extension point” comments — so it is additive, not a rewrite.'),
    ]),
  ]);
  return { root, update: noop };
}

// ---- correctness appendix: live test vectors + invariants (chat.md #9, #14) ----
export function buildAppendixPanel(): Panel {
  const vector = (label: string, settings: MachineSettings, plain: string): HTMLElement => {
    const cipher = new Machine(settings).encrypt(plain);
    return el('tr', {}, [
      el('td', {}, [label]),
      el('td', { class: 'mono' }, [
        `${settings.rotorOrder.join('-')} · UKW-${settings.reflector} · ring ${settings.ringSettings.map(toChar).join('')} · pos ${settings.positions.map(toChar).join('')}`,
      ]),
      el('td', { class: 'mono' }, [plain]),
      el('td', { class: 'mono vec-out' }, [cipher]),
    ]);
  };

  // double-step window sequence, computed live
  const m = new Machine({ rotorOrder: ['I', 'II', 'III'], ringSettings: [0, 0, 0], positions: [0, 3, 20], reflector: 'B', plugboard: [] });
  const windows: string[] = [];
  for (let i = 0; i < 4; i++) {
    const t = m.encryptChar('A', true);
    if (typeof t !== 'string') windows.push(t.rotorPositionsAfter.map(toChar).join(''));
  }

  const invariant = (name: string, body: string, test: string) =>
    el('li', {}, [el('strong', {}, [name]), ' — ', body, ' ', el('code', {}, [test])]);

  const glossary = (a: string, b: string) => el('div', { class: 'gloss-row' }, [
    el('dt', {}, [a]), el('dd', {}, [b]),
  ]);

  const root = el('section', { class: 'panel appendix', 'aria-labelledby': 'appx-h' }, [
    el('h2', { id: 'appx-h' }, ['Appendix — correctness & terms']),
    el('p', { class: 'lead' }, [
      'A crypto demo earns trust by showing its work. These vectors are generated live by the same ',
      'engine the demo runs, so they cannot drift from the code.',
    ]),

    el('h3', {}, ['Test vectors (computed live)']),
    el('div', { class: 'table-scroll' }, [
      el('table', { class: 'vec-table' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Note']), el('th', {}, ['Settings']), el('th', {}, ['Plaintext']), el('th', {}, ['Ciphertext']),
        ])]),
        el('tbody', {}, [
          vector('Classic I-II-III', { rotorOrder: ['I', 'II', 'III'], ringSettings: [0, 0, 0], positions: [0, 0, 0], reflector: 'B', plugboard: [] }, 'AAAAA'),
          vector('Reflector C', { rotorOrder: ['I', 'II', 'III'], ringSettings: [0, 0, 0], positions: [0, 0, 0], reflector: 'C', plugboard: [] }, 'AAAAA'),
          vector('With ring DDD', { rotorOrder: ['IV', 'V', 'I'], ringSettings: [3, 3, 3], positions: [0, 0, 0], reflector: 'B', plugboard: [] }, 'HELLOENIGMA'),
        ]),
      ]),
    ]),
    el('p', { class: 'muted' }, [
      `Double-step window sequence (rotors I-II-III, start ADU): ${windows.join(' → ')} — ` +
        'the middle rotor drags the left on the third keystroke.',
    ]),

    el('h3', {}, ['Invariants the tests enforce']),
    el('ul', { class: 'invariants' }, [
      invariant('Reciprocity', 'identical settings make the machine its own inverse, decrypt(encrypt(x)) = x.', 'reciprocity property test'),
      invariant('No self-encryption', 'at any rotor state, no letter maps to itself (the empty diagonal).', 'exhaustive per-state test'),
      invariant('Stepping', 'turnover and the middle-rotor double-step match Enigma I.', 'ADU→ADV→AEW→BFX→BFY'),
      invariant('Standard wirings', 'rotors/reflectors are valid bijections matching the published tables.', 'bijection + table tests'),
      invariant('Honest Bombe', 'every surfaced stop re-decrypts the crib before it is shown.', 'end-to-end recovery test'),
    ]),

    el('h3', {}, ['Glossary']),
    el('dl', { class: 'glossary' }, [
      glossary('Grundstellung', 'the start position shown in the rotor windows (Section 1 “Start”).'),
      glossary('Ringstellung', 'the ring setting — the wiring’s offset inside the alphabet ring (“Ring”).'),
      glossary('Steckerbrett / Stecker', 'the plugboard and its letter pairs.'),
      glossary('UKW (Umkehrwalze)', 'the reflector (B or C here).'),
      glossary('Crib', 'a known or guessed fragment of plaintext.'),
      glossary('Menu', 'the letter-linkage graph a crib placement builds for the Bombe.'),
      glossary('Stop', 'a setting the Bombe surfaces as consistent — a candidate, verified against the crib, not a guaranteed solution.'),
    ]),
  ]);
  return { root, update: noop };
}
