// Tiny DOM helpers — no framework. `el` builds an element with attributes,
// dataset, event handlers and children in one call.

type Attrs = Record<string, unknown>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] | Child = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'dataset') Object.assign(node.dataset, v as object);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'for') node.setAttribute('for', String(v));
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function copyButton(getText: () => string, label = 'Copy'): HTMLButtonElement {
  // The button's DOM text never changes, and neither does its name. Both the
  // leading glyph and the click feedback are drawn by CSS from `data-state`.
  //
  // That shape is forced by two things at once. axe 4.14 compares a control's
  // accessible name against everything a SIGHTED user sees
  // (label-content-name-mismatch, WCAG 2.5.3 Label in Name), so a glyph in the
  // text and a word that changes both have to be matched by the name. But this
  // lab's own accessibility spec finds the button BY that name, so the name
  // cannot move. Putting the changing part in CSS satisfies both: there is one
  // stable name, and the only visible text is the label it already contains.
  const words = el('span', { class: 'copy-words' }, [label]);
  const btn = el('button', { class: 'copy-btn', type: 'button', 'aria-label': label }, [words]);
  const flash = (state: string): void => {
    btn.dataset.state = state;
    window.setTimeout(() => delete btn.dataset.state, 1200);
  };
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      flash('copied');
    } catch {
      flash('failed');
    }
  });
  return btn;
}

export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
