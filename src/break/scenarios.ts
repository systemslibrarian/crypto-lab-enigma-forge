// Shareable scenarios — no backend. A Scenario captures everything needed to
// reproduce a demo: machine settings, the message, the crib, the loaded
// ciphertext + chosen placement, and the Bombe search scope. Scenarios encode
// to a URL hash (so a link reproduces the state) and to copyable JSON, and a
// handful of curated presets teach specific lessons.

import type { MachineSettings, RotorName, ReflectorName } from '../enigma/types';
import { Machine } from '../enigma/machine';
import { cleanText } from './crib';

export type Scope = 'current' | 'all';

export interface RingSearch {
  enabled: boolean;
  ranges: [number, number][]; // per rotor [lo,hi] inclusive (L,M,R)
}

export interface Scenario {
  v: 1;
  id?: string;
  name?: string;
  description?: string;
  settings: MachineSettings;
  message: string;
  crib: string;
  breakCiphertext: string;
  selectedOffset: number | null;
  scope: Scope;
  ringSearch?: RingSearch;
}

// ---- encode / decode ----

function base64urlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b64)));
}

export function encodeScenario(s: Scenario): string {
  return base64urlEncode(JSON.stringify(s));
}

export function decodeScenario(encoded: string): Scenario | null {
  try {
    const obj = JSON.parse(base64urlDecode(encoded));
    return validate(obj);
  } catch {
    return null;
  }
}

export function scenarioToHash(s: Scenario): string {
  return `#s=${encodeScenario(s)}`;
}

export function scenarioFromHash(hash: string): Scenario | null {
  const m = /[#&]s=([^&]+)/.exec(hash);
  return m ? decodeScenario(m[1]) : null;
}

export function scenarioToJSON(s: Scenario): string {
  return JSON.stringify(s, null, 2);
}

export function scenarioFromJSON(json: string): Scenario | null {
  try {
    return validate(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Minimal structural validation — enough to reject junk without overfitting. */
function validate(o: unknown): Scenario | null {
  if (!o || typeof o !== 'object') return null;
  const s = o as Record<string, unknown>;
  const set = s.settings as MachineSettings | undefined;
  if (
    !set ||
    !Array.isArray(set.rotorOrder) ||
    set.rotorOrder.length < 3 ||
    !Array.isArray(set.ringSettings) ||
    !Array.isArray(set.positions) ||
    typeof set.reflector !== 'string' ||
    !Array.isArray(set.plugboard)
  ) {
    return null;
  }
  // construct once to confirm the settings are actually valid
  try {
    new Machine(set);
  } catch {
    return null;
  }
  return {
    v: 1,
    id: typeof s.id === 'string' ? s.id : undefined,
    name: typeof s.name === 'string' ? s.name : undefined,
    description: typeof s.description === 'string' ? s.description : undefined,
    settings: set,
    message: typeof s.message === 'string' ? s.message : '',
    crib: typeof s.crib === 'string' ? s.crib : '',
    breakCiphertext: typeof s.breakCiphertext === 'string' ? s.breakCiphertext : '',
    selectedOffset:
      typeof s.selectedOffset === 'number' ? s.selectedOffset : null,
    scope: s.scope === 'all' ? 'all' : 'current',
    ringSearch:
      s.ringSearch && typeof s.ringSearch === 'object'
        ? (s.ringSearch as RingSearch)
        : undefined,
  };
}

// ---- preset builder ----

function make(
  id: string,
  name: string,
  description: string,
  settings: MachineSettings,
  message: string,
  crib: string,
  scope: Scope = 'current',
): Scenario {
  const cipher = new Machine(settings).encrypt(message);
  // find the true offset of the crib inside the (cleaned) message
  const cleanMsg = cleanText(message);
  const cleanCrib = cleanText(crib);
  const offsetInClean = cleanMsg.indexOf(cleanCrib);
  // the ciphertext is cleaned too for the break flow
  const breakCiphertext = cleanText(cipher);
  return {
    v: 1,
    id,
    name,
    description,
    settings,
    message,
    crib,
    breakCiphertext,
    selectedOffset: offsetInClean >= 0 ? offsetInClean : null,
    scope,
  };
}

const O = (
  rotorOrder: RotorName[],
  ringSettings: number[],
  positions: number[],
  reflector: ReflectorName,
  plugboard: { a: string; b: string }[] = [],
): MachineSettings => ({ rotorOrder, ringSettings, positions, reflector, plugboard });

// The canonical guided challenge: a believable intercept with a known crib and a
// modest plugboard, recoverable by the fast (current rotor order) scope.
export const CHALLENGE: Scenario = make(
  'challenge',
  'Break this message',
  'An intercepted weather report. The crib WETTERBERICHT is a near-certain opener. ' +
    'Place it, build the menu, run the Bombe, and load a stop back to read it.',
  O(['I', 'II', 'III'], [0, 0, 0], [7, 2, 19], 'B', [
    { a: 'A', b: 'R' },
    { a: 'F', b: 'L' },
  ]),
  'WETTERBERICHTFUERDIENACHTKEINEBESONDERENVORKOMMNISSE',
  'WETTERBERICHT',
);

export const PRESETS: Scenario[] = [
  CHALLENGE,
  make(
    'easy-crib',
    'Easy crib (no plugboard)',
    'A clean example with no Steckers — the deduced plugboard should come back empty, ' +
      'making the recovered rotor start easy to read.',
    O(['III', 'I', 'II'], [0, 0, 0], [4, 11, 22], 'B', []),
    'OBERKOMMANDODERWEHRMACHTMELDET',
    'OBERKOMMANDODERWEHRMACHT',
  ),
  make(
    'double-step',
    'Double-step demo',
    'Start positions A-D-U: type a few letters in Section 1 and watch the middle rotor ' +
      'drag the left rotor on the third keystroke (A-D-V, A-E-W, B-F-X).',
    O(['I', 'II', 'III'], [0, 0, 0], [0, 3, 20], 'B', []),
    'AAAAAAAA',
    'AAAA',
  ),
  make(
    'weak-menu',
    'Weak menu (few loops)',
    'A short crib of mostly distinct letters yields a near-loopless menu: the Bombe will ' +
      'return many coincidental stops. Watch the menu coach flag it.',
    O(['II', 'IV', 'V'], [0, 0, 0], [3, 14, 9], 'C', [{ a: 'Q', b: 'W' }]),
    'ANGRIFFXMORGEN',
    'ANGRIFF',
  ),
  make(
    'many-false-stops',
    'Many false stops',
    'An even shorter crib. The search space barely collapses — a vivid demonstration of why ' +
      'crib length and menu loops matter.',
    O(['V', 'III', 'I'], [0, 0, 0], [1, 1, 1], 'B', []),
    'KEINEXBESONDEREN',
    'KEINE',
  ),
];

export function presetById(id: string): Scenario | undefined {
  return PRESETS.find((p) => p.id === id);
}
