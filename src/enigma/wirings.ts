// Standard Wehrmacht Enigma I rotor and reflector wirings.
//
// These are FIXED, public, historically-correct permutations. Do not edit the
// strings — the tests assert they are valid bijections and match the published
// Enigma I tables. The entry/stator wheel (ETW) for Enigma I is the straight
// alphabet, so it is not represented separately.
//
// Each `wiring` string is read as: input contact A maps to wiring[0], B to
// wiring[1], ... (in the rotor's own A-position frame). The `notch` is the
// window letter at which the NEXT rotor to the left turns over.

import type { RotorName, ReflectorName } from './types';

export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface RotorSpec {
  wiring: string;
  notch: string; // single window letter that triggers turnover of the rotor to its left
}

export const ROTOR_WIRINGS: Record<RotorName, RotorSpec> = {
  I: { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
  II: { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
  III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
  IV: { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
  V: { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' },
};

// Reflectors (Umkehrwalze). Both are fixed-point-free involutions: every letter
// is paired with a different letter and pairing is symmetric. This is precisely
// what guarantees no-self-encryption AND reciprocity for the whole machine.
export const REFLECTOR_WIRINGS: Record<ReflectorName, string> = {
  B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
  C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL',
};

export const ROTOR_NAMES: RotorName[] = ['I', 'II', 'III', 'IV', 'V'];
export const REFLECTOR_NAMES: ReflectorName[] = ['B', 'C'];

// --- small helpers shared across the engine ---

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** 'A' -> 0 ... 'Z' -> 25 */
export function toIdx(c: string): number {
  return c.charCodeAt(0) - 65;
}

/** 0 -> 'A' ... 25 -> 'Z' (with wraparound) */
export function toChar(n: number): string {
  return String.fromCharCode(65 + mod(n, 26));
}

/** Convert a wiring string into a 0-25 permutation array. */
export function wiringToPerm(wiring: string): number[] {
  return Array.from(wiring, (c) => toIdx(c));
}

/** Inverse of a permutation array. */
export function invertPerm(perm: number[]): number[] {
  const inv = new Array<number>(perm.length);
  for (let i = 0; i < perm.length; i++) inv[perm[i]] = i;
  return inv;
}
