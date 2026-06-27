// Runs the (potentially multi-second) Bombe search off the main thread so the
// UI stays responsive. The worker rebuilds the menu from primitives so we don't
// have to structure-clone class-free plain data only.

import { buildMenu } from './menu';
import { runBombe, type BombeSearchSpec, type BombeResult } from './bombe';

export interface BombeRequest {
  crib: string;
  ciphertext: string;
  offset: number;
  spec: BombeSearchSpec;
}

self.onmessage = (e: MessageEvent<BombeRequest>) => {
  const { crib, ciphertext, offset, spec } = e.data;
  const menu = buildMenu(crib, ciphertext, offset);
  const result: BombeResult = runBombe(crib, ciphertext, menu, spec);
  (self as unknown as Worker).postMessage({ result, menu });
};
