import { describe, it, expect } from 'vitest';
import {
  encodeScenario,
  decodeScenario,
  scenarioToHash,
  scenarioFromHash,
  scenarioToJSON,
  scenarioFromJSON,
  PRESETS,
  CHALLENGE,
  presetById,
  type Scenario,
} from '../src/break/scenarios';
import { Machine } from '../src/enigma/machine';
import { cleanText, findCribAlignments } from '../src/break/crib';
import { buildMenu } from '../src/break/menu';

describe('scenario encode/decode round-trips', () => {
  it('survives URL-hash encoding', () => {
    const hash = scenarioToHash(CHALLENGE);
    expect(hash.startsWith('#s=')).toBe(true);
    const back = scenarioFromHash(hash);
    expect(back).toEqual(CHALLENGE);
  });

  it('survives base64 + JSON round-trips', () => {
    const back = decodeScenario(encodeScenario(CHALLENGE));
    expect(back).toEqual(CHALLENGE);
    const viaJson = scenarioFromJSON(scenarioToJSON(CHALLENGE));
    expect(viaJson).toEqual(CHALLENGE);
  });

  it('finds the scenario inside a longer hash with other params', () => {
    expect(scenarioFromHash(`#foo=1&s=${encodeScenario(CHALLENGE)}&bar=2`)).toEqual(CHALLENGE);
  });

  it('rejects junk and invalid settings', () => {
    expect(decodeScenario('not-base64!!')).toBeNull();
    expect(scenarioFromJSON('{"v":1}')).toBeNull();
    const bad = JSON.stringify({ ...CHALLENGE, settings: { ...CHALLENGE.settings, rotorOrder: ['I', 'I', 'I'] } });
    expect(scenarioFromJSON(bad)).toBeNull(); // duplicate rotors -> Machine throws
  });
});

describe('presets are internally consistent', () => {
  for (const p of PRESETS) {
    it(`${p.id}: ciphertext decrypts back to the message`, () => {
      const plain = new Machine(p.settings).encrypt(p.breakCiphertext);
      expect(plain).toBe(cleanText(p.message));
    });

    it(`${p.id}: crib sits at the declared offset`, () => {
      if (p.selectedOffset == null) return;
      const crib = cleanText(p.crib);
      expect(cleanText(p.message).slice(p.selectedOffset, p.selectedOffset + crib.length)).toBe(crib);
      // and the true placement is never self-map-rejected
      const aligns = findCribAlignments(crib, p.breakCiphertext);
      const atTrue = aligns.find((a) => a.offset === p.selectedOffset)!;
      expect(atTrue.valid).toBe(true);
    });
  }
});

describe('curated presets teach their lessons', () => {
  it('the challenge is solvable: a valid placement with a loopy menu exists', () => {
    const menu = buildMenu(cleanText(CHALLENGE.crib), CHALLENGE.breakCiphertext, CHALLENGE.selectedOffset!);
    expect(menu.loops).toBeGreaterThan(0);
  });

  it('weak-menu really is loop-poor', () => {
    const s = presetById('weak-menu') as Scenario;
    const menu = buildMenu(cleanText(s.crib), s.breakCiphertext, s.selectedOffset!);
    expect(menu.loops).toBeLessThanOrEqual(1);
  });

  it('double-step preset triggers a double-step on the 3rd keystroke', () => {
    const s = presetById('double-step') as Scenario;
    const m = new Machine(s.settings);
    const flags: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const t = m.encryptChar('A', true);
      if (typeof t !== 'string') flags.push(t.doubleStep);
    }
    expect(flags).toEqual([false, false, true, false]);
  });
});
