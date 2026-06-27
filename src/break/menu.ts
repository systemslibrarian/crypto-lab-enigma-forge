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
