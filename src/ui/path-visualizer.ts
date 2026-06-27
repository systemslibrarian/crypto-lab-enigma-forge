// PATH VISUALIZER — the technical centerpiece. Traces the last keystroke's
// signal through every stage: plugboard in → R → M → L → reflector → L → M → R
// → plugboard out, labelling the substitution at each stage. Stages are
// conveyed by label + shape + colour (never colour alone). The path animates
// left-to-right per keystroke, shows rotor positions before/after stepping, and
// keeps the previous keystroke for comparison.

import { el, clear } from './dom';
import type { AppState } from './state';
import type { Panel } from './machine-panel';
import type { PathTrace, StageTrace } from '../enigma/types';
import { toChar } from '../enigma/wirings';

function stageKind(stage: string): string {
  if (stage.startsWith('Plugboard')) return 'plug';
  if (stage.startsWith('Reflector')) return 'reflector';
  return 'rotor';
}
const KIND_SHAPE: Record<string, string> = { plug: '▢', rotor: '◈', reflector: '▲' };

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function buildPathVisualizer(onDoubleStepDemo?: () => void): Panel {
  const flow = el('div', { class: 'path-flow', role: 'img' });
  const caption = el('p', { class: 'path-caption', 'aria-live': 'polite' });
  const positionsLine = el('p', { class: 'path-positions mono' });
  const historyLine = el('p', { class: 'path-history muted' });

  const demoBtn = onDoubleStepDemo
    ? el('button', { type: 'button', class: 'btn', onclick: onDoubleStepDemo }, ['⚙ Double-step demo'])
    : null;

  const root = el('section', { class: 'panel path', 'aria-labelledby': 'path-h' }, [
    el('div', { class: 'io-head' }, [
      el('h2', { id: 'path-h' }, ['Signal Path']),
      demoBtn,
    ]),
    el('p', { class: 'lead' }, [
      'The exact route of the last letter pressed. Read left-to-right: in through the ',
      'plugboard, forward R→M→L, bounced by the reflector, back L→M→R, out through the plugboard.',
    ]),
    positionsLine,
    el('div', { class: 'path-scroll' }, [flow]),
    caption,
    historyLine,
  ]);

  let prev: PathTrace | null = null;

  const update = (s: AppState) => {
    const t = s.lastAlphaTrace;
    clear(flow);

    if (!t) {
      flow.setAttribute('aria-label', 'No keystroke yet.');
      flow.append(el('p', { class: 'muted' }, ['Type a letter to trace its path.']));
      caption.textContent = '';
      positionsLine.textContent = '';
      historyLine.textContent = '';
      prev = null;
      return;
    }

    // rotor positions before/after stepping
    const before = t.rotorPositionsBefore.map(toChar).join('');
    const after = t.rotorPositionsAfter.map(toChar).join('');
    clear(positionsLine);
    positionsLine.append(
      el('span', { class: 'muted' }, ['Rotors L-M-R: ']),
      el('span', {}, [before]),
      el('span', { class: 'muted' }, [' → ']),
      el('span', { class: t.doubleStep ? 'pos-double' : '' }, [after]),
      t.doubleStep
        ? el('span', { class: 'pos-tag alarm' }, [' ⚙ double-step (middle dragged the left rotor)'])
        : el('span', { class: 'muted' }, [t.stepped[0] ? ' (left carried)' : '']),
    );

    const animate = !reducedMotion();
    const node = (letter: string, sub: string) =>
      el('div', { class: 'path-node' }, [
        el('span', { class: 'path-letter' }, [letter]),
        el('span', { class: 'path-sub' }, [sub]),
      ]);

    const pieces: HTMLElement[] = [];
    pieces.push(node(t.input, 'key'));
    t.stages.forEach((st: StageTrace) => {
      pieces.push(el('span', { class: 'path-arrow' }, ['→']));
      const kind = stageKind(st.stage);
      pieces.push(
        el('div', { class: `path-stage ${kind}` }, [
          el('span', { class: 'path-shape', 'aria-hidden': 'true' }, [KIND_SHAPE[kind]]),
          el('span', { class: 'path-stage-name' }, [st.stage]),
          el('span', { class: 'path-detail' }, [st.detail]),
          el('span', { class: 'path-map' }, [
            el('span', { class: 'map-in' }, [st.inLetter]),
            '→',
            el('span', { class: 'map-out' }, [st.outLetter]),
          ]),
        ]),
      );
    });
    pieces.push(el('span', { class: 'path-arrow' }, ['→']));
    pieces.push(node(t.output, 'lamp'));

    pieces.forEach((p, i) => {
      if (animate) {
        p.classList.add('enter');
        (p as HTMLElement).style.animationDelay = `${i * 45}ms`;
      }
      flow.append(p);
    });

    flow.setAttribute(
      'aria-label',
      `${t.input} enters and exits as ${t.output}. Rotor windows ${before} stepped to ${after}${
        t.doubleStep ? ' with a double-step' : ''
      }. Stages: ${t.stages.map((st) => `${st.stage} ${st.inLetter} to ${st.outLetter}`).join('; ')}.`,
    );
    caption.textContent = `${t.input} → ${t.output}  ·  ${t.stages.length} stages  ·  the reflector is why ${t.input} could never come out as ${t.input}.`;

    historyLine.textContent = prev
      ? `Previous keystroke: ${prev.input} → ${prev.output}  (compare how the same path shifted as the rotors moved).`
      : '';
    prev = t;
  };

  return { root, update };
}
