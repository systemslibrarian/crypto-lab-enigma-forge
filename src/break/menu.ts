// Menu construction. Given a crib aligned to ciphertext at a chosen offset, the
// "menu" is the letter-linkage graph the Bombe wires up: nodes are letters,
// each edge joins a plaintext letter to its ciphertext letter at a specific
// keystroke position (which fixes the scrambler permutation at that step).
//
// Loops in the menu are what make the Bombe powerful: a loop forces a chain of
// plugboard deductions back onto itself, so a wrong rotor-position guess almost
// always produces a contradiction.

import { cleanText } from './crib';

export interface MenuEdge {
  plain: string; // plaintext letter (crib)
  cipher: string; // ciphertext letter
  position: number; // absolute keystroke index in the message (offset + i)
  label: string; // 1-based position label for display
}

export interface Menu {
  edges: MenuEdge[];
  nodes: string[]; // distinct letters, sorted
  degree: Record<string, number>; // how many edges touch each letter
  central: string; // highest-degree letter (the Bombe's test register)
  components: number; // connected components over the node set
  loops: number; // independent loops = edges - nodes + components
}

/** Build the menu for a crib placed at `offset` against `ciphertext`. */
export function buildMenu(crib: string, ciphertext: string, offset: number): Menu {
  const c = cleanText(crib);
  const ct = cleanText(ciphertext);
  const edges: MenuEdge[] = [];
  for (let i = 0; i < c.length; i++) {
    const pos = offset + i;
    edges.push({ plain: c[i], cipher: ct[pos], position: pos, label: String(pos + 1) });
  }

  const degree: Record<string, number> = {};
  const adj: Record<string, Set<string>> = {};
  for (const e of edges) {
    for (const n of [e.plain, e.cipher]) {
      degree[n] = (degree[n] ?? 0) + 1;
      adj[n] ??= new Set();
    }
    adj[e.plain].add(e.cipher);
    adj[e.cipher].add(e.plain);
  }

  const nodes = Object.keys(degree).sort();
  let central = nodes[0] ?? '';
  for (const n of nodes) if ((degree[n] ?? 0) > (degree[central] ?? 0)) central = n;

  // connected components via union-find-ish DFS
  const seen = new Set<string>();
  let components = 0;
  for (const start of nodes) {
    if (seen.has(start)) continue;
    components++;
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      if (seen.has(u)) continue;
      seen.add(u);
      for (const v of adj[u]) if (!seen.has(v)) stack.push(v);
    }
  }

  const loops = edges.length - nodes.length + components;

  return { edges, nodes, degree, central, components, loops };
}

export interface MenuCoach {
  tone: 'good' | 'warn' | 'bad';
  headline: string;
  tips: string[];
}

/**
 * Turn raw menu stats into actionable cryptanalytic judgement. Loops are the
 * decisive factor: each independent loop lets the Bombe reject ~25/26 of wrong
 * guesses, so loops are roughly worth a factor of 26 in discrimination.
 */
export function menuCoach(menu: Menu, cribLength: number): MenuCoach {
  const tips: string[] = [];
  const maxDegree = menu.central ? menu.degree[menu.central] : 0;

  if (menu.loops >= 2) {
    tips.push(`${menu.loops} loops — strong leverage; each loop kills ~25/26 of wrong settings.`);
    if (cribLength >= 10) tips.push('Crib is long enough to pin the Stecker too — expect few, clean stops.');
    return {
      tone: 'good',
      headline: 'Strong menu — loops + length give the Bombe real bite.',
      tips,
    };
  }

  if (menu.loops === 1) {
    tips.push('One loop — usable, but expect a small handful of stops to verify.');
    tips.push('A longer crib or a different surviving offset may add a second loop.');
    return { tone: 'warn', headline: 'Usable menu — one loop closes the deduction once.', tips };
  }

  // no loops
  tips.push('No loops — the deduction is a tree, so almost any setting stays consistent.');
  tips.push('Expect many coincidental stops, weeded out only by the crib re-check.');
  if (cribLength < 10) tips.push('Try a longer crib — more letters means more chances for a loop.');
  if (maxDegree <= 1) tips.push('No repeated letters link the menu; a crib with repeats helps.');
  tips.push('Try a different surviving offset — placement changes which letters link up.');
  return {
    tone: 'bad',
    headline: 'Weak menu — no loops, so the Bombe leans on the crib re-check alone.',
    tips,
  };
}
