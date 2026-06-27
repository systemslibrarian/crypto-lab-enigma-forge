import { describe, it, expect } from 'vitest';
import { Machine } from '../src/enigma/machine';
import type { MachineSettings } from '../src/enigma/types';
import { findCribAlignments, cleanText } from '../src/break/crib';
import { buildMenu, menuCoach } from '../src/break/menu';
import { runBombe } from '../src/break/bombe';

describe('crib alignment (self-map rejection)', () => {
  it('rejects offsets where a crib letter sits over an equal ciphertext letter', () => {
    // ciphertext XYZAY, crib "AY": only offset 3 places A over A? check by hand
    const aligns = findCribAlignments('AY', 'XYZAY');
    // offsets 0..3
    expect(aligns.map((a) => a.offset)).toEqual([0, 1, 2, 3]);
    // offset 3: crib A,Y over A,Y -> both self-map -> invalid
    const o3 = aligns.find((a) => a.offset === 3)!;
    expect(o3.valid).toBe(false);
    expect(o3.conflicts).toEqual([0, 1]);
  });

  it('reports no alignments when the crib is longer than the ciphertext', () => {
    expect(findCribAlignments('TOOLONG', 'ABC')).toEqual([]);
  });

  it('Enigma output guarantees the true alignment is never self-map-rejected', () => {
    const s: MachineSettings = {
      rotorOrder: ['I', 'II', 'III'],
      ringSettings: [0, 0, 0],
      positions: [5, 12, 1],
      reflector: 'B',
      plugboard: [{ a: 'A', b: 'R' }],
    };
    const plain = 'WETTERBERICHTHEUTE';
    const cipher = new Machine(s).encrypt(plain);
    const crib = 'WETTERBERICHT';
    const aligns = findCribAlignments(crib, cipher);
    const trueOffset = aligns.find((a) => a.offset === 0)!;
    expect(trueOffset.valid).toBe(true); // true placement can never self-map
  });
});

describe('menu construction', () => {
  it('builds one edge per crib letter with absolute positions', () => {
    const menu = buildMenu('ABC', 'XYZAB', 1);
    expect(menu.edges.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(menu.edges[0]).toMatchObject({ plain: 'A', cipher: 'Y', position: 1 });
  });

  it('counts independent loops (edges - nodes + components)', () => {
    // crib A B  / cipher B A  at offset 0 -> nodes {A,B}, 2 edges, 1 component => 1 loop
    const menu = buildMenu('AB', 'BA', 0);
    expect(menu.nodes.sort()).toEqual(['A', 'B']);
    expect(menu.loops).toBe(1);
  });

  it('menu coach grades by loops', () => {
    expect(menuCoach({ loops: 0 } as never, 5).tone).toBe('bad');
    expect(menuCoach({ loops: 1, central: 'A', degree: { A: 2 } } as never, 8).tone).toBe('warn');
    expect(menuCoach({ loops: 3, central: 'A', degree: { A: 4 } } as never, 12).tone).toBe('good');
  });
});

describe('simulated Bombe end-to-end recovery', () => {
  it('recovers the rotor positions + Stecker that produced a ciphertext', () => {
    const truth: MachineSettings = {
      rotorOrder: ['I', 'II', 'III'],
      ringSettings: [0, 0, 0], // rings assumed known (AAA) for the search
      positions: [7, 2, 19], // the unknown Grundstellung to be recovered
      reflector: 'B',
      plugboard: [{ a: 'A', b: 'R' }, { a: 'F', b: 'L' }],
    };
    const plain = 'WETTERBERICHTFUERHEUTE';
    const crib = 'WETTERBERICHT';
    const offset = 4; // crib sits at offset 4 in "...." padded plaintext
    const message = 'XXXX' + plain; // pad so the crib is at offset 4
    const cipher = new Machine(truth).encrypt(message);

    // confirm the crib really sits where we say
    expect(cleanText(message).slice(offset, offset + crib.length)).toBe(crib);

    const menu = buildMenu(crib, cipher, offset);
    const result = runBombe(crib, cipher, menu, {
      reflector: 'B',
      ringSettings: [0, 0, 0],
      rotorOrders: [['I', 'II', 'III']], // search this order across all positions
    });

    const hit = result.candidates.find(
      (c) =>
        c.positions[0] === 7 &&
        c.positions[1] === 2 &&
        c.positions[2] === 19,
    );
    expect(hit, 'true Grundstellung must be among the Bombe candidates').toBeTruthy();
    expect(hit!.verified).toBe(true);

    // the deduced Stecker must include the plugboard pairs touching the crib
    const pairKeys = hit!.stecker.map((p) => [p.a, p.b].sort().join(''));
    expect(pairKeys).toContain('AR');
    expect(pairKeys).toContain('FL');

    // loading the candidate back should decrypt the crib region to the crib
    const recovered = new Machine({
      rotorOrder: hit!.rotorOrder,
      ringSettings: hit!.ringSettings,
      positions: hit!.positions,
      reflector: hit!.reflector,
      plugboard: hit!.stecker,
    });
    expect(recovered.encrypt(cipher).slice(offset, offset + crib.length)).toBe(crib);
  }, 30000);

  it('does not recover the true setting from a WRONG crib', () => {
    const truth: MachineSettings = {
      rotorOrder: ['I', 'II', 'III'],
      ringSettings: [0, 0, 0],
      positions: [7, 2, 19],
      reflector: 'B',
      plugboard: [{ a: 'A', b: 'R' }],
    };
    const cipher = new Machine(truth).encrypt('WETTERBERICHTFUERHEUTE');
    // a crib that is NOT the real plaintext at offset 0
    const wrongCrib = 'ANGRIFFXHEUTE';
    const menu = buildMenu(wrongCrib, cipher, 0);
    const result = runBombe(wrongCrib, cipher, menu, {
      reflector: 'B',
      ringSettings: [0, 0, 0],
      rotorOrders: [['I', 'II', 'III']],
    });
    // the real Grundstellung decrypts the cipher to the REAL plaintext, never the
    // wrong crib, so the true setting must not appear as a verified candidate
    const recoveredTrue = result.candidates.some(
      (c) => c.positions[0] === 7 && c.positions[1] === 2 && c.positions[2] === 19,
    );
    expect(recoveredTrue).toBe(false);
  }, 30000);

  it('a short, loopless menu is under-constrained (surfaces multiple stops)', () => {
    const truth: MachineSettings = {
      rotorOrder: ['I', 'II', 'III'],
      ringSettings: [0, 0, 0],
      positions: [1, 1, 1],
      reflector: 'B',
      plugboard: [],
    };
    const cipher = new Machine(truth).encrypt('ATTACK');
    const crib = 'ATTACK';
    const menu = buildMenu(crib, cipher, 0);
    const result = runBombe(crib, cipher, menu, {
      reflector: 'B',
      ringSettings: [0, 0, 0],
      rotorOrders: [['I', 'II', 'III']],
    });
    // the true setting is always among them...
    const hasTrue = result.candidates.some(
      (c) => c.positions[0] === 1 && c.positions[1] === 1 && c.positions[2] === 1,
    );
    expect(hasTrue).toBe(true);
    // ...but a tiny crib doesn't pin it down — several settings also fit
    expect(result.candidates.length).toBeGreaterThan(1);
  }, 30000);

  it('partitions every tested setting into contradiction / crib-reject / stop', () => {
    const truth: MachineSettings = {
      rotorOrder: ['I', 'II', 'III'],
      ringSettings: [0, 0, 0],
      positions: [7, 2, 19],
      reflector: 'B',
      plugboard: [{ a: 'A', b: 'R' }],
    };
    const cipher = new Machine(truth).encrypt('WETTERBERICHTHEUTE');
    const menu = buildMenu('WETTERBERICHT', cipher, 0);
    const progressTicks: number[] = [];
    const result = runBombe(
      'WETTERBERICHT',
      cipher,
      menu,
      { reflector: 'B', ringSettings: [0, 0, 0], rotorOrders: [['I', 'II', 'III']] },
      (p) => progressTicks.push(p.configsTested),
      500,
    );
    // the three buckets exactly account for every tested setting
    expect(result.contradictionRejects + result.cribRejects + result.stops).toBe(
      result.configsTested,
    );
    expect(result.stops).toBe(result.candidates.length);
    expect(result.configsTested).toBe(26 * 26 * 26);
    // progress was reported and is monotonic
    expect(progressTicks.length).toBeGreaterThan(1);
    for (let i = 1; i < progressTicks.length; i++) {
      expect(progressTicks[i]).toBeGreaterThanOrEqual(progressTicks[i - 1]);
    }
  }, 30000);

  it('recovers an unknown ring setting when asked to search it', () => {
    const truth: MachineSettings = {
      rotorOrder: ['I', 'II', 'III'],
      ringSettings: [0, 0, 3], // right ring = D, unknown to the search
      positions: [1, 1, 1],
      reflector: 'B',
      plugboard: [],
    };
    const cipher = new Machine(truth).encrypt('WETTERBERICHTHEUTE');
    const menu = buildMenu('WETTERBERICHT', cipher, 0);
    // jointly search the right ring (small window) and positions (small window
    // that contains the truth) — both unknowns are recovered together
    const result = runBombe('WETTERBERICHT', cipher, menu, {
      reflector: 'B',
      ringSettings: [0, 0, 0],
      rotorOrders: [['I', 'II', 'III']],
      ringRanges: [[0, 0], [0, 0], [0, 5]],
      positionRanges: [[0, 3], [0, 3], [0, 3]],
    });
    const hit = result.candidates.find(
      (c) => c.ringSettings[2] === 3 && c.positions.join(',') === '1,1,1',
    );
    expect(hit, 'true ring + position must be recovered').toBeTruthy();
  }, 60000);
});
