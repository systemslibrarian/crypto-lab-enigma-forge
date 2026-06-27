// Settings and trace types for the Enigma engine.

export type RotorName = 'I' | 'II' | 'III' | 'IV' | 'V';
export type ReflectorName = 'B' | 'C';

export interface PlugPair {
  a: string; // single uppercase letter
  b: string; // single uppercase letter, b !== a
}

/**
 * A full machine configuration. Arrays are ordered LEFT, MIDDLE, RIGHT to match
 * the physical layout (the right rotor is the fast rotor nearest the keyboard).
 *
 * The rotor stack is a variable-length array even though Enigma I uses exactly
 * three rotors — see the M4 extension point in machine.ts.
 */
export interface MachineSettings {
  rotorOrder: RotorName[]; // length 3 for Enigma I, left -> right
  ringSettings: number[]; // Ringstellung, 0-25 (A=0), same order
  positions: number[]; // Grundstellung, 0-25 (A=0), same order
  reflector: ReflectorName;
  plugboard: PlugPair[]; // Steckerbrett, 0-13 disjoint pairs
}

export interface StageTrace {
  stage: string; // human label, e.g. 'Plugboard in', 'Rotor R (III)'
  detail: string; // e.g. 'III' or 'UKW-B'
  inLetter: string;
  outLetter: string;
}

/** Full per-keystroke trace produced by Machine.encryptChar when tracing. */
export interface PathTrace {
  input: string;
  output: string;
  passthrough: boolean; // true when a non-alpha char passed through untouched
  stages: StageTrace[];
  rotorPositionsBefore: number[]; // L,M,R window indices before this keystroke's stepping
  rotorPositionsAfter: number[]; // L,M,R window indices used to encrypt (after stepping)
  stepped: boolean[]; // which rotors advanced this keystroke [L,M,R]
  doubleStep: boolean; // true when the middle rotor double-stepped this keystroke
}
