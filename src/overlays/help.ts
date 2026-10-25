// Keyboard shortcut list and transient notices.

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['R', 'Restart time'],
  ['Q', 'Cycle render quality'],
  ['E or Enter', 'Open the editor'],
  ['1 – 9', 'New project from example'],
  ['? or H', 'Show this list'],
  ['Editor: ⌘/Ctrl K', 'Turn the selected number into a knob'],
  ['Editor: Esc', 'Close the editor'],
  ['Knob: drag ↕', 'Turn (hold Shift for fine control)'],
  ['Knob: double-click', 'Reset to default'],
  ['Knob: click or right-click', 'Edit label, name, range; delete'],
  ['Portal: click', 'Lean in to the portal and knobs; click again or Esc to sit back'],
  ['Portal: drag', 'Mouse input to the shader (iMouse)'],
  ['Code display: wheel', 'Scroll'],
];

export class HelpOverlay {
  private readonly el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sv-help';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="sv-help-box"><div class="sv-help-title">CONTROLS</div><dl></dl>
      <div class="sv-help-foot">Shaders use the Shadertoy <code>mainImage(out vec4 fragColor, in vec2 fragCoord)</code> entry point.
      Extra float or int parameters after <code>fragCoord</code> are knobs.</div></div>`;
    const dl = this.el.querySelector('dl')!;
    for (const [k, v] of SHORTCUTS) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.hide();
    });
    document.body.appendChild(this.el);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  toggle() {
    this.el.hidden = !this.el.hidden;
  }

  hide() {
    this.el.hidden = true;
  }
}

let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 2600): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'sv-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add('sv-toast-on');
  clearTimeout(toastTimer);
  if (ms > 0) toastTimer = setTimeout(() => toastEl?.classList.remove('sv-toast-on'), ms);
}
