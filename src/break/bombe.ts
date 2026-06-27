// Simulated Bombe. This is a TEACHING-SCALE logical search, not a cycle-accurate
// emulation of the 1940s electromechanical hardware. It exploits the same real
// deduction the historical Bombe did:
//
//   For a guessed rotor order + start position, the scrambler permutation at
//   each menu keystroke is known. The unknown plugboard (Stecker) S relates
//   plaintext to ciphertext by  S(cipher) = scrambler( S(plain) ). Hypothesise
//   the Stecker partner of the menu's busiest letter, then propagate that guess
//   around the menu's edges. A loop in the menu feeds the deduction back on
//   itself: if it closes consistently the guess survives; if it forces a letter
//   to two different partners (or violates the plugboard's own symmetry) the
//   branch dies on a CONTRADICTION — exactly how a wrong setting is rejected.
//
// Surviving stops are then verified by actually decrypting the crib region, the
// same sanity check a Bombe operator performed at each stop.

import { Machine } from '../enigma/machine';
import { toIdx, toChar } from '../enigma/wirings';
import type { MachineSettings, PlugPair, RotorName, ReflectorName } from '../enigma/types';
import type { Menu } from './menu';

export interface BombeSearchSpec {
  reflector: ReflectorName;
  ringSettings: number[]; // assumed known (often AAA for teaching), length 3
  rotorOrders: RotorName[][]; // explicit list of orders to try
  // optional position window; defaults to the full 26^3 space per rotor order
  positionRanges?: [number, number][]; // [start,end] inclusive per rotor (L,M,R)
}

export interface BombeCandidate {
  rotorOrder: RotorName[];
  positions: number[]; // recovered Grundstellung [L,M,R]
  ringSettings: number[];
  reflector: ReflectorName;
  stecker: PlugPair[]; // deduced plugboard pairs
  loopsClosed: number; // menu loops that closed consistently (confidence)
  verified: boolean; // crib region re-decrypts to the crib
}

export interface BombeResult {
  candidates: BombeCandidate[];
  configsTested: number;
  loopsInMenu: number;
  underConstrained: boolean; // menu has no loops -> deduction can't reject much
}

/** All distinct ordered selections of `k` rotors from `set`. */
export function rotorOrderPermutations(set: RotorName[], k = 3): RotorName[][] {
  const out: RotorName[][] = [];
  const pick = (chosen: RotorName[], rest: RotorName[]) => {
    if (chosen.length === k) {
      out.push(chosen.slice());
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      pick([...chosen, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  pick([], set);
  return out;
}

/** Build the scrambler permutation used at each absolute keystroke index up to
 *  maxPos (inclusive), for a plugboard-free machine at the given start. */
function scramblersUpTo(
  rotorOrder: RotorName[],
  ringSettings: number[],
  positions: number[],
  reflector: ReflectorName,
  maxPos: number,
): number[][] {
  const m = new Machine({ rotorOrder, ringSettings, positions, reflector, plugboard: [] });
  const scr: number[][] = [];
  for (let p = 0; p <= maxPos; p++) {
    m.advance(); // character at index p is encrypted AFTER stepping
    scr[p] = m.scramblerPermutation();
  }
  return scr;
}

interface Propagation {
  ok: boolean;
  loopsClosed: number;
  steck: Map<number, number>; // letter idx -> plug partner idx
}

/**
 * Propagate one Stecker hypothesis (central letter -> partner `h`) around the
 * menu using the supplied scramblers. Returns whether it stayed consistent and
 * how many redundant (loop-closing) edges confirmed without contradiction.
 */
function propagate(menu: Menu, scr: number[][], central: number, h: number): Propagation {
  const steck = new Map<number, number>();
  let loopsClosed = 0;

  // assign u<->v as a plug pair; false on any contradiction with prior knowledge
  const assign = (u: number, v: number): boolean => {
    const cu = steck.get(u);
    if (cu !== undefined && cu !== v) return false;
    const cv = steck.get(v);
    if (cv !== undefined && cv !== u) return false;
    steck.set(u, v);
    steck.set(v, u); // plugboard is an involution
    return true;
  };

  if (!assign(central, h)) return { ok: false, loopsClosed: 0, steck };

  const edges = menu.edges.map((e) => ({
    p: toIdx(e.plain),
    c: toIdx(e.cipher),
    s: scr[e.position],
  }));

  // Repeatedly sweep edges, deriving the unknown endpoint from the known one.
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const sp = steck.get(e.p);
      const sc = steck.get(e.c);
      // relationship: steck(cipher) = S(steck(plain))
      if (sp !== undefined) {
        const want = e.s[sp];
        if (sc === undefined) {
          if (!assign(e.c, want)) return { ok: false, loopsClosed, steck };
          changed = true;
        } else if (sc !== want) {
          return { ok: false, loopsClosed, steck };
        } else {
          // both ends known and consistent -> this edge closed a loop
          loopsClosed++;
        }
      } else if (sc !== undefined) {
        const want = e.s[sc]; // S is an involution, so same permutation backwards
        if (!assign(e.p, want)) return { ok: false, loopsClosed, steck };
        changed = true;
      }
    }
  }

  // loopsClosed double-counts (each loop edge can be seen twice across sweeps);
  // it is only used as a monotonic confidence signal, so cap it sanely.
  return { ok: true, loopsClosed, steck };
}

function steckToPairs(steck: Map<number, number>): PlugPair[] {
  const pairs: PlugPair[] = [];
  for (const [u, v] of steck) {
    if (u < v) pairs.push({ a: toChar(u), b: toChar(v) });
  }
  return pairs;
}

/**
 * Run the simulated Bombe.
 *
 * @param crib       known plaintext fragment (cleaned)
 * @param ciphertext full ciphertext (cleaned)
 * @param menu       menu built from this crib/offset
 * @param spec       search space (rotor orders, rings, reflector, optional window)
 */
export function runBombe(
  crib: string,
  ciphertext: string,
  menu: Menu,
  spec: BombeSearchSpec,
): BombeResult {
  const candidates: BombeCandidate[] = [];
  let configsTested = 0;

  const maxPos = menu.edges.reduce((m, e) => Math.max(m, e.position), 0);
  const central = toIdx(menu.central);
  // the crib occupies positions [offset .. offset+crib.length-1]; offset = min edge pos
  const offset = menu.edges.reduce((m, e) => Math.min(m, e.position), maxPos);

  const ranges: [number, number][] = spec.positionRanges ?? [
    [0, 25],
    [0, 25],
    [0, 25],
  ];

  for (const rotorOrder of spec.rotorOrders) {
    for (let l = ranges[0][0]; l <= ranges[0][1]; l++) {
      for (let mPos = ranges[1][0]; mPos <= ranges[1][1]; mPos++) {
        for (let r = ranges[2][0]; r <= ranges[2][1]; r++) {
          configsTested++;
          const start = [l, mPos, r];
          const scr = scramblersUpTo(rotorOrder, spec.ringSettings, start, spec.reflector, maxPos);

          // Try every Stecker partner for the central letter. A wrong rotor
          // position usually contradicts on the menu loops; survivors are then
          // verified by re-decrypting the crib region (the operator's check at a
          // "stop"). Record the first hypothesis that both stays consistent AND
          // regenerates the crib.
          for (let h = 0; h < 26; h++) {
            const prop = propagate(menu, scr, central, h);
            if (!prop.ok) continue;
            const stecker = steckToPairs(prop.steck);
            if (
              !verifyCrib(
                crib,
                ciphertext,
                offset,
                rotorOrder,
                spec.ringSettings,
                start,
                spec.reflector,
                stecker,
              )
            ) {
              continue;
            }
            candidates.push({
              rotorOrder,
              positions: start,
              ringSettings: spec.ringSettings,
              reflector: spec.reflector,
              stecker,
              loopsClosed: prop.loopsClosed,
              verified: true,
            });
            break; // one confirmed stop per config is enough
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.loopsClosed - a.loopsClosed);
  return {
    candidates,
    configsTested,
    loopsInMenu: menu.loops,
    underConstrained: menu.loops <= 0,
  };
}

/**
 * Decrypt just the crib region with a candidate setting and confirm it matches
 * the crib. Stepping is input-independent, so we advance the machine `offset`
 * keystrokes to reach the crib's starting rotor state, then decrypt the crib.
 */
function verifyCrib(
  crib: string,
  ciphertext: string,
  offset: number,
  rotorOrder: RotorName[],
  ringSettings: number[],
  positions: number[],
  reflector: ReflectorName,
  stecker: PlugPair[],
): boolean {
  const settings: MachineSettings = {
    rotorOrder,
    ringSettings,
    positions,
    reflector,
    plugboard: stecker,
  };
  let m: Machine;
  try {
    m = new Machine(settings);
  } catch {
    return false; // a deduced Stecker can be self-inconsistent; reject the stop
  }
  // Stepping is input-independent, so advancing `offset` keystrokes lands the
  // machine in the crib's starting rotor state. Decrypting the ciphertext crib
  // region with the candidate Stecker must reproduce the crib.
  for (let i = 0; i < offset; i++) m.advance();
  for (let i = 0; i < crib.length; i++) {
    if ((m.encryptChar(ciphertext[offset + i]) as string) !== crib[i]) return false;
  }
  return true;
}
