// Top toolbar: shareable scenarios, the guided step tracker (the "success arc"),
// and presenter mode. This is the connective tissue that turns four strong
// sections into one guided cryptanalytic experience.

import { el, clear } from './dom';
import type { AppState } from './state';
import { scenarioFromState } from './state';
import type { Panel } from './machine-panel';
import {
  PRESETS,
  CHALLENGE,
  scenarioToHash,
  scenarioFromHash,
  scenarioFromJSON,
  scenarioToJSON,
  type Scenario,
} from '../break/scenarios';

export interface ControlActions {
  reseed: (s: Scenario) => void;
  resetBlank: () => void;
}

interface Step {
  label: string;
  hint: string;
  target: string; // element id to scroll to
  done: (s: AppState) => boolean;
}

const STEPS: Step[] = [
  { label: 'Set up the machine', hint: 'Choose rotors, rings, plugboard', target: 'machine-h', done: (s) => s.output.length > 0 },
  { label: 'Encrypt a message', hint: 'Type text; watch the lamps', target: 'machine-h', done: (s) => s.output.length > 0 },
  { label: 'Load the ciphertext', hint: 'Send the output to the break panel', target: 'break-h', done: (s) => s.breakCiphertext.length > 0 },
  { label: 'Place the crib', hint: 'Reject impossible offsets, build the menu', target: 'break-h', done: (s) => s.selectedOffset != null },
  { label: 'Run the Bombe', hint: 'Let contradictions kill wrong settings', target: 'break-h', done: (s) => s.bombeStops != null },
  { label: 'Recover & decrypt', hint: 'Load a stop back and read it', target: 'machine-h', done: (s) => s.candidateLoaded },
];

const BEATS: { title: string; body: string; target: string; action?: 'seed' }[] = [
  {
    title: 'An intercepted message',
    body: 'Here is real-looking Enigma ciphertext and a crib — a phrase we expect it contains. Our job: recover the day’s settings.',
    target: 'break-h',
    action: 'seed',
  },
  {
    title: 'The fatal flaw',
    body: 'The machine never maps a letter to itself — the diagonal is empty. One structural leak, and the giant keyspace starts to crack.',
    target: 'flaw-h',
  },
  {
    title: 'Rejecting placements for free',
    body: 'Because no letter self-encrypts, any crib placement with a letter above its own ciphertext is impossible. The search space collapses before we compute anything.',
    target: 'break-h',
  },
  {
    title: 'A menu of constraints',
    body: 'A surviving placement becomes a menu: a graph linking letters through known scrambler positions. Loops in it are pure leverage.',
    target: 'break-h',
  },
  {
    title: 'Elimination, not decryption',
    body: 'The Bombe does not decrypt. It assumes a plugboard guess and propagates it until a contradiction kills the branch — leaving only consistent stops.',
    target: 'break-h',
  },
  {
    title: 'A stop is a candidate',
    body: 'Each surviving stop is verified against the crib, then loaded back to decrypt the whole message. Not magic — structured elimination plus a sanity check.',
    target: 'machine-h',
  },
  {
    title: 'The lesson',
    body: 'Enigma failed not because its keyspace was small, but because exploitable structure turned guesses into contradictions. Large keyspaces can still leak.',
    target: 'break-h',
  },
];

export function buildControls(state: AppState, actions: ControlActions): Panel {
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ---- scenario toolbar ----
  const exampleSelect = el('select', { 'aria-label': 'Load an example scenario',
    onchange: () => {
      const p = PRESETS.find((x) => x.id === exampleSelect.value);
      if (p) { actions.reseed(p); scrollToFor(p); }
      exampleSelect.selectedIndex = 0;
    },
  }, [
    el('option', { value: '' }, ['Examples…']),
    ...PRESETS.map((p) => el('option', { value: p.id }, [p.name ?? p.id ?? ''])),
  ]) as HTMLSelectElement;

  const scrollToFor = (p: Scenario) => scrollTo(p.selectedOffset != null ? 'break-h' : 'machine-h');

  const shareMsg = el('span', { class: 'share-msg', role: 'status', 'aria-live': 'polite' });
  const shareBtn = el('button', { type: 'button', class: 'btn',
    onclick: async () => {
      const hash = scenarioToHash(scenarioFromState(state));
      const url = `${location.origin}${location.pathname}${hash}`;
      try {
        history.replaceState(null, '', hash);
        await navigator.clipboard.writeText(url);
        shareMsg.textContent = '✓ Link copied';
      } catch {
        shareMsg.textContent = 'Link in address bar';
      }
      window.setTimeout(() => (shareMsg.textContent = ''), 2000);
    },
  }, ['🔗 Share link']);

  const importBox = el('div', { class: 'import-box', hidden: true });
  const importArea = el('textarea', { class: 'mono', rows: '3',
    'aria-label': 'Paste a scenario link or JSON', placeholder: 'Paste a #s=… link or scenario JSON…' }) as HTMLTextAreaElement;
  const importMsg = el('span', { class: 'share-msg' });
  importBox.append(
    importArea,
    el('div', { class: 'import-actions' }, [
      el('button', { type: 'button', class: 'btn', onclick: () => {
        const text = importArea.value.trim();
        const s = scenarioFromHash(text) ?? scenarioFromJSON(text);
        if (s) { actions.reseed(s); importBox.hidden = true; importArea.value = ''; importMsg.textContent = ''; scrollToFor(s); }
        else importMsg.textContent = '⚠ Not a valid scenario link or JSON.';
      } }, ['Load']),
      el('button', { type: 'button', class: 'btn', onclick: () => { importBox.hidden = true; importMsg.textContent = ''; } }, ['Close']),
      importMsg,
    ]),
  );
  const importBtn = el('button', { type: 'button', class: 'btn',
    onclick: () => { importBox.hidden = !importBox.hidden; if (!importBox.hidden) importArea.focus(); },
  }, ['📋 Import']);

  const exportBtn = el('button', { type: 'button', class: 'btn',
    onclick: async () => {
      try { await navigator.clipboard.writeText(scenarioToJSON(scenarioFromState(state))); shareMsg.textContent = '✓ JSON copied'; }
      catch { shareMsg.textContent = '⚠ copy failed'; }
      window.setTimeout(() => (shareMsg.textContent = ''), 2000);
    },
  }, ['{ } Copy JSON']);

  const challengeBtn = el('button', { type: 'button', class: 'btn btn-load',
    onclick: () => { actions.reseed(CHALLENGE); scrollTo('break-h'); },
  }, ['🎯 Start challenge']);

  const resetBtn = el('button', { type: 'button', class: 'btn',
    onclick: () => { actions.resetBlank(); scrollTo('machine-h'); },
  }, ['↺ Reset']);

  const presenterBtn = el('button', { type: 'button', class: 'btn',
    onclick: () => openPresenter(),
  }, ['▶ Presenter mode']);

  const toolbar = el('div', { class: 'toolbar', role: 'group', 'aria-label': 'Scenario controls' }, [
    challengeBtn, exampleSelect, presenterBtn,
    el('span', { class: 'toolbar-sep' }),
    shareBtn, exportBtn, importBtn, resetBtn, shareMsg,
  ]);

  // ---- guided step tracker ----
  const stepperEl = el('ol', { class: 'stepper', 'aria-label': 'Guided steps' });
  const successBanner = el('p', { class: 'success-banner', role: 'status', 'aria-live': 'polite', hidden: true });

  function renderStepper(s: AppState) {
    clear(stepperEl);
    const firstTodo = STEPS.findIndex((st) => !st.done(s));
    STEPS.forEach((st, i) => {
      const done = st.done(s);
      const active = i === firstTodo;
      const status = done ? 'done' : active ? 'active' : 'todo';
      stepperEl.append(
        el('li', { class: `step ${status}` }, [
          el('button', { type: 'button', class: 'step-btn',
            'aria-current': active ? 'step' : undefined,
            onclick: () => scrollTo(st.target),
          }, [
            el('span', { class: 'step-mark', 'aria-hidden': 'true' }, [done ? '✓' : String(i + 1)]),
            el('span', { class: 'step-text' }, [
              el('span', { class: 'step-label' }, [st.label]),
              el('span', { class: 'step-hint' }, [st.hint]),
            ]),
          ]),
        ]),
      );
    });
    const allDone = STEPS.every((st) => st.done(s));
    successBanner.hidden = !s.candidateLoaded;
    if (s.candidateLoaded) {
      successBanner.textContent = allDone
        ? '✓ Cracked it. You recovered the rotor order, start position and Stecker, and the ciphertext reads as plaintext — by elimination, not brute force.'
        : '✓ Settings loaded — the machine now decrypts the intercept.';
    }
  }

  // ---- presenter mode ----
  let beat = 0;
  const overlay = el('div', { class: 'presenter', hidden: true, role: 'dialog', 'aria-label': 'Presenter mode', 'aria-modal': 'false' });
  const beatTitle = el('h3', { class: 'beat-title' });
  const beatBody = el('p', { class: 'beat-body' });
  const beatCount = el('span', { class: 'beat-count muted' });
  const prevBtn = el('button', { type: 'button', class: 'btn', onclick: () => gotoBeat(beat - 1) }, ['‹ Prev']);
  const nextBtn = el('button', { type: 'button', class: 'btn btn-attack', onclick: () => gotoBeat(beat + 1) }, ['Next ›']);
  overlay.append(
    el('div', { class: 'presenter-card' }, [
      el('div', { class: 'beat-head' }, [beatCount,
        el('button', { type: 'button', class: 'beat-close', 'aria-label': 'Exit presenter mode', onclick: () => closePresenter() }, ['✕']),
      ]),
      beatTitle, beatBody,
      el('div', { class: 'beat-nav' }, [prevBtn, nextBtn]),
    ]),
  );

  function openPresenter() {
    beat = -1;
    overlay.hidden = false;
    gotoBeat(0);
    nextBtn.focus(); // move focus into the dialog for keyboard users
  }
  function closePresenter() {
    overlay.hidden = true;
    presenterBtn.focus(); // return focus to the trigger
  }
  // Escape exits presenter mode from anywhere
  document.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && !overlay.hidden) closePresenter();
  });
  function gotoBeat(i: number) {
    if (i < 0 || i >= BEATS.length) { if (i >= BEATS.length) closePresenter(); return; }
    beat = i;
    const b = BEATS[i];
    if (b.action === 'seed') actions.reseed(CHALLENGE);
    beatTitle.textContent = b.title;
    beatBody.textContent = b.body;
    beatCount.textContent = `Beat ${i + 1} / ${BEATS.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.textContent = i === BEATS.length - 1 ? 'Finish ✓' : 'Next ›';
    scrollTo(b.target);
  }

  const root = el('section', { class: 'panel controls', 'aria-label': 'Guide and scenarios' }, [
    toolbar,
    importBox,
    el('p', { class: 'guide-intro muted' }, ['Guided path — each step lights up the next:']),
    stepperEl,
    successBanner,
    overlay,
  ]);

  const update = (s: AppState) => {
    renderStepper(s);
    if (exampleSelect.selectedIndex !== 0) exampleSelect.selectedIndex = 0;
  };
  renderStepper(state);

  return { root, update };
}
