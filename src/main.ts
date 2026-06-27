import './styles.css';
import { el } from './ui/dom';
import { createState, recomputeMachine, type AppState } from './ui/state';
import { buildMachinePanel, type Panel } from './ui/machine-panel';
import { buildPathVisualizer } from './ui/path-visualizer';
import { buildFlawPanel } from './ui/flaw-panel';
import { buildBreakPanel } from './ui/break-panel';

const state: AppState = createState();
const app = document.getElementById('app');
if (!app) throw new Error('#app mount point not found');

let panels: Panel[] = [];
function refresh(): void {
  recomputeMachine(state);
  for (const p of panels) p.update(state);
}

const intro = el('div', { class: 'intro' }, [
  el('h1', {}, ['Enigma Forge']),
  el('p', { class: 'tagline' }, [
    'How the machine actually worked — and how it was actually broken.',
  ]),
  el('p', { class: 'scope-note' }, [
    'Scope: Enigma I (3-rotor Wehrmacht), reflectors B/C, rotors I–V. ',
    el('span', { class: 'muted' }, [
      'Not naval M4, not Lorenz (M4 is a planned extension). No backend, no network, nothing saved.',
    ]),
  ]),
]);

const machine = buildMachinePanel(state, refresh);
const path = buildPathVisualizer();
const flaw = buildFlawPanel();
const brk = buildBreakPanel(state, refresh);
panels = [machine, path, flaw, brk];

app.append(intro, machine.root, path.root, flaw.root, brk.root);
refresh();
