import './styles.css';
import { el } from './ui/dom';
import {
  createState,
  recomputeMachine,
  applyScenario,
  defaultSettings,
  type AppState,
} from './ui/state';
import { buildMachinePanel, type Panel } from './ui/machine-panel';
import { buildPathVisualizer } from './ui/path-visualizer';
import { buildFlawPanel } from './ui/flaw-panel';
import { buildBreakPanel } from './ui/break-panel';
import { buildControls } from './ui/controls';
import { buildComparisonPanel, buildLimitsPanel, buildAppendixPanel } from './ui/content';
import { scenarioFromHash, type Scenario } from './break/scenarios';

const state: AppState = createState();
const app = document.getElementById('app');
if (!app) throw new Error('#app mount point not found');

let panels: Panel[] = [];
let controls: Panel | undefined;
function refresh(): void {
  recomputeMachine(state);
  for (const p of panels) p.update(state);
}

// Build panels first so reseed can repaint the break panel's own DOM.
const machine = buildMachinePanel(state, refresh);
// The double-step demo seeds positions A-D-U and types just enough that the
// LAST keystroke is the double-step itself, so the path + windows show it.
const doubleStepDemo = () =>
  reseed({
    v: 1,
    settings: { rotorOrder: ['I', 'II', 'III'], ringSettings: [0, 0, 0], positions: [0, 3, 20], reflector: 'B', plugboard: [] },
    message: 'AAA',
    crib: 'WETTERBERICHT',
    breakCiphertext: '',
    selectedOffset: null,
    scope: 'current',
  });
const path = buildPathVisualizer(doubleStepDemo);
const flaw = buildFlawPanel();
const brk = buildBreakPanel(state, refresh, () => controls?.update(state));

function reseed(s: Scenario): void {
  applyScenario(state, s);
  refresh();
  brk.rerender?.();
}
function resetBlank(): void {
  reseed({
    v: 1,
    settings: defaultSettings(),
    message: '',
    crib: 'WETTERBERICHT',
    breakCiphertext: '',
    selectedOffset: null,
    scope: 'current',
  });
}

controls = buildControls(state, { reseed, resetBlank });

const intro = el('div', { class: 'intro' }, [
  el('h1', {}, ['Enigma Forge']),
  el('p', { class: 'tagline' }, ['How the machine actually worked — and how it was actually broken.']),
  el('p', { class: 'scope-note' }, [
    'Scope: Enigma I (3-rotor Wehrmacht), reflectors B/C, rotors I–V. ',
    el('span', { class: 'muted' }, [
      'Not naval M4, not Lorenz (M4 is a planned extension). No backend, no network, nothing saved.',
    ]),
  ]),
]);

const comparison = buildComparisonPanel();
const limits = buildLimitsPanel();
const appendix = buildAppendixPanel();

panels = [controls, machine, path, flaw, brk, comparison, limits, appendix];
app.append(
  intro,
  controls.root,
  machine.root,
  path.root,
  flaw.root,
  brk.root,
  comparison.root, // thesis right after the break lands
  limits.root,
  appendix.root,
);

// A scenario in the URL hash reproduces a shared state on load.
const shared = scenarioFromHash(location.hash);
if (shared) {
  applyScenario(state, shared);
}
refresh();
brk.rerender?.();
