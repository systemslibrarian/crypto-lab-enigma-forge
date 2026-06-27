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
  const btn = el('button', { class: 'copy-btn', type: 'button', 'aria-label': label }, [
    `⧉ ${label}`,
  ]);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getText());
      const old = btn.textContent;
      btn.textContent = '✓ Copied';
      window.setTimeout(() => (btn.textContent = old), 1200);
    } catch {
      btn.textContent = '⚠ Copy failed';
    }
  });
  return btn;
}

export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
