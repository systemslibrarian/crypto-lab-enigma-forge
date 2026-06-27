// PATH VISUALIZER — the technical centerpiece. Traces the last keystroke's
// signal through every stage: plugboard in → R → M → L → reflector → L → M → R
// → plugboard out, labelling the substitution at each stage. Stages are
// conveyed by label + shape + colour (never colour alone).

import { el, clear } from './dom';
import type { AppState } from './state';
import type { Panel } from './machine-panel';
import type { StageTrace } from '../enigma/types';

function stageKind(stage: string): string {
  if (stage.startsWith('Plugboard')) return 'plug';
  if (stage.startsWith('Reflector')) return 'reflector';
  return 'rotor';
}
const KIND_SHAPE: Record<string, string> = { plug: '▢', rotor: '◈', reflector: '▲' };

export function buildPathVisualizer(): Panel {
  const flow = el('div', { class: 'path-flow', role: 'img' });
  const caption = el('p', { class: 'path-caption', 'aria-live': 'polite' });

  const root = el('section', { class: 'panel path', 'aria-labelledby': 'path-h' }, [
    el('h2', { id: 'path-h' }, ['Signal Path']),
    el('p', { class: 'lead' }, [
      'The exact route of the last letter pressed. Read left-to-right: in through the ',
      'plugboard, forward R→M→L, bounced by the reflector, back L→M→R, out through the plugboard.',
    ]),
    el('div', { class: 'path-scroll' }, [flow]),
    caption,
  ]);

  const update = (s: AppState) => {
    clear(flow);
    const t = s.lastAlphaTrace;
    if (!t) {
      flow.setAttribute('aria-label', 'No keystroke yet.');
      flow.append(el('p', { class: 'muted' }, ['Type a letter to trace its path.']));
      caption.textContent = '';
      return;
    }

    const stages = t.stages;
    const node = (letter: string, sub: string) =>
      el('div', { class: 'path-node' }, [
        el('span', { class: 'path-letter' }, [letter]),
        el('span', { class: 'path-sub' }, [sub]),
      ]);

    // input node
    flow.append(node(t.input, 'key'));
    stages.forEach((st: StageTrace) => {
      const kind = stageKind(st.stage);
      flow.append(el('span', { class: 'path-arrow' }, ['→']));
      flow.append(
        el('div', { class: `path-stage ${kind}` }, [
          el('span', { class: 'path-shape', 'aria-hidden': 'true' }, [KIND_SHAPE[kind]]),
          el('span', { class: 'path-stage-name' }, [st.stage]),
          el('span', { class: 'path-detail' }, [st.detail]),
          el('span', { class: 'path-map' }, [`${st.inLetter}→${st.outLetter}`]),
        ]),
      );
    });
    flow.append(el('span', { class: 'path-arrow' }, ['→']));
    flow.append(node(t.output, 'lamp'));

    flow.setAttribute(
      'aria-label',
      `${t.input} enters and exits as ${t.output}. Stages: ${stages
        .map((st) => `${st.stage} ${st.inLetter} to ${st.outLetter}`)
        .join('; ')}.`,
    );
    caption.textContent = `${t.input} → ${t.output}  ·  ${stages.length} stages  ·  the reflector is why ${t.input} could never come out as ${t.input}.`;
  };

  return { root, update };
}
