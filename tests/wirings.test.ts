import { describe, it, expect } from 'vitest';
import {
  ROTOR_WIRINGS,
  REFLECTOR_WIRINGS,
  ROTOR_NAMES,
  REFLECTOR_NAMES,
  wiringToPerm,
} from '../src/enigma/wirings';

const isBijection = (perm: number[]) =>
  perm.length === 26 && new Set(perm).size === 26 && perm.every((n) => n >= 0 && n < 26);

describe('rotor wirings', () => {
  it('match the published Enigma I tables exactly', () => {
    expect(ROTOR_WIRINGS.I.wiring).toBe('EKMFLGDQVZNTOWYHXUSPAIBRCJ');
    expect(ROTOR_WIRINGS.II.wiring).toBe('AJDKSIRUXBLHWTMCQGZNPYFVOE');
    expect(ROTOR_WIRINGS.III.wiring).toBe('BDFHJLCPRTXVZNYEIWGAKMUSQO');
    expect(ROTOR_WIRINGS.IV.wiring).toBe('ESOVPZJAYQUIRHXLNFTGKDCMWB');
    expect(ROTOR_WIRINGS.V.wiring).toBe('VZBRGITYUPSDNHLXAWMJQOFECK');
  });

  it('have the correct turnover notches', () => {
    expect([
      ROTOR_WIRINGS.I.notch,
      ROTOR_WIRINGS.II.notch,
      ROTOR_WIRINGS.III.notch,
      ROTOR_WIRINGS.IV.notch,
      ROTOR_WIRINGS.V.notch,
    ]).toEqual(['Q', 'E', 'V', 'J', 'Z']);
  });

  it('are valid bijections over 26 letters', () => {
    for (const name of ROTOR_NAMES) {
      expect(isBijection(wiringToPerm(ROTOR_WIRINGS[name].wiring))).toBe(true);
    }
  });
});

describe('reflector wirings', () => {
  it('match the published UKW-B / UKW-C tables', () => {
    expect(REFLECTOR_WIRINGS.B).toBe('YRUHQSLDPXNGOKMIEBFZCWVJAT');
    expect(REFLECTOR_WIRINGS.C).toBe('FVPJIAOYEDRZXWGCTKUQSBNMHL');
  });

  it('are fixed-point-free involutions (the no-self-encryption guarantee)', () => {
    for (const name of REFLECTOR_NAMES) {
      const perm = wiringToPerm(REFLECTOR_WIRINGS[name]);
      expect(isBijection(perm)).toBe(true);
      for (let i = 0; i < 26; i++) {
        expect(perm[i]).not.toBe(i); // no letter reflects to itself
        expect(perm[perm[i]]).toBe(i); // involution: pairing is symmetric
      }
    }
  });
});
