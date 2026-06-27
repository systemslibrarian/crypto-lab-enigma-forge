// Pure rotor mapping primitives, parameterised by window position and ring
// setting. A rotor is just a permutation; rotation and Ringstellung are applied
// as index shifts at signal-entry and -exit time.
//
//   shift = position - ringSetting   (mod 26)
//   forward(c)  = perm[(c + shift) mod 26] - shift   (mod 26)
//   backward(c) = inv[(c + shift) mod 26]  - shift   (mod 26)
//
// The notch (turnover) is detected on the bare window position and is
// independent of the ring setting — historically the notch is carried on the
// alphabet ring, so a rotor always turns over at the same window letter.

import { mod } from './wirings';

export function rotorForward(perm: number[], c: number, position: number, ring: number): number {
  const shift = mod(position - ring, 26);
  return mod(perm[mod(c + shift, 26)] - shift, 26);
}

export function rotorBackward(inv: number[], c: number, position: number, ring: number): number {
  const shift = mod(position - ring, 26);
  return mod(inv[mod(c + shift, 26)] - shift, 26);
}
