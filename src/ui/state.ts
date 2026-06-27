// Shared, in-memory-only application state. Nothing is persisted (per spec).

import type { MachineSettings, PathTrace } from '../enigma/types';
import { Machine } from '../enigma/machine';
import type { Scope, RingSearch, Scenario } from '../break/scenarios';

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

  // guided-progress tracking (drives the step tracker / success arc)
  bombeStops: number | null; // null = not run yet
  candidateLoaded: boolean; // a Bombe stop was loaded back into the machine
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
    bombeStops: null,
    candidateLoaded: false,
  };
}

/** Load a scenario into state (deep-copied so the preset stays pristine). */
export function applyScenario(state: AppState, s: Scenario): void {
  state.settings = {
    rotorOrder: [...s.settings.rotorOrder],
    ringSettings: [...s.settings.ringSettings],
    positions: [...s.settings.positions],
    reflector: s.settings.reflector,
    plugboard: s.settings.plugboard.map((p) => ({ ...p })),
  };
  state.message = s.message;
  state.crib = s.crib;
  state.breakCiphertext = s.breakCiphertext;
  state.selectedOffset = s.selectedOffset;
  state.scope = s.scope;
  state.ringSearch = s.ringSearch
    ? { enabled: s.ringSearch.enabled, ranges: s.ringSearch.ranges.map((r) => [...r] as [number, number]) }
    : defaultRingSearch();
  state.bombeStops = null;
  state.candidateLoaded = false;
}

/** Snapshot the shareable parts of the current state as a Scenario. */
export function scenarioFromState(state: AppState, name?: string): Scenario {
  return {
    v: 1,
    name,
    settings: state.settings,
    message: state.message,
    crib: state.crib,
    breakCiphertext: state.breakCiphertext,
    selectedOffset: state.selectedOffset,
    scope: state.scope,
    ringSearch: state.ringSearch,
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
