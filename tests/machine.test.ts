import { describe, it, expect } from 'vitest';
import { Machine } from '../src/enigma/machine';
import type { MachineSettings, RotorName, PathTrace } from '../src/enigma/types';
import { toIdx } from '../src/enigma/wirings';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function settings(over: Partial<MachineSettings> = {}): MachineSettings {
  return {
    rotorOrder: ['I', 'II', 'III'],
    ringSettings: [0, 0, 0],
    positions: [0, 0, 0],
    reflector: 'B',
    plugboard: [],
    ...over,
  };
}

// deterministic small PRNG so the property tests are reproducible
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROTORS: RotorName[] = ['I', 'II', 'III', 'IV', 'V'];

function randomSettings(rnd: () => number): MachineSettings {
  // pick 3 distinct rotors
  const pool = [...ROTORS];
  const order: RotorName[] = [];
  for (let i = 0; i < 3; i++) order.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const rand26 = () => Math.floor(rnd() * 26);
  // random small plugboard
  const letters = [...Array(26).keys()];
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const plugboard = [];
  const nPairs = Math.floor(rnd() * 11); // 0..10
  for (let i = 0; i < nPairs; i++) {
    plugboard.push({ a: ALPHA[letters[2 * i]], b: ALPHA[letters[2 * i + 1]] });
  }
  return {
    rotorOrder: order,
    ringSettings: [rand26(), rand26(), rand26()],
    positions: [rand26(), rand26(), rand26()],
    reflector: rnd() < 0.5 ? 'B' : 'C',
    plugboard,
  };
}

describe('reciprocity (the machine is its own inverse)', () => {
  it('decrypt(encrypt(x)) === x over many random settings and inputs', () => {
    const rnd = mulberry32(12345);
    for (let trial = 0; trial < 200; trial++) {
      const s = randomSettings(rnd);
      let text = '';
      const len = 1 + Math.floor(rnd() * 60);
      for (let i = 0; i < len; i++) text += ALPHA[Math.floor(rnd() * 26)];
      const ct = new Machine(s).encrypt(text);
      const back = new Machine(s).encrypt(ct);
      expect(back).toBe(text);
    }
  });
});

describe('no-self-encryption (the fatal flaw)', () => {
  it('no letter maps to itself — exhaustive over the alphabet at a fixed state', () => {
    const rnd = mulberry32(999);
    for (let trial = 0; trial < 60; trial++) {
      const s = randomSettings(rnd);
      // currentMapping is the full input->output permutation at one frozen rotor
      // state; assert its diagonal is empty for ALL 26 letters at once.
      const map = new Machine(s).currentMapping();
      for (let i = 0; i < 26; i++) expect(map[i]).not.toBe(i);
      // and it is an involution (reciprocity at the snapshot level)
      for (let i = 0; i < 26; i++) expect(map[map[i]]).toBe(i);
    }
  });

  it('holds exhaustively across consecutive keystrokes (stepping included)', () => {
    const m = new Machine(settings({ plugboard: [{ a: 'A', b: 'B' }, { a: 'C', b: 'D' }] }));
    for (let k = 0; k < 26 * 5; k++) {
      const letter = ALPHA[k % 26];
      expect(m.encryptChar(letter) as string).not.toBe(letter);
    }
  });
});

describe('stepping incl. the double-step anomaly', () => {
  it('reproduces the documented ADU -> ADV -> AEW -> BFX -> BFY sequence', () => {
    // rotors I (L), II (M, notch E), III (R, notch V); rings AAA; start A D U
    const m = new Machine(
      settings({ positions: [toIdx('A'), toIdx('D'), toIdx('U')] }),
    );
    const windows: string[] = [];
    const doubleSteps: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const t = m.encryptChar('A', true) as PathTrace;
      windows.push(t.rotorPositionsAfter.map((n) => ALPHA[n]).join(''));
      doubleSteps.push(t.doubleStep);
    }
    expect(windows).toEqual(['ADV', 'AEW', 'BFX', 'BFY']);
    // the double-step is the 3rd keystroke: middle E->F drags the left rotor A->B
    expect(doubleSteps).toEqual([false, false, true, false]);
  });
});

describe('known Enigma I test vector', () => {
  it('I-II-III, UKW-B, rings AAA, ground AAA, no plugs: AAAAA -> BDZGO', () => {
    const m = new Machine(settings());
    expect(m.encrypt('AAAAA')).toBe('BDZGO');
  });
});

describe('edge-case input conventions', () => {
  it('uppercases lowercase input', () => {
    const a = new Machine(settings()).encrypt('aaaaa');
    const b = new Machine(settings()).encrypt('AAAAA');
    expect(a).toBe(b);
  });

  it('passes non-alpha through unchanged and does not advance the rotors', () => {
    const withSpaces = new Machine(settings()).encrypt('AA AA');
    const noSpaces = new Machine(settings()).encrypt('AAAA');
    expect(withSpaces.replace(/ /g, '')).toBe(noSpaces);
    expect(withSpaces[2]).toBe(' ');
  });
});

describe('settings validation', () => {
  it('rejects duplicate rotors', () => {
    expect(() => new Machine(settings({ rotorOrder: ['I', 'I', 'III'] }))).toThrow(/once/i);
  });
  it('rejects self-pairing on the plugboard', () => {
    expect(() => new Machine(settings({ plugboard: [{ a: 'A', b: 'A' }] }))).toThrow(/itself/i);
  });
  it('rejects a letter used in two plug pairs', () => {
    expect(() =>
      new Machine(settings({ plugboard: [{ a: 'A', b: 'B' }, { a: 'A', b: 'C' }] })),
    ).toThrow(/already used/i);
  });
});
