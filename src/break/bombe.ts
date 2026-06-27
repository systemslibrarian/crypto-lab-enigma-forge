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
// same sanity check a Bombe operator performed at each stop. Every tested
// setting ends up in exactly one bucket: rejected by contradiction, rejected by
// the crib re-check, or surfaced as a stop.

import { Machine } from '../enigma/machine';
import { toIdx, toChar } from '../enigma/wirings';
import type { MachineSettings, PlugPair, RotorName, ReflectorName } from '../enigma/types';
import type { Menu } from './menu';

export interface BombeSearchSpec {
  reflector: ReflectorName;
  ringSettings: number[]; // base rings (used when not searching rings), length 3
  rotorOrders: RotorName[][]; // explicit list of orders to try
  // optional search windows; default to the full 26-wide range per rotor
  positionRanges?: [number, number][]; // [start,end] inclusive per rotor (L,M,R)
  ringRanges?: [number, number][]; // [start,end] inclusive per rotor (L,M,R)
}

export interface BombeCandidate {
  rotorOrder: RotorName[];
  positions: number[]; // recovered Grundstellung [L,M,R]
  ringSettings: number[];
  reflector: ReflectorName;
  stecker: PlugPair[]; // deduced plugboard pairs
  loopsClosed: number; // menu loops that closed consistently (confidence)
  verified: boolean; // crib region re-decrypts to the crib
  offset: number; // where the crib sits in the message
  decryptedCrib: string; // the crib window decrypted with this candidate (== crib)
}

export interface BombeResult {
  candidates: BombeCandidate[];
  configsTested: number;
  contradictionRejects: number; // configs killed because no Stecker hypothesis was consistent
  cribRejects: number; // configs consistent but failed the crib re-check
  stops: number; // verified candidates (== candidates.length)
  loopsInMenu: number;
  underConstrained: boolean; // menu has no loops -> deduction can't reject much
}

export interface BombeProgress {
  configsTested: number;
  total: number;
  contradictionRejects: number;
  cribRejects: number;
  stops: number;
  current: { rotorOrder: RotorName[]; positions: number[]; ringSettings: number[] };
}

export type ProgressFn = (p: BombeProgress) => void;

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

/** Cartesian product of inclusive ranges, e.g. [[0,1],[0,0],[2,3]] -> 4 tuples. */
function combos(ranges: [number, number][]): number[][] {
  let acc: number[][] = [[]];
  for (const [lo, hi] of ranges) {
    const next: number[][] = [];
    for (const prefix of acc) {
      for (let v = lo; v <= hi; v++) next.push([...prefix, v]);
    }
    acc = next;
  }
  return acc;
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
function propagate(
  edges: { p: number; c: number; pos: number }[],
  scr: number[][],
  central: number,
  h: number,
): Propagation {
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

  // Repeatedly sweep edges, deriving the unknown endpoint from the known one.
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const s = scr[e.pos];
      const sp = steck.get(e.p);
      const sc = steck.get(e.c);
      // relationship: steck(cipher) = S(steck(plain))
      if (sp !== undefined) {
        const want = s[sp];
        if (sc === undefined) {
          if (!assign(e.c, want)) return { ok: false, loopsClosed, steck };
          changed = true;
        } else if (sc !== want) {
          return { ok: false, loopsClosed, steck };
        } else {
          loopsClosed++; // both ends known and consistent -> a loop closed
        }
      } else if (sc !== undefined) {
        const want = s[sc]; // S is an involution, so same permutation backwards
        if (!assign(e.p, want)) return { ok: false, loopsClosed, steck };
        changed = true;
      }
    }
  }

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
 * @param spec       search space (rotor orders, rings, reflector, optional windows)
 * @param onProgress optional callback fired roughly every `progressEvery` configs
 */
export function runBombe(
  crib: string,
  ciphertext: string,
  menu: Menu,
  spec: BombeSearchSpec,
  onProgress?: ProgressFn,
  progressEvery = 800,
): BombeResult {
  const candidates: BombeCandidate[] = [];
  let configsTested = 0;
  let contradictionRejects = 0;
  let cribRejects = 0;

  const maxPos = menu.edges.reduce((m, e) => Math.max(m, e.position), 0);
  const central = toIdx(menu.central);
  const offset = menu.edges.reduce((m, e) => Math.min(m, e.position), maxPos);

  const positionRanges = spec.positionRanges ?? ([[0, 25], [0, 25], [0, 25]] as [number, number][]);
  const ringRanges =
    spec.ringRanges ??
    (spec.ringSettings.map((v) => [v, v]) as [number, number][]);

  const positionCombos = combos(positionRanges);
  const ringCombos = combos(ringRanges);
  const total = spec.rotorOrders.length * ringCombos.length * positionCombos.length;

  // precompute the edge index list once (menu letters -> indices)
  const edgeIdx = menu.edges.map((e) => ({ p: toIdx(e.plain), c: toIdx(e.cipher), pos: e.position }));

  for (const rotorOrder of spec.rotorOrders) {
    for (const rings of ringCombos) {
      for (const start of positionCombos) {
        configsTested++;
        const scr = scramblersUpTo(rotorOrder, rings, start, spec.reflector, maxPos);

        let consistentFound = false;
        let verifiedThis = false;
        for (let h = 0; h < 26; h++) {
          const prop = propagate(edgeIdx, scr, central, h);
          if (!prop.ok) continue;
          consistentFound = true;
          const stecker = steckToPairs(prop.steck);
          if (!verifyCrib(crib, ciphertext, offset, rotorOrder, rings, start, spec.reflector, stecker)) {
            continue;
          }
          candidates.push({
            rotorOrder,
            positions: start,
            ringSettings: rings,
            reflector: spec.reflector,
            stecker,
            loopsClosed: prop.loopsClosed,
            verified: true,
            offset,
            decryptedCrib: crib,
          });
          verifiedThis = true;
          break; // one confirmed stop per config is enough
        }
        if (verifiedThis) {
          /* counted via candidates.length */
        } else if (consistentFound) {
          cribRejects++;
        } else {
          contradictionRejects++;
        }

        if (onProgress && configsTested % progressEvery === 0) {
          onProgress({
            configsTested,
            total,
            contradictionRejects,
            cribRejects,
            stops: candidates.length,
            current: { rotorOrder, positions: start, ringSettings: rings },
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.loopsClosed - a.loopsClosed);

  if (onProgress) {
    onProgress({
      configsTested,
      total,
      contradictionRejects,
      cribRejects,
      stops: candidates.length,
      current: {
        rotorOrder: spec.rotorOrders[spec.rotorOrders.length - 1],
        positions: [25, 25, 25],
        ringSettings: spec.ringSettings,
      },
    });
  }

  return {
    candidates,
    configsTested,
    contradictionRejects,
    cribRejects,
    stops: candidates.length,
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
  const settings: MachineSettings = { rotorOrder, ringSettings, positions, reflector, plugboard: stecker };
  let m: Machine;
  try {
    m = new Machine(settings);
  } catch {
    return false; // a deduced Stecker can be self-inconsistent; reject the stop
  }
  for (let i = 0; i < offset; i++) m.advance();
  for (let i = 0; i < crib.length; i++) {
    if ((m.encryptChar(ciphertext[offset + i]) as string) !== crib[i]) return false;
  }
  return true;
}
