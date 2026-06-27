// The Enigma machine: plugboard + rotor stack + reflector, with historically
// correct stepping (including the middle-rotor double-step anomaly) and an
// optional per-keystroke path trace.
//
// Signal path for one keypress:
//   plugboard -> R rotor -> M rotor -> L rotor -> reflector
//             -> L rotor -> M rotor -> R rotor -> plugboard
//
// Reciprocity (own inverse) and no-self-encryption are structural consequences
// of the reflector being a fixed-point-free involution and the path being
// symmetric. They are proven exhaustively in the tests.

import {
  ROTOR_WIRINGS,
  REFLECTOR_WIRINGS,
  toIdx,
  toChar,
  mod,
  wiringToPerm,
  invertPerm,
} from './wirings';
import type { MachineSettings, PathTrace, StageTrace, PlugPair } from './types';
import { rotorForward, rotorBackward } from './rotor';

interface RotorRuntime {
  name: string;
  perm: number[];
  inv: number[];
  notch: number; // window index that triggers turnover of the rotor to its left
  ring: number;
  position: number; // current window index 0-25
}

export class Machine {
  private rotors: RotorRuntime[]; // ordered LEFT .. RIGHT
  private reflector: number[];
  private reflectorName: string;
  private plug: number[]; // plugboard permutation (involution) over 0-25

  constructor(settings: MachineSettings) {
    validateSettings(settings);

    // M4 extension point: this assembly takes a variable-length rotor stack.
    // Adding a 4th (thin) rotor + a thin reflector would be additive here —
    // build the extra rotor with a non-stepping flag and select a thin UKW.
    this.rotors = settings.rotorOrder.map((name, i) => {
      const spec = ROTOR_WIRINGS[name];
      const perm = wiringToPerm(spec.wiring);
      return {
        name,
        perm,
        inv: invertPerm(perm),
        notch: toIdx(spec.notch),
        ring: mod(settings.ringSettings[i], 26),
        position: mod(settings.positions[i], 26),
      };
    });

    // M4 extension point: select thin reflectors (UKW-b/c) from an expanded set.
    this.reflector = wiringToPerm(REFLECTOR_WIRINGS[settings.reflector]);
    this.reflectorName = `UKW-${settings.reflector}`;
    this.plug = buildPlugboard(settings.plugboard);
  }

  /** Window positions [L, M, R] as 0-25 indices. */
  getPositions(): number[] {
    return this.rotors.map((r) => r.position);
  }

  /** Window positions as letters, e.g. ['A','D','U']. */
  getWindow(): string[] {
    return this.rotors.map((r) => toChar(r.position));
  }

  /** Advance the rotors by one keystroke without encrypting (used by the Bombe
   *  to roll the scrambler forward to a given keystroke index). */
  advance(): void {
    this.step();
  }

  private get right(): RotorRuntime {
    return this.rotors[this.rotors.length - 1];
  }
  private get middle(): RotorRuntime {
    return this.rotors[this.rotors.length - 2];
  }
  private get left(): RotorRuntime {
    return this.rotors[this.rotors.length - 3];
  }

  /**
   * Advance the rotors by one keystroke using the ratchet-and-pawl rules:
   *   - the right (fast) rotor always steps;
   *   - the middle rotor steps when the right rotor is at its notch OR when the
   *     middle rotor is itself at its notch (the double-step: the same pawl that
   *     pushes the left rotor also re-pushes the middle ratchet);
   *   - the left rotor steps when the middle rotor is at its notch.
   * Returns which rotors stepped [L,M,R] and whether a double-step occurred.
   */
  private step(): { stepped: boolean[]; doubleStep: boolean } {
    const rNotch = this.right.position === this.right.notch;
    const mNotch = this.middle.position === this.middle.notch;

    const stepLeft = mNotch;
    const stepMiddle = rNotch || mNotch;
    const doubleStep = mNotch; // middle advances "for itself" because of its own notch

    if (stepLeft) this.left.position = mod(this.left.position + 1, 26);
    if (stepMiddle) this.middle.position = mod(this.middle.position + 1, 26);
    this.right.position = mod(this.right.position + 1, 26);

    // stepped flags in L,M,R order
    return { stepped: [stepLeft, stepMiddle, true], doubleStep };
  }

  /** Pass a letter index through the rotor+reflector core only (no plugboard,
   *  no stepping). This is the "scrambler" permutation the Bombe reasons about. */
  private scramble(c: number): number {
    let x = c;
    for (let i = this.rotors.length - 1; i >= 0; i--) {
      const r = this.rotors[i];
      x = rotorForward(r.perm, x, r.position, r.ring);
    }
    x = this.reflector[x];
    for (let i = 0; i < this.rotors.length; i++) {
      const r = this.rotors[i];
      x = rotorBackward(r.inv, x, r.position, r.ring);
    }
    return x;
  }

  /** The current scrambler as a full 26-letter permutation (no stepping, no
   *  plugboard). It is a fixed-point-free involution. Used by the Bombe. */
  scramblerPermutation(): number[] {
    const out = new Array<number>(26);
    for (let i = 0; i < 26; i++) out[i] = this.scramble(i);
    return out;
  }

  /** The full input->output mapping at the CURRENT rotor state, INCLUDING the
   *  plugboard, without stepping. Like the scrambler it is a fixed-point-free
   *  involution — this is exactly the strip the Flaw section visualises: a
   *  permutation whose diagonal is provably empty (no letter maps to itself). */
  currentMapping(): number[] {
    const out = new Array<number>(26);
    for (let i = 0; i < 26; i++) out[i] = this.plug[this.scramble(this.plug[i])];
    return out;
  }

  /**
   * Encrypt one character. Steps the rotors first (as the real machine does),
   * then routes the signal. Non-alpha characters pass through unchanged and do
   * NOT advance the rotors (matching the convention documented in the UI).
   * Lowercase letters are uppercased.
   */
  encryptChar(ch: string, trace = false): PathTrace | string {
    const upper = ch.toUpperCase();
    const code = upper.charCodeAt(0) - 65;
    const isAlpha = code >= 0 && code < 26;

    if (!isAlpha) {
      if (!trace) return ch;
      const pos = this.getPositions();
      return {
        input: ch,
        output: ch,
        passthrough: true,
        stages: [],
        rotorPositionsBefore: pos,
        rotorPositionsAfter: pos,
        stepped: [false, false, false],
        doubleStep: false,
      };
    }

    const before = this.getPositions();
    const { stepped, doubleStep } = this.step();
    const after = this.getPositions();

    const stages: StageTrace[] = [];
    const record = (stage: string, detail: string, inN: number, outN: number) => {
      if (trace) stages.push({ stage, detail, inLetter: toChar(inN), outLetter: toChar(outN) });
    };

    let x = code;
    let prev = x;

    x = this.plug[x];
    record('Plugboard in', 'Stecker', prev, x);
    prev = x;

    // forward through rotors R -> M -> L
    const labelFor = (i: number) => {
      const tag = i === this.rotors.length - 1 ? 'R' : i === this.rotors.length - 2 ? 'M' : 'L';
      return `Rotor ${tag} (${this.rotors[i].name})`;
    };
    for (let i = this.rotors.length - 1; i >= 0; i--) {
      const r = this.rotors[i];
      x = rotorForward(r.perm, x, r.position, r.ring);
      record(labelFor(i), `${r.name} →`, prev, x);
      prev = x;
    }

    x = this.reflector[x];
    record('Reflector', this.reflectorName, prev, x);
    prev = x;

    // back through rotors L -> M -> R
    for (let i = 0; i < this.rotors.length; i++) {
      const r = this.rotors[i];
      x = rotorBackward(r.inv, x, r.position, r.ring);
      record(labelFor(i), `← ${r.name}`, prev, x);
      prev = x;
    }

    x = this.plug[x];
    record('Plugboard out', 'Stecker', prev, x);

    const output = toChar(x);
    if (!trace) return output;

    return {
      input: upper,
      output,
      passthrough: false,
      stages,
      rotorPositionsBefore: before,
      rotorPositionsAfter: after,
      stepped,
      doubleStep,
    };
  }

  /** Encrypt (or decrypt — the operation is identical) a whole string. */
  encrypt(text: string): string {
    let out = '';
    for (const ch of text) out += this.encryptChar(ch) as string;
    return out;
  }
}

// --- validation & helpers ---

export function validateSettings(s: MachineSettings): void {
  const n = s.rotorOrder.length;
  if (n < 3) throw new Error('Enigma I needs at least 3 rotors.');
  if (new Set(s.rotorOrder).size !== n) {
    throw new Error('Each rotor may be used only once (no duplicates).');
  }
  if (s.ringSettings.length !== n || s.positions.length !== n) {
    throw new Error('Ring settings and positions must match the rotor count.');
  }
  validatePlugboard(s.plugboard);
}

/** Validate plugboard pairs: each letter in at most one pair, no self-pairing. */
export function validatePlugboard(pairs: PlugPair[]): void {
  const seen = new Set<string>();
  for (const { a, b } of pairs) {
    const A = a.toUpperCase();
    const B = b.toUpperCase();
    if (A === B) throw new Error(`Cannot plug a letter to itself (${A}).`);
    if (toIdx(A) < 0 || toIdx(A) > 25 || toIdx(B) < 0 || toIdx(B) > 25) {
      throw new Error('Plugboard pairs must be A-Z letters.');
    }
    if (seen.has(A)) throw new Error(`${A} is already used in another plug pair.`);
    if (seen.has(B)) throw new Error(`${B} is already used in another plug pair.`);
    seen.add(A);
    seen.add(B);
  }
  if (pairs.length > 13) throw new Error('At most 13 plugboard pairs are possible.');
}

export function buildPlugboard(pairs: PlugPair[]): number[] {
  const map = Array.from({ length: 26 }, (_, i) => i);
  for (const { a, b } of pairs) {
    const A = toIdx(a.toUpperCase());
    const B = toIdx(b.toUpperCase());
    map[A] = B;
    map[B] = A;
  }
  return map;
}
