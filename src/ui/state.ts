// Shared, in-memory-only application state. Nothing is persisted (per spec).

import type { MachineSettings, PathTrace } from '../enigma/types';
import { Machine } from '../enigma/machine';
import type { Scope, RingSearch } from '../break/scenarios';

export interface AppState {
  settings: MachineSettings;
  message: string; // raw text typed into the machine
  output: string; // ciphertext / plaintext (operation is symmetric)
  traces: PathTrace[]; // one per input character
  lastAlphaTrace: PathTrace | null;

  // break workflow
  crib: string;
  breakCiphertext: string;
  selectedOffset: number | null;
  scope: Scope; // rotor-order search scope
  ringSearch: RingSearch; // advanced: search ring settings too
}

export function defaultRingSearch(): RingSearch {
  return { enabled: false, ranges: [[0, 0], [0, 0], [0, 25]] };
}

export function defaultSettings(): MachineSettings {
  return {
    rotorOrder: ['I', 'II', 'III'],
    ringSettings: [0, 0, 0],
    positions: [0, 0, 0],
    reflector: 'B',
    plugboard: [],
  };
}

export function createState(): AppState {
  return {
    settings: defaultSettings(),
    message: '',
    output: '',
    traces: [],
    lastAlphaTrace: null,
    crib: 'WETTERBERICHT',
    breakCiphertext: '',
    selectedOffset: null,
    scope: 'current',
    ringSearch: defaultRingSearch(),
  };
}

/** Run the whole message through a fresh machine, capturing per-char traces. */
export function recomputeMachine(state: AppState): void {
  const m = new Machine(state.settings);
  const traces: PathTrace[] = [];
  let output = '';
  let lastAlpha: PathTrace | null = null;
  for (const ch of state.message) {
    const t = m.encryptChar(ch, true) as PathTrace;
    traces.push(t);
    output += t.output;
    if (!t.passthrough) lastAlpha = t;
  }
  state.traces = traces;
  state.output = output;
  state.lastAlphaTrace = lastAlpha;
}
