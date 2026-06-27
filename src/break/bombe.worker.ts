// Runs the (potentially multi-second) Bombe search off the main thread so the
// UI stays responsive, streaming progress events as the search space collapses.
// Cancellation is by the main thread terminating the worker.

import { buildMenu } from './menu';
import { runBombe, type BombeSearchSpec, type BombeResult, type BombeProgress } from './bombe';

export interface BombeRequest {
  crib: string;
  ciphertext: string;
  offset: number;
  spec: BombeSearchSpec;
}

export type BombeWorkerMessage =
  | { type: 'progress'; progress: BombeProgress; elapsedMs: number }
  | { type: 'done'; result: BombeResult; elapsedMs: number };

const post = (m: BombeWorkerMessage) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<BombeRequest>) => {
  const { crib, ciphertext, offset, spec } = e.data;
  const menu = buildMenu(crib, ciphertext, offset);
  const start = performance.now();
  const result = runBombe(crib, ciphertext, menu, spec, (progress) => {
    post({ type: 'progress', progress, elapsedMs: performance.now() - start });
  });
  post({ type: 'done', result, elapsedMs: performance.now() - start });
};
