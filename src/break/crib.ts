// Crib placement: find every alignment of a known/guessed plaintext fragment
// against a ciphertext, rejecting offsets that would require Enigma to encrypt a
// letter to itself. That rejection is only possible BECAUSE of the machine's
// fatal no-self-encryption property — the same flaw the Bombe exploits.

import { toIdx } from '../enigma/wirings';

/** Uppercase and strip everything that is not A-Z. */
export function cleanText(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

export interface Alignment {
  offset: number; // index in ciphertext where the crib's first letter sits
  valid: boolean; // true when no self-map conflict occurs at this offset
  conflicts: number[]; // crib indices i where crib[i] === ciphertext[offset+i]
}

/**
 * Return one Alignment per legal offset (0 .. cipher.length - crib.length).
 * `valid` is false when any crib letter would sit above an identical ciphertext
 * letter — an impossible alignment, since Enigma never maps a letter to itself.
 */
export function findCribAlignments(crib: string, ciphertext: string): Alignment[] {
  const c = cleanText(crib);
  const ct = cleanText(ciphertext);
  const out: Alignment[] = [];
  if (c.length === 0 || c.length > ct.length) return out;

  const maxOffset = ct.length - c.length;
  for (let offset = 0; offset <= maxOffset; offset++) {
    const conflicts: number[] = [];
    for (let i = 0; i < c.length; i++) {
      if (toIdx(c[i]) === toIdx(ct[offset + i])) conflicts.push(i);
    }
    out.push({ offset, valid: conflicts.length === 0, conflicts });
  }
  return out;
}
